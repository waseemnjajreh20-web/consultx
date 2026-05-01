/**
 * ch11-edges-analysis.cjs
 * ANALYSIS ONLY — read-only. Zero writes.
 * Covers PASS 1–4: edge schema/samples, Ch11 chunks, target nodes, candidate classification.
 *
 * Credentials: env var SUPABASE_SERVICE_ROLE_KEY or self-bootstrap via CLI.
 */
"use strict";
const { createClient } = require("@supabase/supabase-js");
const { execSync } = require("child_process");

const SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co";
const PROJECT_REF = "hrnltxmwoaphgejckutk";
const BUCKET = "ssss";

function getKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync(
    `npx supabase@2.95.2 projects api-keys --project-ref ${PROJECT_REF} --output json`,
    { encoding: "utf8", stdio: ["pipe","pipe","pipe"] }
  );
  const keys = JSON.parse(raw.match(/\[[\s\S]*\]/)[0]);
  return keys.find(k => k.id === "service_role").api_key;
}

async function downloadJSON(sb, path) {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Download error: ${error.message}`);
  return JSON.parse(await data.text());
}

async function main() {
  const sb = createClient(SUPABASE_URL, getKey());

  // ════════════════════════════════════════════════════════════
  // PASS 1 — GRAPH_EDGES SCHEMA AND EXISTING ROWS
  // ════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════════════════════════");
  console.log("PASS 1 — GRAPH_EDGES SCHEMA + EXISTING STATE");
  console.log("════════════════════════════════════════════════════════\n");

  // Total count
  const { count: edgeTotal } = await sb.from("graph_edges").select("*", { count: "exact", head: true });
  console.log(`graph_edges total: ${edgeTotal}`);

  // Schema probe
  const { data: edgeSample, error: schemaErr } = await sb.from("graph_edges").select("*").limit(1);
  if (schemaErr) { console.error("Schema probe failed:", schemaErr.message); process.exit(1); }
  if (edgeSample?.length) {
    console.log(`\nColumns: ${Object.keys(edgeSample[0]).join(", ")}`);
    console.log("\nSample edge (field types):");
    for (const [k, v] of Object.entries(edgeSample[0])) {
      const t = v === null ? "null" : typeof v === "object" ? "object" : typeof v;
      console.log(`  ${k}: ${t} = ${JSON.stringify(v)?.substring(0, 100)}`);
    }
  }

  // Sample 15 edges to understand vocabulary
  const { data: edgeRows } = await sb
    .from("graph_edges")
    .select("id, source_id, target_id, relationship_type, description, weight, created_at")
    .limit(20);

  console.log(`\n--- 20 sample edges (relationship_type vocabulary) ---`);
  const rtypes = new Set();
  for (const e of (edgeRows || [])) {
    rtypes.add(e.relationship_type);
    console.log(`  src=${e.source_id?.substring(0,8)}… → tgt=${e.target_id?.substring(0,8)}… | type="${e.relationship_type}" | weight=${e.weight}`);
    if (e.description) console.log(`    desc: "${e.description?.substring(0,120)}"`);
  }
  console.log(`\nRelationship_type values seen: ${[...rtypes].join(", ")}`);

  // Check existing Ch11 edges (source or target is a Ch11 node)
  const { data: ch11Nodes } = await sb
    .from("graph_nodes")
    .select("id, name, section_ref, chapter")
    .eq("chapter", 11).not("section_ref", "is", null);
  const ch11Ids = new Set((ch11Nodes || []).map(n => n.id));
  console.log(`\nCh11 canonical nodes: ${ch11Nodes?.length ?? 0}`);
  for (const n of (ch11Nodes || [])) {
    console.log(`  ${n.section_ref} → id=${n.id} | "${n.name}"`);
  }

  // Any existing edges touching Ch11 nodes?
  const ch11IdList = [...ch11Ids];
  let existingCh11Edges = [];
  if (ch11IdList.length > 0) {
    const { data: edg1 } = await sb.from("graph_edges").select("*").in("source_id", ch11IdList);
    const { data: edg2 } = await sb.from("graph_edges").select("*").in("target_id", ch11IdList);
    existingCh11Edges = [...(edg1 || []), ...(edg2 || [])];
  }
  console.log(`\nExisting graph_edges involving Ch11 nodes: ${existingCh11Edges.length}`);
  for (const e of existingCh11Edges) {
    console.log(`  id=${e.id} | src=${e.source_id} | tgt=${e.target_id} | type="${e.relationship_type}"`);
  }

  // ════════════════════════════════════════════════════════════
  // PASS 2 — EVIDENCE SOURCES
  // ════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════════════════════════");
  console.log("PASS 2 — EVIDENCE SOURCES");
  console.log("════════════════════════════════════════════════════════\n");

  // 2a — Download Ch11 v2 chunks
  console.log("--- Ch11 v2 chunks (cross-reference extraction) ---\n");
  const ch11Chunks = await downloadJSON(sb, "SBC801_Ch11_v2_chunks.json");
  console.log(`Total chunks: ${ch11Chunks.length}`);

  // Extract all cross-references mentioned in chunk text
  const xrefPattern = /(?:SBC\s*(?:201|801)[\s\-]*(?:Section|Table|Chapter|§)?\s*[\d.]+|Section\s+\d{3,4}(?:\.\d+)*|Table\s+\d{3,4}(?:\.\d+)*|Chapter\s+\d+)/gi;
  const allXrefs = [];
  for (const chunk of ch11Chunks) {
    const text = chunk.text || "";
    const matches = [...text.matchAll(xrefPattern)].map(m => m[0].trim());
    if (matches.length > 0) {
      console.log(`\nChunk "${chunk.section_ref}" — cross-references found:`);
      const unique = [...new Set(matches)];
      for (const ref of unique) {
        console.log(`  → "${ref}"`);
        allXrefs.push({ chunk_ref: chunk.section_ref, ref, chunk_title: chunk.title });
      }
    }
  }
  console.log(`\nTotal cross-reference mentions across all chunks: ${allXrefs.length}`);

  // Print all unique refs for quick scan
  const uniqueRefs = [...new Set(allXrefs.map(x => x.ref))].sort();
  console.log(`\nUnique refs: ${uniqueRefs.join(" | ")}`);

  // 2b — Inspect available target nodes (SBC201, SBC801 sections)
  console.log("\n--- Candidate target nodes (SBC201 + SBC801 with section_ref) ---\n");
  const { data: allSectionNodes } = await sb
    .from("graph_nodes")
    .select("id, name, section_ref, sbc_source, chapter, type")
    .not("section_ref", "is", null)
    .order("sbc_source")
    .order("section_ref");

  console.log(`Nodes with section_ref populated: ${allSectionNodes?.length ?? 0}`);
  for (const n of (allSectionNodes || [])) {
    console.log(`  [${n.sbc_source}] ${n.section_ref} → id=${n.id} | "${n.name}"`);
  }

  // Build lookup maps
  const nodeByRef = {};
  const nodeByRefAndSource = {};
  for (const n of (allSectionNodes || [])) {
    nodeByRef[n.section_ref] = n;
    nodeByRefAndSource[`${n.sbc_source}::${n.section_ref}`] = n;
  }

  // Build Ch11 node map by section_ref
  const ch11NodeMap = {};
  for (const n of (ch11Nodes || [])) {
    ch11NodeMap[n.section_ref] = n;
  }

  // ════════════════════════════════════════════════════════════
  // PASS 3 — CANDIDATE CLASSIFICATION
  // ════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════════════════════════");
  console.log("PASS 3 — CANDIDATE CLASSIFICATION");
  console.log("════════════════════════════════════════════════════════\n");

  // Manually enumerate known explicit relations from Ch11 text + canonical MD sources
  // These are derived from the actual text in sbc-801-section-1101..1106.md and chunks
  const candidates = [
    // ── From Section 1103 text ──────────────────────────────────
    // 1103.2: "Openings — Exterior wall openings shall comply with SBC 201"
    {
      source_ref: "1103",
      target_ref: "601",
      target_source: "SBC801",
      relation_type: "fire_safety_to_construction_type",
      evidence: "Section 1103 fire safety requirements for existing buildings reference SBC 801 Chapter 6 (construction classification) for fire-resistance ratings of exterior openings and walls.",
      evidence_file: "sbc-801-section-1103.md",
      confidence: "NEEDS_MANUAL_REVIEW",
      note: "Indirect — construction type governs fire resistance but 1103 does not cite Section 601 by number explicitly in partial corpus"
    },
    // 1103.5: Automatic sprinkler systems — SBC 801 Section 903
    {
      source_ref: "1103",
      target_ref: "903",
      target_source: "SBC801",
      relation_type: "fire_safety_requirement_to_suppression_system",
      evidence: "Section 1103.5 Automatic Sprinkler Systems — existing buildings requiring sprinklers shall comply with SBC 801 Section 903. Explicit section number cited.",
      evidence_file: "sbc-801-section-1103.md (canonical extraction)",
      confidence: "APPROVED_CANDIDATE",
      note: "Explicit forward reference: 1103.5 → 903. Both nodes exist."
    },
    // 1103.6: Fire alarm systems — SBC 801 Section 907
    {
      source_ref: "1103",
      target_ref: "907",
      target_source: "SBC801",
      relation_type: "fire_safety_requirement_to_detection_alarm",
      evidence: "Section 1103.6 Fire Alarm — existing buildings requiring fire alarm systems shall comply with SBC 801 Section 907. Explicit citation.",
      evidence_file: "sbc-801-section-1103.md (canonical extraction)",
      confidence: "NEEDS_MANUAL_REVIEW",
      note: "Section 907 node likely does not exist in graph_nodes with section_ref — needs node-id check"
    },
    // 1104 → 1006: Number of exits for existing buildings references Section 1006
    {
      source_ref: "1104",
      target_ref: "1006",
      target_source: "SBC801",
      relation_type: "egress_existing_to_egress_new",
      evidence: "Section 1104.2 — Number of exits for existing buildings references the minimum exit requirements of Section 1006. Ch11 egress adapts Ch10 exit count standards to existing conditions.",
      evidence_file: "sbc-801-section-1104.md (canonical extraction)",
      confidence: "APPROVED_CANDIDATE",
      note: "1006 node exists in graph_nodes. 1104 node exists. Explicit structural adaptation relationship."
    },
    // 1104 → 1004: Occupant load — 1104.1 occupant load per Section 1004
    {
      source_ref: "1104",
      target_ref: "1004",
      target_source: "SBC801",
      relation_type: "egress_existing_to_occupant_load",
      evidence: "Section 1104.1 — occupant load for existing buildings determined per Section 1004. Egress width and exit count in 1104 derive from 1004 occupant load calculations.",
      evidence_file: "sbc-801-section-1104.md (canonical extraction)",
      confidence: "APPROVED_CANDIDATE",
      note: "1004 node exists in graph_nodes. 1104 node exists. Fundamental dependency."
    },
    // 1106 → 503: Fire apparatus access — 1106.1 references Section 503 (access roads)
    {
      source_ref: "1106",
      target_ref: "503",
      target_source: "SBC801",
      relation_type: "existing_operations_to_fire_access_roads",
      evidence: "Section 1106.1 Tire storage yards — fire apparatus access roads shall comply with Section 503. Section 1106.1.1 specifies 45 m and 6 m dimensional requirements within the 503 framework.",
      evidence_file: "sbc-801-section-1106.md",
      confidence: "APPROVED_CANDIDATE",
      note: "Explicit cross-reference in canonical text. Section 503 node exists in graph_nodes."
    },
    // 1106 → 3405: Tire storage pile clearances
    {
      source_ref: "1106",
      target_ref: "3405",
      target_source: "SBC801",
      relation_type: "existing_outdoor_to_tire_storage_requirements",
      evidence: "Section 1106.1.2 — fire apparatus access roads shall be located within all pile clearances identified in Section 3405.4 and within all fire breaks required in Section 3405.5.",
      evidence_file: "sbc-801-section-1106.md",
      confidence: "NEEDS_MANUAL_REVIEW",
      note: "Explicit citation (1106.1.2 → 3405). Section 3405 node likely not in graph_nodes — needs node-id check."
    },
    // 1101 → general provisions → no strong explicit cross-code target
    {
      source_ref: "1101",
      target_ref: null,
      target_source: null,
      relation_type: null,
      evidence: "Section 1101 General provisions: scope and applicability. No explicit numeric cross-code citations found in partial corpus. Chapter-internal context only.",
      evidence_file: "sbc-801-section-1101.md",
      confidence: "REJECTED",
      note: "No explicit cross-code target identified. Keyword similarity only — insufficient for APPROVED."
    },
    // 1102 → no external refs (definitions only)
    {
      source_ref: "1102",
      target_ref: null,
      target_source: null,
      relation_type: null,
      evidence: "Section 1102 Definitions. Dutch Door and Existing defined. No numeric cross-code references in canonical text.",
      evidence_file: "sbc-801-section-1102.md",
      confidence: "REJECTED",
      note: "Definitions section — no cross-code targets applicable."
    },
    // 1105 → Group I-2: healthcare code refs
    {
      source_ref: "1105",
      target_ref: null,
      target_source: null,
      relation_type: null,
      evidence: "Section 1105 construction requirements for existing Group I-2. Partial corpus — subsections 1105.2–1105.9 are outline only. Full cross-references not extractable from partial text.",
      evidence_file: "sbc-801-section-1105.md",
      confidence: "NEEDS_MANUAL_REVIEW",
      note: "Section is partial (outline only). Cannot confirm specific target node references without full text. May reference SBC 201 §407 (Group I-2 sprinkler) but not confirmed from source."
    },
  ];

  // Resolve node IDs for each candidate
  console.log("Resolving node IDs for candidates...\n");
  for (const c of candidates) {
    if (c.source_ref) {
      c.source_node = ch11NodeMap[c.source_ref] || null;
      c.source_id = c.source_node?.id || null;
    }
    if (c.target_ref && c.target_source) {
      c.target_node = nodeByRefAndSource[`${c.target_source}::${c.target_ref}`] ||
                      nodeByRef[c.target_ref] || null;
      c.target_id = c.target_node?.id || null;
    }
  }

  // Print classification
  const approved = candidates.filter(c => c.confidence === "APPROVED_CANDIDATE");
  const review = candidates.filter(c => c.confidence === "NEEDS_MANUAL_REVIEW");
  const rejected = candidates.filter(c => c.confidence === "REJECTED");

  console.log(`\nAPPROVED_CANDIDATES: ${approved.length}`);
  for (const c of approved) {
    console.log(`\n  ✅ APPROVED: ${c.source_ref} → ${c.target_ref} (${c.target_source})`);
    console.log(`     relation_type: "${c.relation_type}"`);
    console.log(`     source_id: ${c.source_id || "MISSING"}`);
    console.log(`     target_id: ${c.target_id || "MISSING"}`);
    console.log(`     evidence: "${c.evidence.substring(0, 250)}"`);
    console.log(`     evidence_file: ${c.evidence_file}`);
    console.log(`     note: ${c.note}`);
  }

  console.log(`\nNEEDS_MANUAL_REVIEW: ${review.length}`);
  for (const c of review) {
    console.log(`\n  🔶 REVIEW: ${c.source_ref} → ${c.target_ref || "UNKNOWN"} (${c.target_source || "?"})`);
    console.log(`     relation_type: "${c.relation_type || "TBD"}"`);
    console.log(`     source_id: ${c.source_id || "MISSING"}`);
    console.log(`     target_id: ${c.target_id || "MISSING"}`);
    console.log(`     note: ${c.note}`);
  }

  console.log(`\nREJECTED: ${rejected.length}`);
  for (const c of rejected) {
    console.log(`  ❌ REJECTED: source=${c.source_ref} — ${c.note}`);
  }

  // ════════════════════════════════════════════════════════════
  // PASS 4 — DUPLICATE / SAFETY CHECK
  // ════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════════════════════════");
  console.log("PASS 4 — DUPLICATE + SAFETY CHECK");
  console.log("════════════════════════════════════════════════════════\n");

  // Build existing edge set for duplicate detection
  const { data: allEdges } = await sb.from("graph_edges").select("id, source_id, target_id, relationship_type");
  const existingEdgeSet = new Set((allEdges || []).map(e => `${e.source_id}::${e.target_id}::${e.relationship_type}`));

  console.log("Checking approved candidates for duplicates and missing node IDs:\n");
  const safeToInsert = [];

  for (const c of approved) {
    const issues = [];
    if (!c.source_id) issues.push("source_id MISSING");
    if (!c.target_id) issues.push("target_id MISSING");
    if (c.source_ref === "1107" || c.target_ref === "1107") issues.push("involves 1107 — FORBIDDEN");

    if (c.source_id && c.target_id) {
      const key = `${c.source_id}::${c.target_id}::${c.relation_type}`;
      if (existingEdgeSet.has(key)) issues.push("DUPLICATE — already in graph_edges");
    }

    if (issues.length === 0) {
      safeToInsert.push(c);
      console.log(`  ✅ SAFE: ${c.source_ref} → ${c.target_ref} — no issues`);
    } else {
      console.log(`  ⚠ BLOCKED: ${c.source_ref} → ${c.target_ref || "?"} — ${issues.join(", ")}`);
    }
  }

  console.log(`\nSafe-to-insert approved candidates: ${safeToInsert.length} / ${approved.length}`);

  // Confirm edge count unchanged
  const { count: finalEdgeCount } = await sb.from("graph_edges").select("*", { count: "exact", head: true });
  console.log(`graph_edges count (must be ${edgeTotal}): ${finalEdgeCount} — ${finalEdgeCount === edgeTotal ? "UNCHANGED ✅" : "CHANGED ❌"}`);

  // ════════════════════════════════════════════════════════════
  // PASS 5 — FUTURE INSERT PLAN
  // ════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════════════════════════");
  console.log("PASS 5 — FUTURE INSERT PLAN (NOT EXECUTED)");
  console.log("════════════════════════════════════════════════════════\n");

  if (safeToInsert.length === 0) {
    console.log("No approved candidates cleared all safety checks — no insert plan generated.");
  } else {
    console.log(`${safeToInsert.length} row(s) would be inserted in a future task:\n`);
    for (const [i, c] of safeToInsert.entries()) {
      console.log(`ROW ${i+1}:`);
      console.log(JSON.stringify({
        source_id: c.source_id,
        target_id: c.target_id,
        relationship_type: c.relation_type,
        description: c.evidence.substring(0, 250),
        weight: 0.85
      }, null, 2));
      console.log();
    }
    console.log("Rollback strategy: DELETE FROM graph_edges WHERE id IN (<inserted ids>) — targeted by returned id, not by source/target pair.");
  }

  console.log("\n════ ANALYSIS COMPLETE — ZERO WRITES PERFORMED ════");
  console.log(`graph_edges before: ${edgeTotal}`);
  console.log(`graph_edges after : ${finalEdgeCount}`);
  console.log(`Writes performed  : 0`);
}

main().catch(e => { console.error("Fatal:", e.message || e); process.exit(1); });
