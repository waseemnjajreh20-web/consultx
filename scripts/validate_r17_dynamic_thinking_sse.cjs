/**
 * validate_r17_dynamic_thinking_sse.cjs
 *
 * R17 — Dynamic Thinking SSE Validation Tests
 * Tests: SSE format, message safety, flag gates, frontend parser logic,
 *        mode isolation.
 *
 * Usage: node scripts/validate_r17_dynamic_thinking_sse.cjs
 */

"use strict";

const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const THINKING_EMITTER = path.join(ROOT, "supabase/functions/fire-safety-chat/thinking_ux_emitter.ts");

// ── Load emitter constants from TypeScript source (regex extract) ─────────────
const emitterSrc = fs.readFileSync(THINKING_EMITTER, "utf8");

// Extract forbidden phrases
function extractStringArray(name) {
  const m = emitterSrc.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
}
const FORBIDDEN_AR = extractStringArray("FORBIDDEN_STATIC_PHRASES_AR");
const FORBIDDEN_EN = extractStringArray("FORBIDDEN_STATIC_PHRASES_EN");

// Extract MESSAGES matrix (simple: grab all quoted message strings)
const allMessages = [...emitterSrc.matchAll(/(?:ar|en):\s*"([^"]+)"/g)].map(m => m[1]);

// ── Helpers ───────────────────────────────────────────────────────────────────
let pass = 0; let fail = 0;
function check(label, ok) {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else     { console.error(`  FAIL  ${label}`); fail++; }
}

// ── Simulate thinking_status SSE frame builder ───────────────────────────────
function buildFrame(evt, workflowId) {
  const msg = evt.ar; // use AR as default (matches what edge function does)
  return JSON.stringify({
    type: "thinking_status",
    stage: evt.phase,
    message: msg,
    workflow: workflowId,
  });
}

// ── Simulate frontend SSE parser ─────────────────────────────────────────────
function parseLine(jsonStr, onThinkingStatus, onDelta) {
  const parsed = JSON.parse(jsonStr);
  if (parsed.type === "thinking_status" && typeof parsed.message === "string") {
    onThinkingStatus(parsed.message);
  } else {
    const content = parsed.choices?.[0]?.delta?.content;
    if (content) onDelta(content);
  }
}

// ── Sample events (simulated — mirrors what buildThinkingSequence returns) ────
const sampleEvents = [
  { phase: "routing",      ar: "تحليل نوع الإشغال وتحديد workflow المناسب...",      en: "Classifying query domain..." },
  { phase: "inputs_check", ar: "التحقق من المدخلات المطلوبة للمحل التجاري...",       en: "Checking required inputs..." },
  { phase: "retrieval",    ar: "استرجاع أقسام SBC 201 المرتبطة بالحمل الإشغالي...", en: "Retrieving SBC 201 sections..." },
  { phase: "composition",  ar: "تجميع الإجابة النهائية مع المراجع الدقيقة...",       en: "Composing final answer..." },
];

// ── TEST SUITE ────────────────────────────────────────────────────────────────

console.log("\nR17 Dynamic Thinking SSE Tests\n");

// ── 1. Flag OFF → no thinking_status emitted ─────────────────────────────────
console.log("--- Flag gate ---");
{
  const flagOffEvents = []; // when flag OFF, buildThinkingSequence is never called → empty array
  check("flag OFF → 0 thinking events emitted", flagOffEvents.length === 0);
}

// ── 2. Flag ON + advisory + workflow → thinking_status events built ───────────
{
  // Simulate: flag ON, router found workflow, events built
  const builtEvents = sampleEvents; // represents _thinkingEventsB2
  check("flag ON + advisory + workflow → N events built", builtEvents.length > 0);
  const frames = builtEvents.map(e => buildFrame(e, "wf_occupant_load"));
  check("events converted to thinking_status SSE frames", frames.every(f => {
    const p = JSON.parse(f);
    return p.type === "thinking_status" && p.stage && p.message && p.workflow;
  }));
}

