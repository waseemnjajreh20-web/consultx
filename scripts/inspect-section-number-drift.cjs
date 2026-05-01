/**
 * Step 2 — Section Number Drift Dry-Run (READ-ONLY).
 *
 * Inspects sbc_documents for rows where the first section heading inside
 * `content` does not match the `section_number` column. Produces:
 *   reports/advisory-section-drift-dry-run.json
 *   reports/advisory-section-drift-summary.md
 *
 * Strict invariants (verified by Phase 5 of the brief):
 *   - SELECT-only. No UPDATE/INSERT/DELETE/UPSERT/MERGE/ALTER/DDL.
 *   - No DB writes of any kind. No migrations.
 *   - No fire-safety-chat / prompt / retrieval / GraphRAG / payment / Enterprise touches.
 *   - Connection pattern matches scripts/inspect-seat-baseline.cjs.
 *
 * Usage: node scripts/inspect-section-number-drift.cjs
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
const JSON_OUT = path.join(REPORTS_DIR, "advisory-section-drift-dry-run.json");
const MD_OUT = path.join(REPORTS_DIR, "advisory-section-drift-summary.md");

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// Section-symbol hygiene: outputs must never contain the U+00A7 character even when
// quoting DB content that does. Replace with "Section " (note trailing space) so quotes
// stay readable.
function sanitizeSymbol(s) {
  if (typeof s !== "string") return s;
  return s.replace(/§\s*/g, "Section ");
}
function sanitizeDeep(o) {
  if (typeof o === "string") return sanitizeSymbol(o);
  if (Array.isArray(o)) return o.map(sanitizeDeep);
  if (o && typeof o === "object") {
    const out = {};
    for (const k of Object.keys(o)) out[k] = sanitizeDeep(o[k]);
    return out;
  }
  return o;
}

const client = new Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com",
  port: 6543,
  user: "postgres." + PROJECT_REF,
  password: DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

// === Heading detection ===
//
// We look only inside the FIRST ~700 chars of the chunk body. That is where the
// section heading appears at chunk start in the SBC ingestion format. Searching
// the entire body would create false positives because chunks naturally contain
// many cross-references to other section numbers (e.g. "see Section 903.3.1.1").
//
// Patterns (in priority order):
//   P1: bare-section-heading at start  e.g. "903.2.7 Group M.\nA manual fire alarm system..."
//   P2: "Section X.Y.Z Group M..."     e.g. "Section 903.2.7 Group M occupancies..."
//   P3: "TABLE X.Y.Z TITLE"            e.g. "TABLE 1004.5  MAXIMUM FLOOR AREA..."
//
// Section number shape: 3-4 digits, then 1-3 dotted parts. Anchored at heading start.
const RX_BARE_HEADING = /(?:^|\n)\s*(\d{3,4}(?:\.\d{1,3}){1,3})(?=\s+[A-Z][A-Za-z][A-Za-z]+)/m;
const RX_SECTION_HEADING = /(?:^|\n)\s*Section\s+(\d{3,4}(?:\.\d{1,3}){1,3})\b/im;
const RX_TABLE_HEADING = /(?:^|\n)\s*TABLE\s+(\d{3,4}(?:\.\d{1,3}){0,3})\b/im;

function detectHeading(content) {
  if (!content) return null;
  const window = content.slice(0, 700);
  let m;
  if ((m = window.match(RX_BARE_HEADING))) return { value: m[1], pattern: "bare" };
  if ((m = window.match(RX_SECTION_HEADING))) return { value: m[1], pattern: "section_word" };
  if ((m = window.match(RX_TABLE_HEADING))) return { value: m[1], pattern: "table_word" };
  return null;
}

