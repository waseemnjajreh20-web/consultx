// retrieval_gate.mjs — model-free retrieval gate: which retrieval configuration
// puts the EXPECTED SBC sections in front of the model most often?
//
// Why this exists: the model-in-the-loop benchmark cannot answer that. Measured
// 2026-09-03, the same question ranged 3.5s to 50s and two rows hit the 120s
// watchdog, so its section-recall numbers move by more than the effect size it
// is supposed to detect. Here every arm sees the SAME embedding of the SAME
// text, and the score is a deterministic set-membership test over the chunks
// each arm returns. One pass takes about a minute for all 43 questions.
//
// Query text: the Arabic question PLUS its English twin from the benchmark row.
// That mirrors the runtime, which embeds `embeddingSourceText` (the question
// plus English search terms plus derived section numbers) and now hands that
// same text to the lexical leg — necessary because the corpus is English
// (measured: "مرشات" matches 0 of 5,553 rows through tsv, "travel distance"
// matches 290). Both arms get the identical text and vector, so the comparison
// stays fair regardless.
//
// Usage (GEMINI_DIAG_TOKEN or PROBE_TASK_TOKEN must be in the environment as
// PROBE_TASK_TOKEN):
//   node retrieval_gate.mjs [--limit=N]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = "D:\\ConsultX_Clean";
const URL_ = "https://hrnltxmwoaphgejckutk.supabase.co";
const MATCH_COUNT = 25;

function readUserEnv(name) {
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], { encoding: "utf8" });
    const line = out.split(/\r?\n/).find((l) => l.trim().startsWith(name));
    const m = line && line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/);
    return m ? m[1] : null;
  } catch { return null; }
}

const serviceKey = readUserEnv("CONSULTX_SERVICE_KEY");
const probeToken = process.env.PROBE_TASK_TOKEN;
if (!serviceKey) { console.error("CONSULTX_SERVICE_KEY missing"); process.exit(2); }
if (!probeToken) { console.error("PROBE_TASK_TOKEN missing from the environment"); process.exit(2); }

const argLimit = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1]) || 0;

