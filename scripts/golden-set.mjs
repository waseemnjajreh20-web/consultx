#!/usr/bin/env node
/**
 * scripts/golden-set.mjs — builds and maintains the advisory golden question
 * set at evals/golden/candidates-20260903.json, the pool ConsultX's
 * evals/advisory_benchmark.jsonl harness eventually grows from.
 *
 * WHY THIS EXISTS: evals/advisory_benchmark.jsonl (43 questions) and
 * docs/launch/new-source-codes-gate-20260831.md (36 questions, SBC 401 +
 * SBC 501) are both hand-authored, source-verified question sets, but small.
 * This script (a) merges both into one candidate pool, (b) mechanically
 * generates many more draft candidates by walking the real extracted
 * corpus, and (c) gives a human reviewer a CSV worksheet to accept/edit/
 * reject the drafts before they are trusted enough to feed the real
 * benchmark. Nothing this script generates is ever marked "validated" --
 * only a human review pass (via --import) can do that. See "STATUS
 * SEMANTICS" below for the one deliberate exception.
 *
 * COMMANDS
 *   node scripts/golden-set.mjs
 *     Default build. Merges evals/advisory_benchmark.jsonl (source
 *     "benchmark") and docs/launch/new-source-codes-gate-20260831.md
 *     (source "gate") with mechanically-generated candidates walked from
 *     the local SBC 401 / SBC 501 chunk corpus (source "generated"), writes
 *     evals/golden/candidates-20260903.json, and writes
 *     evals/golden/review-sheet-20260903.csv (every row still in status
 *     "candidate" -- i.e. everything except the pre-existing benchmark
 *     items). SAFE TO RE-RUN: any id already present in an existing
 *     candidates-20260903.json is left completely untouched (so a prior
 *     --import review pass is never clobbered by a rebuild) -- same
 *     "on conflict do nothing" idempotency the SQL migrations in docs/db/
 *     use for seed rows. New ids are appended; ids that would no longer be
 *     regenerated (e.g. the corpus path is unavailable on this machine)
 *     are kept too, never silently dropped.
 *
 *   node scripts/golden-set.mjs --import <reviewed.csv>
 *     Reads a review-sheet CSV back (same shape as review-sheet-*.csv,
 *     including a human-filled "decision" column) and applies each row's
 *     decision onto the matching id in candidates-20260903.json:
 *       accept -> status "validated"; expected_sections replaced only if
 *                 "corrected answer key" is non-empty.
 *       edit   -> status "validated"; expected_sections replaced from
 *                 "corrected answer key" (the reviewer's corrected list).
 *       reject -> status "rejected".
 *       (blank/anything else) -> left untouched.
 *     Unknown ids in the CSV are skipped (not an error) so a partially
 *     reviewed or re-ordered sheet never aborts the whole import.
 *
 *   node scripts/golden-set.mjs --export-bench [--out <path>]
 *     Writes every candidate with status "validated" AND source !==
 *     "benchmark" (i.e. reviewed gate/generated items -- the pre-existing
 *     benchmark items already live natively in evals/advisory_benchmark.jsonl
 *     and are deliberately not re-emitted) as JSONL in the harness's own
 *     row shape. This is an operator-reviewed EXPORT, not an automatic
 *     merge -- eyeball the output before appending it to
 *     evals/advisory_benchmark.jsonl. Default output:
 *     evals/golden/validated_bench-20260903.jsonl.
 *
 * CANDIDATE SCHEMA (one object per row in candidates-20260903.json):
 *   {
 *     id: string,                    // unique across the whole file
 *     question_ar: string,
 *     category: string,
 *     code_family: string,           // "SBC 201" | "SBC 401" | "SBC 501" | ...
 *     expected_sections: string[],   // section/table numbers, "" for a
 *                                    // deliberate negative-control row
 *     source: "benchmark" | "gate" | "generated",
 *     status: "candidate" | "validated" | "rejected",
 *     validator?: string,
 *     validated_at?: string,         // ISO date
 *     notes?: string,                // free text -- provenance, page
 *                                    // numbers, reviewer comments
 *   }
 *
 * STATUS SEMANTICS (read this before trusting a "validated" row):
 *   - source "benchmark" rows start "validated". Justified because the
 *     transformation is LOSSLESS -- expected_sections is a direct field
 *     copy from evals/advisory_benchmark.jsonl's own hand-authored
 *     expected_section_refs/expected_table_ids, an already-in-production
 *     harness file. No interpretation happens on this script's part.
 *   - source "gate" rows start "candidate", EVEN THOUGH
 *     docs/launch/new-source-codes-gate-20260831.md's own prose ground
 *     truth is itself source-verified with page citations. The reason:
 *     expected_sections for a gate row is extracted from that prose by a
 *     REGEX over free-form Markdown ("<section(s)>: <description>"), and
 *     that extraction can be imprecise (e.g. it can pick up a stray
 *     equation number like the "(4)" in "Chapter 43 equation (4)" as if it
 *     were a second section reference). Marking these "validated" would
 *     overclaim confidence in THIS SCRIPT's parsing, not the source
 *     document -- so they flow through the same human review as generated
 *     rows before being trusted.
 *   - source "generated" rows start "candidate" per the build brief --
 *     never claim validated for a mechanically-generated question.
 *
 * CORPUS COVERAGE -- CONFIRMED at build time (2026-09-03), read before
 * extending this script:
 *   - D:\SBC_2024_intake\out\*_extracted_chunks.json HAS real section text:
 *     SBC 401 (480 chunks, 299 unique section_number values, mostly
 *     content_type "text") and SBC 501 (484 chunks, 383 unique
 *     section_number values, mostly content_type "commentary" -- SBC 501
 *     is a Code-and-Commentary edition, so most of its chunks are the
 *     commentary, not base code text; notes on generated SBC 501 rows carry
 *     content_type so a reviewer can tell which is which). This is the ONLY
 *     source generateFromCode() actually reads from.
 *   - D:\SBC-CC-201-801\ (the directory the build brief also named) has NO
 *     *_chunks.json anywhere, and its brain/sections/sbc801/*.md +
 *     brain/tables/*.md files (308 + 25 of them) are empty maintainer-note
 *     STUBS -- every one seen reads literally "pending maintainer
 *     synthesis" with no extracted section text at all. Confirmed by
 *     reading a sample of both. NOT a usable generation source; unrelated
 *     to the KG/calculator issues already on record for the older
 *     sbc_consultx inventory. SBC 201/801 coverage in this golden set comes
 *     entirely from the "benchmark" and "gate" merges, not from a corpus
 *     walk. loadChunkFile() below no-ops gracefully (returns null, logs a
 *     warning) if a configured chunk path is missing, so this script does
 *     not crash on a machine without the D:\SBC_2024_intake drive -- it
 *     just produces fewer "generated" rows (the merge step preserves
 *     whatever a *previous* successful run already produced; see the
 *     idempotency note above).
 *
 * Node built-ins only, ESM (package.json has "type": "module"). No deps.
 * Pure functions are exported for reuse; nothing runs at import time (see
 * the `isMain` guard at the bottom) -- same reason evals/lib/scoring.ts was
 * split out of evals/run_advisory_benchmark.ts (that file's own header
 * explains it: a script with top-level Deno.exit()/main() calls can't be
 * imported safely). src/__tests__/goldenSet.test.ts therefore verifies the
 * committed OUTPUT ARTIFACTS (the JSON + CSV files) rather than importing
 * this module, which also means the test suite never depends on the
 * D:\SBC_2024_intake drive being present.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

export const PATHS = {
  benchmarkJsonl: path.join(REPO_ROOT, "evals", "advisory_benchmark.jsonl"),
  gateDoc: path.join(REPO_ROOT, "docs", "launch", "new-source-codes-gate-20260831.md"),
  candidates: path.join(REPO_ROOT, "evals", "golden", "candidates-20260903.json"),
  reviewSheet: path.join(REPO_ROOT, "evals", "golden", "review-sheet-20260903.csv"),
  exportBenchDefault: path.join(REPO_ROOT, "evals", "golden", "validated_bench-20260903.jsonl"),
  // Outside the repo -- the committed sbc-code-intake extraction workspace.
  // See "CORPUS COVERAGE" above for what this file does and does not have.
  sbc401Chunks: "D:\\SBC_2024_intake\\out\\SBC 401 2024 - The Saudi Electrical Code_extracted_chunks.json",
  sbc501Chunks: "D:\\SBC_2024_intake\\out\\SBC 501 2024 - The Saudi Mechanical Code_extracted_chunks.json",
};

export const MIN_TOTAL_CANDIDATES = 200;
export const VALID_SOURCES = ["benchmark", "gate", "generated"];
export const VALID_STATUSES = ["candidate", "validated", "rejected"];

// The last date the ground truth in evals/advisory_benchmark.jsonl was
// actually extended (confirmed via `git log -1 --format=%ad --date=short
// -- evals/advisory_benchmark.jsonl` at build time, 2026-09-03) -- not the
// date this script ran, and not the file's original creation date.
const BENCHMARK_VALIDATED_AT = "2026-08-25";

// ============================================================
// 1. Schema validation
// ============================================================

export function validateCandidate(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["candidate is not an object"];
  if (typeof c.id !== "string" || c.id.length === 0) errors.push("id missing/invalid");
  if (typeof c.question_ar !== "string" || c.question_ar.length === 0) errors.push("question_ar missing/invalid");
  if (typeof c.category !== "string" || c.category.length === 0) errors.push("category missing/invalid");
  if (typeof c.code_family !== "string" || c.code_family.length === 0) errors.push("code_family missing/invalid");
  if (!Array.isArray(c.expected_sections)) errors.push("expected_sections must be an array");
  else if (!c.expected_sections.every((s) => typeof s === "string")) errors.push("expected_sections must be string[]");
  if (!VALID_SOURCES.includes(c.source)) errors.push(`source invalid: ${c.source}`);
  if (!VALID_STATUSES.includes(c.status)) errors.push(`status invalid: ${c.status}`);
  if (c.validator !== undefined && typeof c.validator !== "string") errors.push("validator must be a string when present");
  if (c.validated_at !== undefined && typeof c.validated_at !== "string") errors.push("validated_at must be a string when present");
  if (c.notes !== undefined && typeof c.notes !== "string") errors.push("notes must be a string when present");
  return errors;
}

// ============================================================
// 2. CSV (RFC4180-ish: quote on comma/quote/newline, "" escapes a quote)
// ============================================================

export const REVIEW_CSV_HEADERS = [
  "id",
  "question",
  "expected sections",
  "decision (accept/edit/reject)",
  "corrected answer key",
  "notes",
];

export function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsvRow(fields) {
  return fields.map(csvEscape).join(",");
}

/** Minimal RFC4180 parser: quoted fields, "" escapes, CRLF/LF rows. Strips a leading BOM. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
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
      // swallow; \n (if present) closes the row on the next iteration
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

function splitSectionList(s) {
  return String(s ?? "")
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function buildReviewSheetCsv(candidates) {
  const lines = [toCsvRow(REVIEW_CSV_HEADERS)];
  for (const c of candidates) {
    lines.push(
      toCsvRow([c.id, c.question_ar, c.expected_sections.join("; "), "", "", c.notes ?? ""]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Applies decisions from a reviewed CSV onto a candidates array (mutates and returns it). */
