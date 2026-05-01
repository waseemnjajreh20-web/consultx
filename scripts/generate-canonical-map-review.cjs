/**
 * Step 2.5 — Manual canonical map generator (READ-ONLY).
 *
 * Builds two human-review artifacts from sbc_documents using a TIGHTENED
 * heading detector that disqualifies cross-reference matches. No DB writes.
 *
 *   reports/advisory-section-canonical-map-review.csv
 *   reports/advisory-section-canonical-map-priority.md
 *
 * Stricter than scripts/inspect-section-number-drift.cjs:
 *   - Disqualify regex matches preceded by cross-reference keywords
 *     (see, per, in accordance with, complying with, pursuant to,
 *     as required by, Section).
 *   - Detect chunks that contain MULTIPLE distinct section headings,
 *     marking them as split_chunk_candidate (a single section_number
 *     update would be wrong).
 *
 * Strict invariants:
 *   - SELECT-only. Never UPDATE/INSERT/DELETE/UPSERT/MERGE/ALTER/DDL.
 *   - No fire-safety-chat / prompt / retrieval / GraphRAG / payment / Enterprise touches.
 *
 * Usage: node scripts/generate-canonical-map-review.cjs
 * Requires SUPABASE_DB_PASSWORD env var.
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const PROJECT_REF = "hrnltxmwoaphgejckutk";
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!DB_PASSWORD) {
  console.error("SUPABASE_DB_PASSWORD not set");
  process.exit(1);
}

const REPORTS_DIR = path.join(__dirname, "..", "reports");
const CSV_OUT = path.join(REPORTS_DIR, "advisory-section-canonical-map-review.csv");
const MD_OUT = path.join(REPORTS_DIR, "advisory-section-canonical-map-priority.md");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const client = new Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com",
  port: 6543,
  user: "postgres." + PROJECT_REF,
  password: DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

// Hygiene: outputs must never contain U+00A7 even when DB content does.
function sanitizeSymbol(s) {
  return typeof s === "string" ? s.replace(/§\s*/g, "Section ") : s;
}

// Disqualifying preceding context (last 40 chars before the candidate heading).
const DISQUALIFIER_CONTEXT_RX = /\b(see|per|in accordance with|complying with|pursuant to|as required by|Section|Sections|Per|See|under|with)\s*$/i;

// Heading shapes (anchored at line start ideally).
const RX_BARE_LINESTART = /(?:^|\n)\s*(\d{3,4}(?:\.\d{1,3}){1,3})(?=\s+[A-Z][A-Za-z][A-Za-z]+)/m;
const RX_SECTION_WORD_START = /(?:^|\n)\s*Section\s+(\d{3,4}(?:\.\d{1,3}){1,3})\b/im;
const RX_TABLE_WORD_START = /(?:^|\n)\s*TABLE\s+(\d{3,4}(?:\.\d{1,3}){0,3})\b/im;

// All-section-numbers scanner with disqualifier (used to detect split-chunk candidates).
const RX_ANY_SECTION = /\b(\d{3,4}(?:\.\d{1,3}){1,3})\b/g;

function findHeadingTight(content) {
  if (!content) return null;
  const head = content.slice(0, 800);
  const candidates = [];
  let m;
  if ((m = head.match(RX_BARE_LINESTART))) candidates.push({ value: m[1], idx: m.index, pattern: "bare" });
  if ((m = head.match(RX_SECTION_WORD_START))) candidates.push({ value: m[1], idx: m.index, pattern: "section_word" });
  if ((m = head.match(RX_TABLE_WORD_START))) candidates.push({ value: m[1], idx: m.index, pattern: "table_word" });
  if (candidates.length === 0) return null;
  // Prefer the earliest match.
  candidates.sort((a, b) => a.idx - b.idx);
  for (const c of candidates) {
    const before = head.slice(Math.max(0, c.idx - 40), c.idx);
    if (DISQUALIFIER_CONTEXT_RX.test(before)) continue;
    return c;
  }
  return null;
}

