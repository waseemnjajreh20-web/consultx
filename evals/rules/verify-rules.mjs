// verify-rules.mjs — audit every rule in rules/*.json against the PRODUCTION
// SBC corpus (public.sbc_documents), independently of whoever wrote the rule.
//
// Why this is content-based and not page-based: the corpus's own metadata is
// not trustworthy for this purpose. Measured 2026-09-03 — SBC201 chunks report
// page ranges like page_start 72 / page_end 481 on a chunk whose text is a
// single commentary paragraph, `section_number` is frequently the wrong
// section for the chunk's text, and the stored page numbers are chunk-file
// indexes (max 500 for SBC201) while the printed code runs past page 900, which
// is what a rule's provenance.page cites. The only reliable signal in that
// table is `content`. So the audit asks two questions per rule, both answerable
// from text alone:
//
//   1. PRESENT — does the corpus contain a chunk that mentions this rule's
//      section number as a standalone token? (If not, the rule cites something
//      the platform cannot show the user, which is the fabrication risk the
//      SOURCE_SCOPE contract exists to prevent.)
//   2. SUPPORTED — do the NUMBERS the rule asserts (its threshold value, its
//      table values, and the numeric tokens of its provenance quote) actually
//      appear in a chunk that mentions that section?
//
// A rule that fails (2) is not necessarily wrong — the corpus may simply not
// carry that table — but it IS a rule no answer can cite from the platform's
// own sources, and no such rule may leave `status: "draft"`.
//
// Usage: node evals/rules/verify-rules.mjs [--file rules/sbc-fire-life-safety-v0.json]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = "D:\\ConsultX_Clean";
const URL_ = "https://hrnltxmwoaphgejckutk.supabase.co";

function readUserEnv(name) {
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], { encoding: "utf8" });
    const line = out.split(/\r?\n/).find((l) => l.trim().startsWith(name));
    const m = line && line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/);
    return m ? m[1] : null;
  } catch { return null; }
}
const serviceKey = readUserEnv("CONSULTX_SERVICE_KEY");
if (!serviceKey) { console.error("CONSULTX_SERVICE_KEY missing"); process.exit(2); }

const fileArg = (process.argv.find((a) => a.startsWith("--file=")) ?? "").split("=")[1];
const RULES_FILE = fileArg ?? "rules/sbc-fire-life-safety-v0.json";
const parsed = JSON.parse(readFileSync(path.join(REPO_ROOT, RULES_FILE), "utf8"));
const rules = parsed.rules ?? parsed;

/**
 * A token carries evidential weight only if finding it in the text means
 * something. Single digits ("0", "5") match almost any chunk; and a token with
 * two or more dots ("903.3.1.1") is a SECTION CROSS-REFERENCE, not a measured
 * value — the rule is saying "see that section", which is a different claim
 * from "the code prints this number here".
 */
function isCheckableValue(tok) {
  if (!/^\d+(?:\.\d+)*$/.test(tok)) return false;
  if ((tok.match(/\./g) ?? []).length >= 2) return false; // 903.3.1.1 — a reference
  return tok.includes(".") ? true : tok.length >= 2;
}

/** Numbers a rule ASSERTS about the code — the claims an auditor must find in the text. */
function assertedNumbers(rule) {
  const out = new Set();
  const add = (v) => {
    const s = typeof v === "number" && Number.isFinite(v) ? String(v)
      : typeof v === "string" ? v.trim() : "";
    if (s && isCheckableValue(s)) out.add(s);
  };
  const req = rule.requirement ?? {};
  if (req.kind === "threshold") add(req.value);
  if (req.kind === "table_lookup") {
    for (const row of req.rows ?? []) {
      if (Array.isArray(row.values)) row.values.forEach(add);
      else add(row.value);
    }
  }
  // The provenance quote is the transcription the rule was built from: every
  // number in it is a claim about what the printed code says. Tokenised as
  // FULL dotted numbers — matching `\d+(?:\.\d+)?` instead would split
  // "903.3.1.1" into "903.3" and "1.1" and then report both as missing, which
  // is an artefact of the auditor, not a defect in the rule.
  for (const tok of String(rule.provenance?.quote ?? "").match(/\d+(?:\.\d+)*/g) ?? []) {
    add(tok);
  }
  return [...out];
}

/**
 * The number to search the corpus for. Rule sections are written as printed —
 * "Table 509.1", "Table 1006.3.4(1)" — and one rule carries a whole sentence
 * here (a defect this audit found). The corpus is searched for the bare dotted
 * number, which is what its text actually contains.
 */
