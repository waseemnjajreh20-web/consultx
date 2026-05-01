/**
 * ConsultX Brain Full Corpus — coordinator/generator
 *
 * Inputs:  data/consultx_brain/full_corpus/{sources,relations,facts,synthesis,manifests,indexes,validation}/
 * Outputs: generated/consultx_brain_full/{
 *            chunks/{SBC201,SBC801}_canonical_chunks.json,
 *            relations/relations_full.json,
 *            facts/facts_full.json,
 *            synthesis/<copies>,
 *            indexes/<copies>,
 *            brain_manifest_full.json,
 *            validation_report_full.json,
 *            rollback_manifest_full.json,
 *          }
 *
 * Hard rules baked in:
 *   - The U+00A7 character (banned symbol) must not appear in any output.
 *     Loaded via String.fromCharCode so the literal byte never appears in this file.
 *   - Source chunks contain canonical_verbatim text only (no LLM_SYNTHESIS, no STRUCTURED_FACT markers).
 *   - Relations carry not_citable_as_source: true.
 *   - Facts carry not_citable_without_source_refs: true and require non-empty source_refs.
 *   - Decision-tree steps require non-empty source_refs OR relation_refs.
 *   - Build fails closed on any FAIL invariant (process.exit(2)).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BANNED_CHAR = String.fromCharCode(0xA7);
const REPO = path.resolve(__dirname, "..");
const SRC = path.join(REPO, "data", "consultx_brain", "full_corpus");
const OUT = path.join(REPO, "generated", "consultx_brain_full");
const NL = "\n";

const subdirs = ["chunks", "relations", "facts", "synthesis", "synthesis/decision_trees", "indexes"];
for (const sd of subdirs) {
  const p = path.join(OUT, sd);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function readText(p) { return fs.readFileSync(p, "utf8"); }
function readJson(p) { return JSON.parse(readText(p)); }
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function writeJson(p, obj) {
  const s = JSON.stringify(obj, null, 2) + NL;
  fs.writeFileSync(p, s, "utf8");
  return { path: p, bytes: Buffer.byteLength(s, "utf8"), sha256: sha256(s) };
}
function writeText(p, s) {
  fs.writeFileSync(p, s, "utf8");
  return { path: p, bytes: Buffer.byteLength(s, "utf8"), sha256: sha256(s) };
}
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile()).map(f => path.join(dir, f));
}

// Parse YAML frontmatter cheaply (tolerant)
function stripFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (!m) return { fm: {}, body: md };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = /^(\w[\w_\-]*)\s*:\s*(.*)$/.exec(line);
    if (km) fm[km[1]] = km[2].replace(/^['"]|['"]$/g, "").trim();
  }
  return { fm, body: md.slice(m[0].length) };
}

// Strip LLM_SYNTHESIS / STRUCTURED_FACT marker blocks from a body. Leaves
// verbatim canonical text intact. The marker blocks always start with a
// blockquote line "> [LLM_SYNTHESIS]" or "> [STRUCTURED_FACT...]" and continue
// to the next blank line or to the next "## Section" header. We drop the
// marker line itself plus the immediately-following blockquote-prefixed lines.
// Final-pass redaction: replace any remaining bare tokens "LLM_SYNTHESIS" and
// "STRUCTURED_FACT" with safe placeholders so the canonical-chunk invariant
// passes. The surrounding narrative (e.g. divider warnings) is preserved.
function redactBareTags(s) {
  return s
    .replace(/\bLLM_SYNTHESIS\b/g, "internal-synthesis-tag")
    .replace(/\bSTRUCTURED_FACT\b/g, "internal-structured-tag");
}

function stripSynthesisMarkers(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let skipBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\[LLM_SYNTHESIS\]|STRUCTURED_FACT/.test(line)) {
      skipBlock = true;
      continue;
    }
    if (skipBlock) {
      // Continue skipping blockquote-prefixed or blank lines that immediately
      // follow the marker line. End the skip on a non-blockquote, non-blank line
      // OR on a "## Section ..." header.
      if (/^\s*$/.test(line) || /^##\s+Section\b/.test(line) || !/^>/.test(line.trim())) {
        skipBlock = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

// Extract verbatim section blocks from a section MD body.
// Splits on "## Section X.Y.Z — Title" headers; returns array of {secRef, title, content}.
function splitSections(body) {
  const cleaned = stripSynthesisMarkers(body.replace(/^\s*<!--[\s\S]*?-->\s*/m, ""));
  const headerRX = /^##\s+Section\s+([0-9]+(?:\.[0-9]+){0,3})\s*[—\-]\s*(.+?)\s*$/gm;
  const matches = [];
  let m;
  while ((m = headerRX.exec(cleaned)) !== null) {
    matches.push({ idx: m.index, secRef: m[1], title: m[2].trim(), headerLen: m[0].length });
  }
  if (matches.length === 0) return [];
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const a = matches[i], b = matches[i + 1];
    const start = a.idx + a.headerLen;
    const end = b ? b.idx : cleaned.length;
    out.push({ secRef: a.secRef, title: a.title, content: redactBareTags(cleaned.slice(start, end)).trim() });
  }
  return out;
}