function findAllDistinctSectionsInBody(content) {
  // Returns the count of distinct section numbers that appear AS HEADINGS
  // (not as cross-references). Heuristic: section number must be on a line
  // start AND followed by a capitalized word.
  if (!content) return [];
  const headings = new Set();
  // Bare-heading scanner over full content.
  const rx = /(?:^|\n)\s*(\d{3,4}(?:\.\d{1,3}){1,3})(?=\s+[A-Z][A-Za-z][A-Za-z]+)/gm;
  let m;
  while ((m = rx.exec(content)) !== null) {
    const idx = m.index + m[0].indexOf(m[1]);
    const before = content.slice(Math.max(0, idx - 40), idx);
    if (DISQUALIFIER_CONTEXT_RX.test(before)) continue;
    headings.add(m[1]);
  }
  // Also "Section X.Y.Z " heading form (start-of-line).
  const rx2 = /(?:^|\n)\s*Section\s+(\d{3,4}(?:\.\d{1,3}){1,3})\b/gim;
  while ((m = rx2.exec(content)) !== null) headings.add(m[1]);
  return [...headings];
}

function classify(currentSec, detected) {
  if (!detected) {
    return currentSec ? "no_detectable_heading" : "no_detectable_heading_and_no_label";
  }
  const body = detected.value;
  if (!currentSec) return "missing_section_number";
  if (currentSec === body) return "exact_match";
  if (body.startsWith(currentSec + ".")) return "body_heading_child_of_section_number";
  if (currentSec.startsWith(body + ".")) return "section_number_parent_only";
  const cChap = (currentSec.match(/^(\d{3,4})/) || [])[1];
  const bChap = (body.match(/^(\d{3,4})/) || [])[1];
  if (cChap === bChap) return "body_heading_differs_from_section_number";
  return "suspicious_cross_chapter_label";
}

