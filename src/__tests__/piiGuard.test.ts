/**
 * Unit tests for the pre-commit PII/secret guard.
 *
 * Covers: .githooks/pii-guard.mjs
 *
 * BACKGROUND — the incident this guard exists to prevent:
 * A docs file listing 22 real customer email addresses reached git history
 * (2026-09-02) and had to be purged with filter-branch before the branch's
 * first push. These tests pin down what the guard blocks and what it allows
 * so that contract can't silently regress.
 *
 * All email addresses and secrets used below are synthetic placeholders —
 * no real customer data or real keys appear in this file.
 *
 * pii-guard: allow-file — this suite IS a fixture of fake PII/key patterns; the
 * guard exempts it only because it lives under src/__tests__/ and says so here.
 */
import { describe, it, expect } from 'vitest';
import {
  scanLine,
  scanText,
  scanDiff,
  parseDiffAddedLines,
  isAllowlistedEmail,
  isBulkEligibleFile,
  isFixtureAllowedFile,
} from '../../.githooks/pii-guard.mjs';

describe('allow-file marker (fixture files only)', () => {
  const marked = `/**\n * fixture\n * pii-guard: allow-file\n */\nconst x = 'random.customer123@gmail.com';\n`;
  const unmarked = `const x = 'random.customer123@gmail.com';\n`;

  it('exempts a marked file under src/__tests__/', () => {
    expect(isFixtureAllowedFile('src/__tests__/foo.test.ts', marked)).toBe(true);
    expect(scanText(marked, 'src/__tests__/foo.test.ts')).toEqual([]);
  });

  it('still scans an unmarked test file', () => {
    expect(isFixtureAllowedFile('src/__tests__/foo.test.ts', unmarked)).toBe(false);
    expect(scanText(unmarked, 'src/__tests__/foo.test.ts').length).toBeGreaterThan(0);
  });

  it('never exempts a docs or data file, even when marked', () => {
    expect(isFixtureAllowedFile('docs/audits/list.md', marked)).toBe(false);
    expect(scanText(marked, 'docs/audits/list.md').length).toBeGreaterThan(0);
  });

  it('exempts a new fixture file whose marker arrives in the same diff', () => {
    const diff = [
      'diff --git a/src/__tests__/new.test.ts b/src/__tests__/new.test.ts',
      '--- /dev/null',
      '+++ b/src/__tests__/new.test.ts',
      '@@ -0,0 +1,3 @@',
      '+// pii-guard: allow-file',
      "+const e = 'random.customer123@gmail.com';",
      '+export {};',
    ].join('\n');
    expect(scanDiff(diff)).toEqual([]);
  });
});

describe('isAllowlistedEmail', () => {
  it('allows the consultx.app and consultx.ai domains, including subdomains', () => {
    expect(isAllowlistedEmail('anyone@consultx.app')).toBe(true);
    expect(isAllowlistedEmail('anyone@consultx.ai')).toBe(true);
    expect(isAllowlistedEmail('anyone@mail.consultx.app')).toBe(true);
  });

  it('allows mailnull.com and example.com placeholder domains', () => {
    expect(isAllowlistedEmail('probe@mailnull.com')).toBe(true);
    expect(isAllowlistedEmail('someone@example.com')).toBe(true);
  });

  it('allows the specific test placeholder addresses', () => {
    expect(isAllowlistedEmail('a@b.com')).toBe(true);
    expect(isAllowlistedEmail('c@d.com')).toBe(true);
    expect(isAllowlistedEmail('your@email.com')).toBe(true);
    expect(isAllowlistedEmail('ksasmoke@ksa.com')).toBe(true);
  });

  it('allows the owner address and his aliases by prefix', () => {
    expect(isAllowlistedEmail('njajrehwaseem@gmail.com')).toBe(true);
    expect(isAllowlistedEmail('waseemnjajreh20@outlook.com')).toBe(true);
    expect(isAllowlistedEmail('NjajrehWaseem+test@gmail.com')).toBe(true); // case-insensitive
  });

  it('allows consultx system mailboxes', () => {
    expect(isAllowlistedEmail('noreply@consultx.app')).toBe(true);
    expect(isAllowlistedEmail('support@consultx.app')).toBe(true);
    expect(isAllowlistedEmail('info@consultx.ai')).toBe(true);
    expect(isAllowlistedEmail('hello@consultx.app')).toBe(true);
  });

  it('blocks a customer-looking gmail address', () => {
    expect(isAllowlistedEmail('random.customer123@gmail.com')).toBe(false);
  });

  it('blocks lookalike domains that are not on the allowlist', () => {
    expect(isAllowlistedEmail('someone@consultx.app.evil.com')).toBe(false);
    expect(isAllowlistedEmail('someone@notconsultx.app')).toBe(false);
  });
});

