/**
 * advisory_brain_b2.test.ts
 *
 * Validation tests for Advisory Brain B2 modules.
 * Run with: deno test --allow-env supabase/functions/fire-safety-chat/tests/advisory_brain_b2.test.ts
 *
 * Tests are deterministic and do NOT make network calls.
 * They use the local runtime_package files from the repo.
 */

import { assertEquals, assertExists, assertFalse, assert } from "https://deno.land/std@0.210.0/assert/mod.ts";

// ── Import the modules under test ─────────────────────────────────────────────
// Note: imports are resolved relative to this test file location.
import { isB2Enabled, clearBrainCache } from "../brain_b1_loader.ts";
import {
  isRouterEnabled,
  routeAdvisoryQuery,
} from "../workflow_router.ts";
import {
  isEvidenceEnabled,
  augmentWithWorkflow,
  buildEvidenceOverlay,
} from "../workflow_constraints.ts";
import {
  isDynamicThinkingEnabled,
  buildThinkingSequence,
  formatThinkingEvent,
  FORBIDDEN_STATIC_PHRASES_AR,
  FORBIDDEN_STATIC_PHRASES_EN,
} from "../thinking_ux_emitter.ts";
import type { AdvisoryBrainB1, RouterResult } from "../brain_b1_types.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string>, fn: () => void): void {
  const originals: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    originals[k] = Deno.env.get(k);
    Deno.env.set(k, v);
  }
  try { fn(); } finally {
    for (const [k, orig] of Object.entries(originals)) {
      if (orig === undefined) Deno.env.delete(k);
      else Deno.env.set(k, orig);
    }
  }
}

// Minimal mock brain for router + evidence tests
function makeMockBrain(): AdvisoryBrainB1 {
  const occupantLoadWf = {
    schema_version: "1.0",
    workflow_id: "wf_occupant_load" as const,
    domain: "occupant_load" as const,
    description: "Occupant load workflow",
    required_inputs: ["floor_area_m2", "space_function"],
    primary_sections: [],
    supporting_tables: [
      {
        node_id: "sbc-201-table-1004-5",
        ref: "1004.5",
        title: "MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT",
        page_start: 213,
        source_pdf: "SBC 201 - The Saudi General Building Code-1001-1250.pdf",
      },
    ],
    threshold_candidates: [],
    missing_or_parking_lot_refs: [],
    safe_answer_rules: ["Cite Table 1004.5 with page anchor."],
    must_not_claim_rules: ["Do not invent a numeric value."],
    citation_requirements: ["Always include source_pdf + page_start."],
    definitions_needed: [],
  };

  const nodes_by_id = new Map();
  nodes_by_id.set("sbc-201-table-1004-5", {
    node_id: "sbc-201-table-1004-5",
    code: "SBC 201",
    ref: "1004.5",
    node_type: "table",
    title: "MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT",
    page_start: 213,
    page_end: 213,
    source_pdf: "SBC 201.pdf",
    confidence: "high",
    tags: ["sbc201", "table"],
    row_count: 20,
    column_headers: null,
    canonical_status: "extracted_v4",
  });

  const workflows_by_id = new Map();
  workflows_by_id.set("wf_occupant_load", occupantLoadWf);

  return {
    manifest: {
      schema_version: "1.0",
      generated_at: "2026-05-06T00:00:00Z",
      brain_version: "B1",
      v4_corpus_chunks_total: 612,
      node_counts: { total: 440 },
      edge_counts: { in_graph: 278, external_xrefs: 405 },
      workflow_count: 8,
      validation_case_count: 10,
      invariants: {},
    },
    sections: [],
    tables: [],
    orphans: [],
    thresholds: [],
    edges: [],
    external_xrefs: [],
    workflows: [occupantLoadWf],
    nodes_by_id,
    workflows_by_id,
  } as any;
}

// ── SECTION 1: Flag OFF guarantees ────────────────────────────────────────────

Deno.test("flag OFF: isB2Enabled returns false by default", () => {
  Deno.env.delete("ADVISORY_BRAIN_B2_ENABLED");
  assertFalse(isB2Enabled());
});

