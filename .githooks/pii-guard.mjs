#!/usr/bin/env node
/**
 * ConsultX pre-commit guard — blocks customer PII (unlisted email addresses) and
 * secret-looking strings from entering git history.
 *
 * BACKGROUND: a docs file listing 22 customer email addresses reached git history
 * (2026-09-02) and had to be purged with filter-branch before the branch's first
 * push. This guard makes that class of leak impossible to commit silently.
 *
 * Install: git config core.hooksPath .githooks
 * Docs: docs/launch/pre-commit-guard.md
 *
 * Usage:
 *   node .githooks/pii-guard.mjs                    scan staged changes (default)
 *   node .githooks/pii-guard.mjs --staged           same, explicit
 *   node .githooks/pii-guard.mjs --check-file <path> scan one file on disk (dry runs, tests)
 *   node .githooks/pii-guard.mjs --check-diff-base <ref>
 *                                                   scan everything added since the merge-base
 *                                                   with <ref> (CI: origin/main); bulk-eligible
 *                                                   files are read from HEAD
 *
 * Exit code: 0 = clean, 1 = findings (block the commit), 2 = guard itself errored
 * (fails closed — an error scanning is treated as a reason to block, not to allow).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ───────────────────────── email allowlist ─────────────────────────
// Anything NOT covered by one of these rules is treated as a possible
// customer address and blocks the commit.

export const ALLOWLIST_DOMAINS = ['consultx.app', 'consultx.ai', 'mailnull.com', 'example.com'];
// consultx.sa@gmail.com is the platform's own historical mailbox, not a customer.
export const ALLOWLIST_ADDRESSES = ['a@b.com', 'c@d.com', 'your@email.com', 'ksasmoke@ksa.com', 'consultx.sa@gmail.com'];
// Owner + his known aliases — matched as a prefix of the full address.
export const OWNER_PREFIXES = ['njajrehwaseem', 'waseemnjajreh20'];
// ConsultX system mailbox local-parts (already covered by the domain rule above,
// listed explicitly for clarity/documentation of intent).
export const CONSULTX_SYSTEM_LOCALPARTS = ['noreply', 'support', 'info', 'hello'];
const CONSULTX_DOMAINS = ['consultx.app', 'consultx.ai'];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOW_MARKER = 'pii-guard: allow';
// File-level opt-out, deliberately narrow: only files under a test-fixture
// directory may carry it (the guard's own test suite is made of fake PII and
// key patterns). A data or docs file with this marker is still scanned.
const ALLOW_FILE_MARKER = 'pii-guard: allow-file';
const FIXTURE_DIRS = ['src/__tests__/'];
const ALLOW_FILE_HEAD_LINES = 20;
const BULK_EMAIL_THRESHOLD = 5;

/** True when fileName is a test fixture whose first lines carry the allow-file marker. */
export function isFixtureAllowedFile(fileName, text) {
  const normalized = String(fileName).replace(/\\/g, '/').toLowerCase();
  if (!FIXTURE_DIRS.some((d) => normalized.includes(d))) return false;
  const head = String(text ?? '').split(/\r\n|\r|\n/).slice(0, ALLOW_FILE_HEAD_LINES).join('\n');
  return head.includes(ALLOW_FILE_MARKER);
}

