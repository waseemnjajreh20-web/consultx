#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write
/**
 * ConsultX Vision Ground-Truth Eval Harness — Phase P7 (harness only)
 *
 * PRIVACY HARD RULE: client drawings are read from local disk only. They
 * must NEVER be uploaded to Supabase, storage buckets, git, or any
 * third-party service. The ONLY permitted network egress is the direct
 * Gemini API call for evaluation, using an owner-provided key from the
 * environment. Do not commit drawing files or their derived images. This
 * harness is local-and-manual only — never wired into CI.
 *
 * ---------------------------------------------------------------------------
 * What this measures
 * ---------------------------------------------------------------------------
 * fire-safety-chat/index.ts runs a 5-stage vision mission for image-attached
 * requests; Stage 1 ("Planning Agent", see getVisionPlanningPrompt around
 * index.ts line 1903) is a single-shot JSON extraction of what is literally
 * visible on an engineering drawing (document type, sheet context, room
 * labels, legend symbols, image quality, etc.). This harness re-sends a
 * Stage-1-style prompt (the English variant, reproduced locally below — see
 * "Prompt provenance" further down) against real, local, owner-approved
 * project drawings and scores the extraction against hand-reviewed
 * expected-facts files. It does NOT run Stage 2-5 (chain-of-thought, SBC
 * retrieval, compliance verdict) — this is an extraction-fidelity eval only,
 * not an advisory-correctness eval, and it does not call or modify
 * index.ts in any way.
 *
 * ---------------------------------------------------------------------------
 * Dry mode (default — no key needed, no network call)
 * ---------------------------------------------------------------------------
 *   deno run --allow-read --allow-write --allow-env \
 *     evals/vision/run_vision_eval.ts
 *
 * Validates evals/vision/cases.json: warns (never fails) when a case's local
 * source_path is absent on this machine — these are owner-local drawings
 * that will not exist on every workstation or CI runner by design — and
 * validates each case's expected-facts JSON parses and has the required
 * shape. Prints the case table and always exits 0 (a diagnostic tool, not a
 * gate — see the PRIVACY HARD RULE above: this harness is never wired into
 * CI, so there is nothing that dry-mode exit-code failure could gate).
 *
 * ---------------------------------------------------------------------------
 * Live mode (calls the Gemini API directly — never Supabase, never CI)
 * ---------------------------------------------------------------------------
 *   VISION_EVAL_LIVE=1 \
 *   GOOGLE_GEMINI_API_KEY=<owner-provided-key> \
 *   deno run --allow-read --allow-write --allow-env --allow-net \
 *     evals/vision/run_vision_eval.ts
 *
 * VISION_EVAL_LIVE uses exact-string "1" semantics — any other value (unset,
 * "0", "true", ...) runs dry mode. GOOGLE_GEMINI_API_KEY is named to match
 * the Gemini key convention already used by fire-safety-chat/index.ts
 * (`Deno.env.get("GOOGLE_GEMINI_API_KEY")`, see index.ts lines ~1710/2414).
 * The key is transmitted as an `x-goog-api-key` header, never in a URL query
 * string — see geminiAuthHeaders() for why this deliberately diverges from
 * index.ts's `?key=` form.
 *
 * NOT VERIFIED: live mode has never been executed end-to-end. No Gemini API
 * key exists in the development environment this harness was written in, so
 * the upload/generate/score path is reviewed-and-type-checked but not
 * runtime-proven. Expect to debug the first live run.
 *
 * For each case, live mode uploads the local PDF bytes directly to the
 * Gemini Files API, sends the Stage-1-style planning prompt against it, and
 * scores the parsed JSON extraction against the case's expected-facts file.
 * Results are written to evals/vision/results/{YYYY-MM-DD}/results.json and
 * report.md (both gitignored — see evals/vision/results/.gitignore).
 *
 * ---------------------------------------------------------------------------
 * Why Gemini Files API + raw PDF bytes, not pdf-to-image rendering
 * ---------------------------------------------------------------------------
 * fire-safety-chat/index.ts's own vision pipeline sends pre-rendered JPEG
 * page images (see src/lib/pdfToImages.ts, which needs a browser <canvas>
 * and pdfjs-dist — both unavailable in a Deno CLI script). Re-implementing
 * that rendering here would add a real dependency to a harness whose whole
 * job is to stay simple and local. Gemini's generateContent API accepts a
 * PDF directly (file_data with mime_type "application/pdf") and reads it
 * page-by-page natively, so this harness uploads the PDF bytes as-is via the
 * Files API (POST .../upload/v1beta/files, resumable protocol) instead of
 * inlining base64 bytes in the request body — inline requests are capped
 * around 20MB and two of the three seed cases' source PDFs exceed or sit
 * close to that ceiling (NHC-DWG-24.pdf is ~30MB, test_plan.pdf is ~19.7MB),
 * so inlining would work for one case and silently break for the others.
 * The Files API has no such practical ceiling and is the same upload path
 * for every case regardless of size, which is simpler than branching
 * between inline and Files API per case. Uploaded files are Google-side
 * transient objects tied to the API key used to evaluate them; this harness
 * never uploads to any ConsultX-owned storage.
 *
 * `pages` in cases.json (when set) does not crop the PDF — it is passed to
 * the model as a scope instruction in the prompt text ("only analyze
 * page(s) N of this PDF"), since Gemini reads PDFs page-aware natively.
 * Cropping locally would need a PDF-manipulation dependency this harness
 * deliberately does not take on.
 *
 * ---------------------------------------------------------------------------
 * Prompt provenance
 * ---------------------------------------------------------------------------
 * STAGE1_PLANNING_PROMPT_EN below reproduces the English branch of
 * getVisionPlanningPrompt("en") in supabase/functions/fire-safety-chat/
 * index.ts (~lines 1904-1962) verbatim, as of this harness's authoring date
 * (2026-08-25). It is a local copy, not an import — importing a
 * non-exported function from a Supabase Edge Function module into a Deno
 * CLI eval script would couple this harness to index.ts's internals and
 * this lane does not modify index.ts. If getVisionPlanningPrompt's JSON
 * contract changes, this copy — and the "before/after comparison workflow"
 * described in evals/vision/README.md — must be updated by hand.
 */