export function applyReviewDecisions(candidates, csvText) {
  const rows = parseCsv(csvText);
  const dataRows = rows.slice(1); // drop header
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const nowIso = new Date().toISOString();
  let applied = 0;
  let skippedUnknown = 0;

  for (const row of dataRows) {
    const [idRaw, , , decisionRaw, correctedAnswerKey, notes] = row;
    const id = (idRaw ?? "").trim();
    if (!id) continue;
    const candidate = byId.get(id);
    if (!candidate) {
      skippedUnknown++;
      continue;
    }
    const decision = (decisionRaw ?? "").trim().toLowerCase();
    const corrected = splitSectionList(correctedAnswerKey);
    const trimmedNotes = (notes ?? "").trim();

    if (decision === "accept" || decision === "edit") {
      candidate.status = "validated";
      candidate.validator = "csv-import";
      candidate.validated_at = nowIso;
      if (corrected.length > 0) candidate.expected_sections = corrected;
      if (trimmedNotes) candidate.notes = trimmedNotes;
      applied++;
    } else if (decision === "reject") {
      candidate.status = "rejected";
      candidate.validator = "csv-import";
      candidate.validated_at = nowIso;
      if (trimmedNotes) candidate.notes = trimmedNotes;
      applied++;
    }
    // blank or unrecognized decision: leave the candidate untouched
  }
  return { candidates, applied, skippedUnknown };
}