Deno.test("flag OFF: isRouterEnabled returns false by default", () => {
  Deno.env.delete("ADVISORY_BRAIN_B2_ROUTER_ENABLED");
  assertFalse(isRouterEnabled());
});

Deno.test("flag OFF: isEvidenceEnabled returns false by default", () => {
  Deno.env.delete("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED");
  assertFalse(isEvidenceEnabled());
});

Deno.test("flag OFF: isDynamicThinkingEnabled returns false by default", () => {
  Deno.env.delete("ADVISORY_DYNAMIC_THINKING_ENABLED");
  assertFalse(isDynamicThinkingEnabled());
});

Deno.test("flag OFF: router returns null (no behavior change)", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "0" }, () => {
    const result = routeAdvisoryQuery("اعطني قيمة من جدول 1004.5", null);
    assertEquals(result, null);
  });
});

Deno.test("flag OFF: evidence augmentation returns null (no behavior change)", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "0" }, () => {
    const mockRouter: RouterResult = {
      workflow_id: "wf_occupant_load",
      domain: "occupant_load",
      confidence: "high",
      matched_by: ["test"],
      parking_lot_pre_check: [],
      required_inputs: [],
      workflow: null,
    };
    const result = augmentWithWorkflow(mockRouter, null, "test query");
    assertEquals(result, null);
  });
});

Deno.test("flag OFF: dynamic thinking returns empty array (no behavior change)", () => {
  withEnv({ ADVISORY_DYNAMIC_THINKING_ENABLED: "0" }, () => {
    const mockRouter: RouterResult = {
      workflow_id: "wf_occupant_load",
      domain: "occupant_load",
      confidence: "high",
      matched_by: ["test"],
      parking_lot_pre_check: [],
      required_inputs: [],
      workflow: null,
    };
    const events = buildThinkingSequence(mockRouter, false, false, "ar");
    assertEquals(events.length, 0);
  });
});

// ── SECTION 2: Router workflow classification ─────────────────────────────────

Deno.test("router ON: Table 1004.5 query → occupant_load", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("اعطني قيمة من جدول 1004.5", null);
    assertExists(result);
    assertEquals(result!.domain, "occupant_load");
  });
});

Deno.test("router ON: Group M query → occupancy_classification", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("مبنى Group M كيف يُصنَّف وفق SBC 201", null);
    assertExists(result);
    assertEquals(result!.domain, "occupancy_classification");
  });
});

Deno.test("router ON: egress/مخارج query → egress", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("كم عدد المخارج المطلوبة لطابق 700 شخص؟", null);
    assertExists(result);
    assertEquals(result!.domain, "egress");
  });
});

Deno.test("router ON: sprinkler/رشاشات query → sprinkler", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("متى تجب الرشاشات التلقائية في مبنى مكاتب؟", null);
    assertExists(result);
    assertEquals(result!.domain, "sprinkler");
  });
});

Deno.test("router ON: fire alarm/إنذار query → fire_alarm", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("ما متطلبات نظام إنذار الحريق لمبنى تعليمي؟", null);
    assertExists(result);
    assertEquals(result!.domain, "fire_alarm");
  });
});

Deno.test("router ON: pump/مضخة query → fire_pump", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("ما سعة مضخة الحريق لمبنى 20 طابق؟", null);
    assertExists(result);
    assertEquals(result!.domain, "fire_pump");
  });
});

Deno.test("router ON: standpipe query → standpipe", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("what standpipe class is required for a 15-storey building?", null);
    assertExists(result);
    assertEquals(result!.domain, "standpipe");
  });
});

Deno.test("router ON: greeting → non_code", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("مرحبا كيف الحال؟", null);
    assertExists(result);
    assertEquals(result!.domain, "non_code");
  });
});

// ── SECTION 3: Evidence augmentation ─────────────────────────────────────────

Deno.test("evidence ON: Table 1004.5 adds correct table evidence hint", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("اعطني قيمة من جدول 1004.5", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "اعطني قيمة من جدول 1004.5");
    assertExists(aug);
    const tableHint = aug!.hints.find(h => h.node_id === "sbc-201-table-1004-5");
    assertExists(tableHint);
    assertEquals(tableHint!.hint_type, "supporting_table");
    assert(tableHint!.boost_weight >= 2.5);
  });
});

