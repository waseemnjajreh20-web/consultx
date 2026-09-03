/**
 * Tests for the evals/golden/ artifacts built by scripts/golden-set.mjs.
 *
 * This deliberately does NOT import scripts/golden-set.mjs. That file is a
 * plain ESM .mjs module with no .d.ts, and tsconfig.app.json -- which
 * `npx tsc --noEmit -p tsconfig.app.json` type-checks, and which this test
 * file falls under via its own "include": ["src"] -- does not set
 * `allowJs`. Without it TS refuses to resolve a .mjs import at all (a hard
 * "Cannot find module" error on the static import), and touching
 * tsconfig.app.json is out of scope for this change. So instead this file
 * verifies the COMMITTED OUTPUT ARTIFACTS directly --
 * evals/golden/candidates-20260903.json and
 * evals/golden/review-sheet-20260903.csv -- the same pattern
 * wave2Wiring.test.ts uses to read supabase/functions source files straight
 * off disk with __dirname + node:fs rather than importing them. Checking
 * the artifacts is arguably the more faithful test anyway: it proves what
 * actually shipped, not just what the generator's internals do in
 * isolation.
 *
 * Regenerate the artifacts with `node scripts/golden-set.mjs` (the full
 * "generated" set needs the D:\SBC_2024_intake corpus to reproduce -- see
 * that script's header for the idempotency guarantee that keeps a re-run
 * from clobbering a prior human review pass done via --import).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES_PATH = path.resolve(__dirname, "../../evals/golden/candidates-20260903.json");
const REVIEW_SHEET_PATH = path.resolve(__dirname, "../../evals/golden/review-sheet-20260903.csv");

const VALID_SOURCES = ["benchmark", "gate", "generated"];
const VALID_STATUSES = ["candidate", "validated", "rejected"];

interface Candidate {
  id: string;
  question_ar: string;
  category: string;
  code_family: string;
  expected_sections: string[];
  source: string;
  status: string;
  validator?: string;
  validated_at?: string;
  notes?: string;
}

// Minimal RFC4180 CSV parser, deliberately re-implemented here rather than
// imported from scripts/golden-set.mjs (see file header). Exercised below
// against the real, committed review-sheet CSV, so any drift between the
// generator's writer and this reader shows up as a test failure.
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow; a following \n closes the row
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function loadCandidates(): Candidate[] {
  return JSON.parse(readFileSync(CANDIDATES_PATH, "utf8"));
}

describe("evals/golden/candidates-20260903.json", () => {
  it("exists and is a non-empty JSON array", () => {
    expect(existsSync(CANDIDATES_PATH)).toBe(true);
    const candidates = loadCandidates();
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("has at least 200 entries", () => {
    expect(loadCandidates().length).toBeGreaterThanOrEqual(200);
  });

  it("every entry matches the candidate schema", () => {
    for (const c of loadCandidates()) {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.question_ar).toBe("string");
      expect(c.question_ar.length).toBeGreaterThan(0);
      expect(typeof c.category).toBe("string");
      expect(c.category.length).toBeGreaterThan(0);
      expect(typeof c.code_family).toBe("string");
      expect(c.code_family.length).toBeGreaterThan(0);
      expect(Array.isArray(c.expected_sections)).toBe(true);
      for (const s of c.expected_sections) expect(typeof s).toBe("string");
      expect(VALID_SOURCES).toContain(c.source);
      expect(VALID_STATUSES).toContain(c.status);
      if (c.validator !== undefined) expect(typeof c.validator).toBe("string");
      if (c.validated_at !== undefined) expect(typeof c.validated_at).toBe("string");
      if (c.notes !== undefined) expect(typeof c.notes).toBe("string");
    }
  });

  it("has unique ids across the whole file", () => {
    const ids = loadCandidates().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes benchmark, gate, and generated entries, each present", () => {
    const bySource: Record<string, number> = {};
    for (const c of loadCandidates()) bySource[c.source] = (bySource[c.source] ?? 0) + 1;
    expect(bySource.benchmark).toBeGreaterThan(0);
    expect(bySource.gate).toBeGreaterThan(0);
    expect(bySource.generated).toBeGreaterThan(0);
  });

  it('never claims "validated" for a gate or generated entry (only the pre-existing benchmark set starts validated)', () => {
    for (const c of loadCandidates()) {
      if (c.source === "generated" || c.source === "gate") {
        expect(c.status).toBe("candidate");
      }
    }
  });

  it("every generated entry has non-empty expected_sections and a traceable source pointer in notes", () => {
    const generated = loadCandidates().filter((c) => c.source === "generated");
    expect(generated.length).toBeGreaterThan(0);
    for (const c of generated) {
      expect(c.expected_sections.length).toBeGreaterThan(0);
      expect(typeof c.notes).toBe("string");
      // Traceable back to the exact corpus chunk + page it was pulled from.
      expect(c.notes).toMatch(/chunk\s+\S+/);
      expect(c.notes).toMatch(/page\s+\d+/);
    }
  });

  it("keeps the 4 gate negative-control rows with empty expected_sections and a clear marker", () => {
    const negatives = loadCandidates().filter((c) => c.source === "gate" && c.expected_sections.length === 0);
    expect(negatives.length).toBe(4);
    for (const c of negatives) expect(c.notes).toMatch(/NEGATIVE CONTROL/);
  });
});

describe("evals/golden/review-sheet-20260903.csv", () => {
  it("exists, is UTF-8 with a BOM, and has the expected header row", () => {
    expect(existsSync(REVIEW_SHEET_PATH)).toBe(true);
    const buf = readFileSync(REVIEW_SHEET_PATH);
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = parseCsv(buf.toString("utf8"));
    expect(rows[0]).toEqual([
      "id",
      "question",
      "expected sections",
      "decision (accept/edit/reject)",
      "corrected answer key",
      "notes",
    ]);
  });

  it("round-trips every status=candidate entry in order, with matching question and expected_sections", () => {
    const candidates = loadCandidates().filter((c) => c.status === "candidate");
    const rows = parseCsv(readFileSync(REVIEW_SHEET_PATH, "utf8")).slice(1);
    expect(rows.length).toBe(candidates.length);
    rows.forEach((row, i) => {
      expect(row[0]).toBe(candidates[i].id);
      expect(row[1]).toBe(candidates[i].question_ar);
      expect(row[2]).toBe(candidates[i].expected_sections.join("; "));
    });
  });

  it("leaves the decision and corrected-answer-key columns blank on a fresh sheet", () => {
    const rows = parseCsv(readFileSync(REVIEW_SHEET_PATH, "utf8")).slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row[3]).toBe("");
      expect(row[4]).toBe("");
    }
  });

  it("does not include already-validated (benchmark) entries", () => {
    const benchmarkIds = new Set(loadCandidates().filter((c) => c.source === "benchmark").map((c) => c.id));
    const rows = parseCsv(readFileSync(REVIEW_SHEET_PATH, "utf8")).slice(1);
    for (const row of rows) expect(benchmarkIds.has(row[0])).toBe(false);
  });
});