// ============================================================
// 3. Merge evals/advisory_benchmark.jsonl (source "benchmark")
// ============================================================

function inferCodeFamilyFromCategory(category) {
  const m = /SBC-(\d{3})/.exec(category ?? "");
  if (m) return `SBC ${m[1]}`;
  if (category === "cross-document") return "SBC 201 / SBC 801";
  if (category && category.endsWith("-bait")) return "n/a";
  return "unknown";
}

export function loadBenchmarkCandidates(jsonlText) {
  const lines = jsonlText.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const row = JSON.parse(line);
    const sections = [...(row.expected_section_refs ?? []), ...(row.expected_table_ids ?? [])];
    const uniqueSections = [...new Set(sections)];
    return {
      id: row.id,
      question_ar: row.question_ar,
      category: row.category ?? "uncategorized",
      code_family: inferCodeFamilyFromCategory(row.category),
      expected_sections: uniqueSections,
      source: "benchmark",
      status: "validated",
      validator: "pre-existing-harness",
      validated_at: BENCHMARK_VALIDATED_AT,
      notes:
        "From evals/advisory_benchmark.jsonl (pre-existing, already-in-production harness item; " +
        "question_en/expected_table_ids/forbidden_claims/must_refuse/refuse_reason live there verbatim, " +
        "not duplicated here)." + (row.must_refuse ? " NEGATIVE CONTROL — expects explicit refusal." : ""),
    };
  });
}