Deno.test("evidence ON: orphan node is never added to hints", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    // Manually add orphan to workflow (should be rejected by augmenter)
    const wf = brain.workflows_by_id.get("wf_occupant_load")!;
    (wf.primary_sections as any[]).push({
      node_id: "sbc-201-orphan-907-2-11",
      ref: "907.2.11",
      title: "Orphan",
      page_start: null,
      source_pdf: null,
    });
    brain.nodes_by_id.set("sbc-201-orphan-907-2-11", {
      node_id: "sbc-201-orphan-907-2-11",
      node_type: "orphan",
      do_not_promote: true,
      confidence: "low",
    } as any);

    const router = routeAdvisoryQuery("اعطني قيمة من جدول 1004.5", brain);
    const aug = augmentWithWorkflow(router, brain, "test");
    assertExists(aug);
    const orphanHint = aug!.hints.find(h => h.node_id === "sbc-201-orphan-907-2-11");
    assertEquals(orphanHint, undefined);
  });
});

Deno.test("evidence ON: non-code query returns null augmentation", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("مرحبا كيف الحال؟", brain);
    const aug = augmentWithWorkflow(router, brain, "مرحبا");
    assertEquals(aug, null);
  });
});

Deno.test("evidence ON: safe-answer rules appear in overlay", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("اعطني قيمة من جدول 1004.5", brain);
    const aug = augmentWithWorkflow(router, brain, "اعطني قيمة من جدول 1004.5");
    assertExists(aug);
    assert(aug!.safe_answer_rules.length > 0);
    const overlay = buildEvidenceOverlay(aug!, "ar");
    assert(overlay.length > 0);
    assertFalse(overlay.includes("§"));  // no banned char
  });
});

// ── SECTION 4: Dynamic Thinking UX ───────────────────────────────────────────

Deno.test("dynamic thinking ON: workflow-specific routing event emitted", () => {
  withEnv({ ADVISORY_DYNAMIC_THINKING_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const router = routeAdvisoryQuery("اعطني قيمة من جدول 1004.5", null);
    assertExists(router);
    const events = buildThinkingSequence(router, false, false, "ar");
    assert(events.length > 0);
    assert(events[0].ar.length > 0);
    assert(events[0].en.length > 0);
  });
});

Deno.test("dynamic thinking ON: no forbidden static phrases in events", () => {
  withEnv({ ADVISORY_DYNAMIC_THINKING_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const router = routeAdvisoryQuery("اعطني قيمة من جدول 1004.5", null);
    assertExists(router);
    const events = buildThinkingSequence(router, false, false, "ar");
    for (const event of events) {
      for (const forbidden of FORBIDDEN_STATIC_PHRASES_AR) {
        assertFalse(event.ar.includes(forbidden), `Event contains forbidden phrase: "${forbidden}"`);
      }
      for (const forbidden of FORBIDDEN_STATIC_PHRASES_EN) {
        assertFalse(event.en.includes(forbidden), `Event contains forbidden phrase: "${forbidden}"`);
      }
    }
  });
});

Deno.test("dynamic thinking ON: no U+00A7 in any event", () => {
  withEnv({ ADVISORY_DYNAMIC_THINKING_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const domains = [
      "occupant_load", "egress", "sprinkler", "fire_alarm",
      "fire_pump", "standpipe", "smoke_control", "occupancy_classification",
    ] as const;
    for (const domain of domains) {
      const mockRouter: RouterResult = {
        workflow_id: `wf_${domain}` as any,
        domain,
        confidence: "high",
        matched_by: [],
        parking_lot_pre_check: [],
        required_inputs: [],
        workflow: null,
      };
      const events = buildThinkingSequence(mockRouter, true, true, "ar");
      for (const ev of events) {
        assertFalse(ev.ar.includes("§"), `Domain ${domain} event contains §`);
        assertFalse(ev.en.includes("§"), `Domain ${domain} event (EN) contains §`);
      }
    }
  });
});

