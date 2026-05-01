/**
 * ch11-edges-nodecheck.cjs — fast targeted read-only query.
 * Gets node IDs for all target sections and edge count. No schema download.
 */
"use strict";
const { createClient } = require("@supabase/supabase-js");
const { execSync } = require("child_process");

const SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co";
const PROJECT_REF = "hrnltxmwoaphgejckutk";

function getKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync(
    `npx supabase@2.95.2 projects api-keys --project-ref ${PROJECT_REF} --output json`,
    { encoding: "utf8", stdio: ["pipe","pipe","pipe"] }
  );
  return JSON.parse(raw.match(/\[[\s\S]*\]/)[0]).find(k => k.id === "service_role").api_key;
}

async function main() {
  const sb = createClient(SUPABASE_URL, getKey());

  // All target section_refs we care about
  const targets = [
    // Ch11 source nodes
    "1101","1102","1103","1104","1105","1106",
    // Potential target nodes
    "903",   // sprinkler system — SBC801
    "503",   // fire apparatus access — SBC801
    "1004",  // occupant load — SBC801
    "1006",  // number of exits — SBC801
    "1009",  // accessible means of egress — SBC801
    "1011",  // exit signs — SBC801
    "3405",  // tire storage — SBC801 (likely missing)
    // SBC 201 targets
    "405",   // accessible stairway — SBC201
    "708",   // fire-resistance corridors — SBC201
    "716",   // fire/smoke openings — SBC201
    "703",   // fire-resistance ratings — SBC201
  ];

  const { data: nodes, error } = await sb
    .from("graph_nodes")
    .select("id, name, section_ref, sbc_source, chapter")
    .in("section_ref", targets);
  if (error) { console.error(error.message); process.exit(1); }

  console.log(`\nNode lookup (${nodes?.length ?? 0} found of ${targets.length} queried):\n`);
  const found = new Set();
  for (const n of (nodes || [])) {
    found.add(`${n.sbc_source}::${n.section_ref}`);
    console.log(`  ✅ [${n.sbc_source}] ${n.section_ref} → id=${n.id} | "${n.name}"`);
  }
  console.log(`\nMissing targets:`);
  for (const t of targets) {
    if (!nodes?.some(n => n.section_ref === t)) {
      console.log(`  ❌ ${t} — NOT in graph_nodes`);
    }
  }

  // Edge count
  const { count: edgeCount } = await sb.from("graph_edges").select("*", { count: "exact", head: true });
  console.log(`\ngraph_edges total: ${edgeCount}`);

  // Check for existing edges between Ch11 nodes and any of the targets
  const ch11Ids = (nodes || []).filter(n => ["1101","1102","1103","1104","1105","1106"].includes(n.section_ref)).map(n => n.id);
  const targetIds = (nodes || []).filter(n => !["1101","1102","1103","1104","1105","1106"].includes(n.section_ref)).map(n => n.id);

  let existingEdges = [];
  if (ch11Ids.length) {
    const { data: e1 } = await sb.from("graph_edges").select("*").in("source_id", ch11Ids);
    const { data: e2 } = await sb.from("graph_edges").select("*").in("target_id", ch11Ids);
    existingEdges = [...(e1||[]),...(e2||[])];
  }
  console.log(`\nExisting edges touching Ch11 nodes (1101-1106): ${existingEdges.length}`);
  for (const e of existingEdges) {
    console.log(`  ${e.source_id} → ${e.target_id} | type="${e.relationship_type}"`);
  }

  // Edge schema columns
  const { data: s } = await sb.from("graph_edges").select("*").limit(3);
  if (s?.length) {
    console.log(`\ngraph_edges columns: ${Object.keys(s[0]).join(", ")}`);
    console.log("\nSample edges (relationship_type vocabulary):");
    for (const e of s) {
      console.log(`  type="${e.relationship_type}" | weight=${e.weight} | desc="${(e.description||"").substring(0,80)}"`);
    }
    // Get all unique relationship_types
    const { data: allEdges } = await sb.from("graph_edges").select("relationship_type");
    const rtypes = [...new Set((allEdges||[]).map(e => e.relationship_type))].sort();
    console.log(`\nAll relationship_type values in DB:\n  ${rtypes.join("\n  ")}`);
  }
}
main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