// ============================================================
// 4. Merge docs/launch/new-source-codes-gate-20260831.md (source "gate")
// ============================================================

/** Parses the two "| # | question | ground truth | page |" Markdown tables in the gate doc. */
export function parseGateDoc(mdText) {
  const lines = mdText.split("\n");
  const rows = [];
  let currentFamily = null;

  for (const line of lines) {
    const heading = /^##\s+.*SBC\s?(401|501)/.exec(line);
    if (heading) {
      currentFamily = `SBC ${heading[1]}`;
      continue;
    }
    if (!currentFamily || !line.trim().startsWith("|")) continue;

    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[0] === "#" || /^-+$/.test(cells[0].replace(/\s/g, ""))) continue; // header/separator row

    const numMatch = /^(\d+)/.exec(cells[0]);
    if (!numMatch) continue;

    const isNegative = /سلبي/.test(cells[0]);
    const question = cells[1] ?? "";
    const groundTruth = cells[2] ?? "";
    const sectionPart = groundTruth.includes(":") ? groundTruth.split(":")[0] : "";
    let sectionTokens = [...sectionPart.matchAll(/\d+(?:[.-]\d+)*/g)].map((m) => m[0]);
    // Edge case (row 16, SBC 401): a positive row whose ground-truth cell has
    // no leading "<section>:" prefix at all (it is phrased as an English
    // term plus its Arabic translation, e.g. "Initial verification —
    // ..."), so the section number only appears in the QUESTION text
    // ("...الفصل 61؟"). Fall back to pulling a chapter/section number out of
    // the question itself rather than leaving expected_sections empty for a
    // row that is not actually a negative control.
    if (!isNegative && sectionTokens.length === 0) {
      const fromQuestion = /(?:القسم|الفصل|البند)\s+(\d+(?:[.-]\d+)*)/.exec(question);
      if (fromQuestion) sectionTokens = [fromQuestion[1]];
    }

    rows.push({
      num: numMatch[1],
      isNegative,
      question,
      groundTruth,
      sectionTokens: isNegative ? [] : sectionTokens,
      page: cells[3] ?? "",
      codeFamily: currentFamily,
    });
  }
  return rows;
}

function gateRowToCandidate(row) {
  const familySlug = row.codeFamily.replace(/\s+/g, "");
  const id = `GATE-${familySlug}-${row.num.padStart(2, "0")}`;
  const base = `From docs/launch/new-source-codes-gate-20260831.md, ${row.codeFamily} row #${row.num}` +
    (row.page ? `, page ${row.page}` : "") + `. Ground truth: ${row.groundTruth}`;
  return {
    id,
    question_ar: row.question,
    category: row.isNegative ? `${row.codeFamily.replace(" ", "-")}-negative-control` : `${row.codeFamily.replace(" ", "-")}-gate`,
    code_family: row.codeFamily,
    expected_sections: row.sectionTokens,
    source: "gate",
    status: "candidate",
    notes: row.isNegative ? `${base} | NEGATIVE CONTROL — expects explicit refusal, zero fabricated citations.` : base,
  };
}

export function loadGateCandidates(mdText) {
  return parseGateDoc(mdText).map(gateRowToCandidate);
}

// ============================================================
// 5. Generate from the SBC 401 / SBC 501 chunk corpus (source "generated")
// ============================================================

function sanitizeId(s) {
  return String(s).replace(/[^a-zA-Z0-9.-]/g, "_");
}