// ============================================================================
// Types
// ============================================================================

interface CaseEntry {
  id: string;
  title: string;
  source_path: string;
  pages?: number[];
  expected_facts_file: string;
}

interface ExpectedFacts {
  case_id: string;
  review_status: string;
  source_file: string;
  source_facts_reference: string | null;
  scope_note?: string;
  expected_sheet_type: string | null;
  expected_occupancy_group: string | null;
  expected_device_counts: Record<string, number>;
  expected_legend_symbols: string[];
  expected_unreadable_pages: number[];
  notes: string;
}

/** Mirrors the Stage-1 planning JSON contract (see Prompt provenance above). Every
 * field is optional here because this is real, untrusted LLM output being parsed
 * defensively, not a contract this harness controls. */
interface VisionPlanningResult {
  documentType?: string;
  sheetContext?: { title?: string; number?: string; scale?: string; date?: string };
  buildingType?: string;
  occupancyGroup?: string;
  hazardLevel?: string;
  stories?: string;
  floorArea?: string;
  roomLabels?: string[];
  dimensions?: string[];
  visibleSystems?: string[];
  legendSymbols?: string[];
  fireRatedElements?: string[];
  exitElements?: string[];
  observations?: string[];
  readableAreas?: string[];
  unreadableAreas?: string[];
  imageQuality?: string;
  classificationConfidence?: string;
}

interface DryRunCaseCheck {
  id: string;
  title: string;
  source_path: string;
  path_exists: boolean;
  expected_facts_file: string;
  expected_facts_parse_ok: boolean;
  expected_facts_review_status: string | null;
  issues: string[];
}

/** device_count_accuracy values are the RELATIVE ERROR |extracted - expected| /
 * expected as specified in the phase digest — despite the field name, 0 means a
 * perfect match and larger is worse. Kept as a Record because it is reported
 * per device type, never averaged into a single pass/fail number. */
interface CaseScore {
  case_id: string;
  review_status: string;
  ran: boolean;
  error: string | null;
  device_count_accuracy: Record<string, number> | null;
  legend_fidelity: number | null;
  sheet_type_correct: boolean | null;
  occupancy_correct: boolean | null;
  unreadable_honesty: boolean | null;
  extracted_sheet_type_bucket: string | null;
  extraction: VisionPlanningResult | null;
  raw_response_preview: string | null;
}

interface RunReport {
  run_date: string;
  mode: "dry-run" | "live";
  dry_run_checks: DryRunCaseCheck[] | null;
  live_results: CaseScore[] | null;
  pass: boolean;
  summary_notes: string[];
}

// ============================================================================
// Constants
// ============================================================================

const CASES_FILE = "./evals/vision/cases.json";
const RESULTS_DIR = "./evals/vision/results";
const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_CHAIN = ["gemini-2.5-pro", "gemini-2.5-flash"];
const FILE_ACTIVE_POLL_MAX_ATTEMPTS = 30;
const FILE_ACTIVE_POLL_INTERVAL_MS = 2000;