function recommendAction(type, distinctHeadingsCount) {
  if (distinctHeadingsCount >= 2) return "split_chunk_candidate";
  if (type === "body_heading_child_of_section_number" || type === "section_number_parent_only") return "safe_auto_candidate";
  if (type === "suspicious_cross_chapter_label" || type === "body_heading_differs_from_section_number" || type === "missing_section_number") return "manual_review";
  return "do_not_touch";
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = sanitizeSymbol(String(v)).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (s.includes(",") || s.includes("\"") || s.includes(";")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  await client.connect();
  console.log("connected.");

  console.log("scanning all rows with tightened detector...");
  const all = await client.query(
    `SELECT id, file_name, section_number, page_start, page_end,
            content
     FROM public.sbc_documents
     ORDER BY file_name, page_start NULLS LAST, id`
  );

  const csvRows = [];
  csvRows.push([
    "id", "file_name", "page_start", "page_end",
    "current_section_number", "detected_body_heading", "mismatch_type",
    "first_40_words_sanitized",
    "contains_group_m", "contains_1115", "contains_12000",
    "contains_903", "contains_907",
    "recommended_action",
    "proposed_section_number", "confidence", "reviewer_notes",
  ].join(","));

  const counts = { total: 0, mismatch: 0, byType: {}, byAction: {} };
  const splitCandidates = [];
  const groupMRows = [];
  const fireAlarmRows = [];
  const parentChildRows = [];
  const curatedTableConflicts = [];

  for (const row of all.rows) {
    counts.total++;
    const detected = findHeadingTight(row.content || "");
    const type = classify(row.section_number, detected);
    counts.byType[type] = (counts.byType[type] || 0) + 1;
    if (type === "exact_match") continue;
    counts.mismatch++;

    const distinct = findAllDistinctSectionsInBody(row.content || "");
    const action = recommendAction(type, distinct.length);
    counts.byAction[action] = (counts.byAction[action] || 0) + 1;

    const head = (row.content || "").slice(0, 600).replace(/\s+/g, " ").trim();
    const first40 = head.split(/\s+/).slice(0, 40).join(" ");
    const containsGroupM = /\bgroup\s*m\b|mercantile/i.test(row.content || "");
    const contains1115 = /\b1[,]?115\b/.test(row.content || "");
    const contains12000 = /\b12[,]?000\b/.test(row.content || "");
    const contains903 = /\b903\.\d/.test(row.content || "");
    const contains907 = /\b907\.\d/.test(row.content || "");

    // Review-queue inclusion filter:
    //   - all action != "do_not_touch", OR
    //   - any row containing Group M / 1115 / 12000 / 903 / 907 markers,
    //     even if action would otherwise be do_not_touch.
    const isHighSignal = containsGroupM || contains1115 || contains12000 || contains903 || contains907;
    const includeInCSV = action !== "do_not_touch" || isHighSignal;
    if (!includeInCSV) continue;

    const rec = {
      id: row.id, file: row.file_name,
      page_start: row.page_start, page_end: row.page_end,
      current: row.section_number, detected: detected ? detected.value : "",
      type, action,
      distinct_headings: distinct,
      first40, snippet: head.slice(0, 240),
      gm: containsGroupM, n1115: contains1115, n12000: contains12000, n903: contains903, n907: contains907,
    };

    csvRows.push([
      rec.id, rec.file, rec.page_start, rec.page_end,
      rec.current, rec.detected, rec.type,
      rec.first40,
      rec.gm ? "1" : "", rec.n1115 ? "1" : "", rec.n12000 ? "1" : "",
      rec.n903 ? "1" : "", rec.n907 ? "1" : "",
      rec.action,
      "", "", "",
    ].map(csvCell).join(","));

    if (action === "split_chunk_candidate") splitCandidates.push(rec);
    if ((containsGroupM && (contains1115 || contains12000)) || (contains903 && containsGroupM)) groupMRows.push(rec);
    if (contains907 && /(manual fire alarm|waterflow|907\.2\.7)/i.test(row.content || "")) fireAlarmRows.push(rec);
    if (type === "body_heading_child_of_section_number" || type === "section_number_parent_only") parentChildRows.push(rec);
  }

  // Curated-table conflict — pull the live row again for the report.
  const curatedRow = (await client.query(
    `SELECT table_id, table_title, source_code, edition,
            substring(content_md, 1, 1600) AS head, length(content_md) AS clen
     FROM public.sbc_code_tables WHERE table_id = '903.2'`
  )).rows[0];
  if (curatedRow) curatedTableConflicts.push(curatedRow);

  // === Write CSV ===
  fs.writeFileSync(CSV_OUT, csvRows.join("\n"));
  console.log("wrote " + CSV_OUT + " (" + (csvRows.length - 1) + " review rows)");

  // === Write priority MD ===
  const lines = [];
  const generatedAt = new Date().toISOString();
  lines.push("# Advisory Section-Number Canonical Map — Manual Review Priority");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Project: \`${PROJECT_REF}\``);
  lines.push("");
  lines.push("**READ-ONLY.** No DB writes, no UPDATE/INSERT/DELETE/UPSERT/DDL/migrations.");
  lines.push("");
  lines.push("This is a manual review queue. The accompanying CSV (`reports/advisory-section-canonical-map-review.csv`) contains the full set of mismatch rows with blank columns for the reviewer to fill: `proposed_section_number`, `confidence`, `reviewer_notes`.");
  lines.push("");
  lines.push("Detector tightened vs Step 2: matches preceded by `see`, `per`, `in accordance with`, `complying with`, `pursuant to`, `as required by`, or `Section` (cross-ref) are now disqualified. Multi-section chunks are flagged as `split_chunk_candidate`.");
  lines.push("");
  lines.push("## Counts");
  lines.push(`- Total rows scanned: **${counts.total}**`);
  lines.push(`- Mismatch rows in CSV: **${counts.mismatch}**`);
  lines.push("");
  lines.push("By classification:");
  for (const [t, c] of Object.entries(counts.byType).sort((a,b) => b[1]-a[1])) {
    lines.push(`- \`${t}\`: ${c}`);
  }
  lines.push("");
  lines.push("By recommended action:");
  for (const [a, c] of Object.entries(counts.byAction).sort((a,b) => b[1]-a[1])) {
    lines.push(`- \`${a}\`: ${c}`);
  }
  lines.push("");
  lines.push("## 1. Group M sprinkler trigger rows (`1,115 m²` / `Group M` / `Mercantile`)");
  lines.push("");
  lines.push("These are the rows where the Advisory's incorrect 99% Group M answer was rooted. Each row contains either the trigger value or Mercantile / 903.x context.");
  lines.push("");
  lines.push("| id | file (short) | page | current_section | detected_heading | type | action | snippet |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of groupMRows.slice(0, 30)) {
    const fileShort = r.file.replace(/_extracted_chunks\.json/, "").replace(/SBC (\d+).*?(\d+-\d+).*$/, "SBC $1 [$2]");
    lines.push(`| ${r.id} | ${fileShort} | ${r.page_start}-${r.page_end} | \`${r.current || "(null)"}\` | \`${r.detected || "(none)"}\` | ${r.type} | ${r.action} | ${sanitizeSymbol(r.snippet.slice(0, 200)).replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  lines.push(`Total Group M / Mercantile / 903.x rows in review: **${groupMRows.length}**.`);
  lines.push("");
  lines.push("**Recommended handling:** rows where action is `split_chunk_candidate` cannot be fixed by retagging — they need an ingestion-time chunk split (the chunk straddles two distinct sections). Rows tagged `manual_review` need a reviewer to confirm the correct section_number from the body's leading heading.");
  lines.push("");
  lines.push("## 2. Fire-alarm Group M rows (`907.2.7` / `manual fire alarm` / `waterflow`)");
  lines.push("");
  lines.push("| id | file (short) | page | current_section | detected_heading | type | action | snippet |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of fireAlarmRows.slice(0, 30)) {
    const fileShort = r.file.replace(/_extracted_chunks\.json/, "").replace(/SBC (\d+).*?(\d+-\d+).*$/, "SBC $1 [$2]");
    lines.push(`| ${r.id} | ${fileShort} | ${r.page_start}-${r.page_end} | \`${r.current || "(null)"}\` | \`${r.detected || "(none)"}\` | ${r.type} | ${r.action} | ${sanitizeSymbol(r.snippet.slice(0, 200)).replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  lines.push(`Total fire-alarm / 907.x rows in review: **${fireAlarmRows.length}**.`);
  lines.push("");
  lines.push("## 3. Parent-child rows — DO NOT BLINDLY UPDATE");
  lines.push("");
  lines.push("These rows have a `section_number` that is a parent of the body heading, OR a body heading that is a child sub-clause of the column. Some of these are legitimately tagged at the parent level (the chunk covers multiple sub-clauses including the parent's introductory text). Auto-refining the label to the first detected child sub-clause is mechanically safe in most cases, but spot-check a few first.");
  lines.push("");
  lines.push("Examples (top 25):");
  lines.push("");
  lines.push("| id | file (short) | page | current | detected | type |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of parentChildRows.slice(0, 25)) {
    const fileShort = r.file.replace(/_extracted_chunks\.json/, "").replace(/SBC (\d+).*?(\d+-\d+).*$/, "SBC $1 [$2]");
    lines.push(`| ${r.id} | ${fileShort} | ${r.page_start}-${r.page_end} | \`${r.current}\` | \`${r.detected}\` | ${r.type} |`);
  }
  lines.push("");
  lines.push(`Total parent-child rows: **${parentChildRows.length}**.`);
  lines.push("");
  lines.push("## 4. Chunk-split candidates (multiple distinct section headings in one chunk)");
  lines.push("");
  lines.push("These rows contain TWO or more distinct section-heading markers in the body. A single `section_number` UPDATE cannot be correct — they need an ingestion-time split into multiple chunks, one per real section.");
  lines.push("");
  lines.push("| id | file (short) | page | current | detected_first | distinct_headings_in_body |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of splitCandidates.slice(0, 40)) {
    const fileShort = r.file.replace(/_extracted_chunks\.json/, "").replace(/SBC (\d+).*?(\d+-\d+).*$/, "SBC $1 [$2]");
    const distinctList = r.distinct_headings.slice(0, 6).join(", ") + (r.distinct_headings.length > 6 ? ` … (+${r.distinct_headings.length - 6})` : "");
    lines.push(`| ${r.id} | ${fileShort} | ${r.page_start}-${r.page_end} | \`${r.current || "(null)"}\` | \`${r.detected || "(none)"}\` | ${distinctList} |`);
  }
  lines.push("");
  lines.push(`Total chunk-split candidates: **${splitCandidates.length}**.`);
  lines.push("");
  lines.push("**Recommended handling:** these rows must be excluded from any batched relabel UPDATE. They surface a chunking strategy issue (the upstream JSON ingestion produced chunks that span multiple SBC sections). The fix is at ingestion time — re-emit those chunks with section-aware boundaries — not at the row level. Until that's done, queries can still hit these rows, but their `section_number` column will be approximate.");
  lines.push("");
  lines.push("## 5. Curated table conflict — `sbc_code_tables.table_id='903.2'`");
  lines.push("");
  if (curatedRow) {
    lines.push(`- table_id: \`${curatedRow.table_id}\`  source: \`${curatedRow.source_code}\`  edition: \`${curatedRow.edition}\`  md_len: \`${curatedRow.clen}\``);
    lines.push(`- title: \`${curatedRow.table_title}\``);
    lines.push("");
    lines.push("### Live `content_md` (head excerpt)");
    lines.push("");
    lines.push("```");
    lines.push(sanitizeSymbol(curatedRow.head).slice(0, 1200));
    lines.push("```");
    lines.push("");
  }
  lines.push("**Internal inconsistency:** this curated row places **Mercantile (Group M) at sub-clause 903.2.6** and **R-1 (Hotels) at sub-clause 903.2.7**. Multiple verbatim chunks in `sbc_documents` (and the curated row's own neighbour rows) place Group M at 903.2.7 — matching SBC 801 / IBC 2021 numbering as published.");
  lines.push("");
  lines.push("**Required action before any chunk relabel:** a maintainer must:");
  lines.push("1. Open the source PDF (SBC 801 — The Saudi Fire Protection Code) at the Section 903.2 occupancy table.");
  lines.push("2. Confirm whether the published numbering is 903.2.6 → M / 903.2.7 → R-1 (older IBC numbering preserved) or 903.2.7 → M / 903.2.8 → R-1 (matches the verbatim chunks).");
  lines.push("3. If the chunks are correct (903.2.7 → M), open a one-row migration to UPDATE the curated `content_md`. Do NOT auto-update.");
  lines.push("4. If the curated row is correct (older numbering preserved), then the verbatim chunks themselves are anomalous and the relabel direction reverses. (This is unlikely but must be confirmed.)");
  lines.push("");
  lines.push("Until step 1-2 is signed off, no chunk relabel touching 903.2.x or 907.2.x should be committed.");
  lines.push("");
  lines.push("## 6. Bulk reviewer instructions");
  lines.push("");
  lines.push("Open `reports/advisory-section-canonical-map-review.csv` in a spreadsheet (or `csvkit`). For each row:");
  lines.push("- If `recommended_action = safe_auto_candidate`: leave as-is unless body says otherwise. Fill `proposed_section_number = detected_body_heading`, `confidence = high`.");
  lines.push("- If `recommended_action = manual_review`: read the snippet. If the body heading is correct, fill `proposed_section_number = detected_body_heading`, `confidence = high`. If the chunk straddles sections, change `recommended_action` to `split_chunk_candidate` and leave `proposed_section_number` blank.");
  lines.push("- If `recommended_action = split_chunk_candidate`: leave `proposed_section_number` blank. Add a `reviewer_notes` entry describing where the second section starts (page or chunk_index hint).");
  lines.push("- If `recommended_action = do_not_touch`: confirm by leaving `proposed_section_number` blank.");
  lines.push("");
  lines.push("Save the annotated CSV as `reports/advisory-section-canonical-map-review-ANNOTATED.csv` and commit. Step 2.6 will consume that file to produce the actual UPDATE batch script (still not auto-running it — owner approves the SQL diff before execution).");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Companion: `reports/advisory-section-canonical-map-review.csv`. Earlier dry-run: `reports/advisory-section-drift-summary.md`.");

  fs.writeFileSync(MD_OUT, sanitizeSymbol(lines.join("\n")));
  console.log("wrote " + MD_OUT);

  await client.end();

  // Counts for the final report.
  console.log("\nSUMMARY:");
  console.log("  total scanned: " + counts.total);
  console.log("  mismatch rows in CSV: " + counts.mismatch);
  console.log("  group M / Mercantile / 903 rows: " + groupMRows.length);
  console.log("  fire-alarm / 907 rows: " + fireAlarmRows.length);
  console.log("  parent-child rows: " + parentChildRows.length);
  console.log("  split-chunk candidates: " + splitCandidates.length);
  console.log("  by action: " + JSON.stringify(counts.byAction));
}

main().catch((e) => { console.error("FATAL: " + e.message); process.exit(1); });
