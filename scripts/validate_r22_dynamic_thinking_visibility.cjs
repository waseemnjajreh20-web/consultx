/**
 * validate_r22_dynamic_thinking_visibility.cjs
 *
 * R22 — Dynamic Thinking Visibility Tests
 * Tests: backend emission for occupant_load, flag gate, frontend parser,
 *        state lifecycle, mode isolation.
 *
 * Usage: node scripts/validate_r22_dynamic_thinking_visibility.cjs
 */

"use strict";

const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const THINKING_EMITTER = path.join(ROOT, "supabase/functions/fire-safety-chat/thinking_ux_emitter.ts");
const WORKFLOW_ROUTER = path.join(ROOT, "supabase/functions/fire-safety-chat/workflow_router.ts");
const CHAT_INTERFACE = path.join(ROOT, "src/components/ChatInterface.tsx");

const emitterSrc = fs.readFileSync(THINKING_EMITTER, "utf8");
const routerSrc = fs.readFileSync(WORKFLOW_ROUTER, "utf8");
const frontendSrc = fs.readFileSync(CHAT_INTERFACE, "utf8");

let pass = 0; let fail = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else     { console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); fail++; }
}

console.log("\nR22 Dynamic Thinking Visibility Tests\n");

// ── 1. Backend: occupant_load router keywords ─────────────────────────────────
console.log("--- Backend: router keyword coverage ---");
{
  const query = "ما متطلبات الحمل الإشغالي لمحل تجاري؟".toLowerCase();
  // Extract AR keywords for occupant_load
  const m = routerSrc.match(/domain:\s*"occupant_load"[\s\S]*?ar:\s*\[([^\]]+)\]/);
  const arKws = m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
  const matched = arKws.filter(kw => query.includes(kw.toLowerCase()));
  check(
    "occupant_load AR keyword matches test query",
    matched.length > 0,
    `matched: [${matched.join(", ")}]`
  );
  check("occupant_load has 'حمل الإشغال' keyword", arKws.some(k => k === "حمل الإشغال"));
  check("'حمل الإشغال' is substring of 'الحمل الإشغالي'", "الحمل الإشغالي".includes("حمل الإشغال"));
}

// ── 2. Backend: flag ON builds events ─────────────────────────────────────────
console.log("\n--- Backend: flag gate ---");
{
  // Simulate buildThinkingSequence when flag ON (non-empty domain)
  const occupantMsgs = emitterSrc.match(/occupant_load:\s*\{([\s\S]*?)\n  \}/);
  const hasRouting = occupantMsgs && occupantMsgs[1].includes("routing");
  const hasRetrieval = occupantMsgs && occupantMsgs[1].includes("retrieval");
  const hasComposition = occupantMsgs && occupantMsgs[1].includes("composition");
  check("occupant_load has routing phase", !!hasRouting);
  check("occupant_load has retrieval phase", !!hasRetrieval);
  check("occupant_load has composition phase", !!hasComposition);

  // Flag OFF path: buildThinkingSequence returns [] when flag OFF
  const flagOffGuard = emitterSrc.includes("if (!isDynamicThinkingEnabled()) return []");
  check("buildThinkingSequence returns [] when flag OFF", flagOffGuard);
}

// ── 3. Backend: SSE frame format ─────────────────────────────────────────────
console.log("\n--- Backend: SSE frame format ---");
{
  const hasTypeField = emitterSrc.includes('"thinking_status"') ||
    fs.readFileSync(path.join(ROOT, "supabase/functions/fire-safety-chat/index.ts"), "utf8")
      .includes('type: "thinking_status"');
  check("edge function emits type=thinking_status", hasTypeField);

  const indexSrc = fs.readFileSync(path.join(ROOT, "supabase/functions/fire-safety-chat/index.ts"), "utf8");
  check("SSE frame uses data: prefix", indexSrc.includes('enc.encode(`data: ${payload}\\n\\n`)'));
  check("thinking chunks prepended via combinedStream", indexSrc.includes("combinedStream"));
  check("Emitting log fires after chunks built", indexSrc.includes("[ThinkingB2] Emitting"));
}