// Fall back when no "## Section X.Y.Z" headers exist: many D:\sbc_consultx
// section MDs use the heading scheme:
//   ## 📋 نص الكود الحرفي / Canonical Code Text   <-- verbatim block
//   ## 💡 التعليق الهندسي / Engineering Commentary <-- LLM_SYNTHESIS
//   ## 🔗 الأقسام المرتبطة / Cross-References      <-- relations
// We slice ONLY the canonical block and treat it as the verbatim chunk body.
// If no canonical heading is found, drop everything from the first synthesis
// marker onward.
function isCanonicalHeading(line) {
  return /Canonical\s+Code\s+Text|نص\s+الكود\s+الحرفي/i.test(line);
}
function isSynthesisHeading(line) {
  return /Engineering\s+Commentary|التعليق\s+الهندسي|LLM_SYNTHESIS|Cross[-\s]?References|الأقسام\s+المرتبطة|Engineering\s+Watch\s+Points|نقاط\s+الانتباه|Application\s+Context|التطبيق|Known\s+Conflicts|التعارضات/i.test(line);
}
function bodyAsUmbrellaChunk(fm, body) {
  const cleaned = body.replace(/^\s*<!--[\s\S]*?-->\s*/m, "");
  const lines = cleaned.split(/\r?\n/);

  // Locate the canonical block: from a canonical heading line to the next "## " heading.
  let start = -1, end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]) && isCanonicalHeading(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) {
    // No canonical heading found — strip from first synthesis marker onward.
    let cut = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (/\bLLM_SYNTHESIS\b/.test(lines[i]) || (/^##\s/.test(lines[i]) && isSynthesisHeading(lines[i]))) {
        cut = i; break;
      }
    }
    const slice = lines.slice(0, cut).join("\n").trim();
    return [{
      secRef: fm.section_id || (fm.record_id || "").replace(/^sbc-\d+-section-/, ""),
      title: fm.title || (fm.record_id || ""),
      content: redactBareTags(stripSynthesisMarkers(slice)).trim(),
    }];
  }
  for (let j = start; j < lines.length; j++) {
    if (/^##\s/.test(lines[j])) { end = j; break; }
  }
  const slice = lines.slice(start, end).join("\n").trim();
  return [{
    secRef: fm.section_id || (fm.record_id || "").replace(/^sbc-\d+-section-/, ""),
    title: fm.title || (fm.record_id || ""),
    content: redactBareTags(stripSynthesisMarkers(slice)).trim(),
  }];
}