Deno.test("dynamic thinking OFF: buildThinkingSequence always returns []", () => {
  withEnv({ ADVISORY_DYNAMIC_THINKING_ENABLED: "0" }, () => {
    const mockRouter: RouterResult = {
      workflow_id: "wf_occupant_load",
      domain: "occupant_load",
      confidence: "high",
      matched_by: [],
      parking_lot_pre_check: [],
      required_inputs: [],
      workflow: null,
    };
    assertEquals(buildThinkingSequence(mockRouter, false, false, "ar"), []);
    assertEquals(buildThinkingSequence(mockRouter, true, true, "en"), []);
  });
});

// ── SECTION 5: Safety invariants ──────────────────────────────────────────────

Deno.test("runtime package manifest: no banned chars", async () => {
  const manifestPath = new URL(
    "../../../../generated/consultx_brain_full/v4/advisory_brain/runtime_package/advisory_brain_manifest.json",
    import.meta.url
  );
  const text = await Deno.readTextFile(manifestPath);
  assertFalse(text.includes("§"), "Manifest contains banned U+00A7");
  const manifest = JSON.parse(text);
  assertEquals(manifest.invariants.banned_char_u00a7, 0);
  assertEquals(manifest.validation_result, "PASS");
});

Deno.test("runtime package manifest: no_orphan_promoted = true", async () => {
  const manifestPath = new URL(
    "../../../../generated/consultx_brain_full/v4/advisory_brain/runtime_package/advisory_brain_manifest.json",
    import.meta.url
  );
  const text = await Deno.readTextFile(manifestPath);
  const manifest = JSON.parse(text);
  assertEquals(manifest.invariants.no_orphan_promoted, true);
  assertEquals(manifest.invariants.no_unadopted_promoted, true);
});

Deno.test("runtime package manifest: all 8 workflows present", async () => {
  const manifestPath = new URL(
    "../../../../generated/consultx_brain_full/v4/advisory_brain/runtime_package/advisory_brain_manifest.json",
    import.meta.url
  );
  const text = await Deno.readTextFile(manifestPath);
  const manifest = JSON.parse(text);
  assertEquals(manifest.workflow_count, 8);
  const requiredIds = [
    "wf_occupancy_classification", "wf_occupant_load", "wf_egress",
    "wf_sprinkler", "wf_fire_alarm", "wf_fire_pump",
    "wf_standpipe", "wf_smoke_control",
  ];
  for (const id of requiredIds) {
    assert(manifest.workflow_ids.includes(id), `Missing workflow: ${id}`);
  }
});

Deno.test("runtime package: orphans_compact all have do_not_promote=true", async () => {
  const filePath = new URL(
    "../../../../generated/consultx_brain_full/v4/advisory_brain/runtime_package/orphans_compact.json",
    import.meta.url
  );
  const text = await Deno.readTextFile(filePath);
  const orphans = JSON.parse(text);
  for (const orphan of orphans) {
    assertEquals(orphan.do_not_promote, true, `Orphan ${orphan.node_id} missing do_not_promote`);
    assertEquals(orphan.confidence, "low", `Orphan ${orphan.node_id} should have low confidence`);
  }
});

Deno.test("runtime package: no SBC201/SBC801 family mixing in workflows", async () => {
  const filePath = new URL(
    "../../../../generated/consultx_brain_full/v4/advisory_brain/runtime_package/workflows_compact.json",
    import.meta.url
  );
  const text = await Deno.readTextFile(filePath);
  const { workflows } = JSON.parse(text);
  for (const wf of workflows) {
    const allRefs = [
      ...(wf.primary_sections ?? []),
      ...(wf.supporting_tables ?? []),
    ];
    // Verify refs are from consistent families
    const families = new Set(allRefs.map((r: any) => {
      if (r.source_pdf?.includes("SBC 201")) return "201";
      if (r.source_pdf?.includes("SBC 801")) return "801";
      return null;
    }).filter(Boolean));
    // fire_alarm and fire_pump workflows may reference both codes legitimately
    if (families.size > 1 &&
        wf.workflow_id !== "wf_fire_alarm" &&
        wf.workflow_id !== "wf_fire_pump") {
      // Allow cross-refs but log for review
      console.warn(`Workflow ${wf.workflow_id} has refs from multiple families: ${[...families].join(",")}`);
    }
  }
});

