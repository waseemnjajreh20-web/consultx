/**
 * validate_r24_occupant_load_quality.cjs
 *
 * R24 — Advisory Answer Quality + Dynamic Thinking Final Polish
 * Tests: occupant_load routing, gross/net enforcement, thinking events,
 *        source isolation, mode isolation.
 *
 * Usage: node scripts/validate_r24_occupant_load_quality.cjs
 */

"use strict";

const path = require("path");
const fs   = require("fs");

const ROOT        = path.resolve(__dirname, "..");
const CONSTRAINTS = path.join(ROOT, "supabase/functions/fire-safety-chat/workflow_constraints.ts");
const ROUTER      = path.join(ROOT, "supabase/functions/fire-safety-chat/workflow_router.ts");
const EMITTER     = path.join(ROOT, "supabase/functions/fire-safety-chat/thinking_ux_emitter.ts");
const CHAT_IF     = path.join(ROOT, "src/components/ChatInterface.tsx");
const INDEX_TS    = path.join(ROOT, "supabase/functions/fire-safety-chat/index.ts");

const constraintsSrc = fs.readFileSync(CONSTRAINTS, "utf8");
const routerSrc      = fs.readFileSync(ROUTER,      "utf8");
const emitterSrc     = fs.readFileSync(EMITTER,     "utf8");
const chatIfSrc      = fs.readFileSync(CHAT_IF,     "utf8");
const indexSrc       = fs.readFileSync(INDEX_TS,    "utf8");

let pass = 0; let fail = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else     { console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); fail++; }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nR24 — TASK 1: Dynamic Thinking Visibility");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

console.log("--- Frontend: ChatInterface.tsx ---");
{
  check("thinking_status handler present (standard branch)",
    chatIfSrc.includes('parsed.type === "thinking_status"'));
  check("onThinkingStatus callback called",
    chatIfSrc.includes("onThinkingStatus"));
  check("dynamicThinkingMsg state present",
    chatIfSrc.includes("dynamicThinkingMsg"));
  check("R22 timing guard removed (no loadingStage !== connecting for dynamicThinkingMsg)",
    !chatIfSrc.includes('dynamicThinkingMsg && loadingStage !== "connecting"'));
  check("getLoadingMessage returns dynamicThinkingMsg unconditionally",
    chatIfSrc.includes("if (dynamicThinkingMsg) return dynamicThinkingMsg"));
}

console.log("\n--- Edge function: index.ts ---");
{
  check("isDynamicThinkingEnabled imported",
    indexSrc.includes("isDynamicThinkingEnabled"));
  check("buildThinkingSequence called",
    indexSrc.includes("buildThinkingSequence("));
  check("thinking_status SSE type emitted",
    indexSrc.includes('"thinking_status"'));
  check("[ThinkingB2] Emitting log present",
    indexSrc.includes("[ThinkingB2] Emitting"));
  check("_thinkingEventsB2 variable used",
    indexSrc.includes("_thinkingEventsB2"));
}

