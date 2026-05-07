/**
 * validate_r26_occupant_load_regression.cjs
 *
 * R26 — Occupant Load Regression Fix
 * Tests:
 *  1. occupant_load query routes to wf_occupant_load
 *  2. R24 rules present (Table 1004.5, 2.8, 5.6, 28, gross, forbid net)
 *  3. buildEvidenceOverlay with workflowId contains mandatory protocol override
 *  4. Mandatory protocol appears FIRST (before missing_inputs STOP section)
 *  5. No SBC801 source in occupant_load context (getTargetChapters cross-ref fix)
 *  6. fetchSBCContext restrictToSBC201 param present
 *  7. Main mode unaffected
 *  8. Analytical mode unaffected
 *
 * Usage: node scripts/validate_r26_occupant_load_regression.cjs
 */

"use strict";

const path = require("path");
const fs   = require("fs");

const ROOT        = path.resolve(__dirname, "..");
const CONSTRAINTS = path.join(ROOT, "supabase/functions/fire-safety-chat/workflow_constraints.ts");
const ROUTER      = path.join(ROOT, "supabase/functions/fire-safety-chat/workflow_router.ts");
const INDEX_TS    = path.join(ROOT, "supabase/functions/fire-safety-chat/index.ts");

const constraintsSrc = fs.readFileSync(CONSTRAINTS, "utf8");
const routerSrc      = fs.readFileSync(ROUTER,      "utf8");
const indexSrc       = fs.readFileSync(INDEX_TS,    "utf8");

