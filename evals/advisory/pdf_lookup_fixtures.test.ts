// ConsultX Advisory — offline fixture tests for the Live PDF Lookup V1 helper
//
// These fixtures lock in the deterministic-gate behavior of lookupPdfSourceTextV1
// without making real Supabase storage calls. Each test mocks supabaseAdmin.storage
// to return a synthetic index + artifact payload.
//
// The helper is INLINE in supabase/functions/fire-safety-chat/index.ts (Phase 1B).
// We re-implement the deterministic surface here as a contract mirror, the same
// pattern used by intent_gate_fixtures.test.ts.
//
// Run:  npx tsx evals/advisory/pdf_lookup_fixtures.test.ts
//
// Phase 1B contract scenarios (locked here):
//   1. Flag OFF → not_found, diagnostic=disabled_by_flag
//   2. Wrong mode (Main / Analytical) → not_found
//   3. Figure ref → not_found
//   4. Index miss (no entry for code+ref) → not_found
//   5. Hyphenated input ref normalizes to dot form
//   6. Excerpt truncation at max_excerpt_chars
//   7. Page-marker exact match → confidence=exact, should_answer_compliance=true
//   8. Page-only fallback → confidence=likely, should_answer_compliance=false

// ───────────────────────────────────────────────────────────────────────────────
// Production mirrors (copies of helper internals — keep in sync with
// supabase/functions/fire-safety-chat/index.ts lookupPdfSourceTextV1 block)
// ───────────────────────────────────────────────────────────────────────────────

interface PdfLookupInput {
  code: "SBC201" | "SBC801";
  ref_type: "section" | "table" | "figure";
  ref: string;
  query: string;
  max_excerpt_chars?: number;
  mode: string;
}

interface PdfLookupOutput {
  found: boolean;
  confidence: "exact" | "likely" | "not_found";
  code: "SBC201" | "SBC801";
  ref: string;
  ref_type: "section" | "table" | "figure";
  pdf_file: string | null;
  page_start: number | null;
  page_end: number | null;
  excerpt: string | null;
  citation_label: string | null;
  limitations: string | null;
  should_answer_compliance: boolean;
  diagnostic: string;
}

interface PdfIndexEntry {
  code: string;
  ref_type: string;
  ref: string;
  normalized_ref: string;
  pdf_path: string | null;
  page_start: number | null;
  page_end: number | null;
  confidence: string;
  source_method: string;
}

interface PdfIndexDoc {
  entries: PdfIndexEntry[];
}

interface TextArtifact {
  code: string;
  pdf_file: string;
  page_count: number;
  pages: Array<{ page: number; char_count: number; text: string }>;
}

function pdfLookupNormalizeRef(s: string): string {
  return String(s || "").replace(/-/g, ".").trim();
}

function findIndexEntry(idx: PdfIndexDoc, code: string, refType: string, ref: string): PdfIndexEntry | null {
  const norm = pdfLookupNormalizeRef(ref);
  for (const e of idx.entries) {
    if (e.code === code && e.ref_type === refType) {
      const eNorm = pdfLookupNormalizeRef(e.ref);
      const eIdxNorm = e.normalized_ref ? pdfLookupNormalizeRef(e.normalized_ref) : eNorm;
      if (eNorm === norm || eIdxNorm === norm) return e;
    }
  }
  return null;
}

function findSectionInPages(
  pages: TextArtifact["pages"],
  ref: string,
  refType: string,
  pageHintStart: number | null,
  pageHintEnd: number | null,
): { page: number; matchStart: number; method: "exact" | "page_only" } | null {
  const refForMatch = ref.replace(/-/g, "[\\-.]");
  let markerRx: RegExp;
  if (refType === "section") {
    markerRx = new RegExp(`(?:^|\\n|\\s)(?:Section\\s+)?${refForMatch}(?:\\s+[A-Z\\u0600-\\u06FF]|\\s*\\.|\\s*$)`, "m");
  } else if (refType === "table") {
    markerRx = new RegExp(`Table\\s+${refForMatch}\\b`, "i");
  } else {
    markerRx = new RegExp(`Figure\\s+${refForMatch}\\b`, "i");
  }
  const hintStart = pageHintStart || 1;
  const hintEnd = pageHintEnd || hintStart;
  const winStart = Math.max(1, hintStart - 2);
  const winEnd = hintEnd + 2;
  for (const p of pages) {
    if (p.page < winStart || p.page > winEnd) continue;
    const m = markerRx.exec(p.text);
    if (m) return { page: p.page, matchStart: m.index, method: "exact" };
  }
  for (const p of pages) {
    if (p.page < winStart || p.page > winEnd) continue;
    if (p.text && p.text.length > 100) {
      return { page: p.page, matchStart: 0, method: "page_only" };
    }
  }
  return null;
}