// Verbatim copy of getVisionPlanningPrompt("en") — see "Prompt provenance" in
// the file header for why this is a copy, not an import.
const STAGE1_PLANNING_PROMPT_EN = `You are a fire safety document intelligence agent. Your task is to extract ALL readable information from the uploaded engineering drawing or image with maximum precision.

CRITICAL RULE: Only report what is EXPLICITLY visible or readable. Never fabricate room labels, measurements, system names, or symbols. If something is unclear or illegible, say so explicitly.

Extract the following in order:

1. DOCUMENT TYPE — select the best match:
   floor_plan | reflected_ceiling_plan | fire_suppression_plan | fire_alarm_plan | mechanical_plan | site_plan | section_elevation | schedule_table | specification | mixed | unclear

2. SHEET CONTEXT (only if explicitly labeled):
   - Sheet title (exact text if visible)
   - Sheet number (exact if visible, e.g. "FP-101")
   - Scale (e.g. "1:100", "NTS")
   - Date or revision (if shown)

3. BUILDING CLASSIFICATION:
   - Building type (based on visible labels/use)
   - Occupancy Group per SBC 201 Chapter 3 (A-1 through U) — only if determinable
   - Hazard Level (Low / Ordinary G1 / Ordinary G2 / Extra Hazard G1 / Extra Hazard G2) — only if determinable
   - Number of stories (if visible or labeled)
   - Floor area (only if dimensioned or labeled)

4. VISIBLE ELEMENTS (list only what is explicitly readable):
   - Room labels and functions (exact text as shown)
   - Dimension annotations (e.g. "6000mm", "20'")
   - Fire protection system labels (sprinkler heads, detectors, alarm devices, standpipes, hydrants, suppression nozzles)
   - Legend/symbol key (describe each symbol and its associated label exactly as shown)
   - Fire-rated elements (fire doors labeled, fire walls, smoke partitions — exact labels)
   - Exit routes, stairwells, corridors (as labeled)
   - Equipment schedules visible in the drawing

5. IMAGE QUALITY:
   - Overall quality: clear | partial | low | illegible
   - Readable areas: (list clearly legible zones or content)
   - Unreadable areas: (list illegible, cut-off, or too-small-to-read content)
   - Classification confidence: high | medium | low

Respond ONLY in valid JSON (no markdown, no explanation outside JSON):
{
  "documentType": "...",
  "sheetContext": {"title":"...","number":"...","scale":"...","date":"..."},
  "buildingType": "...",
  "occupancyGroup": "...",
  "hazardLevel": "...",
  "stories": "...",
  "floorArea": "...",
  "roomLabels": ["..."],
  "dimensions": ["..."],
  "visibleSystems": ["..."],
  "legendSymbols": ["..."],
  "fireRatedElements": ["..."],
  "exitElements": ["..."],
  "observations": ["..."],
  "readableAreas": ["..."],
  "unreadableAreas": ["..."],
  "imageQuality": "clear|partial|low|illegible",
  "classificationConfidence": "high|medium|low"
}`;

// ============================================================================
// Small utilities
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Parses model output that is supposed to be JSON but may arrive wrapped in
 * markdown code fences or with leading/trailing prose — same defensive
 * stripping index.ts itself uses at the CoT-parsing step (index.ts line
 * ~2262: `.replace(/\`\`\`json\n?/g, "").replace(/\`\`\`\n?/g, "")`). */