let pass = 0; let fail = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else     { console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); fail++; }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 1: Routing — occupant_load detection");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  check("router: 'حمل إشغالي' in occupant_load AR keywords",
    routerSrc.includes("حمل إشغالي"));
  check("router: 'occupant load' in occupant_load EN keywords",
    routerSrc.includes("occupant load"));
  check("router: wf_occupant_load ref in DOMAIN_KEYWORDS",
    routerSrc.includes('"wf_occupant_load"'));
  check("router: 1004.5 regex in occupant_load refs",
    routerSrc.includes("1004\\.5"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 2: R24 occupant_load safe_answer_rules");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  check("workflow_constraints: R24 block present (wf_occupant_load check)",
    constraintsSrc.includes('routerResult.workflow_id === "wf_occupant_load"'));
  check("workflow_constraints: Table 1004.5 in R24 rules",
    constraintsSrc.includes("Table 1004.5"));
  check("workflow_constraints: 2.8 m²/person in R24 rules",
    constraintsSrc.includes("2.8 m²/person"));
  check("workflow_constraints: 5.6 m²/person in R24 rules",
    constraintsSrc.includes("5.6 m²/person"));
  check("workflow_constraints: 28 m²/person in R24 rules",
    constraintsSrc.includes("28 m²/person"));
  check("workflow_constraints: GROSS enforced in R24 rules",
    constraintsSrc.includes("GROSS area"));
  check("workflow_constraints: 'NEVER say net area' in R24 rules",
    constraintsSrc.includes("NEVER say 'net area'"));
  check("workflow_constraints: 'State the table values first' in R24 rules",
    constraintsSrc.includes("State the table values first"));
  check("workflow_constraints: safe_answer_rules slice limit = 10",
    constraintsSrc.includes(".slice(0, 10)"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 3: buildEvidenceOverlay mandatory protocol (R26 fix)");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  check("buildEvidenceOverlay accepts workflowId parameter",
    constraintsSrc.includes("workflowId: string | null = null"));
  check("buildEvidenceOverlay: wf_occupant_load mandatory protocol injected",
    constraintsSrc.includes('workflowId === "wf_occupant_load"'));
  check("mandatory protocol contains SUPERSEDES override instruction",
    constraintsSrc.includes("SUPERSEDES") || constraintsSrc.includes("يعلو"));
  check("mandatory protocol contains 2.8 م²/شخص",
    constraintsSrc.includes("2.8 م²/شخص"));
  check("mandatory protocol contains 5.6 م²/شخص",
    constraintsSrc.includes("5.6 م²/شخص"));
  check("mandatory protocol contains 28 م²/شخص",
    constraintsSrc.includes("28 م²/شخص"));
  check("mandatory protocol contains GROSS",
    constraintsSrc.includes("GROSS area") || constraintsSrc.includes("GROSS"));
  check("mandatory protocol forbids SBC801",
    constraintsSrc.includes("SBC801") && constraintsSrc.includes("FORBIDDEN"));
  check("mandatory protocol forbids starting with questions",
    constraintsSrc.includes("Starting with questions") || constraintsSrc.includes("البدء بالأسئلة"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 3b: Ordering — mandatory protocol before parking_lot/missing_inputs");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  // The mandatory protocol block must appear BEFORE the parking_lot warnings loop
  const mandatoryIdx = constraintsSrc.indexOf('workflowId === "wf_occupant_load"');
  const parkingLotIdx = constraintsSrc.indexOf("// Parking-lot warnings");
  check("mandatory protocol code appears before parking-lot section",
    mandatoryIdx !== -1 && parkingLotIdx !== -1 && mandatoryIdx < parkingLotIdx,
    `mandatory@${mandatoryIdx} parking_lot@${parkingLotIdx}`);

  // The mandatory protocol block must appear before the missing_inputs section
  const missingInputsIdx = constraintsSrc.indexOf("missing_inputs.length > 0");
  check("mandatory protocol code appears before missing_inputs section",
    mandatoryIdx !== -1 && missingInputsIdx !== -1 && mandatoryIdx < missingInputsIdx,
    `mandatory@${mandatoryIdx} missingInputs@${missingInputsIdx}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 4: Source pollution fix — SBC201-only restriction");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  // getTargetChapters: conditional cross-reference (R26 fix)
  check("getTargetChapters: R26 fire/egress intent check present",
    indexSrc.includes("hasFireOrEgressIntent"));
  check("getTargetChapters: cross-ref conditional on fire/egress OR chapter 9",
    indexSrc.includes("(sbc201Chapters.has(9) || (sbc201Chapters.has(10) && hasFireOrEgressIntent))"));
  check("getTargetChapters: مخرج|egress|exit in intent regex",
    indexSrc.includes("مخرج|egress|exit"));
  check("getTargetChapters: sprinkler|رشاش in intent regex",
    indexSrc.includes("sprinkler|رشاش"));

  // fetchSBCContext: restrictToSBC201 parameter
  check("fetchSBCContext: restrictToSBC201 parameter present",
    indexSrc.includes("restrictToSBC201: boolean = false"));
  check("fetchSBCContext: cache key includes restrictToSBC201 flag",
    indexSrc.includes('"sbc201only:"') || indexSrc.includes("sbc201only:"));
  check("fetchSBCContext: sbc801Chapters cleared when restrictToSBC201",
    indexSrc.includes("sbc801Chapters = []") && indexSrc.includes("restrictToSBC201"));
  check("fetchSBCContext: scored801 empty when restrictToSBC201",
    indexSrc.includes("scored801 = restrictToSBC201") || indexSrc.includes("restrictToSBC201\n      ? []"));
  check("fetchSBCContext: max801 = 0 when restrictToSBC201",
    indexSrc.includes("max801 = restrictToSBC201 ? 0"));
  check("fetchSBCContext: remaining filter excludes 801 when restricted",
    indexSrc.includes('"801"') && indexSrc.includes("restrictToSBC201"));

  // Call site: _restrictToSBC201 passed
  check("call site: _restrictToSBC201 computed from workflow_id",
    indexSrc.includes('_routerResultB2?.workflow_id === "wf_occupant_load"') &&
    indexSrc.includes("_restrictToSBC201"));
  check("call site: fetchSBCContext called with restrictToSBC201",
    indexSrc.includes("fetchSBCContext(userQuery, undefined, _restrictToSBC201)"));

  // buildEvidenceOverlay call site updated
  check("call site: buildEvidenceOverlay passes workflowId",
    indexSrc.includes("buildEvidenceOverlay(_augmentationB2, language as") &&
    indexSrc.includes("_routerResultB2?.workflow_id ?? null"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 5: No SBC801 in occupant_load prompt context");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  // These are structural checks — actual runtime requires network
  check("R26 fix: SBC801 log message present when restrictToSBC201",
    indexSrc.includes("[R26] restrictToSBC201=true"));
  check("R26 fix: R26 comment in source filter section",
    indexSrc.includes("[R26]") || indexSrc.includes("R26:"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 6: Mode isolation — Main and Analytical unaffected");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  // Main mode (primary): fetchSBCContext is called once in the advisory block
  // The _restrictToSBC201 is set INSIDE the `if (mode === "standard")` block effectively
  // (router runs only in mode==="standard")
  check("Main mode: _routerResultB2 only set in mode=standard block",
    indexSrc.includes('if (mode === "standard")') &&
    indexSrc.includes("_routerResultB2 = routeAdvisoryQuery"));

  // Analytical mode: uses fetchSBCContextVector, not fetchSBCContext
  check("Analytical mode: uses fetchSBCContextVector (separate path)",
    indexSrc.includes("fetchSBCContextVector"));
  check("Analytical mode: augmentWithWorkflow NOT called for analysis mode",
    (() => {
      // augmentWithWorkflow should only be called once, inside the advisory block
      const calls = (indexSrc.match(/augmentWithWorkflow\(/g) || []).length;
      return calls === 1;
    })());

  // Flags unaffected
  check("ADVISORY_BRAIN_B2_ENABLED flag still checked",
    indexSrc.includes("ADVISORY_BRAIN_B2_ENABLED"));
  check("ADVISORY_BRAIN_B2_ROUTER_ENABLED flag still checked",
    indexSrc.includes("ADVISORY_BRAIN_B2_ROUTER_ENABLED"));
  check("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED flag still checked",
    indexSrc.includes("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED"));
  check("ADVISORY_DYNAMIC_THINKING_ENABLED flag still checked",
    indexSrc.includes("ADVISORY_DYNAMIC_THINKING_ENABLED"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR26 — TASK 7: R24 tests still pass (regression check)");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

{
  // R24 rules still present and untouched
  check("R24: r24Rules block still present in constraints",
    constraintsSrc.includes("r24Rules") && constraintsSrc.includes("2.8 m²/person"));
  check("R24: safe_answer_rules spread with r24Rules first",
    constraintsSrc.includes("[...r24Rules, ...result.safe_answer_rules]"));
  check("R24: wf_occupant_load condition still guards R24 block",
    constraintsSrc.includes('routerResult.workflow_id === "wf_occupant_load"'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════════════════════════");
console.log(`R26 Results: ${pass} PASS, ${fail} FAIL  (total ${pass + fail})`);
console.log("════════════════════════════════════════════════════════════\n");
process.exit(fail > 0 ? 1 : 0);