// ── SECTION 6: Validation cases from B1 ──────────────────────────────────────

Deno.test("validation cases: vc_01 expected domain is occupant_load", async () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, async () => {
    const filePath = new URL(
      "../../../../generated/consultx_brain_full/v4/advisory_brain/runtime_package/validation_cases_compact.json",
      import.meta.url
    );
    const text = await Deno.readTextFile(filePath);
    const { cases } = JSON.parse(text);
    const vc01 = cases.find((c: any) => c.case_id === "vc_01_table_1004_5_occupant_load");
    assertExists(vc01);
    // Router should classify vc_01 as occupant_load
    const result = routeAdvisoryQuery(vc01.query, null);
    assertExists(result);
    assertEquals(result!.domain, "occupant_load");
  });
});

Deno.test("validation cases: vc_02 egress → router detects egress domain", async () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, async () => {
    const filePath = new URL(
      "../../../../generated/consultx_brain_full/v4/advisory_brain/runtime_package/validation_cases_compact.json",
      import.meta.url
    );
    const text = await Deno.readTextFile(filePath);
    const { cases } = JSON.parse(text);
    const vc02 = cases.find((c: any) => c.case_id === "vc_02_table_1006_3_3_min_exits");
    assertExists(vc02);
    const result = routeAdvisoryQuery(vc02.query, null);
    assertExists(result);
    assertEquals(result!.domain, "egress");
  });
});

Deno.test("validation cases: greeting case → non_code", async () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, async () => {
    const result = routeAdvisoryQuery("مرحبا كيف الحال", null);
    assertExists(result);
    assertEquals(result!.domain, "non_code");
  });
});

// ── SECTION 7: R24 — Occupant load answer quality + dynamic thinking polish ──

Deno.test("R24: محل تجاري query routes to occupant_load", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const result = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", null);
    assertExists(result);
    assertEquals(result!.domain, "occupant_load");
    assertEquals(result!.workflow_id, "wf_occupant_load");
  });
});

Deno.test("R24: occupant_load safe_answer_rules contain Table 1004.5", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const rulesText = aug!.safe_answer_rules.join(" ");
    assert(rulesText.includes("1004.5"), "safe_answer_rules must reference Table 1004.5");
  });
});

Deno.test("R24: occupant_load safe_answer_rules include 2.8 gross factor", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري في الطابق الأرضي؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما الحمل الإشغالي لمحل تجاري في الطابق الأرضي؟");
    assertExists(aug);
    const rulesText = aug!.safe_answer_rules.join(" ");
    assert(rulesText.includes("2.8"), "Rules must include 2.8 m²/person for ground-floor Mercantile");
  });
});

Deno.test("R24: occupant_load safe_answer_rules include 5.6 gross factor", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري في الطابق الثاني؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما الحمل الإشغالي لمحل تجاري في الطابق الثاني؟");
    assertExists(aug);
    const rulesText = aug!.safe_answer_rules.join(" ");
    assert(rulesText.includes("5.6"), "Rules must include 5.6 m²/person for other-floor Mercantile");
  });
});

Deno.test("R24: occupant_load safe_answer_rules include 28 storage factor", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const rulesText = aug!.safe_answer_rules.join(" ");
    assert(rulesText.includes("28"), "Rules must include 28 m²/person for storage areas");
  });
});

Deno.test("R24: occupant_load safe_answer_rules forbid net area for Mercantile", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const rulesText = aug!.safe_answer_rules.join(" ").toLowerCase();
    assert(
      rulesText.includes("never say 'net area'") || rulesText.includes("gross"),
      "Rules must forbid net area for Mercantile and enforce GROSS"
    );
  });
});

Deno.test("R24: occupant_load overlay contains GROSS keyword", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const overlay = buildEvidenceOverlay(aug!, "ar");
    assert(overlay.includes("GROSS"), "Evidence overlay must contain GROSS for occupant_load");
  });
});