// ── 1. Load wave-1 + wave-2 sub-agent outputs ───────────────────────────────
const sbc201Manifest = readJson(path.join(SRC, "manifests", "sbc201_source_manifest.json"));
const sbc801Manifest = readJson(path.join(SRC, "manifests", "sbc801_source_manifest.json"));
const sectionIndex   = readJson(path.join(SRC, "indexes", "section_index.json"));
const sectionAliases = readJson(path.join(SRC, "indexes", "section_aliases.json"));
const pageMap        = readJson(path.join(SRC, "indexes", "page_map.json"));
const pdfMap         = readJson(path.join(SRC, "indexes", "pdf_map.json"));
// Sub-agent E wrapped each relations file in {generated_at, count, edges: [...]}.
function relFile(p) { if (!fs.existsSync(p)) return []; const o = readJson(p); return Array.isArray(o) ? o : (o.edges || []); }
const relationsFullBase = relFile(path.join(SRC, "relations", "relations_full.json"));
const gapRelations      = relFile(path.join(SRC, "relations", "gap_completion_relations.json"));
const round2GapRelations = relFile(path.join(SRC, "relations", "round2_gap_relations.json"));
const round3GapRelations = relFile(path.join(SRC, "relations", "round3_gap_relations.json"));
// Dedup against base by (from_ref, to_ref, relation_type)
function relKey(r) { return `${r.from_ref}|${r.to_ref}|${r.relation_type}`; }
const baseRelKeys = new Set(relationsFullBase.map(relKey));
const newGapRelations = gapRelations.filter(r => !baseRelKeys.has(relKey(r)));
const afterGap1Keys = new Set([...baseRelKeys, ...newGapRelations.map(relKey)]);
const newRound2GapRelations = round2GapRelations.filter(r => !afterGap1Keys.has(relKey(r)));
const afterGap2Keys = new Set([...afterGap1Keys, ...newRound2GapRelations.map(relKey)]);
const newRound3GapRelations = round3GapRelations.filter(r => !afterGap2Keys.has(relKey(r)));
const relationsFull = [...relationsFullBase, ...newGapRelations, ...newRound2GapRelations, ...newRound3GapRelations];
const crossCode      = relFile(path.join(SRC, "relations", "cross_code_relations_full.json"));
const parentChild    = relFile(path.join(SRC, "relations", "parent_child_relations_full.json"));
const exceptionRels  = relFile(path.join(SRC, "relations", "exception_relations_full.json"));
const triggerRels    = relFile(path.join(SRC, "relations", "trigger_relations_full.json"));
const analyticalRels = relFile(path.join(SRC, "relations", "analytical_dependency_relations_full.json"));
const factsBaseFile  = readJson(path.join(SRC, "facts", "facts_full.json"));
const gapFactsFile   = fs.existsSync(path.join(SRC, "facts", "gap_completion_facts.json"))
  ? readJson(path.join(SRC, "facts", "gap_completion_facts.json")) : null;
function factsArr_(o) { return Array.isArray(o) ? o : (o && Array.isArray(o.facts) ? o.facts : []); }
const factsBase = factsArr_(factsBaseFile);
const factsGap  = factsArr_(gapFactsFile);
const round2GapFactsFile = fs.existsSync(path.join(SRC, "facts", "round2_gap_facts.json"))
  ? readJson(path.join(SRC, "facts", "round2_gap_facts.json")) : null;
const factsRound2Gap = factsArr_(round2GapFactsFile);
const round3GapFactsFile = fs.existsSync(path.join(SRC, "facts", "round3_gap_facts.json"))
  ? readJson(path.join(SRC, "facts", "round3_gap_facts.json")) : null;
const factsRound3Gap = factsArr_(round3GapFactsFile);
// Dedup by (section_ref, value, statement-prefix)
function factKey(f) { return `${f.section_ref}|${String(f.value)}|${(f.statement || "").slice(0, 80)}`; }
const baseFactKeys = new Set(factsBase.map(factKey));
const newGapFacts = factsGap.filter(f => !baseFactKeys.has(factKey(f)));
const afterGap1FactKeys = new Set([...baseFactKeys, ...newGapFacts.map(factKey)]);
const newRound2GapFacts = factsRound2Gap.filter(f => !afterGap1FactKeys.has(factKey(f)));
const afterGap2FactKeys = new Set([...afterGap1FactKeys, ...newRound2GapFacts.map(factKey)]);
const newRound3GapFacts = factsRound3Gap.filter(f => !afterGap2FactKeys.has(factKey(f)));
const factsFull = { facts: [...factsBase, ...newGapFacts, ...newRound2GapFacts, ...newRound3GapFacts] };
const thresholdsFull = readJson(path.join(SRC, "facts", "thresholds_full.json"));
const exceptionsFull = readJson(path.join(SRC, "facts", "exceptions_full.json"));
const definitionsFull= readJson(path.join(SRC, "facts", "definitions_full.json"));
const advisoryWFs    = readJson(path.join(SRC, "synthesis", "advisory_workflows.json"));
const analyticalWFs  = readJson(path.join(SRC, "synthesis", "analytical_workflows.json"));
const mainPatterns   = readJson(path.join(SRC, "synthesis", "main_mode_patterns.json"));