const rows = readFileSync(path.join(REPO_ROOT, "evals", "advisory_benchmark.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => Array.isArray(r.expected_section_refs) && r.expected_section_refs.length > 0);
const selected = argLimit > 0 ? rows.slice(0, argLimit) : rows;

async function embed(text) {
  const resp = await fetch(`${URL_}/functions/v1/gemini-diag`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-probe-token": probeToken },
    body: JSON.stringify({ action: "embed", text }),
  });
  if (!resp.ok) throw new Error(`embed HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const j = await resp.json();
  if (!Array.isArray(j.embedding)) throw new Error("embed returned no vector");
  return j.embedding;
}

async function rpc(fn, args) {
  const resp = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(args),
  });
  if (!resp.ok) throw new Error(`${fn} HTTP ${resp.status}: ${(await resp.text()).slice(0, 220)}`);
  return await resp.json();
}

/**
 * Byte-for-byte the rule in supabase/functions/fire-safety-chat/
 * retrievalPolicy.ts applySimilarityFloor(): cut = max(absFloor,
 * relFloor * best similarity in THIS result set); a row with no usable
 * similarity is kept.
 */
const REL_FLOOR = 0.85, ABS_FLOOR = 0.70;
function applyProductionFloor(chunks) {
  let top = null;
  for (const c of chunks) {
    const s = c?.similarity;
    if (typeof s === "number" && Number.isFinite(s)) top = top === null ? s : Math.max(top, s);
  }
  if (top === null) return chunks;
  const cut = Math.max(ABS_FLOOR, REL_FLOOR * top);
  return chunks.filter((c) => {
    const s = c?.similarity;
    if (typeof s !== "number" || !Number.isFinite(s)) return true;
    return s >= cut;
  });
}

/** Retrieved = a chunk is labelled with the section, or quotes it as a standalone number. */
function sectionsFound(chunks, refs) {
  const found = new Set();
  for (const ref of refs) {
    const rx = new RegExp(`(?<![\\d.])${ref.replace(/\./g, "\\.")}(?![\\d.])`);
    for (const c of chunks) {
      if ((c.section_number ?? "") === ref || rx.test(String(c.content ?? ""))) { found.add(ref); break; }
    }
  }
  return found;
}

// The arms. "vector" is today's production path; every hybrid arm differs from
// it in exactly the knobs named.
const ARMS = [
  { key: "vector", label: "vector RPC, unfiltered", vector: true },
  // What production ACTUALLY sends to the model: the same 25 rows with
  // retrievalPolicy.ts's similarity floor applied in TypeScript
  // (cut = max(0.70, 0.85 * top similarity of this result set)). Kept as its
  // own arm because the floor's recall COST had never been measured - it was
  // calibrated in 2026-08 against the unrelated-pair noise distribution, on
  // the reasonable-but-untested assumption that what it drops is noise.
  { key: "vector_floor", label: "vector + production similarity floor", vector: true, tsFloor: true },
  { key: "tuned", label: "hybrid fts0.5 quota15 floor", fts_weight: 0.5, vector_quota: 15, floors: true },
  { key: "tuned_nofloor", label: "hybrid fts0.5 quota15 no-floor", fts_weight: 0.5, vector_quota: 15, floors: false },
  { key: "untuned", label: "hybrid fts1.0 quota0 no-floor (as first shipped)", fts_weight: 1.0, vector_quota: 0, floors: false },
];

const totals = Object.fromEntries(ARMS.map((a) => [a.key, { found: 0, total: 0, full: 0, rows: 0, ftsRows: 0 }]));
const perRow = [];

for (const row of selected) {
  const ar = row.question_ar ?? "";
  const en = row.question_en ?? "";
  const text = [ar, en].filter(Boolean).join(" ");
  let embedding;
  try {
    embedding = await embed(text);
  } catch (e) {
    console.log(`${row.id}: embed failed — ${e.message}`);
    continue;
  }

  const refs = row.expected_section_refs;
  const result = { id: row.id, refs, arms: {} };

  for (const arm of ARMS) {
    let chunks = [];
    try {
      chunks = arm.vector
        ? await rpc("match_sbc_documents", { query_embedding: embedding, match_count: MATCH_COUNT, filter_code: null })
        : await rpc("match_sbc_hybrid", {
            query_text: text,
            query_embedding: embedding,
            match_count: MATCH_COUNT,
            filter_codes: null,
            rrf_k: 60,
            candidate_pool: 40,
            fts_weight: arm.fts_weight,
            vector_quota: arm.vector_quota,
            min_similarity_rel: arm.floors ? 0.85 : null,
            min_similarity_abs: arm.floors ? 0.70 : null,
          });
    } catch (e) {
      console.log(`${row.id} [${arm.key}]: ${e.message}`);
    }
    if (arm.tsFloor) chunks = applyProductionFloor(chunks);
    const found = sectionsFound(chunks, refs);
    const t = totals[arm.key];
    t.found += found.size; t.total += refs.length; t.rows += chunks.length;
    t.ftsRows += chunks.filter((c) => c.fts_rank !== null && c.fts_rank !== undefined).length;
    if (found.size === refs.length) t.full++;
    result.arms[arm.key] = { found: found.size, of: refs.length, rows: chunks.length };
  }

  perRow.push(result);
  console.log(
    `${row.id.padEnd(8)} | ` +
    ARMS.map((a) => `${a.key} ${result.arms[a.key].found}/${refs.length}`).join(" | ") +
    ` | rows ${ARMS.map((a) => result.arms[a.key].rows).join("/")}`,
  );
}

const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);
console.log(`\n${selected.length} questions, ${totals.vector.total} expected sections, match_count ${MATCH_COUNT}\n`);
for (const arm of ARMS) {
  const t = totals[arm.key];
  const wins = perRow.filter((r) => r.arms[arm.key].found > r.arms.vector.found).length;
  const losses = perRow.filter((r) => r.arms[arm.key].found < r.arms.vector.found).length;
  console.log(
    `${arm.label.padEnd(46)} recall ${String(t.found).padStart(3)}/${t.total} (${String(pct(t.found, t.total)).padStart(5)}%) | ` +
    `all-sections ${String(t.full).padStart(2)}/${perRow.length} | avg rows ${(t.rows / Math.max(1, perRow.length)).toFixed(1)} | ` +
    `fts-supported ${t.ftsRows} | vs vector: +${wins}/-${losses}`,
  );
}

const out = path.join(REPO_ROOT, "evals", "results", "retrieval-gate-latest.json");
writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), match_count: MATCH_COUNT, totals, perRow }, null, 2));
console.log(`\ndetail written to ${out}`);