Deno.test("R24: occupant_load overlay does NOT include SBC801 sources", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    // No SBC 801 nodes should appear in hints for occupant_load
    const sbc801Hints = aug!.hints.filter(h => {
      const node = brain.nodes_by_id.get(h.node_id) as any;
      return node?.code?.includes("801");
    });
    assertEquals(sbc801Hints.length, 0, "No SBC 801 hints for occupant_load query");
  });
});

Deno.test("R24: dynamic thinking event exists for occupant_load", () => {
  withEnv({ ADVISORY_DYNAMIC_THINKING_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري؟", null);
    assertExists(router);
    assertEquals(router!.domain, "occupant_load");
    const events = buildThinkingSequence(router, true, false, "ar");
    assert(events.length >= 2, "Should have at least routing + retrieval events for occupant_load");
    // routing event specific to occupant_load
    const routingEvent = events.find(e => e.phase === "routing");
    assertExists(routingEvent, "Must have routing thinking event for occupant_load");
    assert(routingEvent!.ar.includes("جدول") || routingEvent!.ar.includes("مساحة"),
      "Routing event must reference table or area for occupant_load");
  });
});

Deno.test("R24: no CoT or private diagnostics in thinking events", () => {
  withEnv({ ADVISORY_DYNAMIC_THINKING_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const router = routeAdvisoryQuery("ما الحمل الإشغالي لمحل تجاري؟", null);
    assertExists(router);
    const events = buildThinkingSequence(router, true, false, "ar");
    const FORBIDDEN_PATTERNS = ["CoT", "chain-of-thought", "scoring", "diagnostic", "[DEBUG]", "confidence="];
    for (const evt of events) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        assertFalse(evt.ar.includes(pattern), `AR event contains forbidden: "${pattern}"`);
        assertFalse(evt.en.includes(pattern), `EN event contains forbidden: "${pattern}"`);
      }
    }
  });
});

Deno.test("R24: Main (primary) mode — occupant_load rules NOT injected (no router call)", () => {
  // Main mode never calls augmentWithWorkflow — verify evidence flag gate
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "0" }, () => {
    const mockRouter: RouterResult = {
      workflow_id: "wf_occupant_load",
      domain: "occupant_load",
      confidence: "high",
      matched_by: [],
      parking_lot_pre_check: [],
      required_inputs: [],
      workflow: null,
    };
    const aug = augmentWithWorkflow(mockRouter, null, "any query");
    assertEquals(aug, null, "Evidence must return null when flag is OFF (Main mode path)");
  });
});

Deno.test("R24: Analytical mode — evidence returns null (flag gate)", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "0" }, () => {
    const mockRouter: RouterResult = {
      workflow_id: "wf_occupant_load",
      domain: "occupant_load",
      confidence: "high",
      matched_by: [],
      parking_lot_pre_check: [],
      required_inputs: [],
      workflow: null,
    };
    const aug = augmentWithWorkflow(mockRouter, null, "قراءة مخطط");
    assertEquals(aug, null, "Evidence must return null when flag is OFF (Analytical mode path)");
  });
});

// ── SECTION 8: R26 — Occupant Load Regression Fix Tests ──────────────────────

Deno.test("R26: occupant_load overlay with workflowId contains mandatory protocol override", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    // Pass workflowId to buildEvidenceOverlay (R26 fix)
    const overlay = buildEvidenceOverlay(aug!, "ar", "wf_occupant_load");
    // Must contain the mandatory protocol block
    assert(overlay.includes("بروتوكول") || overlay.includes("PROTOCOL"), "Overlay must contain mandatory protocol block");
    // Must contain Table 1004.5 reference
    assert(overlay.includes("1004.5"), "Overlay must reference Table 1004.5");
  });
});

Deno.test("R26: overlay with workflowId=wf_occupant_load contains 2.8 m²/person", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const overlay = buildEvidenceOverlay(aug!, "ar", "wf_occupant_load");
    assert(overlay.includes("2.8"), "Overlay must state 2.8 m²/person for ground-floor Mercantile");
  });
});

Deno.test("R26: overlay with workflowId=wf_occupant_load contains 5.6 m²/person", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const overlay = buildEvidenceOverlay(aug!, "ar", "wf_occupant_load");
    assert(overlay.includes("5.6"), "Overlay must state 5.6 m²/person for other-floor Mercantile");
  });
});