// ── 4. Frontend: thinking_status handler present ──────────────────────────────
console.log("\n--- Frontend: thinking_status handler ---");
{
  check(
    "streamChat checks parsed.type === 'thinking_status'",
    frontendSrc.includes('parsed.type === "thinking_status"')
  );
  check(
    "handler calls onThinkingStatus(parsed.message)",
    frontendSrc.includes("onThinkingStatus?.(parsed.message)")
  );
  check(
    "onThinkingStatus declared in streamChat params",
    frontendSrc.includes("onThinkingStatus?: (msg: string) => void")
  );
}

// ── 5. Frontend: dynamicThinkingMsg state and display ─────────────────────────
console.log("\n--- Frontend: state and display ---");
{
  check(
    "dynamicThinkingMsg state exists",
    frontendSrc.includes('useState<string>("")') &&
    frontendSrc.includes("dynamicThinkingMsg")
  );
  check(
    "setDynamicThinkingMsg wired to onThinkingStatus",
    frontendSrc.includes("onThinkingStatus: (msg) => setDynamicThinkingMsg(msg)")
  );
  check(
    "getLoadingMessage returns dynamicThinkingMsg when set",
    frontendSrc.includes("if (dynamicThinkingMsg) return dynamicThinkingMsg")
  );
  check(
    "guard no longer suppresses during 'connecting' stage",
    !frontendSrc.includes("dynamicThinkingMsg && loadingStage !== \"connecting\"")
  );
  check(
    "dynamicThinkingMsg shown in loading span",
    frontendSrc.includes("key={dynamicThinkingMsg || loadingStage}")
  );
}

// ── 6. Frontend: stopLoading clears dynamicThinkingMsg ───────────────────────
console.log("\n--- Frontend: lifecycle ---");
{
  // stopLoading() contains setDynamicThinkingMsg("")
  const stopLoadingBlock = frontendSrc.match(/const stopLoading = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\)/);
  check(
    "stopLoading clears dynamicThinkingMsg",
    !!stopLoadingBlock && stopLoadingBlock[1].includes('setDynamicThinkingMsg("")')
  );
}

// ── 7. Safety: no CoT/diagnostics in messages ─────────────────────────────────
console.log("\n--- Safety ---");
{
  const FORBIDDEN_PATTERNS = [
    "score", "confidence", "chain-of-thought", "CoT",
    "probability", "logprob", "vector", "embedding",
    "§", "debug", "diagnostic"
  ];
  const allMsgs = [...emitterSrc.matchAll(/(?:ar|en):\s*"([^"]+)"/g)].map(m => m[1]);
  const violations = allMsgs.filter(m =>
    FORBIDDEN_PATTERNS.some(p => m.toLowerCase().includes(p.toLowerCase()))
  );
  check(
    "no CoT/scoring/diagnostics in any MESSAGES entry",
    violations.length === 0,
    violations.length > 0 ? `violations: ${violations.join(", ")}` : ""
  );
  check(
    "no U+00A7 § in any MESSAGES entry",
    allMsgs.every(m => !m.includes("§"))
  );
}

// ── 8. Mode isolation ─────────────────────────────────────────────────────────
console.log("\n--- Mode isolation ---");
{
  const indexSrc = fs.readFileSync(path.join(ROOT, "supabase/functions/fire-safety-chat/index.ts"), "utf8");
  // B2 thinking code is only inside the standard mode block
  const advisoryBlock = indexSrc.match(/isDynamicThinkingEnabled\(\) && _routerResultB2/);
  check("dynamic thinking guarded by isDynamicThinkingEnabled()", !!advisoryBlock);
  check(
    "thinking events declared at outer scope (accessible to SSE block)",
    indexSrc.match(/let _thinkingEventsB2: ThinkingEvent\[\] = \[\];/) !== null
  );
  // Main/Analytical don't go through the advisory text pipeline
  check(
    "Main mode bypasses advisory B2 block (else-if primary branch)",
    indexSrc.includes('else if (mode === "primary")')
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${pass} PASS, ${fail} FAIL`);
if (fail === 0) console.log("ALL TESTS PASS");
else { console.error(`${fail} TEST(S) FAILED`); process.exit(1); }