function searchableSection(section) {
  const m = String(section).match(/\d+(?:\.\d+)*/);
  return m ? m[0] : "";
}

async function rest(params) {
  const url = `${URL_}/rest/v1/sbc_documents?${params}`;
  const resp = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!resp.ok) throw new Error(`REST ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return await resp.json();
}

/** Standalone-token match, the same shape the citation verifier uses. */
function mentions(text, token) {
  return new RegExp(`(?<![\\d.])${token.replace(/\./g, "\\.")}(?![\\d.])`).test(text);
}

const results = [];
for (const rule of rules) {
  const code = rule.provenance?.code ?? rule.code;
  const rawSection = String(rule.provenance?.section ?? rule.section ?? "");
  const section = searchableSection(rawSection);
  const sectionMalformed = !section || !/^(Table\s+)?\d+(\.\d+)*(\(\d+\))?$/.test(rawSection.trim());
  let chunks = [];
  try {
    if (section) {
      chunks = await rest(
        `code_type=eq.${encodeURIComponent(code)}&content=ilike.${encodeURIComponent("*" + section + "*")}` +
        `&select=id,section_number,page_start,page_end,content&limit=60`,
      );
    }
  } catch (e) {
    console.log(`${rule.id}: corpus query failed — ${e.message}`);
  }
  // ilike is a substring match, so "504.3" also hits "1504.35"; keep only
  // chunks that mention the section as a standalone number.
  const hits = chunks.filter((c) => mentions(String(c.content ?? ""), section));
  const numbers = assertedNumbers(rule);

  // STRONG support: the value sits in a chunk that also names the section.
  const strong = new Map();
  for (const n of numbers) {
    for (const c of hits) {
      if (mentions(String(c.content ?? ""), n)) { strong.set(n, c.id); break; }
    }
  }
  // WEAK support: the value appears somewhere else in the same code. Worth
  // separating because the corpus is chunked mid-table — a table's continuation
  // rows routinely land in a chunk that never repeats the table's number, so a
  // strong-only audit would report correct transcriptions as unsupported.
  const weak = new Set();
  for (const n of numbers) {
    if (strong.has(n)) continue;
    try {
      const found = await rest(
        `code_type=eq.${encodeURIComponent(code)}&content=ilike.${encodeURIComponent("*" + n + "*")}` +
        `&select=id,content&limit=25`,
      );
      if (found.some((c) => mentions(String(c.content ?? ""), n))) weak.add(n);
    } catch { /* leave it unsupported */ }
  }
  const missing = numbers.filter((n) => !strong.has(n) && !weak.has(n));

  // ROW-LEVEL check for table_lookup rules. Presence of a value proves the
  // corpus is not being invented from; it does NOT prove the value was read
  // off the right row. This looks for the row's own key text and its value
  // close together in one chunk (a printed table row is a short span), which
  // is the strongest mapping evidence obtainable without a human reading the
  // PDF. A row that fails this is not necessarily wrong — table rows get split
  // across chunks — so it is reported as "unconfirmed", never as an error.
  const rowChecks = [];
  if (rule.requirement?.kind === "table_lookup") {
    const WINDOW = 220;
    for (const row of rule.requirement.rows ?? []) {
      const raw = typeof row.value === "number" ? String(row.value) : null;
      // A single-digit value ("0", "2", "3" — the hour ratings in Table 601)
      // cannot be confirmed this way: it matches almost any span of table text,
      // so a "confirmation" would carry no information and a non-match no
      // weight. Those rows are reported as not checkable, not as unconfirmed.
      const value = raw && isCheckableValue(raw) ? raw : null;
      if (raw && !value) { rowChecks.push({ row: row.id, value: raw, keys: [], checkable: false, confirmed: false }); continue; }
      const keyTexts = (row.match ?? [])
        .flatMap((m) => (Array.isArray(m.value) ? m.value : [m.value]))
        .filter((v) => typeof v === "string" && v.length >= 2)
        // Keys are written in the rule's own vocabulary ("group_e_corridor_ol_ge_100");
        // the code prints them as words. Only keys that look like printed code
        // labels (an occupancy or construction type) can be matched literally.
        .filter((v) => /^[A-Z]/.test(v) || /^[IV]+-[AB]$/.test(v));
      if (!value || keyTexts.length === 0) continue;
      let confirmed = false;
      outer: for (const c of hits) {
        const text = String(c.content ?? "");
        for (const key of keyTexts) {
          let at = text.indexOf(key);
          while (at !== -1) {
            const span = text.slice(Math.max(0, at - WINDOW), at + WINDOW);
            if (mentions(span, value)) { confirmed = true; break outer; }
            at = text.indexOf(key, at + 1);
          }
        }
      }
      rowChecks.push({ row: row.id, value, keys: keyTexts, checkable: true, confirmed });
    }
  }

  results.push({
    id: rule.id,
    code,
    section: rawSection,
    searched: section,
    section_malformed: sectionMalformed,
    status: rule.status,
    present: hits.length > 0,
    chunks: hits.length,
    numbers: numbers.length,
    strong: strong.size,
    weak: weak.size,
    missing,
    rows_checked: rowChecks.filter((r) => r.checkable).length,
    rows_confirmed: rowChecks.filter((r) => r.checkable && r.confirmed).length,
    rows_unconfirmed: rowChecks.filter((r) => r.checkable && !r.confirmed).map((r) => `${r.row}=${r.value}`),
  });
  const verdict = !hits.length
    ? "SECTION NOT IN CORPUS"
    : missing.length === 0
      ? (weak.size === 0 ? "ok" : `ok (${strong.size} in-section, ${weak.size} elsewhere in the code)`)
      : `${strong.size}+${weak.size}/${numbers.length} supported`;
  console.log(
    `${rule.id.padEnd(46)} ${code} ${section.padEnd(12)} chunks ${String(hits.length).padStart(2)} | ${verdict}` +
    (rowChecks.some((r) => r.checkable) ? ` | rows ${rowChecks.filter((r) => r.checkable && r.confirmed).length}/${rowChecks.filter((r) => r.checkable).length} key+value together` : "") +
    (missing.length ? ` | MISSING: ${missing.slice(0, 8).join(", ")}` : "") +
    (sectionMalformed ? " | SECTION FIELD MALFORMED" : ""),
  );
}

const notPresent = results.filter((r) => !r.present);
const unsupported = results.filter((r) => r.present && r.missing.length > 0);
const clean = results.filter((r) => r.present && r.missing.length === 0);
const totalNumbers = results.reduce((s, r) => s + r.numbers, 0);
const totalStrong = results.reduce((s, r) => s + r.strong, 0);
const totalWeak = results.reduce((s, r) => s + r.weak, 0);
const malformed = results.filter((r) => r.section_malformed);

console.log(`\n${results.length} rules audited against the production corpus`);
console.log(`  section present in corpus:       ${results.length - notPresent.length}/${results.length}`);
console.log(`  every asserted value found:      ${clean.length}/${results.length}`);
console.log(`  values in a chunk naming the section: ${totalStrong}/${totalNumbers}`);
console.log(`  values found elsewhere in the code:   ${totalWeak}/${totalNumbers}`);
console.log(`  values not found at all:             ${totalNumbers - totalStrong - totalWeak}/${totalNumbers}`);
if (notPresent.length) console.log(`  NOT IN CORPUS: ${notPresent.map((r) => r.id).join(", ")}`);
if (malformed.length) console.log(`  MALFORMED section field: ${malformed.map((r) => r.id).join(", ")}`);
const rowsChecked = results.reduce((s, r) => s + (r.rows_checked ?? 0), 0);
const rowsConfirmed = results.reduce((s, r) => s + (r.rows_confirmed ?? 0), 0);
if (rowsChecked) {
  console.log(`  table rows with key and value together in one chunk: ${rowsConfirmed}/${rowsChecked}`);
  const unconfirmed = results.filter((r) => (r.rows_unconfirmed ?? []).length);
  if (unconfirmed.length) {
    console.log(`  rows the corpus could not confirm as a PAIR (split table rows look like this too - engineer check):`);
    for (const r of unconfirmed) console.log(`    ${r.id.padEnd(46)} ${r.rows_unconfirmed.join(', ')}`);
  }
}
if (unsupported.length) {
  console.log(`\n  rules with unfound values (engineer must check these against the printed PDF):`);
  for (const r of unsupported) console.log(`    ${r.id.padEnd(46)} ${r.missing.join(", ")}`);
}

const outDir = path.join(REPO_ROOT, "evals", "results");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "rule-audit-latest.json");
writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), rules_file: RULES_FILE, results }, null, 2));
console.log(`\ndetail written to ${out}`);