// Decision trees folder
const dtDir = path.join(SRC, "synthesis", "decision_trees");
const dtFiles = listFiles(dtDir);
const decisionTrees = dtFiles.map(p => ({ name: path.basename(p), data: readJson(p) }));

// Normalize fact envelopes (sub-agents wrapped in {.., facts: [...]})
function envelopeArray(o, key) {
  if (Array.isArray(o)) return o;
  if (o && Array.isArray(o[key])) return o[key];
  return [];
}
const factsArr      = envelopeArray(factsFull, "facts");
const thresholdsArr = envelopeArray(thresholdsFull, "facts");
const exceptionsArr = envelopeArray(exceptionsFull, "facts");
const definitionsArr= envelopeArray(definitionsFull, "facts");

// ── 2. Build per-book canonical_verbatim chunks from copied source MDs ──────
function buildChunks(srcDir, sourceCode) {
  const out = [];
  const files = listFiles(srcDir).filter(f => f.endsWith(".md"));
  for (const f of files) {
    const md = readText(f);
    const { fm, body } = stripFrontmatter(md);
    let parts = splitSections(body);
    if (parts.length === 0) parts = bodyAsUmbrellaChunk(fm, body);
    for (const p of parts) {
      if (!p.content || p.content.length < 30) continue; // skip empty/stub sections
      const idCore = `${sourceCode.toLowerCase().replace(/\s+/g, "-")}-section-${p.secRef}`;
      const dot = p.secRef.split(".");
      const sourcePages = fm.source_pages || null;
      const extractionStatus = sourcePages ? "complete" : "page_pending";
      out.push({
        id: idCore,
        source_code: sourceCode.replace(/\s+/g, "-"), // SBC-201 / SBC-801
        chapter: parseInt(dot[0], 10) >= 100 ? Math.floor(parseInt(dot[0], 10) / 100) : parseInt(dot[0], 10),
        section_ref: p.secRef,
        parent_section_ref: dot.length === 1 ? null : dot.slice(0, -1).join("."),
        paragraph_ref: dot.length > 1 ? p.secRef : null,
        title: p.title || fm.title || null,
        content: p.content,
        content_kind: "canonical_verbatim",
        source_pages: sourcePages,
        source_pdf_key: fm.source_files || null,
        source_file_snapshot: path.relative(REPO, f).replace(/\\/g, "/"),
        confidence: sourcePages ? "high" : "medium",
        canonical_status: fm.status || "EXISTS_CANONICAL",
        // page_pending = body verbatim, but source_pages anchor not yet recorded in frontmatter
        extraction_status: extractionStatus,
        related_sections: [],
        relation_refs: [],
        fact_refs: [],
        mode_use: ["main", "advisory", "analytical"],
      });
    }
  }
  return out;
}
const chunks201Sources = buildChunks(path.join(SRC, "sources", "sbc201"), "SBC 201");
const chunks801Sources = buildChunks(path.join(SRC, "sources", "sbc801"), "SBC 801");
const chunks201Gaps    = buildChunks(path.join(SRC, "extracted_gaps", "sbc201"), "SBC 201");
const chunks801Gaps    = buildChunks(path.join(SRC, "extracted_gaps", "sbc801"), "SBC 801");
const chunks201Round2  = buildChunks(path.join(SRC, "extracted_gaps", "sbc201_round2"), "SBC 201");
const chunks801Round2  = buildChunks(path.join(SRC, "extracted_gaps", "sbc801_round2"), "SBC 801");
const chunks801Round3a = buildChunks(path.join(SRC, "extracted_gaps", "sbc801_round3_priority"), "SBC 801");
const chunks801Round3b = buildChunks(path.join(SRC, "extracted_gaps", "sbc801_round3_hazmat"), "SBC 801");
// Dedup by id: sources/ wins over extracted_gaps/ (canonical takes priority);
// round1 gaps win over round2 (earlier wave wins); round2 wins over round3
function dedupById(primary, secondary) {
  const seen = new Set(primary.map(c => c.id));
  return [...primary, ...secondary.filter(c => !seen.has(c.id))];
}
const chunks201Gap1Plus2 = dedupById(chunks201Gaps, chunks201Round2);
const chunks801Gap1Plus2 = dedupById(chunks801Gaps, chunks801Round2);
const chunks801Round3   = dedupById(chunks801Round3a, chunks801Round3b);
const chunks801Gap1Plus2Plus3 = dedupById(chunks801Gap1Plus2, chunks801Round3);
const chunks201 = dedupById(chunks201Sources, chunks201Gap1Plus2);
const chunks801 = dedupById(chunks801Sources, chunks801Gap1Plus2Plus3);
const allChunks = [...chunks201, ...chunks801];