function parseJsonLenient(text: string): unknown | null {
  const stripped = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Loosely coerces parsed JSON into VisionPlanningResult — every field is read
 * defensively since this is untrusted model output, never trusted as typed. */
function coerceVisionPlanningResult(parsed: unknown): VisionPlanningResult {
  if (!isRecord(parsed)) return {};
  const sheetContextRaw = parsed.sheetContext;
  const sheetContext = isRecord(sheetContextRaw)
    ? {
      title: asString(sheetContextRaw.title),
      number: asString(sheetContextRaw.number),
      scale: asString(sheetContextRaw.scale),
      date: asString(sheetContextRaw.date),
    }
    : undefined;

  return {
    documentType: asString(parsed.documentType),
    sheetContext,
    buildingType: asString(parsed.buildingType),
    occupancyGroup: asString(parsed.occupancyGroup),
    hazardLevel: asString(parsed.hazardLevel),
    stories: asString(parsed.stories),
    floorArea: asString(parsed.floorArea),
    roomLabels: asStringArray(parsed.roomLabels),
    dimensions: asStringArray(parsed.dimensions),
    visibleSystems: asStringArray(parsed.visibleSystems),
    legendSymbols: asStringArray(parsed.legendSymbols),
    fireRatedElements: asStringArray(parsed.fireRatedElements),
    exitElements: asStringArray(parsed.exitElements),
    observations: asStringArray(parsed.observations),
    readableAreas: asStringArray(parsed.readableAreas),
    unreadableAreas: asStringArray(parsed.unreadableAreas),
    imageQuality: asString(parsed.imageQuality),
    classificationConfidence: asString(parsed.classificationConfidence),
  };
}

// ============================================================================
// Case loading & dry-run validation
// ============================================================================

async function loadCases(): Promise<CaseEntry[]> {
  const text = await Deno.readTextFile(CASES_FILE);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${CASES_FILE} must contain a JSON array of case entries.`);
  }
  return parsed as CaseEntry[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

const REQUIRED_EXPECTED_FACTS_FIELDS: Array<keyof ExpectedFacts> = [
  "case_id",
  "review_status",
  "source_file",
  "expected_sheet_type",
  "expected_occupancy_group",
  "expected_device_counts",
  "expected_legend_symbols",
  "expected_unreadable_pages",
  "notes",
];

async function loadExpectedFacts(
  expectedFactsPath: string,
): Promise<{ facts: ExpectedFacts | null; issues: string[] }> {
  const issues: string[] = [];
  const fullPath = `./evals/vision/${expectedFactsPath}`;
  let text: string;
  try {
    text = await Deno.readTextFile(fullPath);
  } catch (err) {
    issues.push(`could not read ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
    return { facts: null, issues };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    issues.push(`${fullPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return { facts: null, issues };
  }
  if (!isRecord(parsed)) {
    issues.push(`${fullPath} must be a JSON object.`);
    return { facts: null, issues };
  }
  for (const field of REQUIRED_EXPECTED_FACTS_FIELDS) {
    if (!(field in parsed)) {
      issues.push(`${fullPath} is missing required field "${field}".`);
    }
  }
  issues.push(...validateExpectedFactsTypes(fullPath, parsed));
  return { facts: parsed as unknown as ExpectedFacts, issues };
}

/** Validates the TYPES of an expected-facts file, not just field presence.
 * These files are hand-edited by the owner (see "How the owner fills in
 * expected-facts files" in evals/vision/README.md), so a wrong type is a
 * realistic mistake — and an unvalidated one scores silently wrong instead of
 * failing loudly. Concretely: a bare string in expected_legend_symbols has a
 * .length and iterates character-by-character, which would yield a
 * plausible-looking but meaningless legend_fidelity; a non-array
 * expected_unreadable_pages would throw inside scoreUnreadableHonesty; and a
 * zero/negative/non-finite expected device count would divide badly in
 * scoreDeviceCounts. Anything reported here makes the case fail
 * expected_facts_parse_ok in dry mode and be SKIPPED (never scored) in live
 * mode, which is the intended fail-loud behavior. */
function validateExpectedFactsTypes(fullPath: string, parsed: Record<string, unknown>): string[] {
  const issues: string[] = [];

  for (const field of ["case_id", "review_status", "source_file", "notes"] as const) {
    if (field in parsed && typeof parsed[field] !== "string") {
      issues.push(`${fullPath}: "${field}" must be a string.`);
    }
  }

  for (const field of ["expected_sheet_type", "expected_occupancy_group"] as const) {
    if (field in parsed && parsed[field] !== null && typeof parsed[field] !== "string") {
      issues.push(`${fullPath}: "${field}" must be a string or null.`);
    }
  }

  if ("expected_legend_symbols" in parsed) {
    const v = parsed.expected_legend_symbols;
    if (!Array.isArray(v)) {
      issues.push(`${fullPath}: "expected_legend_symbols" must be an array of strings.`);
    } else if (!v.every((x) => typeof x === "string")) {
      issues.push(`${fullPath}: every entry in "expected_legend_symbols" must be a string.`);
    }
  }

  if ("expected_unreadable_pages" in parsed) {
    const v = parsed.expected_unreadable_pages;
    if (!Array.isArray(v)) {
      issues.push(`${fullPath}: "expected_unreadable_pages" must be an array of page numbers.`);
    } else if (!v.every((x) => typeof x === "number" && Number.isInteger(x) && x > 0)) {
      issues.push(`${fullPath}: every entry in "expected_unreadable_pages" must be a positive integer page number.`);
    }
  }

  if ("expected_device_counts" in parsed) {
    const v = parsed.expected_device_counts;
    if (!isRecord(v)) {
      issues.push(`${fullPath}: "expected_device_counts" must be a JSON object of {device_type: count}.`);
    } else {
      for (const [deviceType, count] of Object.entries(v)) {
        // Negative or non-finite counts would make the relative-error division
        // in scoreDeviceCounts meaningless; 0 is allowed and handled as an
        // explicit "expected absent" case there.
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
          issues.push(
            `${fullPath}: "expected_device_counts.${deviceType}" must be a finite number >= 0 (got ${JSON.stringify(count)}).`,
          );
        }
      }
    }
  }

  return issues;
}

async function runDryRunChecks(cases: CaseEntry[]): Promise<DryRunCaseCheck[]> {
  const checks: DryRunCaseCheck[] = [];
  for (const c of cases) {
    const issues: string[] = [];
    const exists = await pathExists(c.source_path);
    if (!exists) {
      issues.push(
        `source_path not found on this machine (WARN only — expected on machines that don't have the owner's local drawing set): ${c.source_path}`,
      );
    }
    const { facts, issues: factIssues } = await loadExpectedFacts(c.expected_facts_file);
    issues.push(...factIssues);

    checks.push({
      id: c.id,
      title: c.title,
      source_path: c.source_path,
      path_exists: exists,
      expected_facts_file: c.expected_facts_file,
      expected_facts_parse_ok: facts !== null && factIssues.length === 0,
      expected_facts_review_status: facts?.review_status ?? null,
      issues,
    });
  }
  return checks;
}

function printCaseTable(checks: DryRunCaseCheck[]): void {
  console.log("\nVision eval case registry:\n");
  for (const c of checks) {
    console.log(`  [${c.id}] ${c.title}`);
    console.log(`      source_path:     ${c.source_path}  (${c.path_exists ? "found" : "MISSING on this machine"})`);
    console.log(
      `      expected_facts:  ${c.expected_facts_file}  (${c.expected_facts_parse_ok ? "parsed ok" : "FAILED to parse/conform"}, review_status=${c.expected_facts_review_status ?? "unknown"})`,
    );
    for (const issue of c.issues) {
      console.log(`      - ${issue}`);
    }
    console.log("");
  }
}

// ============================================================================
// Scoring
// ============================================================================

const SHEET_TYPE_BUCKET_MAP: Record<string, string> = {
  fire_alarm_plan: "fire_alarm",
  fire_suppression_plan: "fire_fighting",
  site_plan: "site",
  mechanical_plan: "mechanical",
  schedule_table: "schedule",
  specification: "specification",
  section_elevation: "section_elevation",
  reflected_ceiling_plan: "reflected_ceiling_plan",
  mixed: "mixed",
  unclear: "unknown",
};

const LIFE_SAFETY_KEYWORDS = [
  "life safety",
  "evacuation",
  "egress",
  "travel distance",
  "exit separation",
  "dead end",
  "common path of travel",
];

/** Maps a Stage-1 `documentType` (plus a light keyword scan of observations/
 * sheetContext.title, since "life_safety" is not one of Stage-1's documentType
 * enum values but IS the vocabulary the derived plan_parse/page_inventory
 * facts use — see evals/vision/expected/nhc-dwg-24.json scope_note) onto the
 * same bucket vocabulary the expected-facts files use, so sheet_type_correct
 * can do a plain string comparison. This is a harness-local heuristic, not
 * part of the production prompt contract. */
function bucketSheetType(extraction: VisionPlanningResult): string | null {
  const docType = extraction.documentType?.trim().toLowerCase();
  if (!docType) return null;

  const haystack = normalizeToken(
    [
      extraction.sheetContext?.title ?? "",
      ...(extraction.observations ?? []),
      ...(extraction.exitElements ?? []),
      ...(extraction.dimensions ?? []),
    ].join(" "),
  );
  const looksLifeSafety = LIFE_SAFETY_KEYWORDS.some((kw) => haystack.includes(normalizeToken(kw)));
  if (looksLifeSafety) return "life_safety";

  if (docType === "floor_plan") return "floor_plan";
  return SHEET_TYPE_BUCKET_MAP[docType] ?? docType;
}

function scoreSheetType(
  extraction: VisionPlanningResult,
  expected: string | null,
): { correct: boolean | null; bucket: string | null } {
  const bucket = bucketSheetType(extraction);
  if (expected === null) return { correct: null, bucket };
  if (bucket === null) return { correct: false, bucket };
  return { correct: normalizeToken(bucket) === normalizeToken(expected), bucket };
}

function scoreOccupancy(extraction: VisionPlanningResult, expected: string | null): boolean | null {
  if (expected === null) return null;
  const extracted = extraction.occupancyGroup?.trim();
  if (!extracted) return false;
  return normalizeToken(extracted) === normalizeToken(expected);
}

/** Token-overlap match: an expected legend symbol counts as "found" when at
 * least half of its normalized tokens appear in at least one extracted legend
 * symbol string. Plain substring matching is too strict here — Gemini
 * routinely paraphrases legend text ("ES: EXIT SEPRATION" vs "Exit
 * Separation (ES)") rather than transcribing it byte-for-byte. */
function legendSymbolFound(expectedSymbol: string, extractedSymbols: string[]): boolean {
  const expectedTokens = new Set(normalizeToken(expectedSymbol).split(" ").filter((t) => t.length > 1));
  if (expectedTokens.size === 0) return false;
  for (const extracted of extractedSymbols) {
    const extractedNorm = normalizeToken(extracted);
    const extractedTokens = new Set(extractedNorm.split(" ").filter((t) => t.length > 1));
    let overlap = 0;
    for (const t of expectedTokens) if (extractedTokens.has(t)) overlap++;
    if (overlap / expectedTokens.size >= 0.5) return true;
  }
  return false;
}

function scoreLegendFidelity(extraction: VisionPlanningResult, expectedSymbols: string[]): number | null {
  if (expectedSymbols.length === 0) return null;
  const extractedSymbols = extraction.legendSymbols ?? [];
  let found = 0;
  for (const symbol of expectedSymbols) {
    if (legendSymbolFound(symbol, extractedSymbols)) found++;
  }
  return found / expectedSymbols.length;
}

/** Proxy device count: Stage-1's JSON contract has no numeric device-count
 * field (visibleSystems/legendSymbols/observations are label lists, not
 * tallies), so "extracted count" for a device type is the number of distinct
 * string entries across visibleSystems + legendSymbols + observations +
 * fireRatedElements + exitElements that mention the device-type keyword. This
 * is a heuristic proxy, not a true device tally, and is documented as such in
 * evals/vision/README.md. All three seed cases ship expected_device_counts:
 * {} (no ground-truth counts exist in the derived facts — see the seed's
 * notes field), so this function returns {} for them today; it activates
 * once the owner fills in real counts. */
function scoreDeviceCounts(
  extraction: VisionPlanningResult,
  expectedCounts: Record<string, number>,
): Record<string, number> | null {
  const entries = Object.entries(expectedCounts);
  if (entries.length === 0) return null;

  const haystackEntries = [
    ...(extraction.visibleSystems ?? []),
    ...(extraction.legendSymbols ?? []),
    ...(extraction.observations ?? []),
    ...(extraction.fireRatedElements ?? []),
    ...(extraction.exitElements ?? []),
  ];

  const result: Record<string, number> = {};
  for (const [deviceType, expected] of entries) {
    const keyword = normalizeToken(deviceType.replace(/_/g, " "));
    const extractedCount = haystackEntries.filter((entry) => normalizeToken(entry).includes(keyword)).length;
    if (expected === 0) {
      result[deviceType] = extractedCount === 0 ? 0 : 1;
    } else {
      result[deviceType] = Math.abs(extractedCount - expected) / expected;
    }
  }
  return result;
}

/** Honesty check, deliberately ONE-SIDED — do not "fix" this into a symmetric
 * comparison.
 *
 * The failure mode this guards against is the model claiming it could read
 * something it could not: silently inventing content for an illegible region
 * is what makes a downstream compliance verdict dangerous. The opposite
 * direction is not a failure — a model that flags MORE as unreadable than the
 * owner marked is being appropriately cautious, and penalizing that would
 * train the harness to reward overconfidence.
 *
 * So: the metric only ACTIVATES when a page the harness actually tested is one
 * the owner marked expected-unreadable (returns null — unscored — otherwise,
 * which is also why over-declaring on a fully-legible sheet is never counted
 * against the model). When it activates, it passes if the model said
 * *something* was hard to read (non-empty unreadableAreas, or an imageQuality
 * of low/partial/illegible) — not necessarily the exact region the owner
 * flagged, since matching regions by name across a paraphrasing model is not
 * something this harness can do reliably. */
function scoreUnreadableHonesty(
  extraction: VisionPlanningResult,
  expectedUnreadablePages: number[],
  testedPages: number[] | undefined,
): boolean | null {
  const relevant = testedPages === undefined || testedPages.length === 0
    ? expectedUnreadablePages.length > 0
    : testedPages.some((p) => expectedUnreadablePages.includes(p));
  if (!relevant) return null;

  const declaredUnreadable = (extraction.unreadableAreas?.length ?? 0) > 0;
  const qualityFlag = ["low", "illegible", "partial"].includes(
    (extraction.imageQuality ?? "").trim().toLowerCase(),
  );
  return declaredUnreadable || qualityFlag;
}

function scoreCase(
  caseEntry: CaseEntry,
  expected: ExpectedFacts,
  extraction: VisionPlanningResult,
): CaseScore {
  const { correct: sheetTypeCorrect, bucket } = scoreSheetType(extraction, expected.expected_sheet_type);
  return {
    case_id: caseEntry.id,
    review_status: expected.review_status,
    ran: true,
    error: null,
    device_count_accuracy: scoreDeviceCounts(extraction, expected.expected_device_counts),
    legend_fidelity: scoreLegendFidelity(extraction, expected.expected_legend_symbols),
    sheet_type_correct: sheetTypeCorrect,
    occupancy_correct: scoreOccupancy(extraction, expected.expected_occupancy_group),
    unreadable_honesty: scoreUnreadableHonesty(extraction, expected.expected_unreadable_pages, caseEntry.pages),
    extracted_sheet_type_bucket: bucket,
    extraction,
    raw_response_preview: null,
  };
}

// ============================================================================
// Gemini Files API (live mode only)
// ============================================================================

interface UploadedGeminiFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** The Gemini key is sent as an `x-goog-api-key` HEADER, never as a `?key=`
 * query parameter.
 *
 * index.ts uses the `?key=` form (see index.ts line ~1721) and both forms are
 * accepted by generativelanguage.googleapis.com, but this is a local CLI
 * script that prints errors to a terminal, and Deno's fetch failures embed the
 * full request URL in the error message ("error sending request for url
 * (https://...?key=AIza...)"). With the key in the query string, one network
 * blip would print the owner's live API key into terminal scrollback. The
 * header form makes that leak structurally impossible. redactKey() below is
 * the second layer, for anything that still manages to echo the value back. */
function geminiAuthHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return { "x-goog-api-key": apiKey, ...extra };
}

/** Scrubs the API key out of any text before it is printed or written to a
 * results file. Defense-in-depth behind geminiAuthHeaders — error bodies from
 * Google occasionally echo request details back. */
function redactKey(text: string, apiKey: string | undefined): string {
  if (!apiKey || apiKey.length < 8) return text;
  return text.split(apiKey).join("[REDACTED_GEMINI_KEY]");
}

async function uploadFileToGemini(
  apiKey: string,
  filePath: string,
  displayName: string,
): Promise<UploadedGeminiFile> {
  const fileInfo = await Deno.stat(filePath);
  const totalBytes = fileInfo.size;
  const mimeType = "application/pdf";

  const startResp = await fetch(GEMINI_UPLOAD_URL, {
    method: "POST",
    headers: geminiAuthHeaders(apiKey, {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(totalBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startResp.ok) {
    throw new Error(
      `Gemini upload start failed: ${startResp.status} ${redactKey(await startResp.text(), apiKey)}`,
    );
  }
  const uploadUrl = startResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload start did not return an x-goog-upload-url header.");
  }

  const bytes = await Deno.readFile(filePath);
  // No auth header here on purpose: uploadUrl is the one-shot resumable-session
  // URL Google just handed back, and it carries its own upload token. Content-
  // Length is also omitted — it is a forbidden header name for fetch(), so
  // setting it is a silent no-op; the runtime derives it from the body.
  const uploadResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!uploadResp.ok) {
    throw new Error(
      `Gemini file upload failed: ${uploadResp.status} ${redactKey(await uploadResp.text(), apiKey)}`,
    );
  }
  const uploadJson = await uploadResp.json();
  const file = uploadJson.file;
  if (!isRecord(file) || typeof file.name !== "string") {
    throw new Error(`Gemini file upload returned an unexpected shape: ${JSON.stringify(uploadJson)}`);
  }

  let state = typeof file.state === "string" ? file.state : "PROCESSING";
  let uri = typeof file.uri === "string" ? file.uri : "";
  const name = file.name;
  let attempts = 0;
  while (state === "PROCESSING" && attempts < FILE_ACTIVE_POLL_MAX_ATTEMPTS) {
    await delay(FILE_ACTIVE_POLL_INTERVAL_MS);
    const statusResp = await fetch(`${GEMINI_API_ROOT}/${name}`, {
      headers: geminiAuthHeaders(apiKey),
    });
    if (!statusResp.ok) {
      throw new Error(
        `Gemini file status check failed: ${statusResp.status} ${redactKey(await statusResp.text(), apiKey)}`,
      );
    }
    const statusJson = await statusResp.json();
    state = typeof statusJson.state === "string" ? statusJson.state : state;
    uri = typeof statusJson.uri === "string" ? statusJson.uri : uri;
    attempts++;
  }
  if (state !== "ACTIVE") {
    throw new Error(`Gemini file "${name}" did not reach ACTIVE state (last state: ${state}).`);
  }
  return { uri, name, mimeType };
}

async function deleteGeminiFile(apiKey: string, name: string): Promise<void> {
  try {
    await fetch(`${GEMINI_API_ROOT}/${name}`, {
      method: "DELETE",
      headers: geminiAuthHeaders(apiKey),
    });
  } catch {
    // best-effort cleanup only — Gemini also auto-expires uploaded files after
    // 48 hours, so a failed delete here is not a privacy or cost problem.
  }
}

function buildScopedPrompt(pages: number[] | undefined): string {
  if (!pages || pages.length === 0) return STAGE1_PLANNING_PROMPT_EN;
  const scopeLine = `\n\nSCOPE: Only analyze page(s) ${pages.join(", ")} of this PDF. Ignore all other pages entirely.\n`;
  return STAGE1_PLANNING_PROMPT_EN.replace(
    "Extract the following in order:",
    `${scopeLine}\nExtract the following in order:`,
  );
}

async function generateContentForFile(
  apiKey: string,
  uploadedFile: UploadedGeminiFile,
  promptText: string,
): Promise<string> {
  let lastError = "";
  for (const model of MODEL_CHAIN) {
    const resp = await fetch(`${GEMINI_API_ROOT}/models/${model}:generateContent`, {
      method: "POST",
      headers: geminiAuthHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { file_data: { mime_type: uploadedFile.mimeType, file_uri: uploadedFile.uri } },
              { text: promptText },
            ],
          },
        ],
        generationConfig: { temperature: 0.4 },
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return typeof text === "string" ? text : "";
    }
    lastError = `${model}: ${resp.status} ${redactKey(await resp.text(), apiKey)}`;
    console.log(`    [Gemini] ${model} failed, trying next in chain: ${lastError.slice(0, 200)}`);
  }
  throw new Error(`All Gemini models in chain failed. Last error: ${lastError}`);
}

async function runLiveCase(
  apiKey: string,
  caseEntry: CaseEntry,
  expected: ExpectedFacts,
): Promise<CaseScore> {
  const exists = await pathExists(caseEntry.source_path);
  if (!exists) {
    return {
      case_id: caseEntry.id,
      review_status: expected.review_status,
      ran: false,
      error: `source_path not found: ${caseEntry.source_path}`,
      device_count_accuracy: null,
      legend_fidelity: null,
      sheet_type_correct: null,
      occupancy_correct: null,
      unreadable_honesty: null,
      extracted_sheet_type_bucket: null,
      extraction: null,
      raw_response_preview: null,
    };
  }

  let uploaded: UploadedGeminiFile | null = null;
  try {
    console.log(`    uploading ${caseEntry.source_path} to Gemini Files API...`);
    uploaded = await uploadFileToGemini(apiKey, caseEntry.source_path, caseEntry.id);
    console.log(`    uploaded as ${uploaded.name}, calling generateContent...`);
    const promptText = buildScopedPrompt(caseEntry.pages);
    const rawText = await generateContentForFile(apiKey, uploaded, promptText);
    const parsed = parseJsonLenient(rawText);
    if (parsed === null) {
      return {
        case_id: caseEntry.id,
        review_status: expected.review_status,
        ran: true,
        error: "Gemini response was not valid JSON after fence-stripping.",
        device_count_accuracy: null,
        legend_fidelity: null,
        sheet_type_correct: null,
        occupancy_correct: null,
        unreadable_honesty: null,
        extracted_sheet_type_bucket: null,
        extraction: null,
        raw_response_preview: rawText.slice(0, 500),
      };
    }
    const extraction = coerceVisionPlanningResult(parsed);
    const score = scoreCase(caseEntry, expected, extraction);
    score.raw_response_preview = rawText.slice(0, 500);
    return score;
  } catch (err) {
    return {
      case_id: caseEntry.id,
      review_status: expected.review_status,
      ran: false,
      error: redactKey(err instanceof Error ? err.message : String(err), apiKey),
      device_count_accuracy: null,
      legend_fidelity: null,
      sheet_type_correct: null,
      occupancy_correct: null,
      unreadable_honesty: null,
      extracted_sheet_type_bucket: null,
      extraction: null,
      raw_response_preview: null,
    };
  } finally {
    if (uploaded) await deleteGeminiFile(apiKey, uploaded.name);
  }
}

// ============================================================================
// Reporting
// ============================================================================

function renderDryRunReport(checks: DryRunCaseCheck[]): string {
  const lines: string[] = [];
  lines.push("# Vision Eval — Dry Run\n");
  lines.push(`Cases: ${checks.length}\n`);
  lines.push("| id | source found | expected facts | review_status |");
  lines.push("|---|---|---|---|");
  for (const c of checks) {
    lines.push(
      `| ${c.id} | ${c.path_exists ? "yes" : "MISSING"} | ${c.expected_facts_parse_ok ? "ok" : "FAILED"} | ${c.expected_facts_review_status ?? "unknown"} |`,
    );
  }
  if (checks.some((c) => c.issues.length > 0)) {
    lines.push("\n## Issues\n");
    for (const c of checks) {
      for (const issue of c.issues) lines.push(`- **${c.id}**: ${issue}`);
    }
  }
  return lines.join("\n") + "\n";
}

function fmtScore(v: number | boolean | null): string {
  if (v === null) return "n/a";
  if (typeof v === "boolean") return v ? "PASS" : "FAIL";
  return v.toFixed(2);
}

function renderLiveReport(report: RunReport): string {
  const lines: string[] = [];
  lines.push(`# Vision Eval — Live Run ${report.run_date}\n`);
  lines.push(
    "All expected-facts files in this run are owner-review seeds/skeletons (see review_status per case) — these scores are diagnostic, not a pass/fail gate.\n",
  );
  lines.push("| case | ran | sheet_type | occupancy | legend_fidelity | unreadable_honesty | device_count_accuracy | error |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of report.live_results ?? []) {
    const deviceSummary = r.device_count_accuracy
      ? Object.entries(r.device_count_accuracy).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")
      : "n/a";
    lines.push(
      `| ${r.case_id} | ${r.ran ? "yes" : "NO"} | ${fmtScore(r.sheet_type_correct)} (${r.extracted_sheet_type_bucket ?? "-"}) | ${fmtScore(r.occupancy_correct)} | ${fmtScore(r.legend_fidelity)} | ${fmtScore(r.unreadable_honesty)} | ${deviceSummary} | ${r.error ?? ""} |`,
    );
  }
  return lines.join("\n") + "\n";
}

// ============================================================================
// main
// ============================================================================

async function main() {
  const isLive = Deno.env.get("VISION_EVAL_LIVE") === "1";
  const mode: "dry-run" | "live" = isLive ? "live" : "dry-run";
  const runDate = new Date().toISOString().slice(0, 10);

  const cases = await loadCases();
  console.log(`Loaded ${cases.length} vision eval case(s) from ${CASES_FILE}.`);
  console.log(`Mode: ${isLive ? "LIVE — calling Gemini API directly" : "DRY-RUN — no network calls"}`);

  const dateDir = `${RESULTS_DIR}/${runDate}`;
  await Deno.mkdir(dateDir, { recursive: true });

  if (!isLive) {
    const checks = await runDryRunChecks(cases);
    printCaseTable(checks);

    const report: RunReport = {
      run_date: runDate,
      mode: "dry-run",
      dry_run_checks: checks,
      live_results: null,
      pass: true,
      summary_notes: [
        "Dry mode is a diagnostic check, not a gate — it always exits 0 regardless of missing local files or expected-facts issues (see the file header). Set VISION_EVAL_LIVE=1 to run scoring against the Gemini API.",
      ],
    };
    await Deno.writeTextFile(`${dateDir}/results.json`, JSON.stringify(report, null, 2));
    await Deno.writeTextFile(`${dateDir}/report.md`, renderDryRunReport(checks));
    console.log(`Results written to ${dateDir}/`);
    Deno.exit(0);
  }

  const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!apiKey) {
    console.error(
      "Live mode requires GOOGLE_GEMINI_API_KEY (an owner-provided Gemini API key).\nSee evals/vision/README.md for setup instructions.",
    );
    Deno.exit(1);
  }

  const results: CaseScore[] = [];
  for (const c of cases) {
    console.log(`\n[${c.id}] ${c.title}`);
    const { facts, issues } = await loadExpectedFacts(c.expected_facts_file);
    if (!facts || issues.length > 0) {
      console.log(`  SKIPPED — expected-facts file did not parse/conform: ${issues.join("; ")}`);
      results.push({
        case_id: c.id,
        review_status: "unknown",
        ran: false,
        error: `expected-facts file did not parse/conform: ${issues.join("; ")}`,
        device_count_accuracy: null,
        legend_fidelity: null,
        sheet_type_correct: null,
        occupancy_correct: null,
        unreadable_honesty: null,
        extracted_sheet_type_bucket: null,
        extraction: null,
        raw_response_preview: null,
      });
      continue;
    }
    const result = await runLiveCase(apiKey, c, facts);
    results.push(result);
    console.log(`  ${result.ran ? "done" : "FAILED"}${result.error ? `: ${result.error}` : ""}`);
  }

  const report: RunReport = {
    run_date: runDate,
    mode: "live",
    dry_run_checks: null,
    live_results: results,
    pass: results.every((r) => r.ran),
    summary_notes: [
      "All expected-facts files are owner-review seeds/skeletons today — see each case's review_status. Scores here are diagnostic extraction-fidelity signals, not a pass/fail release gate.",
    ],
  };
  await Deno.writeTextFile(`${dateDir}/results.json`, JSON.stringify(report, null, 2));
  await Deno.writeTextFile(`${dateDir}/report.md`, renderLiveReport(report));
  console.log(`\nResults written to ${dateDir}/`);
  Deno.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  // Redact before printing: an unexpected throw can carry a request URL or a
  // response body, and this runs in a terminal whose scrollback the owner
  // may paste elsewhere.
  const detail = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error("Fatal error:", redactKey(detail, Deno.env.get("GOOGLE_GEMINI_API_KEY")));
  Deno.exit(1);
});
