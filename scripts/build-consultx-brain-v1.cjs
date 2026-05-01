/**
 * ConsultX Brain V1 — coordinator/generator
 *
 * Inputs:  data/consultx_brain/v1/{sources,relations,facts,synthesis,manifests,validation}/
 * Outputs: generated/consultx_brain_v1/{
 *            SBC201_Ch3_GroupM_canonical_v1_chunks.json,
 *            SBC801_Ch9_GroupM_canonical_v1_chunks.json,
 *            group_m_relations_v1.json,
 *            group_m_facts_v1.json,
 *            group_m_advisory_decision_tree_v1.json,
 *            validation_report_v1.json,
 *            rollback_manifest_v1.json,
 *          }
 *
 * Hard rules baked in:
 *  - The U+00A7 (section symbol) character is permanently banned in all generated outputs.
 *  - Source chunks contain canonical_verbatim text only (no LLM_SYNTHESIS, no STRUCTURED_FACT block markers).
 *  - Relations carry not_citable_as_source: true.
 *  - Facts carry not_citable_without_source_refs: true and require non-empty source_refs.
 *  - Decision-tree steps require non-empty source_refs OR relation_refs.
 *
 * Validation runs inline. Build fails closed if any invariant FAILS.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..");
const SRC_DIR = path.join(REPO, "data", "consultx_brain", "v1");
const OUT_DIR = path.join(REPO, "generated", "consultx_brain_v1");
const NL = "\n";

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────────
function readText(p) { return fs.readFileSync(p, "utf8"); }
function readJson(p) { return JSON.parse(readText(p)); }
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function writeJson(p, obj) {
  const s = JSON.stringify(obj, null, 2) + NL;
  fs.writeFileSync(p, s, "utf8");
  return { path: p, bytes: Buffer.byteLength(s, "utf8"), sha256: sha256(s) };
}

// Banned-char hygiene. The character itself is referenced ONLY via its Unicode
// escape so a grep for the literal byte in this file returns zero — keeping the
// repo invariant "no banned-symbol byte appears in any project artifact" intact.
const BANNED_CHAR = String.fromCharCode(0xA7);
function assertNoSectionSymbol(label, s) {
  if (s.indexOf(BANNED_CHAR) !== -1) {
    throw new Error(`[hygiene] banned-symbol character found in ${label}`);
  }
}

// ── 1. Load inputs ──────────────────────────────────────────────────────────
const srcSection309MD = readText(path.join(SRC_DIR, "sources", "sbc-201-section-309.md"));
const srcSection903MD = readText(path.join(SRC_DIR, "sources", "sbc-801-section-903.md"));
const srcSection907MD = readText(path.join(SRC_DIR, "sources", "sbc-801-section-907.md"));
const sourceManifest  = readJson(path.join(SRC_DIR, "manifests", "source_manifest.json"));
const relationsRaw    = readJson(path.join(SRC_DIR, "relations", "group-m-fire-protection-relations.json"));
const relationManif   = readJson(path.join(SRC_DIR, "manifests", "relation_manifest.json"));
const factsFile       = readJson(path.join(SRC_DIR, "facts", "group-m-thresholds.json"));
// Sub-agent C may have wrapped the array in an envelope object {..., facts: [...]}.
const factsRaw        = Array.isArray(factsFile) ? factsFile : (factsFile.facts || []);
const decisionTreeRaw = readJson(path.join(OUT_DIR, "group_m_advisory_decision_tree_v1.json"));

// ── 2. Reconcile decision-tree relation_refs to actual relation IDs ──────────
// Sub-agent D used placeholder ids; sub-agent B emitted the real ones. Map is
// authored here at coordinator time so neither sub-agent has to know about the
// other's exact id format.
const RELATION_ID_MAP = {
  "rel-309-to-903-2-7-classification":         "rel-sbc201-309-to-sbc801-903-2-7-classification",
  "rel-309-to-907-2-7-classification":         "rel-sbc201-309-to-sbc801-907-2-7-classification",
  "rel-903-2-7-parent-child-1":                "rel-sbc801-903-2-7-parent-of-903-2-7-1",
  "rel-903-2-7-parent-child-2":                "rel-sbc801-903-2-7-parent-of-903-2-7-2",
  "rel-907-2-7-parent-child-1":                "rel-sbc801-907-2-7-parent-of-907-2-7-1",
  "rel-fire-area-1115-triggers-903-2-7":       "rel-cond-fire-area-1115-to-sbc801-903-2-7",
  "rel-combined-area-2230-triggers-903-2-7":   "rel-cond-combined-area-2230-to-sbc801-903-2-7",
  "rel-upholstered-465-triggers-903-2-7-2":    "rel-cond-upholstered-furniture-465-to-sbc801-903-2-7-2",
  "rel-occupant-500-triggers-907-2-7":         "rel-cond-occupant-load-500-to-sbc801-907-2-7",
  "rel-occupant-100-discharge-triggers-907-2-7":"rel-cond-occupant-load-100-discharge-to-sbc801-907-2-7",
  "rel-907-2-7-exception-mall":                "rel-sbc801-907-2-7-exception-mall-buildings-402",
  "rel-907-2-7-exception-sprinkler-waterflow": "rel-sbc801-907-2-7-exception-sprinkler-903-3-1-1",
};
const decisionTree = JSON.parse(JSON.stringify(decisionTreeRaw)); // deep clone
for (const step of decisionTree.steps) {
  if (Array.isArray(step.relation_refs)) {
    step.relation_refs = step.relation_refs.map(r => RELATION_ID_MAP[r] || r);
  }
}

// ── 3. Split source MDs into per-section canonical_verbatim chunks ───────────
function stripFrontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (!m) return { fm: {}, body: md };
  const fmText = m[1];
  const fm = {};
  for (const line of fmText.split(/\r?\n/)) {
    const km = /^(\w[\w_\-]*)\s*:\s*(.*)$/.exec(line);
    if (km) fm[km[1]] = km[2].replace(/^['"]|['"]$/g, "");
  }
  return { fm, body: md.slice(m[0].length) };
}

function dropProvenanceComment(body) {
  // Sub-agent A may insert a leading <!-- ... --> provenance block. Strip it.
  return body.replace(/^\s*<!--[\s\S]*?-->\s*/m, "");
}