export function isAllowlistedEmail(rawEmail) {
  const email = rawEmail.toLowerCase();
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (ALLOWLIST_ADDRESSES.includes(email)) return true;
  if (ALLOWLIST_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  // RFC 2606 / RFC 6761 reserved TLDs can never belong to a real person.
  if (/\.(invalid|test|example|localhost)$/.test(domain)) return true;
  if (OWNER_PREFIXES.some((p) => email.startsWith(p))) return true;
  if (CONSULTX_SYSTEM_LOCALPARTS.includes(local) && CONSULTX_DOMAINS.includes(domain)) return true;
  return false;
}

// ───────────────────────── secret patterns ─────────────────────────
// Moyasar keys documented at docs.moyasar.com/api/authentication: secret keys
// are "sk_live_"/"sk_test_", publishable are "pk_live_"/"pk_test_" (public by
// design — not flagged, mirrors sb_publishable_ below).
// Resend keys documented at resend.com/docs/api-reference/api-keys: "re_" prefix.

const SECRET_PATTERNS = [
  { name: 'Google API key (AIza...)', re: /AIza[0-9A-Za-z_-]{35,}/g },
  { name: 'Google API key (AQ. format)', re: /\bAQ\.[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI-style API key (sk-...)', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Supabase secret key (sb_secret_...)', re: /\bsb_secret_[A-Za-z0-9]{10,}/g },
  { name: 'Moyasar/Stripe-style secret key (sk_live_/sk_test_...)', re: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}/g },
  { name: 'Resend API key (re_...)', re: /\bre_[A-Za-z0-9_]{16,}/g },
  {
    name: 'Private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
  },
];

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const JWT_MIN_LENGTH = 100;

// ───────────────────────── pure scanning functions (exported for tests) ─────────────────────────

/** Scan a single line of text. Returns findings with no file/line attached. */
export function scanLine(line) {
  if (line.includes(ALLOW_MARKER)) return [];
  const findings = [];

  const emailRe = new RegExp(EMAIL_RE.source, 'g');
  let m;
  while ((m = emailRe.exec(line))) {
    const email = m[0];
    if (!isAllowlistedEmail(email)) {
      findings.push({ type: 'email', reason: `email address not on allowlist: ${email}` });
    }
  }

  for (const { name, re } of SECRET_PATTERNS) {
    const r = new RegExp(re.source, re.flags);
    if (r.test(line)) {
      findings.push({ type: 'secret', reason: `possible ${name} committed` });
    }
  }

  const jwtRe = new RegExp(JWT_RE.source, 'g');
  while ((m = jwtRe.exec(line))) {
    if (m[0].length > JWT_MIN_LENGTH) {
      findings.push({ type: 'secret', reason: `JWT-looking token (>${JWT_MIN_LENGTH} chars) committed` });
    }
  }

  return findings;
}

/**
 * A "data file" gets scanned as a whole (not just added lines) and is subject to
 * the bulk-email-list rule, since customer lists can be built up a few rows per
 * commit across many commits and would otherwise dodge the added-lines checks.
 */
export function isBulkEligibleFile(fileName) {
  const normalized = String(fileName).replace(/\\/g, '/').toLowerCase();
  const dot = normalized.lastIndexOf('.');
  const ext = dot === -1 ? '' : normalized.slice(dot);
  if (ext === '.csv' || ext === '.xlsx') return true;
  if (['.json', '.md', '.txt'].includes(ext) && normalized.startsWith('docs/')) return true;
  return false;
}

/**
 * Scan a block of text representing a file (or file-like blob), starting at line 1.
 * Runs the per-line checks over every line, plus — when fileName is a bulk-eligible
 * data file — an aggregate check for >= BULK_EMAIL_THRESHOLD distinct non-allowlisted
 * email addresses anywhere in the text.
 */
export function scanText(text, fileName) {
  if (isFixtureAllowedFile(fileName, text)) return [];
  const findings = [];
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((line, idx) => {
    for (const f of scanLine(line)) {
      findings.push({ ...f, file: fileName, line: idx + 1 });
    }
  });

  if (isBulkEligibleFile(fileName)) {
    const emails = new Set();
    const re = new RegExp(EMAIL_RE.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (!isAllowlistedEmail(m[0])) emails.add(m[0].toLowerCase());
    }
    if (emails.size >= BULK_EMAIL_THRESHOLD) {
      findings.push({
        type: 'bulk-email-list',
        file: fileName,
        line: null,
        reason: `data file contains ${emails.size} distinct non-allowlisted email addresses (threshold ${BULK_EMAIL_THRESHOLD}) — looks like a customer list`,
      });
    }
  }

  return findings;
}

// ───────────────────────── unified-diff parsing (added lines only) ─────────────────────────

/** Parse `git diff --unified=0` output into { file, line, text } for each added (+) line. */
export function parseDiffAddedLines(diffText) {
  const results = [];
  const lines = diffText.split('\n');
  let currentFile = null;
  let newLineNum = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      currentFile = null;
      newLineNum = null;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const m = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
      currentFile = m && m[1] !== '/dev/null' ? m[1] : null;
      continue;
    }
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      newLineNum = m ? parseInt(m[1], 10) : null;
      continue;
    }
    if (!currentFile || newLineNum === null) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      results.push({ file: currentFile, line: newLineNum, text: line.slice(1) });
      newLineNum++;
    }
    // '-' lines (old-file only) and '\ No newline at end of file' don't advance
    // the new-file line counter and are not scanned (they are not being added).
  }
  return results;
}

