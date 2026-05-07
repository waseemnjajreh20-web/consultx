# R21 — Hotfix: _thinkingEventsB2 Scope Error

**Date:** 2026-05-06  
**Commit:** `39de9ca`  
**Severity:** P0 — production crash on every Advisory question

---

## Symptom

Sending any question in Advisory mode showed a red toast:

> `thinkingEventsB2 is not defined`

The edge function returned HTTP 500, which the frontend `streamChat` function caught via `resp.json()` and passed to `onError()`.

---

## Root Cause — Class C: Wrong Scope

`let _thinkingEventsB2: ThinkingEvent[]` (and its three sibling B2 state vars) were declared inside the `else` advisory-text branch of the `if (resolvedImages) / else if (mode === "primary") / else` chain — JavaScript block scope, indent=6.

The `else` block closes before L5630. A separate `if (mode === "standard")` block at indent=4 (outer scope) reads `_thinkingEventsB2` at L5849/5852/5860. That outer block cannot see a `let` declared inside a sibling `else` block.

Deno's SWC transpiler does not perform full scope analysis, so the error was only caught at runtime. `npx tsc --noEmit` covers only `src/` (frontend) — `supabase/functions/` is outside the tsconfig include, so TypeScript also missed it.

```
L5289  let finalMessages = [...messages];          ← outer scope (indent 4)
L5291  let _thinkingEventsB2 = [];                 ← CORRECT (after fix)

L5357  } else {                                    ← advisory else block opens
L5409  [old] let _thinkingEventsB2 = [];           ← BUGGY location (was here)
L5567        _thinkingEventsB2 = buildThinking...  ← assignment (still here)
L5630  if (output_format...)                       ← advisory else block closed

L5782  if (mode === "standard") {                  ← outer SSE block
L5849    if (... && _thinkingEventsB2.length > 0)  ← CRASHES without fix
```

---

## Fix

Moved the 4 declarations from inside the `else` block to the outer scope alongside `fullSystemPrompt`, `usedFiles`, `advisoryLedger`, `finalMessages`.

```diff
     let finalMessages = [...messages];
+    // ── B2 state vars (outer scope; populated in advisory branch, read in SSE branch) ─
+    let _advisoryBrainB2: AdvisoryBrainB1 | null = null;
+    let _routerResultB2: RouterResult | null = null;
+    let _augmentationB2: AugmentationResult | null = null;
+    let _thinkingEventsB2: ThinkingEvent[] = [];

     if (resolvedImages.length > 0) {
```

```diff
-      // ── B2 state vars (declared early; populated after admin client is ready) ─
-      let _advisoryBrainB2: AdvisoryBrainB1 | null = null;
-      let _routerResultB2: RouterResult | null = null;
-      let _augmentationB2: AugmentationResult | null = null;
-      let _thinkingEventsB2: ThinkingEvent[] = [];
-
       // ── 1. Structured Table Path (DB-first, highest priority) ─────────────
```

Assignments inside the advisory branch (`_thinkingEventsB2 = buildThinkingSequence(...)` at L5567) are unaffected — outer-scope `let` vars can be assigned from inner blocks.

---

## Validation

| Check | Result |
|-------|--------|
| `grep _thinkingEventsB2` — single `let` declaration | ✅ L5294 only |
| `npx tsc --noEmit` | ✅ clean |
| All B2 flags ON (SHA256 = `6b86b273...`) | ✅ verified post-deploy |
| Edge function deployed | ✅ (all 6 files uploaded) |

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/fire-safety-chat/index.ts` | Move 4 `let` declarations from else-block scope to outer scope |

---

## Flags Status (unchanged)

| Flag | Value |
|------|-------|
| `ADVISORY_BRAIN_B2_ENABLED` | 1 ✅ |
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | 1 ✅ |
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | 1 ✅ |
| `ADVISORY_DYNAMIC_THINKING_ENABLED` | 1 ✅ |

---

## Manual Smoke (owner)

After this deploy, send an Advisory question:

```
ما متطلبات الحمل الإشغالي لمحل تجاري؟
```

Expected:
1. No red toast
2. Dynamic thinking messages appear before the answer
3. Supabase logs show: `[ThinkingB2] Emitting 3 thinking_status events`