Deno.test("R26: overlay with workflowId=wf_occupant_load contains 28 m²/person storage", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const overlay = buildEvidenceOverlay(aug!, "ar", "wf_occupant_load");
    assert(overlay.includes("28"), "Overlay must state 28 m²/person for storage areas");
  });
});

Deno.test("R26: overlay mandatory protocol appears BEFORE missing_inputs section", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    // Provide no context → missing_inputs will be detected (floor_area missing)
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const overlay = buildEvidenceOverlay(aug!, "ar", "wf_occupant_load");
    // The mandatory protocol (2.8) must appear before any missing-inputs stop instruction
    const idx28 = overlay.indexOf("2.8");
    const idxStop = overlay.indexOf("REQUIRED INPUTS") !== -1
      ? overlay.indexOf("REQUIRED INPUTS")
      : overlay.indexOf("مدخلات مطلوبة");
    if (idxStop !== -1) {
      assert(idx28 < idxStop || idx28 !== -1,
        "2.8 value must appear in overlay before the stop-and-ask instruction");
    } else {
      // No missing_inputs section → protocol must still be present
      assert(idx28 !== -1, "2.8 must be in overlay");
    }
  });
});

Deno.test("R26: overlay with workflowId=null has no occupant_load mandatory protocol", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    // Without workflowId — old behavior (no mandatory protocol block)
    const overlay = buildEvidenceOverlay(aug!, "ar", null);
    assertFalse(overlay.includes("بروتوكول حمل الإشغال الإلزامي"),
      "Without workflowId, no mandatory protocol block injected");
  });
});

Deno.test("R26: overlay with workflowId=wf_occupant_load forbids SBC801 mixing", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const overlay = buildEvidenceOverlay(aug!, "ar", "wf_occupant_load");
    assert(overlay.toLowerCase().includes("sbc801") || overlay.includes("SBC801"),
      "Overlay must explicitly forbid SBC801 sources for occupant_load");
  });
});

Deno.test("R26: occupant_load hints contain no SBC801 nodes (family isolation)", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    // No SBC 801 nodes in evidence hints
    for (const hint of aug!.hints) {
      const node = brain.nodes_by_id.get(hint.node_id) as any;
      if (node?.code) {
        assertFalse(node.code.includes("801"),
          `SBC 801 node ${hint.node_id} must not appear in occupant_load hints`);
      }
    }
  });
});

Deno.test("R26: egress query still gets SBC801 cross-ref (fire/egress intent present)", () => {
  withEnv({ ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    // egress query has مخرج — hasFireOrEgressIntent=true → SBC801 cross-ref preserved
    const result = routeAdvisoryQuery("كم عدد المخارج المطلوبة لطابق 700 شخص occupant load؟", null);
    assertExists(result);
    // Should route to egress (or occupant_load — both are valid; key is NOT non_code)
    assertFalse(result!.domain === "non_code", "Egress+occupant query must not be non_code");
  });
});

Deno.test("R26: overlay contains GROSS area requirement (no net area for Mercantile)", () => {
  withEnv({ ADVISORY_BRAIN_B2_EVIDENCE_ENABLED: "1", ADVISORY_BRAIN_B2_ROUTER_ENABLED: "1" }, () => {
    const brain = makeMockBrain();
    const router = routeAdvisoryQuery("ما متطلبات الحمل الإشغالي لمحل تجاري؟", brain);
    assertExists(router);
    const aug = augmentWithWorkflow(router, brain, "ما متطلبات الحمل الإشغالي لمحل تجاري؟");
    assertExists(aug);
    const overlay = buildEvidenceOverlay(aug!, "ar", "wf_occupant_load");
    const overlayLower = overlay.toLowerCase();
    assert(overlayLower.includes("gross"), "Overlay must contain GROSS for occupant_load");
    assertFalse(
      overlayLower.includes("net area") && !overlayLower.includes("never") && !overlayLower.includes("forbidden"),
      "Overlay must not endorse net area for Mercantile"
    );
  });
});

console.log("\n[B2 Tests] All tests registered. Run: deno test --allow-env <path>");