function extractExcerptAroundMatch(pageText: string, matchStart: number, maxChars: number): string {
  if (matchStart >= pageText.length) return "";
  const end = Math.min(pageText.length, matchStart + maxChars);
  let slice = pageText.slice(matchStart, end);
  slice = slice.replace(/^\s+/, "");
  if (end < pageText.length) {
    const lastSpace = slice.lastIndexOf("\n\n");
    if (lastSpace > maxChars * 0.5) slice = slice.slice(0, lastSpace);
    else {
      const lastDot = slice.lastIndexOf(". ");
      if (lastDot > maxChars * 0.5) slice = slice.slice(0, lastDot + 1);
    }
    slice += " …[truncated]";
  }
  return slice.trim();
}

function buildPdfLookupNotFound(input: PdfLookupInput, diagnostic: string): PdfLookupOutput {
  return {
    found: false,
    confidence: "not_found",
    code: input.code,
    ref: input.ref,
    ref_type: input.ref_type,
    pdf_file: null,
    page_start: null,
    page_end: null,
    excerpt: null,
    citation_label: null,
    limitations: null,
    should_answer_compliance: false,
    diagnostic,
  };
}

// Mock helper that mimics production lookupPdfSourceTextV1 but accepts injected
// index + artifact payloads instead of calling Supabase storage.
async function lookupPdfSourceTextV1Mock(
  input: PdfLookupInput,
  envFlag: string | undefined,
  injected: { idx: PdfIndexDoc | null; artifacts: Record<string, TextArtifact> },
): Promise<PdfLookupOutput> {
  if (envFlag !== "1") return buildPdfLookupNotFound(input, "disabled_by_flag");
  if (input.mode !== "standard") return buildPdfLookupNotFound(input, "wrong_mode_" + input.mode);
  if (input.ref_type === "figure") return buildPdfLookupNotFound(input, "figure_not_supported_v1");

  const maxChars = input.max_excerpt_chars && input.max_excerpt_chars > 0
    ? Math.min(input.max_excerpt_chars, 1500)
    : 1200;

  if (!injected.idx) return buildPdfLookupNotFound(input, "index_unavailable");
  const entry = findIndexEntry(injected.idx, input.code, input.ref_type, input.ref);
  if (!entry) return buildPdfLookupNotFound(input, "index_miss");
  if (!entry.pdf_path) return buildPdfLookupNotFound(input, "no_pdf_path_in_index");

  const artifact = injected.artifacts[entry.pdf_path];
  if (!artifact) return buildPdfLookupNotFound(input, "artifact_unavailable");

  const refIdForMatch = entry.normalized_ref || entry.ref;
  const match = findSectionInPages(
    artifact.pages, refIdForMatch, input.ref_type,
    entry.page_start, entry.page_end,
  );
  if (!match) return buildPdfLookupNotFound(input, "marker_not_found_in_window");

  const matchedPage = artifact.pages.find(p => p.page === match.page);
  if (!matchedPage) return buildPdfLookupNotFound(input, "page_not_in_artifact");

  const excerpt = extractExcerptAroundMatch(matchedPage.text, match.matchStart, maxChars);
  if (!excerpt || excerpt.length < 30) return buildPdfLookupNotFound(input, "excerpt_too_thin");

  const confidence: "exact" | "likely" = match.method === "exact" ? "exact" : "likely";
  const refKindLabel = input.ref_type === "table" ? "Table" : "Section";
  const familyLabel = input.code === "SBC201" ? "SBC-201" : "SBC-801";
  const citationLabel = `${familyLabel} ${refKindLabel} ${refIdForMatch} (p. ${match.page}, live PDF)`;

  return {
    found: true,
    confidence,
    code: input.code,
    ref: input.ref,
    ref_type: input.ref_type,
    pdf_file: entry.pdf_path,
    page_start: match.page,
    page_end: match.page,
    excerpt,
    citation_label: citationLabel,
    limitations: confidence === "likely"
      ? "Section anchor not located precisely; excerpt is from the page-level neighborhood and may include adjacent content."
      : null,
    should_answer_compliance: confidence === "exact",
    diagnostic: `method=${match.method} index_method=${entry.source_method}`,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Synthetic test data
// ───────────────────────────────────────────────────────────────────────────────

const synthIndex: PdfIndexDoc = {
  entries: [
    {
      code: "SBC801", ref_type: "section", ref: "903.2.7",
      normalized_ref: "903.2.7",
      pdf_path: "SBC801/pp_0801-1000.pdf",
      page_start: 712, page_end: 712,
      confidence: "exact", source_method: "ledger",
    },
    {
      code: "SBC201", ref_type: "table", ref: "1004.5",
      normalized_ref: "1004.5",
      pdf_path: "SBC201/pp_0501-1000.pdf",
      page_start: 612, page_end: 614,
      confidence: "likely", source_method: "manual_seed",
    },
    {
      code: "SBC801", ref_type: "section", ref: "915.5.1",
      normalized_ref: "915.5.1",
      pdf_path: "SBC801/pp_1001-1200.pdf",
      page_start: 1042, page_end: 1042,
      confidence: "likely", source_method: "ledger_no_page",
    },
    {
      code: "SBC801", ref_type: "section", ref: "102-7-1",
      normalized_ref: "102.7.1",
      pdf_path: "SBC801/pp_0001-0200.pdf",
      page_start: 50, page_end: 50,
      confidence: "likely", source_method: "ledger_no_page",
    },
  ],
};

const synthArtifacts: Record<string, TextArtifact> = {
  "SBC801/pp_0801-1000.pdf": {
    code: "SBC801", pdf_file: "SBC801/pp_0801-1000.pdf", page_count: 200,
    pages: [
      { page: 711, char_count: 200, text: "Some text on prior page about sprinkler systems and adjacent context." },
      {
        page: 712, char_count: 800,
        text: "903.2.7 Group M. An automatic sprinkler system shall be provided throughout buildings containing a Group M occupancy where one of the following conditions exists. The fire area exceeds 1,200 square meters. The fire area is located more than three stories above the lowest level of fire department vehicle access. The combined area of all Group M fire areas on all floors exceeds 2,400 square meters. Subsequent paragraphs continue with details that match this section content.",
      },
      { page: 713, char_count: 250, text: "Continuing into 903.2.8 Group R requirements which is a different section entirely." },
    ],
  },
  "SBC201/pp_0501-1000.pdf": {
    code: "SBC201", pdf_file: "SBC201/pp_0501-1000.pdf", page_count: 500,
    pages: [
      {
        page: 612, char_count: 600,
        text: "Table 1004.5 — MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT\nFunction Of Space ... Floor Area In M2 Per Occupant\nAccessory storage areas ... 28\nAssembly without fixed seats ... 1.4 (concentrated)\n2.8 (loose)\n5.0 (standing)\nBusiness areas ... 9.3\nMercantile areas ... 5.6 — basement and grade floor\nMercantile areas ... 5.6 — upper floors",
      },
    ],
  },
  "SBC801/pp_1001-1200.pdf": {
    code: "SBC801", pdf_file: "SBC801/pp_1001-1200.pdf", page_count: 200,
    pages: [
      {
        page: 1042, char_count: 700,
        text: "Some general fire-protection text on this page covering several topics like detection and notification. The page does not contain the literal section anchor but covers the general subject area. More content fills this page including notification appliance specifications, audible signal requirements, and visible signal coverage areas. The section we want is conceptually here but the marker doesn't appear on this exact page.",
      },
    ],
  },
  "SBC801/pp_0001-0200.pdf": {
    code: "SBC801", pdf_file: "SBC801/pp_0001-0200.pdf", page_count: 200,
    pages: [
      {
        page: 50, char_count: 500,
        text: "102.7.1 Some administrative content about applicability of the code, jurisdictional scope, and how the provisions apply to existing buildings. This subsection is a sub-clause of section 102.7 and is referenced as 102.7.1 throughout the code. More text continues to fill the page.",
      },
    ],
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────────

interface Fixture {
  scenario: string;
  input: PdfLookupInput;
  envFlag: string | undefined;
  injected: { idx: PdfIndexDoc | null; artifacts: Record<string, TextArtifact> };
  expect: {
    found: boolean;
    confidence: PdfLookupOutput["confidence"];
    should_answer_compliance: boolean;
    diagnosticIncludes?: string;
    excerptIncludes?: string;
    pageStart?: number | null;
  };
  rationale: string;
}

const FIXTURES: Fixture[] = [
  {
    scenario: "1 — Flag OFF returns disabled_by_flag",
    input: { code: "SBC801", ref_type: "section", ref: "903.2.7", query: "test", mode: "standard" },
    envFlag: undefined,
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: false, confidence: "not_found", should_answer_compliance: false, diagnosticIncludes: "disabled_by_flag" },
    rationale: "When ADVISORY_PDF_LOOKUP_ENABLED is unset, the helper must short-circuit before any storage call. This is the safe default.",
  },
  {
    scenario: "2a — Wrong mode (main) returns wrong_mode",
    input: { code: "SBC801", ref_type: "section", ref: "903.2.7", query: "test", mode: "main" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: false, confidence: "not_found", should_answer_compliance: false, diagnosticIncludes: "wrong_mode_main" },
    rationale: "Helper is Advisory-only. Main mode call must return not_found.",
  },
  {
    scenario: "2b — Wrong mode (analysis) returns wrong_mode",
    input: { code: "SBC801", ref_type: "section", ref: "903.2.7", query: "test", mode: "analysis" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: false, confidence: "not_found", should_answer_compliance: false, diagnosticIncludes: "wrong_mode_analysis" },
    rationale: "Analytical mode must NOT trigger live PDF lookup either.",
  },
  {
    scenario: "3 — Figure ref returns figure_not_supported_v1",
    input: { code: "SBC201", ref_type: "figure", ref: "10-1", query: "test", mode: "standard" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: false, confidence: "not_found", should_answer_compliance: false, diagnosticIncludes: "figure_not_supported_v1" },
    rationale: "V1 does not support figure refs. They return not_found cleanly.",
  },
  {
    scenario: "4 — Index miss for unknown ref returns index_miss",
    input: { code: "SBC801", ref_type: "section", ref: "9999.9", query: "test", mode: "standard" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: false, confidence: "not_found", should_answer_compliance: false, diagnosticIncludes: "index_miss" },
    rationale: "Section not in synthetic index — helper returns not_found with diagnostic.",
  },
  {
    scenario: "5 — Hyphenated ref 102-7-1 normalizes to dot form 102.7.1",
    input: { code: "SBC801", ref_type: "section", ref: "102-7-1", query: "test", mode: "standard" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: true, confidence: "exact", should_answer_compliance: true, excerptIncludes: "102.7.1", pageStart: 50 },
    rationale: "Hyphen-form ref input must normalize and match the dotted-form entry. Marker on the page uses dotted form.",
  },
  {
    scenario: "6 — Excerpt truncation at max_excerpt_chars",
    input: { code: "SBC801", ref_type: "section", ref: "903.2.7", query: "test", mode: "standard", max_excerpt_chars: 80 },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: true, confidence: "exact", should_answer_compliance: true, excerptIncludes: "903.2.7" },
    rationale: "max_excerpt_chars=80 means the excerpt should be ≤ 80 chars + truncation suffix.",
  },
  {
    scenario: "7 — Exact section match returns confidence=exact",
    input: { code: "SBC801", ref_type: "section", ref: "903.2.7", query: "sprinkler", mode: "standard" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: true, confidence: "exact", should_answer_compliance: true, excerptIncludes: "903.2.7", pageStart: 712 },
    rationale: "Marker '903.2.7 Group M' is on page 712 of the synthetic artifact. Helper finds it via regex and returns exact.",
  },
  {
    scenario: "8 — Page-only fallback returns confidence=likely",
    input: { code: "SBC801", ref_type: "section", ref: "915.5.1", query: "alarm", mode: "standard" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: true, confidence: "likely", should_answer_compliance: false, pageStart: 1042 },
    rationale: "Synthetic page 1042 has substantive text but does NOT contain the literal '915.5.1' marker. Helper falls back to page-only match → confidence=likely.",
  },
  {
    scenario: "9 — Table ref Table 1004.5 returns exact",
    input: { code: "SBC201", ref_type: "table", ref: "1004.5", query: "occupant load", mode: "standard" },
    envFlag: "1",
    injected: { idx: synthIndex, artifacts: synthArtifacts },
    expect: { found: true, confidence: "exact", should_answer_compliance: true, excerptIncludes: "1004.5", pageStart: 612 },
    rationale: "Synthetic table page contains 'Table 1004.5 — MAXIMUM FLOOR AREA...'. Helper matches table marker and returns exact with page=612.",
  },
];

// ───────────────────────────────────────────────────────────────────────────────
// Runner
// ───────────────────────────────────────────────────────────────────────────────

interface RowResult {
  scenario: string;
  pass: boolean;
  detail: string;
}

async function runOne(fx: Fixture): Promise<RowResult> {
  const out = await lookupPdfSourceTextV1Mock(fx.input, fx.envFlag, fx.injected);
  const failures: string[] = [];

  if (out.found !== fx.expect.found) failures.push(`found: expected=${fx.expect.found} got=${out.found}`);
  if (out.confidence !== fx.expect.confidence) failures.push(`confidence: expected=${fx.expect.confidence} got=${out.confidence}`);
  if (out.should_answer_compliance !== fx.expect.should_answer_compliance) {
    failures.push(`should_answer_compliance: expected=${fx.expect.should_answer_compliance} got=${out.should_answer_compliance}`);
  }
  if (fx.expect.diagnosticIncludes && !out.diagnostic.includes(fx.expect.diagnosticIncludes)) {
    failures.push(`diagnostic missing '${fx.expect.diagnosticIncludes}': got '${out.diagnostic}'`);
  }
  if (fx.expect.excerptIncludes) {
    if (!out.excerpt || !out.excerpt.includes(fx.expect.excerptIncludes)) {
      failures.push(`excerpt missing '${fx.expect.excerptIncludes}': got '${(out.excerpt || "").slice(0, 80)}…'`);
    }
  }
  if (fx.expect.pageStart !== undefined && out.page_start !== fx.expect.pageStart) {
    failures.push(`page_start: expected=${fx.expect.pageStart} got=${out.page_start}`);
  }

  // Truncation check (scenario 6 specifically)
  if (fx.input.max_excerpt_chars && out.excerpt) {
    if (out.excerpt.length > fx.input.max_excerpt_chars + 50) {
      failures.push(`excerpt length ${out.excerpt.length} exceeds max_excerpt_chars ${fx.input.max_excerpt_chars} + 50 buffer`);
    }
  }

  return {
    scenario: fx.scenario,
    pass: failures.length === 0,
    detail: failures.length === 0 ? "ok" : failures.join("; "),
  };
}

async function runAll(): Promise<{ rows: RowResult[]; passCount: number; failCount: number }> {
  const rows: RowResult[] = [];
  for (const fx of FIXTURES) rows.push(await runOne(fx));
  const passCount = rows.filter(r => r.pass).length;
  const failCount = rows.length - passCount;
  return { rows, passCount, failCount };
}

declare const Deno: { test?: (name: string, fn: () => void | Promise<void>) => void } | undefined;

if (typeof Deno !== "undefined" && typeof Deno.test === "function") {
  for (const fx of FIXTURES) {
    Deno.test(fx.scenario, async () => {
      const r = await runOne(fx);
      if (!r.pass) throw new Error(`${fx.scenario} FAILED — ${r.detail}\n  rationale: ${fx.rationale}`);
    });
  }
}

async function main(): Promise<number> {
  const { rows, passCount, failCount } = await runAll();
  console.log("=== ConsultX Advisory PDF Lookup Fixtures ===");
  for (const r of rows) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(`[${tag}] ${r.scenario} — ${r.detail}`);
  }
  console.log(`\nResult: ${passCount} passed / ${failCount} failed (total ${rows.length})`);
  return failCount === 0 ? 0 : 1;
}

const isDirectRun =
  typeof Deno === "undefined" ||
  (typeof Deno !== "undefined" && typeof Deno.test !== "function");
if (isDirectRun) {
  main().then(code => {
    if (typeof process !== "undefined" && typeof process.exit === "function") process.exit(code);
  });
}

export { FIXTURES, lookupPdfSourceTextV1Mock, runAll };