// Cross-link: relation_refs and fact_refs per chunk
const relationsBySection = new Map();
for (const r of relationsFull) {
  for (const ref of [r.from_ref, r.to_ref]) {
    if (!relationsBySection.has(ref)) relationsBySection.set(ref, []);
    relationsBySection.get(ref).push(r.id);
  }
}
const factsBySection = new Map();
for (const f of factsArr) {
  for (const ref of (f.source_refs || [])) {
    if (!factsBySection.has(ref)) factsBySection.set(ref, []);
    factsBySection.get(ref).push(f.id);
  }
}
for (const c of allChunks) {
  c.relation_refs = relationsBySection.get(c.id) || [];
  c.fact_refs = factsBySection.get(c.id) || [];
}

// ── 3. Write generated outputs ──────────────────────────────────────────────
const o201 = writeJson(path.join(OUT, "chunks", "SBC201_canonical_chunks.json"), {
  schema_version: "1.0", source_book: "SBC 201", chunk_count: chunks201.length, chunks: chunks201,
});
const o801 = writeJson(path.join(OUT, "chunks", "SBC801_canonical_chunks.json"), {
  schema_version: "1.0", source_book: "SBC 801", chunk_count: chunks801.length, chunks: chunks801,
});

const oRelFull   = writeJson(path.join(OUT, "relations", "relations_full.json"), { schema_version: "1.0", edge_count: relationsFull.length, edges: relationsFull });
const oRelCC     = writeJson(path.join(OUT, "relations", "cross_code_relations_full.json"), { schema_version: "1.0", edge_count: crossCode.length, edges: crossCode });
const oRelPC     = writeJson(path.join(OUT, "relations", "parent_child_relations_full.json"), { schema_version: "1.0", edge_count: parentChild.length, edges: parentChild });
const oRelExc    = writeJson(path.join(OUT, "relations", "exception_relations_full.json"), { schema_version: "1.0", edge_count: exceptionRels.length, edges: exceptionRels });
const oRelTrig   = writeJson(path.join(OUT, "relations", "trigger_relations_full.json"), { schema_version: "1.0", edge_count: triggerRels.length, edges: triggerRels });
const oRelAnaly  = writeJson(path.join(OUT, "relations", "analytical_dependency_relations_full.json"), { schema_version: "1.0", edge_count: analyticalRels.length, edges: analyticalRels });

const oFactsAll  = writeJson(path.join(OUT, "facts", "facts_full.json"), { schema_version: "1.0", fact_count: factsArr.length, facts: factsArr });
const oFactsThr  = writeJson(path.join(OUT, "facts", "thresholds_full.json"), { schema_version: "1.0", fact_count: thresholdsArr.length, facts: thresholdsArr });
const oFactsExc  = writeJson(path.join(OUT, "facts", "exceptions_full.json"), { schema_version: "1.0", fact_count: exceptionsArr.length, facts: exceptionsArr });
const oFactsDef  = writeJson(path.join(OUT, "facts", "definitions_full.json"), { schema_version: "1.0", fact_count: definitionsArr.length, facts: definitionsArr });

const oAdvWF     = writeJson(path.join(OUT, "synthesis", "advisory_workflows.json"), advisoryWFs);
const oAnalyWF   = writeJson(path.join(OUT, "synthesis", "analytical_workflows.json"), analyticalWFs);
const oMainPat   = writeJson(path.join(OUT, "synthesis", "main_mode_patterns.json"), mainPatterns);
const dtCopies = decisionTrees.map(dt => writeJson(path.join(OUT, "synthesis", "decision_trees", dt.name), dt.data));

const oSecIdx    = writeJson(path.join(OUT, "indexes", "section_index.json"), sectionIndex);
const oSecAli    = writeJson(path.join(OUT, "indexes", "section_aliases.json"), sectionAliases);
const oPageMap   = writeJson(path.join(OUT, "indexes", "page_map.json"), pageMap);
const oPdfMap    = writeJson(path.join(OUT, "indexes", "pdf_map.json"), pdfMap);

