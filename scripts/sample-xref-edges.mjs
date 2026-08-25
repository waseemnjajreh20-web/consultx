/**
 * ConsultX -- xref-graph manual review sampler
 *
 * Read-only. Draws a deterministic sample of 50 rows from sbc_xref_edges
 * (extractor_ver='xref_v1') and writes a review table to
 * reports/xref-edge-review-2026-08-25.md for the manual half of the G0 gate
 * (docs/audits/graphrag-design-20260823.md, "G0", gate item 4: >=90%
 * accuracy on a 50-edge sample checked against the printed SBC page).
 *
 * Sampling is a seeded LCG over the full sorted list of edge ids -- NOT
 * Math.random -- so the same seed against the same data always reproduces
 * the identical 50 ids.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sample-xref-edges.mjs [--seed 20260825]
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

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
const SAMPLE_SIZE = 50;
const OUT_PATH = 'reports/xref-edge-review-2026-08-25.md';
const DEFAULT_SEED = 20260825;

function parseArgs(argv) {
  let seed = DEFAULT_SEED;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') {
      seed = Number(argv[i + 1]);
      i++;
    } else if (a.startsWith('--seed=')) {
      seed = Number(a.split('=')[1]);
    }
  }
  if (!Number.isFinite(seed)) {
    console.error('Invalid --seed value; must be a number.');
    process.exit(1);
  }
  return { seed };
}

// Numerical-Recipes-style linear congruential generator. Deterministic,
// no Math.random anywhere in this file.
function makeLcg(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296; // -> [0, 1)
  };
}

// Deterministic partial Fisher-Yates shuffle over the SORTED id array, then
// re-sorted ascending for a readable report. Same seed + same input array
// always produces the same 50 ids.
function seededSampleIds(sortedIds, sampleSize, seed) {
  const rand = makeLcg(seed);
  const arr = sortedIds.slice();
  const n = Math.min(sampleSize, arr.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const picked = arr.slice(0, n);
  picked.sort((a, b) => a - b);
  return picked;
}

async function fetchAll(table, columns, applyFilters) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    all = all.concat(data ?? []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function mdEscape(s) {
  if (s == null) return '';
  return String(s).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function centeredExcerpt(content, needle, radius, maxLen) {
  if (!content) return '';
  const idx = needle ? content.indexOf(needle) : -1;
  const start = idx >= 0 ? Math.max(0, idx - radius) : 0;
  return content.slice(start, start + maxLen);
}

async function main() {
  const { seed } = parseArgs(process.argv.slice(2));

  console.log(`Fetching all sbc_xref_edges ids (extractor_ver='${EXTRACTOR_VER}')...`);
  const idRows = await fetchAll('sbc_xref_edges', 'id', (q) =>
    q.eq('extractor_ver', EXTRACTOR_VER).order('id', { ascending: true })
  );
  const sortedIds = idRows.map((r) => r.id).sort((a, b) => a - b);
  if (sortedIds.length === 0) {
    console.error('No sbc_xref_edges rows found for extractor_ver=xref_v1. Has build-xref-graph.sql run yet?');
    process.exit(1);
  }
  console.log(`Total edges: ${sortedIds.length}. Sampling ${SAMPLE_SIZE} with seed=${seed}...`);

  const sampledIds = seededSampleIds(sortedIds, SAMPLE_SIZE, seed);

  const { data: edges, error: edgesErr } = await supabase
    .from('sbc_xref_edges')
    .select('id, src_doc_id, tgt_doc_id, tgt_code, tgt_section, edge_kind, cue, occurrences, evidence')
    .in('id', sampledIds)
    .order('id', { ascending: true });
  if (edgesErr) throw new Error(`fetching sampled edges: ${edgesErr.message}`);

  const docIds = [...new Set(edges.flatMap((e) => [e.src_doc_id, e.tgt_doc_id]))];
  const { data: docs, error: docsErr } = await supabase
    .from('sbc_documents')
    .select('id, code_type, content')
    .in('id', docIds);
  if (docsErr) throw new Error(`fetching sbc_documents: ${docsErr.message}`);
  const docMap = new Map(docs.map((d) => [d.id, d]));

  const srcDocIds = [...new Set(edges.map((e) => e.src_doc_id))];
  const { data: srcDefs, error: defsErr } = await supabase
    .from('sbc_section_defs')
    .select('doc_id, section')
    .in('doc_id', srcDocIds);
  if (defsErr) throw new Error(`fetching sbc_section_defs: ${defsErr.message}`);
  const srcDefMap = new Map();
  for (const d of srcDefs ?? []) {
    const list = srcDefMap.get(d.doc_id) ?? [];
    list.push(d.section);
    srcDefMap.set(d.doc_id, list);
  }

  const rows = edges.map((e, i) => {
    const srcDoc = docMap.get(e.src_doc_id);
    const tgtDoc = docMap.get(e.tgt_doc_id);
    const srcSections = srcDefMap.get(e.src_doc_id) ?? [];
    const srcLabel = `${srcDoc?.code_type ?? '(unknown)'} ${srcSections.length ? srcSections.join(', ') : '(none defined)'}`;
    const tgtLabel = `${e.tgt_code} ${e.tgt_section}`;
    const srcExcerpt = mdEscape((srcDoc?.content ?? '').slice(0, 200));
    const tgtExcerpt = mdEscape(centeredExcerpt(tgtDoc?.content ?? '', e.tgt_section, 40, 200));
    return {
      n: i + 1,
      id: e.id,
      srcLabel,
      tgtLabel,
      cue: e.cue,
      evidence: mdEscape(e.evidence),
      srcExcerpt,
      tgtExcerpt,
      srcDocId: e.src_doc_id,
      tgtDocId: e.tgt_doc_id,
    };
  });

  const lines = [];
  lines.push('# Xref Edge Review -- G0 Manual Sample (2026-08-25)');
  lines.push('');
  lines.push(
    'Deterministic sample of 50 edges from `sbc_xref_edges` (extractor_ver=\'xref_v1\'), for the ' +
    'manual half of the G0 gate defined in docs/audits/graphrag-design-20260823.md ("G0", gate ' +
    'item 4): **at least 90% of this sample must be judged correct against the printed SBC page** ' +
    'before the graph built by scripts/build-xref-graph.sql can be treated as usable. This file does ' +
    'not judge anything itself -- a human reviewer must open the printed PDF for each `Tgt` code+section ' +
    '(Sources Viewer / source-pdfs bucket) and confirm: (1) that section genuinely exists and its content ' +
    'matches `Tgt excerpt`, and (2) the `Evidence` text really is a citation to it, taken from the `Src` chunk.'
  );
  lines.push('');
  lines.push(
    `Sampling: seed=${seed}, deterministic LCG over the full sorted list of edge ids (no Math.random -- ` +
    're-running this script with the same seed against unchanged data reproduces the identical 50 ids). ' +
    `Total edges in the table at sample time: ${sortedIds.length}.`
  );
  lines.push('');
  lines.push('Column notes:');
  lines.push('- **Src** -- source chunk\'s code_type + every section it itself defines (per `sbc_section_defs`), or `(none defined)`.');
  lines.push('- **Tgt** -- the edge\'s resolved target code + section (`tgt_code` / `tgt_section`).');
  lines.push('- **Src excerpt** -- first 200 chars of the citing chunk\'s content (general orientation).');
  lines.push('- **Tgt excerpt** -- up to 200 chars of the target chunk\'s content, centered on the target section number (what that section actually says).');
  lines.push('- **Evidence** -- the exact <=200-char excerpt the extractor stored, centered on the matched citation phrase. Check this first -- it is what actually produced the edge.');
  lines.push('');
  lines.push('| # | Edge ID | Src (code + section) | Tgt (code + section) | Cue | Evidence | Src excerpt | Tgt excerpt | Correct? | Notes |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.n} | ${r.id} | ${r.srcLabel} | ${r.tgtLabel} | ${r.cue} | ${r.evidence} | ${r.srcExcerpt} | ${r.tgtExcerpt} | [ ] correct<br>[ ] wrong | |`
    );
  }
  lines.push('');
  lines.push('## Scoring');
  lines.push('');
  lines.push(
    'Fill in every row above, then count. **G0 manual gate passes only if at least 45 of the 50 rows ' +
    '(90%) are checked "correct".** Record the final tally here once done:'
  );
  lines.push('');
  lines.push('- Correct: ____ / 50');
  lines.push('- Accuracy: ____%');
  lines.push('- G0 manual gate: PASS / FAIL (circle one)');
  lines.push('- Reviewer: ____________________');
  lines.push('- Date: ____________________');
  lines.push('');

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, lines.join('\n'));
  console.log(`Wrote ${OUT_PATH} (${rows.length} sampled edges).`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