export function loadChunkFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[golden-set] corpus file not found, skipping generation from it: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[golden-set] failed to parse ${filePath}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** One realistic Arabic engineer question template per curated high-value topic. */
const SBC401_TOPICS = [
  {
    id: "rcd-protection",
    category: "SBC401-rcd-protection",
    keywords: /\bRCD\b|residual\s+current|residual\s+operating\s+current/i,
    ask: (s) => `ما الحد الأقصى لتيار التشغيل المتبقي (RCD) الذي يشترطه القسم ${s} من SBC 401 في هذا التطبيق؟`,
  },
  {
    id: "overcurrent-adiabatic",
    category: "SBC401-overcurrent-protection",
    keywords: /adiabatic|overcurrent\s+protective\s+device|short-circuit\s+protection/i,
    ask: (s) => `كيف يحدد القسم ${s} من SBC 401 التنسيق بين تيار التصميم وتيار الحماية وسعة الموصل، أو معادلة التحمل الأديباتي لتيار القصر؟`,
  },
  {
    id: "life-safety-backup-power",
    category: "SBC401-life-safety-power",
    keywords: /safety\s+service|standby\s+(?:supply|source|system)|life\s+safety/i,
    ask: (s) => `ما أنظمة السلامة التي يشملها القسم ${s} من SBC 401 ضمن "خدمات السلامة" التي تتطلب مصدر تغذية احتياطياً؟`,
  },
  {
    id: "fault-loop-disconnection",
    category: "SBC401-fault-protection",
    keywords: /disconnection\s+time|fault\s+loop\s+impedance|automatic\s+disconnection/i,
    ask: (s) => `ما شرط ممانعة حلقة الخطأ وزمن الفصل التلقائي المطلوب الذي يحدده القسم ${s} من SBC 401؟`,
  },
  {
    id: "lightning-protection",
    category: "SBC401-lightning-protection",
    keywords: /lightning/i,
    ask: (s) => `ما متطلبات الحماية من الصواعق التي يوردها القسم ${s} من SBC 401؟`,
  },
  {
    id: "earthing",
    category: "SBC401-earthing",
    keywords: /earthing\s+arrangement|protective\s+conductor/i,
    ask: (s) => `ما متطلبات ترتيبات التأريض وموصلات الحماية الواردة في القسم ${s} من SBC 401؟`,
  },
  {
    id: "transient-overvoltage",
    category: "SBC401-transient-overvoltage",
    keywords: /transient\s+overvoltage|surge\s+protect/i,
    ask: (s) => `متى تلزم الحماية من الاضطرابات الجهدية العابرة (Transients) وفق القسم ${s} من SBC 401؟`,
  },
  {
    id: "pv-solar",
    category: "SBC401-pv-solar",
    keywords: /\bPV\s+array|photovoltaic/i,
    ask: (s) => `ما متطلبات مقاومة العزل أو حماية زيادة الحمل لمصفوفة الطاقة الشمسية (PV) الواردة في القسم ${s} من SBC 401؟`,
  },
  {
    id: "ev-charging",
    category: "SBC401-ev-charging",
    keywords: /electric\s+vehicle|EV\s+charging/i,
    ask: (s) => `ما متطلبات تركيب شحن المركبات الكهربائية (EV) الواردة في القسم ${s} من SBC 401؟`,
  },
  {
    id: "fire-alarm-electrical",
    category: "SBC401-fire-alarm-electrical",
    keywords: /fire\s+detection|fire\s+alarm/i,
    ask: (s) => `ما متطلبات التمديدات الكهربائية لأنظمة كشف وإنذار الحريق الواردة في القسم ${s} من SBC 401؟`,
  },
  {
    id: "emergency-lighting",
    category: "SBC401-emergency-lighting",
    keywords: /emergency\s+lighting|escape\s+lighting/i,
    ask: (s) => `ما متطلبات تغذية إنارة الطوارئ أو إنارة الهروب التي يحددها القسم ${s} من SBC 401؟`,
  },
  {
    id: "thermal-effects",
    category: "SBC401-thermal-effects",
    keywords: /degree\s+of\s+protection\s+IP|thermal\s+effect|luminaire/i,
    ask: (s) => `ما متطلبات الحماية من الآثار الحرارية (كدرجة الحماية IP أو السطوح الساخنة) الواردة في القسم ${s} من SBC 401؟`,
  },
  {
    id: "insulation-resistance",
    category: "SBC401-insulation-resistance",
    keywords: /insulation\s+resistance|insulation\s+monitoring/i,
    ask: (s) => `ما متطلبات مقاومة العزل أو أجهزة مراقبة العزل الواردة في القسم ${s} من SBC 401؟`,
  },
  {
    id: "initial-verification",
    category: "SBC401-initial-verification",
    keywords: /initial\s+verification|inspection\s+and\s+testing/i,
    ask: (s) => `ما إجراءات التحقق الابتدائي (Initial Verification) التي يشترطها القسم ${s} من SBC 401؟`,
  },
];