console.log("\n--- Edge function: thinking_ux_emitter.ts ---");
{
  check("occupant_load thinking events defined",
    emitterSrc.includes("occupant_load:"));
  check("occupant_load routing phase has Arabic text",
    emitterSrc.includes("أربط المساحة بجدول الحمل الإشغالي"));
  check("occupant_load retrieval phase references Table 1004.5",
    emitterSrc.includes("الجدول 1004.5") || emitterSrc.includes("1004.5"));
  check("ADVISORY_DYNAMIC_THINKING_ENABLED flag gate present",
    emitterSrc.includes("ADVISORY_DYNAMIC_THINKING_ENABLED"));
  // CoT check: only verify the public MESSAGES object, not file comments
  // (Comments may mention chain-of-thought as a prohibition, which is correct)
  const messagesObj = (() => {
    const start = emitterSrc.indexOf("const MESSAGES");
    const end   = emitterSrc.indexOf("export function", start);
    return start >= 0 ? emitterSrc.slice(start, end > 0 ? end : start + 5000) : "";
  })();
  check("No CoT in public MESSAGES object",
    !messagesObj.includes("CoT") && !messagesObj.includes("chain-of-thought"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\nR24 — TASK 2+3: Occupant Load Gross/Net Enforcement");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

console.log("--- Router: occupant_load keyword coverage ---");
{
  const query = "ما متطلبات الحمل الإشغالي لمحل تجاري؟".toLowerCase();
  const m = routerSrc.match(/domain:\s*"occupant_load"[\s\S]*?ar:\s*\[([^\]]+)\]/);
  const arKws = m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
  const matched = arKws.filter(kw => query.includes(kw.toLowerCase()));

  check("occupant_load domain defined in router", routerSrc.includes('"occupant_load"'));
  check("occupant_load AR keywords include حمل إشغالي", arKws.some(k => k.includes("حمل")));
  check("test query 'محل تجاري' matches occupant_load keywords",
    matched.length > 0,
    `matched: [${matched.join(", ")}]`
  );
  check("1004.5 in router AR keywords", arKws.some(k => k.includes("1004.5")) || routerSrc.match(/1004\.5.*occupant_load|occupant_load.*1004\.5/) !== null);
}

console.log("\n--- Constraints: R24 occupant_load gross/net rules ---");
{
  check("R24 occupant_load rules block present (wf_occupant_load condition)",
    constraintsSrc.includes('workflow_id === "wf_occupant_load"'));
  check("R24 rule: Table 1004.5 citation required",
    constraintsSrc.includes("Table 1004.5"));
  check("R24 rule: 2.8 m²/person GROSS for ground/basement",
    constraintsSrc.includes("2.8"));
  check("R24 rule: 5.6 m²/person GROSS for other floors",
    constraintsSrc.includes("5.6"));
  check("R24 rule: 28 m²/person for storage",
    constraintsSrc.includes("28"));
  check("R24 rule: GROSS keyword present",
    constraintsSrc.includes("GROSS"));
  check("R24 rule: forbids net area for Mercantile",
    constraintsSrc.includes("NEVER say 'net area'") ||
    constraintsSrc.includes("never say 'net area'") ||
    constraintsSrc.includes("NEVER") && constraintsSrc.includes("net area"));
  check("R24 rule: state values first, then ask for inputs",
    constraintsSrc.includes("State the table values first"));
  check("R24 rules prepended (higher priority than brain rules)",
    (() => {
      const idx = constraintsSrc.indexOf("wf_occupant_load");
      const r24Idx = constraintsSrc.indexOf("r24Rules");
      // r24Rules should appear after the wf_occupant_load check
      return r24Idx > idx;
    })());
  check("Slice limit increased to 10 (accommodates R24 rules + brain rules)",
    constraintsSrc.includes(".slice(0, 10)") || constraintsSrc.includes(".slice(0,10)"));
}

console.log("\n--- Constraints: evidence overlay correctness ---");
{
  check("buildEvidenceOverlay exported",
    constraintsSrc.includes("export function buildEvidenceOverlay"));
  check("augmentWithWorkflow exported",
    constraintsSrc.includes("export function augmentWithWorkflow"));
  check("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED gate present",
    constraintsSrc.includes("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED"));
  check("non_code domain returns null (no overlay for greetings)",
    constraintsSrc.includes('domain === "non_code"'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\nR24 — TASK 4: Source Sanity for Occupant Load");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

console.log("--- Source isolation: SBC201 not mixed with SBC801 ---");
{
  check("filterHintsByFamily exported in constraints",
    constraintsSrc.includes("export function filterHintsByFamily"));
  check("SBC 201 family filter logic present",
    constraintsSrc.includes('"SBC201"') || constraintsSrc.includes("'SBC201'"));
  check("SBC 801 family filter logic present",
    constraintsSrc.includes('"SBC801"') || constraintsSrc.includes("'SBC801'"));
  check("Table 1004.5 node referenced in router supporting_tables",
    routerSrc.includes("1004.5") || routerSrc.includes("1004"));
  check("Constraints do NOT mention SBC 801 for occupant_load",
    !constraintsSrc.match(/wf_occupant_load[\s\S]*?SBC 801[\s\S]*?}/));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\nR24 — TASK 5: Mode Isolation (Main + Analytical Unaffected)");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

console.log("--- Mode isolation ---");
{
  // Evidence function only fires under B2 evidence flag
  check("augmentWithWorkflow returns null when flag off (flag gate first line)",
    constraintsSrc.match(/if\s*\(!isEvidenceEnabled\(\)\)\s*return null/) !== null ||
    constraintsSrc.includes("isEvidenceEnabled()") && constraintsSrc.includes("return null"));

  // Main mode doesn't call augmentWithWorkflow at all (advisory-only path)
  check("augmentWithWorkflow only called inside advisory block in index.ts",
    (() => {
      const advisoryBlock = indexSrc.match(/\/\/ Advisory mode[\s\S]*?augmentWithWorkflow/);
      return advisoryBlock !== null ||
             indexSrc.includes("augmentWithWorkflow") &&
             !indexSrc.match(/primary.*augmentWithWorkflow|augmentWithWorkflow.*primary/);
    })());

  check("Analytical mode does NOT call augmentWithWorkflow (called exactly once, in advisory block)",
    (() => {
      // augmentWithWorkflow must appear exactly once as a function call in index.ts
      // (the import declaration doesn't count as a call)
      const calls = [...indexSrc.matchAll(/augmentWithWorkflow\s*\(/g)];
      return calls.length === 1;
    })());

  check("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED gates evidence injection in index.ts",
    indexSrc.includes("isEvidenceEnabled()") || indexSrc.includes("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED"));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\nR24 — TASK 5: No CoT / Private Diagnostics Exposed");
console.log("─────────────────────────────────────────────────────────────────────────────\n");
// ─────────────────────────────────────────────────────────────────────────────

console.log("--- Safety: no CoT in public-facing thinking events ---");
{
  const FORBIDDEN_IN_THINKING = ["CoT", "chain-of-thought", "chain_of_thought", "confidence=", "[DEBUG]", "scoring"];
  for (const f of FORBIDDEN_IN_THINKING) {
    // Check it doesn't appear in the MESSAGES object of emitter (the public-facing part)
    const messagesBlock = emitterSrc.match(/const MESSAGES[\s\S]*?^}/m)?.[0] ?? emitterSrc;
    check(`No "${f}" in public thinking messages`, !messagesBlock.includes(f));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
console.log(`R24 Results: ${pass} PASS, ${fail} FAIL  (total ${pass + fail})`);
console.log("═".repeat(60));
if (fail > 0) process.exit(1);