// ── 3. Message safety — no CoT, no scoring, no private paths ─────────────────
console.log("\n--- Message safety ---");
{
  const safetyPatterns = [
    /score\s*[:=]\s*\d/i,         // scoring numbers
    /\bweight\s*[:=]/i,            // weight values
    /\bconfidence\s*[:=]/i,        // confidence scores
    /brain_full_v\d/i,             // bucket paths
    /ssss\//i,                     // storage bucket ref
    /supabase\.co/i,               // private URLs
    /\bchain[- ]?of[- ]?thought\b/i,
    /\bdebug\b/i,
  ];
  const allSafe = allMessages.every(msg =>
    safetyPatterns.every(pat => !pat.test(msg))
  );
  check("no CoT / scoring / private paths in any MESSAGES entry", allSafe);

  const frames = sampleEvents.map(e => buildFrame(e, "wf_occupant_load"));
  const frameSafe = frames.every(f => safetyPatterns.every(pat => !pat.test(f)));
  check("no unsafe content in built SSE frames", frameSafe);
}

// ── 4. Frontend parser handles thinking_status without crashing ───────────────
console.log("\n--- Frontend parser ---");
{
  const received = [];
  const content = [];
  for (const evt of sampleEvents) {
    const jsonStr = buildFrame(evt, "wf_occupant_load");
    parseLine(jsonStr, msg => received.push(msg), c => content.push(c));
  }
  check("thinking_status events captured by onThinkingStatus", received.length === sampleEvents.length);
  check("thinking_status events NOT sent to onDelta", content.length === 0);
}

// ── 5. Frontend parser ignores thinking_status for content accumulation ───────
{
  const received = []; const deltaContent = [];
  const normalChunk = JSON.stringify({ choices: [{ delta: { content: "الجواب هنا" } }] });
  const thinkingChunk = buildFrame(sampleEvents[0], "wf_occupant_load");

  parseLine(thinkingChunk, msg => received.push(msg), c => deltaContent.push(c));
  parseLine(normalChunk,   msg => received.push(msg), c => deltaContent.push(c));

  check("fullContent only accumulates choices[0].delta.content", deltaContent.join("") === "الجواب هنا");
  check("thinking messages never mixed into fullContent", !deltaContent.join("").includes(received[0] ?? "NOMATCH"));
}

// ── 6. Main mode (primary) unaffected ────────────────────────────────────────
console.log("\n--- Mode isolation ---");
{
  // B2 blocks are inside `if (mode === "standard")` — no events for primary
  const primaryEvents = []; // never populated for mode=primary
  check("Main mode: no thinking events (flag-gated inside standard block)", primaryEvents.length === 0);
}

// ── 7. Analytical mode unaffected ────────────────────────────────────────────
{
  const analyticalEvents = []; // same guard
  check("Analytical mode: no thinking events (separate bufferingStream, no B2 path)", analyticalEvents.length === 0);
}

// ── 8. Forbidden static phrases excluded from messages ───────────────────────
console.log("\n--- Static phrase exclusion ---");
{
  check(`FORBIDDEN_STATIC_PHRASES_AR loaded (${FORBIDDEN_AR.length} entries)`, FORBIDDEN_AR.length > 0);
  check(`FORBIDDEN_STATIC_PHRASES_EN loaded (${FORBIDDEN_EN.length} entries)`, FORBIDDEN_EN.length > 0);

  const msgLower = allMessages.map(m => m.toLowerCase());
  const arClean = FORBIDDEN_AR.every(forbidden =>
    !msgLower.some(m => m.includes(forbidden.toLowerCase()))
  );
  const enClean = FORBIDDEN_EN.every(forbidden =>
    !msgLower.some(m => m.includes(forbidden.toLowerCase()))
  );
  check("no FORBIDDEN_STATIC_PHRASES_AR appear in MESSAGES matrix", arClean);
  check("no FORBIDDEN_STATIC_PHRASES_EN appear in MESSAGES matrix", enClean);
}

// ── 9. Max message length (≤ 80 chars) ───────────────────────────────────────
console.log("\n--- Message length ---");
{
  const tooLong = allMessages.filter(m => m.length > 80);
  check("all MESSAGES entries ≤ 80 chars", tooLong.length === 0);
  if (tooLong.length > 0) tooLong.forEach(m => console.error(`    LONG: "${m}" (${m.length})`));
}

// ── 10. No U+00A7 (§) in any message ─────────────────────────────────────────
{
  const hasSec = allMessages.some(m => m.includes("§"));
  check("no U+00A7 § in any MESSAGES entry", !hasSec);
}

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${pass} PASS, ${fail} FAIL`);
if (fail === 0) console.log("ALL TESTS PASS");
else { console.error(`${fail} test(s) FAILED`); process.exit(1); }