describe('scanLine — email detection', () => {
  it('produces no findings for allowlisted addresses', () => {
    expect(scanLine('contact us at support@consultx.app for help')).toEqual([]);
    expect(scanLine('test fixture: a@b.com and c@d.com')).toEqual([]);
  });

  it('flags a customer-looking gmail address', () => {
    const findings = scanLine('customer email: random.customer123@gmail.com');
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('email');
    expect(findings[0].reason).toContain('random.customer123@gmail.com');
  });
});

describe('scanLine — secret detection', () => {
  it('flags a Google API key', () => {
    const fakeGoogleKey = 'AIza' + 'FAKE'.repeat(9); // 36 chars after "AIza" (>= 35 required)
    const findings = scanLine(`const key = "${fakeGoogleKey}";`);
    expect(findings.some((f) => f.type === 'secret' && f.reason.includes('Google API key (AIza'))).toBe(true);
  });

  it('flags an OpenAI-style key', () => {
    const findings = scanLine('OPENAI_KEY=sk-FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234');
    expect(findings.some((f) => f.reason.includes('OpenAI-style'))).toBe(true);
  });

  it('flags a Supabase secret key but not a publishable key', () => {
    const secretFindings = scanLine('key = "sb_secret_FAKE1234567890fakefake"');
    expect(secretFindings.some((f) => f.reason.includes('Supabase secret key'))).toBe(true);

    const publishableFindings = scanLine('key = "sb_publishable_FAKE1234567890fakefake"');
    expect(publishableFindings).toEqual([]);
  });

  it('flags a Moyasar/Stripe-style secret key but not the publishable key', () => {
    const secretFindings = scanLine('MOYASAR_SECRET_KEY=sk_live_FAKE1234567890fake');
    expect(secretFindings.some((f) => f.reason.includes('Moyasar/Stripe-style'))).toBe(true);

    const publishableFindings = scanLine('VITE_MOYASAR_PUBLISHABLE_KEY=pk_live_FAKE1234567890fake');
    expect(publishableFindings).toEqual([]);
  });

  it('flags a Resend API key', () => {
    const findings = scanLine('RESEND_API_KEY=re_FAKE1234567890fakefakefake');
    expect(findings.some((f) => f.reason.includes('Resend API key'))).toBe(true);
  });

  it('flags a long JWT-looking token', () => {
    const fakeJwt =
      'eyJhbGciOiJIUzI1NiJ9.' +
      'eyJmYWtlIjoidHJ1ZSIsInBhZGRpbmciOiJmYWtlZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2UifQ.' +
      'FAKESIGNATUREFAKESIGNATUREFAKESIGNATURE';
    expect(fakeJwt.length).toBeGreaterThan(100);
    const findings = scanLine(`token: ${fakeJwt}`);
    expect(findings.some((f) => f.reason.includes('JWT-looking token'))).toBe(true);
  });

  it('flags a private key block', () => {
    const findings = scanLine('-----BEGIN RSA PRIVATE KEY-----');
    expect(findings.some((f) => f.reason.includes('Private key block'))).toBe(true);
  });

  it('suppresses any finding on a line carrying the allow marker', () => {
    const findings = scanLine('const key = "AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12"; // pii-guard: allow');
    expect(findings).toEqual([]);
  });
});