const SBC501_TOPICS = [
  {
    id: "exhaust-grade",
    category: "SBC501-exhaust-grade",
    keywords: /\bgrade\b.{0,40}exhaust|exhaust\s+duct.{0,40}slope|minimum\s+slope/i,
    ask: (s) => `ما الميل الأدنى المطلوب لمجرى العادم أو خط التصريف وفق القسم ${s} من SBC 501؟`,
  },
  {
    id: "ventilation-rate-equation",
    category: "SBC501-ventilation-rate",
    keywords: /breathing\s+zone|outdoor\s+airflow/i,
    ask: (s) => `كيف تُحسب كمية هواء التهوية الخارجي لمنطقة التنفس وفق المعادلة الواردة في القسم ${s} من SBC 501؟`,
  },
  {
    id: "classroom-ventilation",
    category: "SBC501-classroom-ventilation",
    keywords: /classroom/i,
    ask: (s) => `ما معدلات التهوية المطلوبة للفصول الدراسية (للشخص وللمساحة) وفق القسم ${s} من SBC 501؟`,
  },
  {
    id: "multizone-ventilation",
    category: "SBC501-multizone-ventilation",
    keywords: /multiple[\s-]zone|system\s+ventilation\s+efficiency/i,
    ask: (s) => `كيف يُحسب هواء التهوية الخارجي الكلي لنظام متعدد المناطق وفق القسم ${s} من SBC 501؟`,
  },
  {
    id: "grease-duct",
    category: "SBC501-grease-duct",
    keywords: /grease\s+duct|commercial\s+kitchen/i,
    ask: (s) => `ما متطلبات تصميم مجاري شحوم المطابخ التجارية الواردة في القسم ${s} من SBC 501؟`,
  },
  {
    id: "combustion-air",
    category: "SBC501-combustion-air",
    keywords: /combustion\s+air/i,
    ask: (s) => `ما متطلبات هواء الاحتراق الواردة في القسم ${s} من SBC 501؟`,
  },
  {
    id: "chimneys-vents",
    category: "SBC501-chimneys-vents",
    keywords: /\bchimney\b|\bvent(?:ing|s)?\b.{0,30}(?:appliance|flue)/i,
    ask: (s) => `ما متطلبات المداخن أو المنافس الواردة في القسم ${s} من SBC 501؟`,
  },
  {
    id: "boilers-pressure-vessels",
    category: "SBC501-boilers-pressure-vessels",
    keywords: /\bboiler\b|pressure\s+vessel/i,
    ask: (s) => `ما المتطلبات المتعلقة بالغلايات أو أوعية الضغط الواردة في القسم ${s} من SBC 501؟`,
  },
  {
    id: "expansion-tank",
    category: "SBC501-expansion-tank",
    keywords: /expansion\s+tank/i,
    ask: (s) => `كيف يُحسب الحجم الأدنى لخزان التمدد المغلق وفق القسم ${s} من SBC 501؟`,
  },
  {
    id: "smoke-control-door-force",
    category: "SBC501-smoke-control",
    keywords: /smoke\s+control|door.{0,25}opening\s+force/i,
    ask: (s) => `ما معادلة قوة فتح الباب في أنظمة التحكم بالدخان الواردة في القسم ${s} من SBC 501؟`,
  },
  {
    id: "makeup-air",
    category: "SBC501-makeup-air",
    keywords: /makeup\s+air/i,
    ask: (s) => `ما الفرق بين هواء التعويض (Makeup Air) ومتطلباته مقارنة بهواء الاحتراق وفق القسم ${s} من SBC 501؟`,
  },
  {
    id: "refrigeration-machinery-room",
    category: "SBC501-refrigeration-room",
    keywords: /refrigerant.{0,40}machinery\s+room|machinery\s+room.{0,40}ventilation/i,
    ask: (s) => `ما متطلبات تهوية غرفة آلات التبريد الواردة في القسم ${s} من SBC 501؟`,
  },
  {
    id: "hazardous-exhaust",
    category: "SBC501-hazardous-exhaust",
    keywords: /hazardous\s+exhaust|hazardous.{0,30}exhaust\s+system/i,
    ask: (s) => `ما معدل العادم المطلوب للأنظمة الخطرة بحسب مساحة المنطقة وفق القسم ${s} من SBC 501؟`,
  },
  {
    id: "condensate-drain",
    category: "SBC501-condensate-drain",
    keywords: /condensate.{0,30}(?:drain|trap|slope)/i,
    ask: (s) => `ما الميل الأدنى المطلوب لتصريف مياه التكاثف (Condensate) وفق القسم ${s} من SBC 501؟`,
  },
  {
    id: "hydronic-piping-stress",
    category: "SBC501-hydronic-piping",
    keywords: /hydronic|copper\s+tube.{0,30}stress/i,
    ask: (s) => `ما معادلة إجهاد التصميم لأنابيب الأنظمة الهيدرونية الواردة في القسم ${s} من SBC 501؟`,
  },
];