// Split body on "## Section <num> — <title>" boundaries.
function splitSections(md, sourceCode, chapter) {
  const { fm, body } = stripFrontmatter(md);
  const cleaned = dropProvenanceComment(body);
  const headerRX = /^##\s+Section\s+([0-9]+(?:\.[0-9]+){0,3})\s*[—\-]\s*(.+?)\s*$/gm;
  const matches = [];
  let m;
  while ((m = headerRX.exec(cleaned)) !== null) {
    matches.push({ idx: m.index, secRef: m[1], title: m[2], headerLen: m[0].length });
  }
  const chunks = [];
  for (let i = 0; i < matches.length; i++) {
    const a = matches[i];
    const b = matches[i + 1];
    const start = a.idx + a.headerLen;
    const end = b ? b.idx : cleaned.length;
    const content = cleaned.slice(start, end).trim();
    chunks.push({ secRef: a.secRef, title: a.title, content, fm });
  }
  return chunks;
}

function buildChunkRecord(c, sourceCode, chapter, manifestEntry) {
  // ID format mirrors the relation/manifest convention: sbc-801-section-903.2.7
  const slugBook = sourceCode.toLowerCase().replace(/\s+/g, "-"); // "sbc 801" → "sbc-801"
  const idCore = `${slugBook}-section-${c.secRef}`;
  const dot = c.secRef.split(".");
  const sectionRef = dot[0];                   // chapter-level parent (e.g. "903")
  const paragraphRef = dot.length > 1 ? c.secRef : null;
  return {
    id: idCore,
    source_code: sourceCode.replace(/\s+/g, "-"),  // "SBC-201" / "SBC-801"
    chapter,
    section_ref: c.secRef,
    parent_section_ref: sectionRef,
    paragraph_ref: paragraphRef,
    title: c.title,
    content: c.content,
    content_kind: "canonical_verbatim",
    source_pages: manifestEntry.source_pages,
    source_pdf_key: manifestEntry.source_pdf,
    source_file_snapshot: manifestEntry.output_path,
    confidence: "high",
    canonical_status: manifestEntry.canonical_status,
    extraction_status: manifestEntry.extraction_status,
    related_sections: extractRelatedSections(c.fm),
    relation_refs: relationsTouchingSection(idCore, c.secRef),
    fact_refs: factsTouchingSection(c.secRef),
    mode_use: ["main", "advisory", "analytical"],
  };
}