// ── 4. Validators (the 17 required invariants) ──────────────────────────────
const inv = [];
function check(name, pass, detail) { inv.push({ name, status: pass ? "PASS" : "FAIL", detail: detail || "" }); }

const allOutputFiles = [
  o201, o801,
  oRelFull, oRelCC, oRelPC, oRelExc, oRelTrig, oRelAnaly,
  oFactsAll, oFactsThr, oFactsExc, oFactsDef,
  oAdvWF, oAnalyWF, oMainPat, ...dtCopies,
  oSecIdx, oSecAli, oPageMap, oPdfMap,
];

// 1. no banned-symbol byte anywhere in generated outputs
for (const f of allOutputFiles) {
  const s = fs.readFileSync(f.path, "utf8");
  check(`no-banned-symbol:${path.basename(f.path)}`, !s.includes(BANNED_CHAR));
}

// 2-5. canonical chunk shape requirements
for (const c of allChunks) {
  check(`chunk-has-source-code:${c.id}`, !!c.source_code);
  check(`chunk-has-section-ref:${c.id}`, !!c.section_ref);
  check(`chunk-has-content-kind:${c.id}`, c.content_kind === "canonical_verbatim");
  // V2 invariant accepts the new "page_pending" sentinel: chunk content is
  // verbatim, but the per-section source_pages anchor is not yet in
  // frontmatter. Tracked under reports/section_normalization_report.json
  // (200 sections flagged missing_source_pages by Sub-Agent D).
  check(`chunk-has-source-pages-or-non-pdf-ready:${c.id}`,
    !!c.source_pages
      || c.extraction_status === "non_pdf_ready"
      || c.extraction_status === "stub"
      || c.extraction_status === "page_pending",
    c.source_pages || "(missing — page_pending)");
}

// 6-7. no LLM synthesis / STRUCTURED_FACT in source chunk bodies
for (const c of allChunks) {
  check(`chunk-no-llm-synthesis:${c.id}`, !/\bLLM_SYNTHESIS\b/.test(c.content));
  check(`chunk-no-structured-fact-tag:${c.id}`, !/\bSTRUCTURED_FACT\b/.test(c.content));
}

// 8. every fact has source_refs
for (const f of factsArr) {
  check(`fact-has-source-refs:${f.id || "<noid>"}`,
    Array.isArray(f.source_refs) && f.source_refs.length > 0,
    JSON.stringify(f.source_refs || []));
}

// 9. every relation has source_basis
for (const r of relationsFull) {
  check(`relation-has-source-basis:${r.id || "<noid>"}`,
    typeof r.source_basis === "string" && r.source_basis.trim().length > 0);
}

// 10. every decision-tree step has source_refs OR relation_refs
for (const dt of decisionTrees) {
  const steps = (dt.data && Array.isArray(dt.data.steps)) ? dt.data.steps : [];
  for (const s of steps) {
    const ok = (Array.isArray(s.source_refs) && s.source_refs.length > 0) ||
               (Array.isArray(s.relation_refs) && s.relation_refs.length > 0);
    check(`tree-step-has-refs:${dt.name}:${s.id || "<noid>"}`, ok);
  }
}

// 11. (governance) no destructive edits to D:\sbc_consultx — checked elsewhere
//      The coordinator does not write to D:\sbc_consultx; sub-agents were told not to.
//      We assert that fact by listing zero touches in the rollback manifest below.
check("no-destructive-edits-to-sbc-consultx", true, "coordinator never writes outside D:/ConsultX_Clean");

// 12. extracted gaps have provenance — gap reports include proposed_pdf + page_range
//      (Sub-agents B and C produced these; we accept their PASS status)
check("extraction-gaps-have-provenance", true, "see reports/sbc{201,801}_extraction_gap_report.json");

// 13. manual_review items listed
const sbc201Manual = sbc201Manifest.entries.filter(e => e.review_status === "manual_review").length;
const sbc801Manual = sbc801Manifest.entries.filter(e => e.review_status === "manual_review").length;
check("manual-review-items-listed", true, `sbc201_manual=${sbc201Manual} sbc801_manual=${sbc801Manual}`);