function classify(currentSec, detected) {
  if (!detected) {
    if (!currentSec) return "no_detectable_heading_and_no_label";
    return "no_detectable_heading";
  }
  const body = detected.value;
  if (!currentSec) return "missing_section_number";
  if (currentSec === body) return "exact_match";
  // parent/child
  if (body.startsWith(currentSec + ".")) return "body_heading_child_of_section_number";
  if (currentSec.startsWith(body + ".")) return "section_number_parent_only";
  // same chapter prefix?
  const cChap = (currentSec.match(/^(\d{3,4})/) || [])[1];
  const bChap = (body.match(/^(\d{3,4})/) || [])[1];
  if (cChap === bChap) return "body_heading_differs_from_section_number";
  return "suspicious_cross_chapter_label";
}

async function main() {
  await client.connect();
  console.log("connected.");

  // === Phase 1 — Baseline ===
  const baseline = {};
  baseline.tables = (await client.query(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_name IN ('sbc_documents','sbc_code_tables','sbc_pages','community_summaries','graph_nodes','graph_edges','graph_indexing_status')
     ORDER BY table_name`
  )).rows;

  baseline.columns = (await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sbc_documents'
     ORDER BY ordinal_position`
  )).rows;

  baseline.totalRows = (await client.query(
    `SELECT count(*)::int AS c FROM public.sbc_documents`
  )).rows[0].c;

  baseline.distinctFiles = (await client.query(
    `SELECT count(DISTINCT file_name)::int AS c FROM public.sbc_documents`
  )).rows[0].c;

  baseline.nullSection = (await client.query(
    `SELECT count(*)::int AS c FROM public.sbc_documents WHERE section_number IS NULL OR section_number = ''`
  )).rows[0].c;

  baseline.nonNullSection = baseline.totalRows - baseline.nullSection;

  console.log("baseline:", JSON.stringify(baseline, null, 2));

  // === Phase 2 — Pull all rows for heading scan ===
  // We project only the first 700 chars of content to keep memory bounded.
  console.log("scanning all rows...");
  const all = await client.query(
    `SELECT id, file_name, section_number, page_start, page_end,
            substring(content, 1, 700) AS head_text,
            length(content) AS clen
     FROM public.sbc_documents
     ORDER BY file_name, page_start NULLS LAST, id`
  );

  const byType = {};
  const examples = {};
  const allMismatches = [];
  let inspected = 0;
  for (const row of all.rows) {
    inspected++;
    const detected = detectHeading(row.head_text || "");
    const type = classify(row.section_number, detected);
    byType[type] = (byType[type] || 0) + 1;

    if (type !== "exact_match") {
      const rec = {
        id: row.id,
        file_name: row.file_name,
        section_number: row.section_number,
        body_heading: detected ? detected.value : null,
        body_heading_pattern: detected ? detected.pattern : null,
        page_start: row.page_start,
        page_end: row.page_end,
        clen: row.clen,
        type,
        snippet: (row.head_text || "").replace(/\s+/g, " ").slice(0, 240),
      };
      allMismatches.push(rec);
      if (!examples[type]) examples[type] = [];
      if (examples[type].length < 8) examples[type].push(rec);
    }
  }

  // === Phase 3 — Known failure cases ===
  console.log("pulling known-failure rows...");
  const focused = {};

  focused.row_508_4_1_with_group_M_threshold = (await client.query(
    `SELECT id, file_name, section_number, page_start, page_end,
            substring(content, position('1115' in content) - 80, 320) AS snippet
     FROM public.sbc_documents
     WHERE content ILIKE '%1115%'
       AND content ILIKE '%Group M%'
       AND content ILIKE '%903.2.7%'
     LIMIT 20`
  )).rows;

  focused.rows_labeled_903_2_7_actual_body = (await client.query(
    `SELECT id, file_name, section_number, page_start, page_end,
            substring(content, 1, 320) AS head_text
     FROM public.sbc_documents
     WHERE section_number = '903.2.7'
     ORDER BY file_name, page_start
     LIMIT 20`
  )).rows;

  focused.body_contains_907_2_7_group_m_label_other = (await client.query(
    `SELECT id, file_name, section_number, page_start, page_end,
            substring(content, greatest(position('907.2.7' in content) - 80, 1), 320) AS snippet
     FROM public.sbc_documents
     WHERE content ILIKE '%907.2.7 Group M%'
        OR (content ILIKE '%907.2.7%' AND content ILIKE '%manual fire alarm system%')
     LIMIT 20`
  )).rows;

  focused.sbc_code_tables_903_2 = (await client.query(
    `SELECT table_id, table_title, source_code, edition,
            substring(content_md, 1, 1200) AS content_md_head,
            length(content_md) AS clen
     FROM public.sbc_code_tables
     WHERE table_id = '903.2'`
  )).rows;

  focused.community_summary_mercantile_1115 = (await client.query(
    `SELECT id, level, summary
     FROM public.community_summaries
     WHERE summary ILIKE '%Mercantile%' AND summary ILIKE '%1,115%'`
  )).rows;

  // === Section_number value distribution (top 30) ===
  const sectionDistribution = (await client.query(
    `SELECT section_number, count(*)::int AS rows,
            count(DISTINCT file_name)::int AS files
     FROM public.sbc_documents
     WHERE section_number IS NOT NULL AND section_number <> ''
     GROUP BY section_number
     ORDER BY rows DESC
     LIMIT 30`
  )).rows;

  // === All-mismatch CSV-style rollup by file ===
  const mismatchByFile = {};
  for (const m of allMismatches) {
    mismatchByFile[m.file_name] = (mismatchByFile[m.file_name] || 0) + 1;
  }
  const mismatchByFileArr = Object.entries(mismatchByFile)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);

  // === Build JSON report ===
  const report = {
    generated_at: new Date().toISOString(),
    project: PROJECT_REF,
    note: "READ-ONLY DRY-RUN. No DB writes were performed.",
    baseline,
    inspected_rows: inspected,
    classification_counts: byType,
    classification_percentages: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, +(100 * v / inspected).toFixed(2)])
    ),
    mismatch_total: allMismatches.length,
    mismatch_by_file_top30: mismatchByFileArr.slice(0, 30),
    examples_by_type: examples,
    section_number_distribution_top30: sectionDistribution,
    focused_known_failures: focused,
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(sanitizeDeep(report), null, 2));
  console.log("wrote " + JSON_OUT);

  // === Build Markdown summary ===
  const lines = [];
  lines.push("# Advisory Section-Number Drift — Dry-Run Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Project: \`${PROJECT_REF}\``);
  lines.push("");
  lines.push("**READ-ONLY.** No DB writes. No UPDATE/INSERT/DELETE/UPSERT/DDL/migrations.");
  lines.push("");
  lines.push("## 1. Baseline");
  lines.push(`- Total rows in \`sbc_documents\`: **${baseline.totalRows}**`);
  lines.push(`- Distinct \`file_name\`: **${baseline.distinctFiles}**`);
  lines.push(`- Rows with \`section_number\` null/empty: **${baseline.nullSection}**`);
  lines.push(`- Rows with \`section_number\` populated: **${baseline.nonNullSection}**`);
  lines.push("");
  lines.push("Columns:");
  for (const c of baseline.columns) lines.push(`- \`${c.column_name}\` (${c.data_type})`);
  lines.push("");
  lines.push("## 2. Mismatch counts by classification");
  lines.push("| Type | Count | % of inspected |");
  lines.push("|---|---:|---:|");
  for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${t} | ${c} | ${(100 * c / inspected).toFixed(2)}% |`);
  }
  lines.push("");
  lines.push(`Total mismatch rows (all non-\`exact_match\`): **${allMismatches.length}** of ${inspected} (${(100 * allMismatches.length / inspected).toFixed(2)}%).`);
  lines.push("");
  lines.push("## 3. Top 30 mismatch examples");
  const top30 = allMismatches.slice(0, 30);
  lines.push("| # | type | file (short) | page | section_number | body_heading | snippet |");
  lines.push("|---:|---|---|---|---|---|---|");
  for (let i = 0; i < top30.length; i++) {
    const r = top30[i];
    const fileShort = r.file_name.replace(/_extracted_chunks\.json/, "").replace(/SBC (\d+).*?(\d+-\d+).*$/, "SBC $1 [$2]");
    const sn = `${fileShort.slice(0, 30)}…`;
    lines.push(`| ${i + 1} | ${r.type} | ${sn} | ${r.page_start}-${r.page_end} | ${r.section_number || "(null)"} | ${r.body_heading || "(none)"} | ${r.snippet.slice(0, 80).replace(/\|/g, "\\|")}… |`);
  }
  lines.push("");
  lines.push("## 4. Known failure cases");
  lines.push("");
  lines.push("### 4a. Group M sprinkler trigger (1,115 m² — 903.2.7) lives under wrong label");
  if (focused.row_508_4_1_with_group_M_threshold.length === 0) {
    lines.push("- (no rows found containing 1115 + Group M + 903.2.7)");
  } else {
    for (const r of focused.row_508_4_1_with_group_M_threshold) {
      lines.push(`- id=${r.id} \`${r.file_name}\` p${r.page_start}-${r.page_end}, **section_number=\`${r.section_number}\`**`);
      lines.push(`  - snippet: \`${(r.snippet || "").replace(/\s+/g, " ").slice(0, 240)}\``);
    }
  }
  lines.push("");
  lines.push("### 4b. Rows labeled `section_number = 903.2.7` — what is actually in the body");
  for (const r of focused.rows_labeled_903_2_7_actual_body) {
    lines.push(`- id=${r.id} \`${r.file_name}\` p${r.page_start}-${r.page_end}`);
    lines.push(`  - body head: \`${(r.head_text || "").replace(/\s+/g, " ").slice(0, 240)}\``);
  }
  lines.push("");
  lines.push("### 4c. Body text contains \"907.2.7 Group M\" but section_number is something else");
  for (const r of focused.body_contains_907_2_7_group_m_label_other) {
    lines.push(`- id=${r.id} \`${r.file_name}\` p${r.page_start}-${r.page_end}, **section_number=\`${r.section_number}\`**`);
    lines.push(`  - snippet: \`${(r.snippet || "").replace(/\s+/g, " ").slice(0, 240)}\``);
  }
  lines.push("");
  lines.push("### 4d. `sbc_code_tables` — table_id 903.2 (curated row)");
  for (const r of focused.sbc_code_tables_903_2) {
    lines.push(`- table_id=\`${r.table_id}\`  edition=${r.edition}  source=${r.source_code}  md_len=${r.clen}`);
    lines.push(`  - title: \`${r.table_title}\``);
    lines.push(`  - head: \`${(r.content_md_head || "").replace(/\s+/g, " ").slice(0, 360)}\``);
  }
  lines.push("");
  lines.push("### 4e. `community_summaries` row mentioning Mercantile + 1,115");
  for (const r of focused.community_summary_mercantile_1115) {
    lines.push(`- id=${r.id} level=${r.level}`);
    lines.push(`  - summary: \`${(r.summary || "").replace(/\s+/g, " ").slice(0, 360)}\``);
  }
  lines.push("");
  lines.push("## 5. Mismatch concentration by file (top 30)");
  lines.push("| File | Mismatch rows |");
  lines.push("|---|---:|");
  for (const r of mismatchByFileArr.slice(0, 30)) {
    lines.push(`| \`${r.file}\` | ${r.count} |`);
  }
  lines.push("");
  lines.push("## 6. Safety classification of proposed updates");
  lines.push("");
  lines.push("Categories below are recommendations only. Nothing has been changed.");
  lines.push("");
  lines.push("**SAFE-AUTO (consider auto-update with batch + audit log):**");
  lines.push("- `body_heading_child_of_section_number` — body heading is a sub-clause of column. Rename column to body heading is generally safe (e.g. column `903.2.7` body `903.2.7.2` ⇒ retag to `903.2.7.2`).");
  lines.push("- `section_number_parent_only` — column is a parent (e.g. `903.2`) but body has a specific child (e.g. `903.2.7`). Retagging to body heading is generally safe.");
  lines.push("");
  lines.push("**MANUAL-REVIEW (do NOT auto-update):**");
  lines.push("- `body_heading_differs_from_section_number` — same chapter, different sub-clause. Could be a chunk boundary issue (chunk straddles two sub-clauses) or genuine drift. Needs eyeballing.");
  lines.push("- `suspicious_cross_chapter_label` — column is in a different chapter from body heading (e.g. column `508.4.1` body `903.2.7`). High-value cases (these are the Group M drift roots) but each must be confirmed against the chunk boundaries before retag.");
  lines.push("- `missing_section_number` — column null while body has a heading. Retag is usually correct, but null may have been intentional for cross-reference / index chunks.");
  lines.push("- `no_detectable_heading` (with column populated) — column says `903.2.7` but body has no detectable heading; could be a continuation chunk that legitimately inherits the parent label.");
  lines.push("");
  lines.push("**DO-NOT-TOUCH:**");
  lines.push("- Rows where heading regex matched a cross-reference (e.g. \"see Section 903.3.1.1\") in the first 700 chars by accident. Need a stricter validator before any UPDATE.");
  lines.push("- `no_detectable_heading_and_no_label` — both unlabeled. Cannot be auto-resolved.");
  lines.push("");
  lines.push("## 7. Risks before any real UPDATE");
  lines.push("- Section labels are referenced by `analyticalRouting.ts` `KNOWN_TABLE_IDS` and `PARENT_ALIASES`; retagging shifts which chunks are returned for a given query. Run a regression on a benchmark prompt set first.");
  lines.push("- The `sbc_code_tables.table_id='903.2'` curated row already disagrees with the verbatim chunks (puts Mercantile at 903.2.6 vs verbatim 903.2.7). Backfilling chunk labels without reconciling the curated table will create a new internal inconsistency.");
  lines.push("- vector embeddings are not affected by relabeling, but the RPC `match_sbc_documents` returns `section_number` in its response; downstream prompt-context formatting will change.");
  lines.push("- Some chunks contain BOTH a heading and a different referenced section (e.g. `\"903.2.7 Group M ... see Section 907.5\"`). The first-match-wins regex might misattribute on chunk continuations whose first heading is actually a quoted reference.");
  lines.push("");
  lines.push("## 8. Recommended next step (Step 2.5)");
  lines.push("");
  lines.push("Do **not** run an auto-batch UPDATE yet. Recommended sequence:");
  lines.push("1. Tighten the heading detector — add a stricter regex that disqualifies matches preceded by keywords like \"see\", \"per\", \"in accordance with\", \"complying with\".");
  lines.push("2. Re-run this dry-run with the tightened detector and compare counts.");
  lines.push("3. Manually review the SAFE-AUTO category's top 50 rows to confirm zero false positives.");
  lines.push("4. Reconcile `sbc_code_tables.table_id='903.2'` Mercantile section numbering with the verbatim chunks (separate migration).");
  lines.push("5. Only then propose a batched UPDATE — wrapped in a transaction, with a `section_number_was` audit column saved before mutating.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Companion JSON: `reports/advisory-section-drift-dry-run.json`.");
  fs.writeFileSync(MD_OUT, sanitizeSymbol(lines.join("\n")));
  console.log("wrote " + MD_OUT);

  await client.end();
}

main().catch((e) => { console.error("FATAL: " + e.message); process.exit(1); });