/** Scan only the added lines of a staged diff. Bulk-eligible files are skipped here
 * (they get a full-content scan instead — see scanBulkEligibleStagedFiles). */
export function scanDiff(diffText, opts = {}) {
  const added = parseDiffAddedLines(diffText);
  // A fixture file is exempt when the caller resolved its staged head (opts.allowFiles)
  // or when the marker itself is among the added lines (new fixture files).
  const allowFiles = new Set([...(opts.allowFiles ?? [])].map((f) => String(f).replace(/\\/g, '/')));
  for (const { file, text } of added) {
    if (isFixtureAllowedFile(file, text)) allowFiles.add(file.replace(/\\/g, '/'));
  }
  const findings = [];
  for (const { file, line, text } of added) {
    if (isBulkEligibleFile(file)) continue;
    if (allowFiles.has(file.replace(/\\/g, '/'))) continue;
    for (const f of scanLine(text)) {
      findings.push({ ...f, file, line });
    }
  }
  return findings;
}

/** Staged fixture files whose head carries the allow-file marker (read from the index). */
function resolveAllowedFixtureFiles(stagedFiles) {
  const allowed = [];
  for (const file of stagedFiles) {
    const normalized = file.replace(/\\/g, '/').toLowerCase();
    if (!FIXTURE_DIRS.some((d) => normalized.includes(d))) continue;
    try {
      const head = getStagedFileBuffer(file).toString('utf8');
      if (isFixtureAllowedFile(file, head)) allowed.push(file);
    } catch {
      /* removed between listing and show — nothing to exempt */
    }
  }
  return allowed;
}

// ───────────────────────── best-effort .xlsx text extraction ─────────────────────────
// xlsx is a zip of XML parts. Node has no built-in zip reader, so this walks the
// zip central directory and inflates just the worksheet/sharedStrings XML entries
// using node:zlib — no dependency needed. Best-effort: encrypted, corrupted, or
// unusually-structured workbooks are skipped rather than blocking the commit
// (see docs/launch/pre-commit-guard.md for this limitation).
export function extractXlsxText(buffer) {
  try {
    const EOCD_SIG = 0x06054b50;
    const searchStart = Math.max(0, buffer.length - 22 - 65536);
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= searchStart; i--) {
      if (buffer.readUInt32LE(i) === EOCD_SIG) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) return null;

    const cdEntries = buffer.readUInt16LE(eocdOffset + 10);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (cdEntries > 5000) return null; // sanity bound

    const texts = [];
    let offset = cdOffset;
    for (let i = 0; i < cdEntries; i++) {
      if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
      const compMethod = buffer.readUInt16LE(offset + 10);
      const compSize = buffer.readUInt32LE(offset + 20);
      const nameLen = buffer.readUInt16LE(offset + 28);
      const extraLen = buffer.readUInt16LE(offset + 30);
      const commentLen = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const name = buffer.slice(offset + 46, offset + 46 + nameLen).toString('utf8');

      if (/^xl\/(sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) {
        const lfSig = buffer.readUInt32LE(localHeaderOffset);
        if (lfSig === 0x04034b50) {
          const lfNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
          const lfExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
          const dataStart = localHeaderOffset + 30 + lfNameLen + lfExtraLen;
          const compData = buffer.slice(dataStart, dataStart + compSize);
          let content = null;
          if (compMethod === 0) content = compData;
          else if (compMethod === 8) content = inflateRawSync(compData);
          if (content) texts.push(content.toString('utf8'));
        }
      }

      offset += 46 + nameLen + extraLen + commentLen;
    }
    return texts.length ? texts.join('\n') : null;
  } catch {
    return null;
  }
}