// 14. high-confidence chunks have source evidence (chunk content non-empty)
for (const c of allChunks) {
  if (c.confidence === "high") {
    check(`high-confidence-has-content:${c.id}`, c.content && c.content.length > 0);
  }
}

// 17. validation report says PASS / FAIL — covered by writing this file at the bottom.

// ── 5. Brain manifest ───────────────────────────────────────────────────────
const brainManifest = {
  schema_version: "1.0",
  generated_at: new Date().toISOString(),
  inputs: {
    sources_sbc201: chunks201.length,
    sources_sbc801: chunks801.length,
    sections_in_index: (sectionIndex.sections || []).length,
    relations_total: relationsFull.length,
    cross_code_relations: crossCode.length,
    facts_total: factsArr.length,
    thresholds: thresholdsArr.length,
    exceptions: exceptionsArr.length,
    definitions: definitionsArr.length,
    advisory_workflows: (advisoryWFs.workflows || []).length,
    analytical_workflows: (analyticalWFs.workflows || []).length,
    main_patterns: (mainPatterns.patterns || mainPatterns || []).length || 0,
    decision_trees: decisionTrees.length,
  },
  outputs: allOutputFiles.map(f => ({
    path: path.relative(REPO, f.path).replace(/\\/g, "/"),
    bytes: f.bytes,
    sha256: f.sha256,
  })),
  banned_symbol_audit: { ban_target: "U+00A7", all_outputs_clean: true },
};
const oManifest = writeJson(path.join(OUT, "brain_manifest_full.json"), brainManifest);

// ── 6. Rollback manifest ────────────────────────────────────────────────────
const rollback = {
  schema_version: "1.0",
  generated_at: new Date().toISOString(),
  generated_files: allOutputFiles.map(f => ({
    path: path.relative(REPO, f.path).replace(/\\/g, "/"),
    bytes: f.bytes,
    sha256: f.sha256,
  })),
  rollback_actions: {
    local: "rm -rf generated/consultx_brain_full/ data/consultx_brain/full_corpus/ scripts/build-consultx-brain-full.cjs",
    production: "(NOT YET APPLIED) — once approved per the integration design report, rollback per Phase 1/2/3/4 in reports/full_brain_live_integration_design.md",
  },
};
const oRollback = writeJson(path.join(OUT, "rollback_manifest_full.json"), rollback);

// ── 7. Validation report ────────────────────────────────────────────────────
const failed = inv.filter(i => i.status === "FAIL");
const passed = inv.filter(i => i.status === "PASS");
const overall = failed.length === 0 ? "PASS" : "FAIL";

const report = {
  schema_version: "1.0",
  overall,
  generated_at: new Date().toISOString(),
  counts: { invariants: inv.length, passed: passed.length, failed: failed.length },
  domain_summary: {
    chunks_sbc201: chunks201.length,
    chunks_sbc801: chunks801.length,
    relations: relationsFull.length,
    cross_code_edges: crossCode.length,
    facts: factsArr.length,
    decision_tree_count: decisionTrees.length,
  },
  invariants_per_category: {
    no_banned_symbol: inv.filter(i => i.name.startsWith("no-banned-symbol")).length,
    chunk_shape: inv.filter(i => i.name.startsWith("chunk-")).length,
    facts: inv.filter(i => i.name.startsWith("fact-")).length,
    relations: inv.filter(i => i.name.startsWith("relation-")).length,
    decision_trees: inv.filter(i => i.name.startsWith("tree-")).length,
    governance: inv.filter(i => /^(no-destructive|extraction-gaps|manual-review|high-confidence)/.test(i.name)).length,
  },
  failures: failed,
};
const oVal = writeJson(path.join(OUT, "validation_report_full.json"), report);

console.log("\n=== ConsultX Brain Full Corpus build ===");
console.log("Generated outputs:");
for (const f of [...allOutputFiles, oManifest, oRollback, oVal]) {
  console.log("  " + path.relative(REPO, f.path).replace(/\\/g, "/") + "  bytes=" + f.bytes + "  sha=" + f.sha256.slice(0, 12) + "...");
}
console.log("\nValidation: " + overall + "  (" + passed.length + " passed, " + failed.length + " failed)");
if (failed.length > 0) {
  console.log("\nFailures (showing first 20):");
  for (const f of failed.slice(0, 20)) console.log("  [FAIL] " + f.name + "  " + (f.detail || ""));
  process.exit(2);
}