// Tuned so total candidates (benchmark + gate + generated) lands in the low
// 200s and the review-sheet workload (gate + generated) stays close to the
// "batches of 25, 4-6 hours total" review budget in
// docs/launch/golden-set-notes.md -- see that file for the arithmetic.
const MAX_PER_TOPIC = 6;
const MIN_TOKEN_COUNT = 80;

function pickBestChunkPerSection(chunks) {
  const bySection = new Map();
  for (const c of chunks) {
    if (!c.section_number) continue;
    const existing = bySection.get(c.section_number);
    if (!existing || (c.token_count ?? 0) > (existing.token_count ?? 0)) {
      bySection.set(c.section_number, c);
    }
  }
  return bySection;
}

/**
 * Walks one code's chunk file against its topic list, emitting at most one
 * candidate per (topic, section_number), at most MAX_PER_TOPIC per topic,
 * and never reusing a section_number already claimed by an earlier topic or
 * an earlier call (usedSections is shared across both codes, keyed by
 * "<codeType>:<section>" so SBC 401 and SBC 501 numbering can never collide).
 */
export function generateFromCode(codeType, codeFamily, chunkData, topics, usedSections, maxPerTopic = MAX_PER_TOPIC) {
  const generated = [];
  if (!chunkData || !Array.isArray(chunkData.chunks)) return generated;

  const usable = chunkData.chunks.filter(
    (c) => c.content_type !== "front_matter" && (c.token_count ?? 0) >= MIN_TOKEN_COUNT && c.section_number,
  );
  const bestBySection = pickBestChunkPerSection(usable);

  for (const topic of topics) {
    let count = 0;
    for (const [section, chunk] of bestBySection) {
      if (count >= maxPerTopic) break;
      const key = `${codeType}:${section}`;
      if (usedSections.has(key)) continue;
      if (!topic.keywords.test(chunk.content)) continue;
      usedSections.add(key);
      count++;
      generated.push({
        id: `GEN-${codeType}-${topic.id}-${sanitizeId(section)}`,
        question_ar: topic.ask(section),
        category: topic.category,
        code_family: codeFamily,
        expected_sections: [section],
        source: "generated",
        status: "candidate",
        notes:
          `Generated from ${chunkData.code_id} chunk ${chunk.chunk_id}, page ${chunk.page_start}-${chunk.page_end}, ` +
          `content_type=${chunk.content_type}, topic=${topic.id}. Not reviewed -- verify the section actually answers ` +
          `the question before promoting.`,
      });
    }
  }
  return generated;
}

// ============================================================
// 6. --export-bench
// ============================================================

function extractForbiddenClaims(text) {
  const matches = [...String(text ?? "").matchAll(/\b(NFPA|IMC|IBC|IFC|SFPE)\s?\d*\w*/gi)].map((m) => m[0]);
  const uniq = [...new Set(matches)];
  const claims = [];
  for (const m of uniq) claims.push(`${m} Section`, `${m} القسم`);
  return claims;
}

export function exportValidatedToHarnessJsonl(candidates) {
  const rows = candidates.filter((c) => c.status === "validated" && c.source !== "benchmark");
  const lines = rows.map((c) => {
    const isNegative = c.source === "gate" && c.expected_sections.length === 0;
    return JSON.stringify({
      id: c.id,
      question_ar: c.question_ar,
      question_en: "",
      expected_section_refs: c.expected_sections,
      expected_table_ids: [],
      forbidden_claims: isNegative ? extractForbiddenClaims(c.question_ar) : [],
      must_refuse: isNegative,
      refuse_reason: isNegative ? (c.notes ?? "gate-negative-control") : null,
      category: c.category,
    });
  });
  return lines.length ? lines.join("\n") + "\n" : "";
}