// ───────────────────────── git plumbing + CLI ─────────────────────────

// Scan source: the index (pre-commit) or the range <base>...HEAD (CI). The
// blob revision follows: ':' reads the index, 'HEAD:' reads the committed tree.
let scanSource = { diffArgs: ['diff', '--cached'], blobPrefix: ':' };

function useDiffBase(baseRef) {
  scanSource = { diffArgs: ['diff', `${baseRef}...HEAD`], blobPrefix: 'HEAD:' };
}

function getStagedDiff() {
  return execFileSync('git', [...scanSource.diffArgs, '--unified=0', '--no-color'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
}

function getStagedFileList() {
  const out = execFileSync('git', [...scanSource.diffArgs, '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getStagedFileBuffer(file) {
  return execFileSync('git', ['show', `${scanSource.blobPrefix}${file}`], { maxBuffer: 50 * 1024 * 1024 });
}

function scanBulkEligibleStagedFiles(stagedFiles) {
  const findings = [];
  for (const file of stagedFiles) {
    if (!isBulkEligibleFile(file)) continue;
    let buf;
    try {
      buf = getStagedFileBuffer(file);
    } catch {
      continue; // e.g. removed from index between listing and show
    }
    const ext = file.toLowerCase().slice(file.toLowerCase().lastIndexOf('.'));
    let text;
    if (ext === '.xlsx') {
      text = extractXlsxText(buf);
      if (text == null) continue; // best-effort only; see docs/launch/pre-commit-guard.md
    } else {
      text = buf.toString('utf8');
    }
    findings.push(...scanText(text, file));
  }
  return findings;
}

function formatFindings(findings) {
  const lines = [];
  lines.push('ConsultX pre-commit guard: BLOCKED — possible customer PII or secret detected.');
  lines.push('');
  for (const f of findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    lines.push(`  ${loc} — ${f.reason}`);
  }
  lines.push('');
  lines.push('False positive? Add "pii-guard: allow" as a comment on that same line and re-stage.');
  lines.push('Customer data belongs only in gitignored docs/campaigns/ — never in tracked files.');
  lines.push('Details: docs/launch/pre-commit-guard.md');
  return lines.join('\n');
}

function readFileForCheck(filePath) {
  const ext = filePath.toLowerCase().slice(filePath.toLowerCase().lastIndexOf('.'));
  if (ext === '.xlsx') {
    return extractXlsxText(readFileSync(filePath)) ?? '';
  }
  return readFileSync(filePath, 'utf8');
}

function main() {
  const args = process.argv.slice(2);
  const checkFileIdx = args.indexOf('--check-file');
  const diffBaseIdx = args.indexOf('--check-diff-base');
  if (diffBaseIdx !== -1) {
    const baseRef = args[diffBaseIdx + 1];
    if (!baseRef) {
      console.error('pii-guard: --check-diff-base requires a git ref argument');
      process.exit(2);
      return;
    }
    useDiffBase(baseRef);
  }

  let findings;
  if (checkFileIdx !== -1) {
    const filePath = args[checkFileIdx + 1];
    if (!filePath) {
      console.error('pii-guard: --check-file requires a path argument');
      process.exit(2);
      return;
    }
    const text = readFileForCheck(filePath);
    findings = scanText(text, filePath.replace(/\\/g, '/'));
  } else {
    try {
      const diff = getStagedDiff();
      const stagedFiles = getStagedFileList();
      const allowFiles = resolveAllowedFixtureFiles(stagedFiles);
      if (allowFiles.length) {
        console.error(`pii-guard: fixture file(s) exempted by "${ALLOW_FILE_MARKER}": ${allowFiles.join(', ')}`);
      }
      findings = [...scanDiff(diff, { allowFiles }), ...scanBulkEligibleStagedFiles(stagedFiles)];
    } catch (err) {
      console.error(`pii-guard: failed to read staged changes via git: ${err.message}`);
      process.exit(2);
      return;
    }
  }

  if (findings.length > 0) {
    console.error(formatFindings(findings));
    process.exit(1);
    return;
  }
  process.exit(0);
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main();
}