describe('scanText — bulk email-list rule for data files', () => {
  const fiveEmails = [
    'buyer1@gmail.com',
    'buyer2@yahoo.com',
    'buyer3@hotmail.com',
    'buyer4@gmail.com',
    'buyer5@outlook.com',
  ];

  it('flags a CSV containing 5+ distinct emails', () => {
    const csv = ['name,email', ...fiveEmails.map((e, i) => `Customer ${i},${e}`)].join('\n');
    const findings = scanText(csv, 'docs/campaigns/export-not-actually-ignored.csv');
    expect(findings.some((f) => f.type === 'bulk-email-list')).toBe(true);
  });

  it('flags a docs/ markdown file with 5+ distinct emails', () => {
    const md = `# Recipient list\n\n${fiveEmails.join('\n')}\n`;
    const findings = scanText(md, 'docs/launch/recipient-list.md');
    expect(findings.some((f) => f.type === 'bulk-email-list')).toBe(true);
  });

  it('does not flag a code file with 2 allowlisted test emails', () => {
    const code = `const FIXTURES = ["a@b.com", "c@d.com"]; // test fixtures\n`;
    const findings = scanText(code, 'src/lib/fixtures.ts');
    expect(findings).toEqual([]);
  });

  it('does not treat a non-docs, non-csv/xlsx file as bulk-eligible even with 5+ emails', () => {
    const code = `const emails = [${fiveEmails.map((e) => `"${e}"`).join(', ')}];\n`;
    const findings = scanText(code, 'src/lib/notBulkEligible.ts');
    // Per-line email findings still fire (these are not allowlisted), but no
    // aggregate bulk-email-list finding, since .ts under src/ is not eligible.
    expect(findings.some((f) => f.type === 'bulk-email-list')).toBe(false);
    expect(findings.filter((f) => f.type === 'email')).toHaveLength(5);
  });
});

describe('isBulkEligibleFile', () => {
  it('treats .csv and .xlsx as eligible anywhere in the tree', () => {
    expect(isBulkEligibleFile('docs/campaigns/list.csv')).toBe(true);
    expect(isBulkEligibleFile('exports/list.xlsx')).toBe(true);
  });

  it('treats .json/.md/.txt as eligible only under docs/', () => {
    expect(isBulkEligibleFile('docs/launch/notes.md')).toBe(true);
    expect(isBulkEligibleFile('docs/data/dump.json')).toBe(true);
    expect(isBulkEligibleFile('src/data/dump.json')).toBe(false);
    expect(isBulkEligibleFile('README.md')).toBe(false);
  });

  it('does not treat source extensions as eligible', () => {
    expect(isBulkEligibleFile('docs/launch/script.ts')).toBe(false);
  });
});

describe('parseDiffAddedLines / scanDiff — added-lines-only contract', () => {
  const fakeGoogleKey = 'AIza' + 'FAKE'.repeat(9); // 36 chars after "AIza" (>= 35 required)
  const diff = [
    'diff --git a/src/example.ts b/src/example.ts',
    'index 0000000..1111111 100644',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -5,0 +6,2 @@',
    '+const removedCustomer = "old@gmail.com"; // this line is a - in a real diff normally',
    `+const key = "${fakeGoogleKey}";`,
  ].join('\n');

  it('extracts added lines with correct file and new-file line numbers', () => {
    const added = parseDiffAddedLines(diff);
    expect(added).toEqual([
      { file: 'src/example.ts', line: 6, text: expect.stringContaining('removedCustomer') },
      { file: 'src/example.ts', line: 7, text: expect.stringContaining('AIzaFAKE') },
    ]);
  });

  it('ignores removed (-) lines entirely', () => {
    const diffWithRemoval = [
      'diff --git a/src/example.ts b/src/example.ts',
      '--- a/src/example.ts',
      '+++ b/src/example.ts',
      '@@ -6,1 +6,0 @@',
      '-const customer = "leaked@gmail.com";',
    ].join('\n');
    expect(scanDiff(diffWithRemoval)).toEqual([]);
  });

  it('flags secrets and non-allowlisted emails found in added lines', () => {
    const findings = scanDiff(diff);
    expect(findings).toHaveLength(2);
    expect(findings.find((f) => f.type === 'email')?.line).toBe(6);
    expect(findings.find((f) => f.type === 'secret')?.line).toBe(7);
  });

  it('skips bulk-eligible files in the diff pass (they get a full-content scan instead)', () => {
    const csvDiff = [
      'diff --git a/docs/campaigns/list.csv b/docs/campaigns/list.csv',
      '--- a/docs/campaigns/list.csv',
      '+++ b/docs/campaigns/list.csv',
      '@@ -0,0 +1,1 @@',
      '+new@gmail.com',
    ].join('\n');
    expect(scanDiff(csvDiff)).toEqual([]);
  });
});