// ============================================================
// 7. CLI
// ============================================================

function loadCandidates() {
  if (!fs.existsSync(PATHS.candidates)) return [];
  return JSON.parse(fs.readFileSync(PATHS.candidates, "utf8"));
}

function getFlagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function build() {
  const existing = loadCandidates();
  const existingById = new Map(existing.map((c) => [c.id, c]));

  const benchmarkCandidates = fs.existsSync(PATHS.benchmarkJsonl)
    ? loadBenchmarkCandidates(fs.readFileSync(PATHS.benchmarkJsonl, "utf8"))
    : [];
  const gateCandidates = fs.existsSync(PATHS.gateDoc)
    ? loadGateCandidates(fs.readFileSync(PATHS.gateDoc, "utf8"))
    : [];

  const usedSections = new Set();
  const sbc401 = loadChunkFile(PATHS.sbc401Chunks);
  const sbc501 = loadChunkFile(PATHS.sbc501Chunks);
  const generatedCandidates = [
    ...generateFromCode("SBC401", "SBC 401", sbc401, SBC401_TOPICS, usedSections),
    ...generateFromCode("SBC501", "SBC 501", sbc501, SBC501_TOPICS, usedSections),
  ];

  const merged = [];
  for (const c of [...benchmarkCandidates, ...gateCandidates, ...generatedCandidates]) {
    merged.push(existingById.has(c.id) ? existingById.get(c.id) : c);
  }
  // Never silently drop a previously-generated id just because this run's
  // corpus/inputs no longer reproduce it (e.g. a machine without the
  // SBC_2024_intake drive) -- a human may have already reviewed it.
  for (const c of existing) {
    if (!merged.some((m) => m.id === c.id)) merged.push(c);
  }

  const errors = [];
  for (const c of merged) errors.push(...validateCandidate(c).map((e) => `${c.id}: ${e}`));
  if (errors.length > 0) {
    console.error("Schema validation failed:\n" + errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  const ids = merged.map((c) => c.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length > 0) {
    console.error("Duplicate ids: " + dupes.join(", "));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(PATHS.candidates), { recursive: true });
  fs.writeFileSync(PATHS.candidates, JSON.stringify(merged, null, 2) + "\n", "utf8");

  const forReview = merged.filter((c) => c.status === "candidate");
  fs.writeFileSync(PATHS.reviewSheet, "\uFEFF" + buildReviewSheetCsv(forReview), "utf8");

  console.log(
    `candidates: ${merged.length} total ` +
      `(benchmark=${benchmarkCandidates.length}, gate=${gateCandidates.length}, generated=${generatedCandidates.length})`,
  );
  console.log(`review sheet: ${forReview.length} row(s) -> ${PATHS.reviewSheet}`);
  if (merged.length < MIN_TOTAL_CANDIDATES) {
    console.warn(`WARNING: total candidates (${merged.length}) is below the ${MIN_TOTAL_CANDIDATES} target.`);
  }
}

function runImport(csvPath) {
  if (!csvPath) {
    console.error("Usage: node scripts/golden-set.mjs --import <reviewed.csv>");
    process.exitCode = 1;
    return;
  }
  const candidates = loadCandidates();
  const csvText = fs.readFileSync(csvPath, "utf8");
  const { candidates: updated, applied, skippedUnknown } = applyReviewDecisions(candidates, csvText);
  fs.writeFileSync(PATHS.candidates, JSON.stringify(updated, null, 2) + "\n", "utf8");
  console.log(`Applied ${applied} review decision(s) from ${csvPath} (${skippedUnknown} unknown id(s) skipped).`);
  console.log(`Wrote ${PATHS.candidates}.`);
}

function runExportBench(outPath) {
  const candidates = loadCandidates();
  const jsonl = exportValidatedToHarnessJsonl(candidates);
  const dest = outPath ?? PATHS.exportBenchDefault;
  fs.writeFileSync(dest, jsonl, "utf8");
  const count = jsonl ? jsonl.trim().split("\n").filter(Boolean).length : 0;
  console.log(`Exported ${count} validated entr${count === 1 ? "y" : "ies"} to ${dest}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--export-bench")) {
    runExportBench(getFlagValue(args, "--out"));
    return;
  }
  if (args.includes("--import")) {
    runImport(getFlagValue(args, "--import"));
    return;
  }
  build();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) main();