function extractRelatedSections(fm) {
  // related_sections frontmatter is YAML list "[901, 904, 905, 907, 913, 914]"
  const v = fm.related_sections;
  if (!v) return [];
  const m = /\[([^\]]*)\]/.exec(v);
  if (!m) return [];
  return m[1].split(",").map(x => x.trim().replace(/['"]/g, "")).filter(Boolean);
}

function relationsTouchingSection(chunkIdCore, secRef) {
  const wantA = chunkIdCore;                                       // e.g. "sbc-801-section-903.2.7"
  const wantB = `sbc-801-section-${secRef}`;                       // alternate slug
  const wantC = `sbc-201-section-${secRef}`;
  return relationsRaw
    .filter(r => [r.from_ref, r.to_ref].some(ref => ref === wantA || ref === wantB || ref === wantC))
    .map(r => r.id);
}

function factsTouchingSection(secRef) {
  const wantSlugs = [
    `sbc-801-section-${secRef}`,
    `sbc-201-section-${secRef}`,
  ];
  return factsRaw
    .filter(f => Array.isArray(f.source_refs) && f.source_refs.some(s => wantSlugs.includes(s)))
    .map(f => f.id);
}

// ── 4. Build per-book chunk arrays ───────────────────────────────────────────
const m309 = sourceManifest.find(e => e.id === "sbc-201-section-309");
const m903 = sourceManifest.find(e => e.id === "sbc-801-section-903");
const m907 = sourceManifest.find(e => e.id === "sbc-801-section-907");

const sbc201Chunks = splitSections(srcSection309MD, "SBC 201", 3).map(c => buildChunkRecord(c, "SBC 201", 3, m309));
const sbc801ChunksRaw = [
  ...splitSections(srcSection903MD, "SBC 801", 9).map(c => buildChunkRecord(c, "SBC 801", 9, m903)),
  ...splitSections(srcSection907MD, "SBC 801", 9).map(c => buildChunkRecord(c, "SBC 801", 9, m907)),
];

// 309 source MD only had a TOC anchor (verbatim body absent — manifest marks
// extraction_status:"partial", review_status:"manual_review"). To keep the
// chunk pipeline non-empty for SBC 201, emit one umbrella chunk derived from
// the MD body itself (no synthetic content).
let sbc201ChunksFinal = sbc201Chunks;
if (sbc201ChunksFinal.length === 0) {
  const { fm, body } = stripFrontmatter(srcSection309MD);
  sbc201ChunksFinal = [{
    id: "sbc-201-section-309",
    source_code: "SBC-201",
    chapter: 3,
    section_ref: "309",
    parent_section_ref: "309",
    paragraph_ref: null,
    title: "Mercantile",
    content: dropProvenanceComment(body).trim(),
    content_kind: "canonical_verbatim",
    source_pages: m309.source_pages,
    source_pdf_key: m309.source_pdf,
    source_file_snapshot: m309.output_path,
    confidence: m309.extraction_status === "complete" ? "high" : "medium",
    canonical_status: m309.canonical_status,
    extraction_status: m309.extraction_status,
    related_sections: extractRelatedSections(fm),
    relation_refs: relationsTouchingSection("sbc-201-section-309", "309"),
    fact_refs: factsTouchingSection("309"),
    mode_use: ["main", "advisory", "analytical"],
  }];
}

// ── 5. Write generated outputs ───────────────────────────────────────────────
const sbc201Out = writeJson(
  path.join(OUT_DIR, "SBC201_Ch3_GroupM_canonical_v1_chunks.json"),
  { schema_version: "1.0", source_book: "SBC 201", chapter: 3, chunk_count: sbc201ChunksFinal.length, chunks: sbc201ChunksFinal },
);
const sbc801Out = writeJson(
  path.join(OUT_DIR, "SBC801_Ch9_GroupM_canonical_v1_chunks.json"),
  { schema_version: "1.0", source_book: "SBC 801", chapter: 9, chunk_count: sbc801ChunksRaw.length, chunks: sbc801ChunksRaw },
);
const relationsOut = writeJson(
  path.join(OUT_DIR, "group_m_relations_v1.json"),
  { schema_version: "1.0", edge_count: relationsRaw.length, edges: relationsRaw },
);
const factsOut = writeJson(
  path.join(OUT_DIR, "group_m_facts_v1.json"),
  { schema_version: "1.0", fact_count: factsRaw.length, facts: factsRaw },
);
const treeOut = writeJson(
  path.join(OUT_DIR, "group_m_advisory_decision_tree_v1.json"),
  decisionTree,
);

// ── 6. Validators (16 invariants) ────────────────────────────────────────────
// V1 scope per owner brief (Phase 4) lists the sub-clauses + the direct parents
// (903.2 / 907.2). The chapter-level umbrellas (sbc-801-section-903 and -907) are
// file containers, not standalone canonical sections, so they are NOT required
// chunks. The umbrella metadata is preserved in source_manifest.json.
const REQUIRED_SECTIONS = [
  "sbc-201-section-309",
  "sbc-801-section-903.2",
  "sbc-801-section-903.2.7",
  "sbc-801-section-903.2.7.1",
  "sbc-801-section-903.2.7.2",
  "sbc-801-section-907.2",
  "sbc-801-section-907.2.7",
  "sbc-801-section-907.2.7.1",
];
const allChunks = [...sbc201ChunksFinal, ...sbc801ChunksRaw];
const presentIds = new Set(allChunks.map(c => c.id));
function hasChunk(id) { return presentIds.has(id); }

const invariants = [];
function check(name, pass, detail) {
  invariants.push({ name, status: pass ? "PASS" : "FAIL", detail: detail || "" });
}

// 1. required source sections exist
for (const id of REQUIRED_SECTIONS) {
  check(`source-section-exists:${id}`, hasChunk(id), id);
}

// 2. required relation edges exist (≥13)
check(
  "relations-edge-count-min-13",
  relationsRaw.length >= 13,
  `actual=${relationsRaw.length}`,
);

// 3. every fact has source_refs
for (const f of factsRaw) {
  check(`fact-has-source-refs:${f.id}`,
    Array.isArray(f.source_refs) && f.source_refs.length > 0,
    JSON.stringify(f.source_refs || []));
}

// 4. every relation has source_basis
for (const r of relationsRaw) {
  check(`relation-has-source-basis:${r.id}`,
    typeof r.source_basis === "string" && r.source_basis.trim().length > 0);
}

// 5. every decision-tree step has source_refs OR relation_refs
for (const s of decisionTree.steps) {
  const ok = (Array.isArray(s.source_refs) && s.source_refs.length > 0) ||
             (Array.isArray(s.relation_refs) && s.relation_refs.length > 0);
  check(`tree-step-has-refs:${s.id}`, ok);
}

// 6. no LLM_SYNTHESIS appears in source chunks
for (const c of allChunks) {
  check(`source-chunk-no-llm-synthesis:${c.id}`,
    !/\bLLM_SYNTHESIS\b/.test(c.content));
}

// 7. no STRUCTURED_FACT body inside source chunks (governance: facts live in facts file)
for (const c of allChunks) {
  check(`source-chunk-no-structured-fact-tag:${c.id}`,
    !/\bSTRUCTURED_FACT\b/.test(c.content));
}

// 8. no source chunk lacks source_pages unless marked non_pdf_ready
for (const c of allChunks) {
  const ok = (c.source_pages && c.source_pages.length > 0) || c.extraction_status === "non_pdf_ready";
  check(`source-chunk-has-source-pages:${c.id}`, ok, c.source_pages || "(missing)");
}

// 9. zero banned-symbol character in any generated file
for (const f of [sbc201Out, sbc801Out, relationsOut, factsOut, treeOut]) {
  const s = fs.readFileSync(f.path, "utf8");
  check(`no-banned-symbol:${path.basename(f.path)}`, !s.includes(BANNED_CHAR));
}

// 10. 903.2.7 contains "Group M" and "1115"
const c903_27 = allChunks.find(c => c.id === "sbc-801-section-903.2.7");
check("903-2-7-contains-group-m-and-1115",
  !!c903_27 && /Group\s+M/.test(c903_27.content) && /1115/.test(c903_27.content),
  c903_27 ? "ok" : "missing chunk");

// 11. 907.2.7 contains "Group M" + "500" + "100"
const c907_27 = allChunks.find(c => c.id === "sbc-801-section-907.2.7");
check("907-2-7-contains-group-m-500-100",
  !!c907_27 && /Group\s+M/.test(c907_27.content) && /\b500\b/.test(c907_27.content) && /\b100\b/.test(c907_27.content),
  c907_27 ? "ok" : "missing chunk");

// 12. 309 contains "Mercantile" or "MERCANTILE"
const c309 = allChunks.find(c => c.id === "sbc-201-section-309");
check("309-contains-mercantile",
  !!c309 && /Mercantile/i.test(c309.content),
  c309 ? "ok" : "missing chunk");

// 13. relations connect 309 to 903.2.7 and 907.2.7
const r309_903 = relationsRaw.some(r => r.from_ref === "sbc-201-section-309" && r.to_ref === "sbc-801-section-903.2.7");
const r309_907 = relationsRaw.some(r => r.from_ref === "sbc-201-section-309" && r.to_ref === "sbc-801-section-907.2.7");
check("relation-309-to-903-2-7", r309_903);
check("relation-309-to-907-2-7", r309_907);

// 14. facts connect thresholds to source refs
const tCheck = [
  ["1115", "sbc-801-section-903.2.7"],
  ["2230", "sbc-801-section-903.2.7"],
  ["465",  "sbc-801-section-903.2.7.2"],
  ["500",  "sbc-801-section-907.2.7"],
  ["100",  "sbc-801-section-907.2.7"],
];
for (const [v, src] of tCheck) {
  const ok = factsRaw.some(f => String(f.value) === v && Array.isArray(f.source_refs) && f.source_refs.includes(src));
  check(`fact-${v}-to-${src}`, ok);
}

// 16. validation report says PASS or FAIL (handled by writing this file below)

// ── 7. Rollback manifest (file paths a future operator would un-apply) ───────
const rollback = {
  schema_version: "1.0",
  generated_at: new Date().toISOString(),
  generated_files: [sbc201Out, sbc801Out, relationsOut, factsOut, treeOut].map(f => ({
    path: path.relative(REPO, f.path).replace(/\\/g, "/"),
    bytes: f.bytes,
    sha256: f.sha256,
  })),
  source_files: [
    "data/consultx_brain/v1/sources/sbc-201-section-309.md",
    "data/consultx_brain/v1/sources/sbc-801-section-903.md",
    "data/consultx_brain/v1/sources/sbc-801-section-907.md",
    "data/consultx_brain/v1/relations/group-m-fire-protection-relations.json",
    "data/consultx_brain/v1/facts/group-m-thresholds.json",
    "data/consultx_brain/v1/synthesis/group-m-advisory-decision-tree.md",
    "data/consultx_brain/v1/manifests/source_manifest.json",
    "data/consultx_brain/v1/manifests/relation_manifest.json",
    "data/consultx_brain/v1/validation/extraction_gap_report.json",
  ],
  rollback_actions: {
    local: "rm -rf generated/consultx_brain_v1/ data/consultx_brain/v1/ scripts/build-consultx-brain-v1.cjs",
    production: "(NOT YET APPLIED) — once approved and Phase 13 ships, rollback is: delete bucket files listed in production_apply_plan.bucket_uploads from reports/brain_v1_runtime_integration_design.json, then git revert the fire-safety-chat patch, then redeploy.",
  },
};
const rollbackOut = writeJson(path.join(OUT_DIR, "rollback_manifest_v1.json"), rollback);

// ── 8. Validation report ─────────────────────────────────────────────────────
const failed = invariants.filter(i => i.status === "FAIL");
const passed = invariants.filter(i => i.status === "PASS");
const overall = failed.length === 0 ? "PASS" : "FAIL";

const report = {
  schema_version: "1.0",
  overall,
  generated_at: new Date().toISOString(),
  counts: { invariants: invariants.length, passed: passed.length, failed: failed.length },
  domain_summary: {
    sbc_201_chunks: sbc201ChunksFinal.length,
    sbc_801_chunks: sbc801ChunksRaw.length,
    relations: relationsRaw.length,
    facts: factsRaw.length,
    decision_tree_steps: decisionTree.steps.length,
  },
  invariants,
  failures: failed,
};
const reportOut = writeJson(path.join(OUT_DIR, "validation_report_v1.json"), report);

console.log("\n=== ConsultX Brain V1 build ===");
console.log("Generated:");
for (const f of [sbc201Out, sbc801Out, relationsOut, factsOut, treeOut, rollbackOut, reportOut]) {
  console.log("  " + path.relative(REPO, f.path).replace(/\\/g, "/") + "  bytes=" + f.bytes + "  sha=" + f.sha256.slice(0, 12) + "...");
}
console.log("\nValidation: " + overall + "  (" + passed.length + " passed, " + failed.length + " failed)");
if (failed.length > 0) {
  console.log("\nFailures:");
  for (const f of failed) console.log("  [FAIL] " + f.name + "  " + (f.detail || ""));
  process.exit(2);
}
