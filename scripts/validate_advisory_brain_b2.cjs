/**
 * validate_advisory_brain_b2.cjs
 *
 * Node.js validation script for B2 modules (non-Deno, CI-compatible).
 * Tests what can be tested without Deno imports:
 *   - Runtime package integrity
 *   - Workflow router logic (pure JS port of the key router functions)
 *   - Invariant checks
 *
 * Run: node scripts/validate_advisory_brain_b2.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const PKG_DIR = path.join(REPO_ROOT, "generated/consultx_brain_full/v4/advisory_brain/runtime_package");

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failures.push({ name, error: e.message });
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function readPkg(fname) {
  return JSON.parse(fs.readFileSync(path.join(PKG_DIR, fname), "utf-8"));
}

// ── PORT: key router logic for Node testing ──────────────────────────────────

const DOMAIN_KEYWORDS = [
  {
    domain: "occupant_load", ar: ["حمل إشغالي", "حمل الإشغال", "1004.5", "جدول 1004"],
    en: ["occupant load", "floor area allowance"], refs: [/\b1004\b/, /\b1004\.5\b/],
  },
  {
    domain: "egress", ar: ["مخرج", "مخارج", "مسار الخروج", "عدد المخارج", "1006"],
    en: ["egress", "exit", "travel distance"], refs: [/\b100[4-9]\b/, /\b101[0-9]\b/],
  },
  {
    domain: "occupancy_classification", ar: ["تصنيف الإشغال", "مجموعة", "group m"],
    en: ["occupancy group", "group m", "mixed occupancy"], refs: [/\b3\d\d\b/],
  },
  {
    domain: "sprinkler", ar: ["رشاشات", "رشاش", "رش تلقائي", "903"],
    en: ["sprinkler", "automatic sprinkler", "fire area"], refs: [/\b903\b/, /\b903\.\d/],
  },
  {
    domain: "fire_alarm", ar: ["إنذار حريق", "انذار", "نظام إنذار", "907"],
    en: ["fire alarm", "alarm system", "smoke detector"], refs: [/\b907\b/, /\b907\.\d/],
  },
  {
    domain: "fire_pump", ar: ["مضخة حريق", "مضخة الحريق", "913"],
    en: ["fire pump", "pump capacity"], refs: [/\b913\b/, /\b913\.\d/],
  },
  {
    domain: "standpipe", ar: ["أنبوب ثابت", "standpipe", "905"],
    en: ["standpipe", "hose connection"], refs: [/\b905\b/, /\b905\.\d/],
  },
  {
    domain: "smoke_control", ar: ["تحكم بالدخان", "إدارة الدخان", "909"],
    en: ["smoke control", "smoke management"], refs: [/\b909\b/, /\b909\.\d/],
  },
];

const CASUAL_AR = ["كيفك", "كيف الحال", "مرحبا", "السلام", "صباح الخير", "شكرا"];

function routeQuery(query) {
  const lower = query.toLowerCase();
  for (const kw of CASUAL_AR) {
    if (lower.includes(kw)) return "non_code";
  }
  let best = null, bestScore = 0;
  for (const cfg of DOMAIN_KEYWORDS) {
    let score = 0;
    for (const re of (cfg.refs || [])) { if (re.test(query)) { score += 3; break; } }
    for (const kw of cfg.ar) { if (lower.includes(kw.toLowerCase())) { score += 2; break; } }
    for (const kw of cfg.en) { if (lower.includes(kw.toLowerCase())) { score += 1; break; } }
    if (score > bestScore) { bestScore = score; best = cfg.domain; }
  }
  return best || "general_code_lookup";
}

// ── TESTS ────────────────────────────────────────────────────────────────────
console.log("\n=== Advisory Brain B2 — Node Validation ===\n");

console.log("--- Manifest integrity ---");
test("manifest exists and parses", () => {
  const m = readPkg("advisory_brain_manifest.json");
  assert(m.schema_version === "1.0", "schema_version");
  assert(m.brain_version === "B1", "brain_version");
  assert(m.validation_result === "PASS", "validation_result");
});

test("manifest: node counts correct (440 total)", () => {
  const m = readPkg("advisory_brain_manifest.json");
  assert(m.node_counts.total === 440, `Expected 440 nodes, got ${m.node_counts.total}`);
});

test("manifest: 278 in-graph edges", () => {
  const m = readPkg("advisory_brain_manifest.json");
  assert(m.edge_counts.in_graph === 278, `Expected 278 edges, got ${m.edge_counts.in_graph}`);
});

test("manifest: 405 external xrefs", () => {
  const m = readPkg("advisory_brain_manifest.json");
  assert(m.edge_counts.external_xrefs === 405, `Expected 405, got ${m.edge_counts.external_xrefs}`);
});

test("manifest: 8 workflows", () => {
  const m = readPkg("advisory_brain_manifest.json");
  assert(m.workflow_count === 8, `Expected 8 workflows, got ${m.workflow_count}`);
});

test("manifest: all 8 workflow IDs present", () => {
  const m = readPkg("advisory_brain_manifest.json");
  const required = ["wf_occupancy_classification","wf_occupant_load","wf_egress",
    "wf_sprinkler","wf_fire_alarm","wf_fire_pump","wf_standpipe","wf_smoke_control"];
  for (const id of required) {
    assert(m.workflow_ids.includes(id), `Missing: ${id}`);
  }
});

test("manifest: invariants all true", () => {
  const m = readPkg("advisory_brain_manifest.json");
  assert(m.invariants.no_orphan_promoted === true, "no_orphan_promoted");
  assert(m.invariants.no_unadopted_promoted === true, "no_unadopted_promoted");
  assert(m.invariants.banned_char_u00a7 === 0, "banned_char_u00a7");
  assert(m.invariants.no_secrets === true, "no_secrets");
  assert(m.invariants.no_dangling_edges === true, "no_dangling_edges");
  assert(m.invariants.no_duplicate_node_ids === true, "no_duplicate_node_ids");
});

console.log("\n--- Orphans: do_not_promote invariant ---");
test("all orphan nodes have do_not_promote=true", () => {
  const orphans = readPkg("orphans_compact.json");
  assert(Array.isArray(orphans), "orphans is array");
  for (const o of orphans) {
    assert(o.do_not_promote === true, `Orphan ${o.node_id} missing do_not_promote`);
    assert(o.confidence === "low", `Orphan ${o.node_id} should have low confidence`);
  }
});

test("no orphan appears in workflow primary_sections", () => {
  const orphans = readPkg("orphans_compact.json");
  const { workflows } = readPkg("workflows_compact.json");
  const orphanIds = new Set(orphans.map(o => o.node_id));
  for (const wf of workflows) {
    for (const ps of (wf.primary_sections || [])) {
      assert(!orphanIds.has(ps.node_id), `Workflow ${wf.workflow_id} has orphan in primary_sections: ${ps.node_id}`);
    }
    for (const st of (wf.supporting_tables || [])) {
      assert(!orphanIds.has(st.node_id), `Workflow ${wf.workflow_id} has orphan in supporting_tables: ${st.node_id}`);
    }
  }
});

console.log("\n--- Banned characters ---");
test("no U+00A7 in nodes_compact", () => {
  const text = fs.readFileSync(path.join(PKG_DIR, "nodes_compact.json"), "utf-8");
  assert(!text.includes("§"), "Found banned § in nodes_compact.json");
});

test("no U+00A7 in workflows_compact", () => {
  const text = fs.readFileSync(path.join(PKG_DIR, "workflows_compact.json"), "utf-8");
  assert(!text.includes("§"), "Found banned § in workflows_compact.json");
});

console.log("\n--- Router logic (ported to Node) ---");
test("Table 1004.5 → occupant_load", () => {
  const domain = routeQuery("اعطني قيمة من جدول 1004.5");
  assert(domain === "occupant_load", `Expected occupant_load, got ${domain}`);
});

test("Group M → occupancy_classification", () => {
  const domain = routeQuery("مبنى Group M كيف يُصنَّف وفق SBC 201");
  assert(domain === "occupancy_classification", `Expected occupancy_classification, got ${domain}`);
});

test("مخارج/egress → egress", () => {
  const domain = routeQuery("كم عدد المخارج المطلوبة لطابق 700 شخص؟");
  assert(domain === "egress", `Expected egress, got ${domain}`);
});

test("رشاشات/sprinkler → sprinkler", () => {
  const domain = routeQuery("متى تجب الرشاشات التلقائية في مبنى مكاتب؟");
  assert(domain === "sprinkler", `Expected sprinkler, got ${domain}`);
});

test("إنذار/fire alarm → fire_alarm", () => {
  const domain = routeQuery("ما متطلبات نظام إنذار الحريق لمبنى تعليمي؟");
  assert(domain === "fire_alarm", `Expected fire_alarm, got ${domain}`);
});

test("pump/مضخة → fire_pump", () => {
  const domain = routeQuery("ما سعة مضخة الحريق لمبنى 20 طابق؟");
  assert(domain === "fire_pump", `Expected fire_pump, got ${domain}`);
});

test("standpipe → standpipe", () => {
  const domain = routeQuery("what standpipe class is required for a 15-storey building?");
  assert(domain === "standpipe", `Expected standpipe, got ${domain}`);
});

test("تحية/greeting → non_code", () => {
  const domain = routeQuery("مرحبا كيف الحال؟");
  assert(domain === "non_code", `Expected non_code, got ${domain}`);
});

console.log("\n--- Validation cases ---");
test("10 validation cases in package", () => {
  const vc = readPkg("validation_cases_compact.json");
  assert(vc.case_count === 10, `Expected 10 cases, got ${vc.case_count}`);
  assert(Array.isArray(vc.cases), "cases is array");
  assert(vc.cases.length === 10, "cases.length === 10");
});

test("vc_01 Table 1004.5 routes to occupant_load", () => {
  const vc = readPkg("validation_cases_compact.json");
  const vc01 = vc.cases.find(c => c.case_id === "vc_01_table_1004_5_occupant_load");
  assert(vc01, "vc_01 not found");
  const domain = routeQuery(vc01.query);
  assert(domain === "occupant_load", `Expected occupant_load, got ${domain}`);
});

test("vc_02 min exits routes to egress", () => {
  const vc = readPkg("validation_cases_compact.json");
  const vc02 = vc.cases.find(c => c.case_id === "vc_02_table_1006_3_3_min_exits");
  assert(vc02, "vc_02 not found");
  const domain = routeQuery(vc02.query);
  assert(domain === "egress", `Expected egress, got ${domain}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n========================================");
console.log(`Results: ${pass} PASS, ${fail} FAIL`);
if (failures.length > 0) {
  console.error("\nFailed tests:");
  for (const f of failures) console.error(`  - ${f.name}: ${f.error}`);
  process.exit(1);
} else {
  console.log("ALL TESTS PASS");
  process.exit(0);
}
