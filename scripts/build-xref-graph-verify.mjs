/**
 * ConsultX -- xref-graph build verifier
 *
 * Read-only. Re-runs (as far as PostgREST allows) the Section 8 G0 gate
 * probes from scripts/build-xref-graph.sql through supabase-js, and prints
 * a PASS/FAIL/INFO table. Run this any time after build-xref-graph.sql has
 * been applied, to re-check the graph without opening the SQL editor.
 *
 * NOTE ON SCOPE: PostgREST does not expose information_schema or
 * pg_catalog over the REST API, so probe 8b (the schema-level "tgt_doc_id's
 * FK points at sbc_documents, not sbc_code_tables" check) cannot be
 * reproduced here exactly as written in the SQL file. This script instead
 * runs a data-level proxy for the same claim: every tgt_doc_id in
 * sbc_xref_edges must resolve to a real sbc_documents row (no dangling
 * reference to anything else, including sbc_code_tables), AND the stored
 * tgt_code must match that row's live code_type. The authoritative
 * schema-level check is build-xref-graph.sql Section 8b, run once in the
 * Supabase SQL editor.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/build-xref-graph-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables before running this script.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EXTRACTOR_VER = 'xref_v1';

// Point estimates from docs/audits/graphrag-design-20260823.md Sections 2.3
// and 2.5 -- the same +/-5% tolerance band scripts/build-xref-graph.sql uses.
const EXPECTED = {
  section_ref: 9296,
  cross_code: 358,
  prefix_fallback: 168,
};
const TOLERANCE = 0.05;

function withinTolerance(actual, expected) {
  return Math.abs(actual - expected) <= expected * TOLERANCE;
}

const results = [];
function record(id, label, status, detail) {
  results.push({ id, label, status, detail });
}

async function countEdges(applyFilters) {
  let q = supabase
    .from('sbc_xref_edges')
    .select('*', { count: 'exact', head: true })
    .eq('extractor_ver', EXTRACTOR_VER);
  q = applyFilters(q);
  const { count, error } = await q;
  if (error) throw new Error(`countEdges: ${error.message}`);
  return count ?? 0;
}

// Paged fetch. The explicit .order('id') is load-bearing, not cosmetic:
// PostgREST's .range() is OFFSET/LIMIT, and an OFFSET query with no ORDER BY
// has no guaranteed row order in Postgres, so across the ~10 pages this makes
// over sbc_xref_edges some rows can be returned twice and others never --
// which would silently corrupt the dangling/mismatched counts probe 8b
// reports. Every caller must page over a stable, unique key.
async function fetchAll(table, columns, applyFilters, orderColumn = 'id') {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    let q = supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    all = all.concat(data ?? []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function probe8a() {
  const sectionRef = await countEdges((q) =>
    q.eq('edge_kind', 'section_ref').not('cue', 'like', '%:prefix_fallback')
  );
  const crossCode = await countEdges((q) => q.eq('edge_kind', 'cross_code'));
  const prefixFallback = await countEdges((q) => q.like('cue', '%:prefix_fallback'));
  const total = await countEdges((q) => q);

  record(
    '8a-section_ref',
    'section_ref edges (EXPECTED ~9296, +/-5%)',
    withinTolerance(sectionRef, EXPECTED.section_ref) ? 'PASS' : 'FAIL',
    `actual=${sectionRef}`
  );
  record(
    '8a-cross_code',
    'cross_code edges (EXPECTED ~358, +/-5%)',
    withinTolerance(crossCode, EXPECTED.cross_code) ? 'PASS' : 'FAIL',
    `actual=${crossCode}`
  );
  // NOT a pass/fail gate, deliberately. The design's G0 gate #1 names exactly
  // two numbers -- 9,296 same-code and 358 cross-code (design doc "G0", item
  // 1). The 168 figure comes from design 2.8 and counts (source chunk,
  // ORIGINAL cited section) PAIRS that the ancestor fallback rescues, while
  // this column counts stored EDGES after several originals collapsing onto
  // one ancestor have been merged -- a related but not identical quantity.
  // Failing the run (exit 1, "do not treat G0 as passed") on a number the
  // design never gated, and which is not even the same measurement, would
  // block a release for the wrong reason. Reported with the band assessment
  // so nothing is hidden.
  record(
    '8a-prefix_fallback',
    'prefix_fallback edges (design 2.8 reports ~168 rescued pairs -- plausibility, not a gate)',
    'INFO',
    `actual=${prefixFallback}; within +/-5% of ${EXPECTED.prefix_fallback}: ${
      withinTolerance(prefixFallback, EXPECTED.prefix_fallback) ? 'yes' : 'NO -- re-read design 2.8 before trusting these edges'
    }`
  );
  record('8a-total', 'total xref_v1 edges (informational)', 'INFO', `actual=${total}`);
}

async function probe8b() {
  const edges = await fetchAll('sbc_xref_edges', 'tgt_doc_id, tgt_code', (q) =>
    q.eq('extractor_ver', EXTRACTOR_VER)
  );
  const uniqueTgtIds = [...new Set(edges.map((e) => e.tgt_doc_id))];

  const docMap = new Map();
  const chunkSize = 500;
  for (let i = 0; i < uniqueTgtIds.length; i += chunkSize) {
    const chunk = uniqueTgtIds.slice(i, i + chunkSize);
    const { data, error } = await supabase.from('sbc_documents').select('id, code_type').in('id', chunk);
    if (error) throw new Error(`probe8b sbc_documents lookup: ${error.message}`);
    for (const row of data ?? []) docMap.set(row.id, row.code_type);
  }

  let dangling = 0;
  let mismatched = 0;
  for (const e of edges) {
    const liveCodeType = docMap.get(e.tgt_doc_id);
    if (liveCodeType === undefined) {
      dangling++;
      continue;
    }
    if (liveCodeType !== e.tgt_code) mismatched++;
  }

  record(
    '8b-fk-target',
    'every tgt_doc_id resolves inside sbc_documents (data-level proxy: cannot point at sbc_code_tables or anything else)',
    dangling === 0 ? 'PASS' : 'FAIL',
    `dangling=${dangling} / ${edges.length} edges checked`
  );
  record(
    '8b-tgt-code-consistency',
    'stored tgt_code matches the live sbc_documents.code_type of tgt_doc_id',
    mismatched === 0 ? 'PASS' : 'FAIL',
    `mismatched=${mismatched} / ${edges.length} edges checked`
  );
  record(
    '8b-note',
    'schema-level FK constraint (authoritative check)',
    'INFO',
    'information_schema is not exposed over PostgREST -- run build-xref-graph.sql Section 8b directly in the Supabase SQL editor for the schema-level guarantee'
  );
}

async function probe8c() {
  const pattern =
    'Sections?\\s+[0-9]{2,4}(\\.[0-9]+)*\\s+of\\s+(ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)';
  const { count, error } = await supabase
    .from('sbc_xref_edges')
    .select('*', { count: 'exact', head: true })
    .eq('extractor_ver', EXTRACTOR_VER)
    .filter('evidence', 'imatch', pattern);
  if (error) throw new Error(`probe8c: ${error.message}`);
  record(
    '8c-external-leak',
    'zero edges whose evidence still shows an external-standard citation (design 2.3 zero-tolerance)',
    (count ?? 0) === 0 ? 'PASS' : 'FAIL',
    `actual=${count ?? 0}`
  );
}

async function probe8d() {
  const { data: top, error } = await supabase
    .from('sbc_xref_indegree')
    .select('doc_id, in_degree')
    .order('in_degree', { ascending: false })
    .limit(10);
  if (error) throw new Error(`probe8d: ${error.message}`);

  const docIds = (top ?? []).map((r) => r.doc_id);
  const { data: docs } = docIds.length
    ? await supabase.from('sbc_documents').select('id, code_type').in('id', docIds)
    : { data: [] };
  const { data: defs } = docIds.length
    ? await supabase.from('sbc_section_defs').select('doc_id, section').in('doc_id', docIds)
    : { data: [] };

  const docMap = new Map((docs ?? []).map((d) => [d.id, d.code_type]));
  const defMap = new Map();
  for (const d of defs ?? []) {
    const list = defMap.get(d.doc_id) ?? [];
    list.push(d.section);
    defMap.set(d.doc_id, list);
  }

  const rows = (top ?? []).map((r) => ({
    doc_id: r.doc_id,
    code_type: docMap.get(r.doc_id) ?? '(unknown)',
    sections: (defMap.get(r.doc_id) ?? ['(none defined)']).join(', '),
    in_degree: r.in_degree,
  }));
  const hasSprinkler = rows.some((r) => r.sections.includes('903.3.1.1'));

  record(
    '8d-top-indegree',
    'top-10 in-degree plausibility (design predicts 903.3.1.1 near/at the top, NOT a pass/fail gate)',
    'INFO',
    `903.3.1.1 in top 10: ${
      hasSprinkler
        ? 'yes -- matches design 2.5'
        : 'NO -- design 2.5 predicts it at the top in BOTH codes; treat the whole build as suspect regardless of what 8a says'
    } || ` +
      (rows.map((r) => `${r.code_type} ${r.sections} (in_degree=${r.in_degree})`).join('  |  ') || '(no rows)')
  );
}

function printTable() {
  const idWidth = Math.max(8, ...results.map((r) => r.id.length));
  console.log('');
  for (const r of results) {
    console.log(`[${r.status.padEnd(6)}] ${r.id.padEnd(idWidth)}  ${r.label}`);
    console.log(`  ${' '.repeat(idWidth)}  -> ${r.detail}`);
  }
}

async function main() {
  console.log('ConsultX xref-graph verify -- Section 8 G0 gate probes (read-only)');
  console.log('='.repeat(78));

  await probe8a();
  await probe8b();
  await probe8c();
  await probe8d();

  printTable();

  const hardFails = results.filter((r) => r.status === 'FAIL');
  console.log('');
  console.log('='.repeat(78));
  if (hardFails.length > 0) {
    console.log(`RESULT: FAIL -- ${hardFails.length} probe(s) failed. Do not treat G0 as passed.`);
    process.exit(1);
  } else {
    console.log('RESULT: PASS -- all automated probes this script can run passed.');
    console.log(
      'G0 is NOT complete until scripts/sample-xref-edges.mjs review reaches >=90% accuracy,'
    );
    console.log(
      'build-xref-graph.sql Section 8b has been checked directly in the SQL editor, and'
    );
    console.log('tsc / test / build / deno check are all green (design doc G0 gate items 4-5).');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
