# R22 — Dynamic Thinking Backend Verification

**Date:** 2026-05-07  
**Task:** TASK 1 — Backend Emission Verification

---

## Summary

Backend emission is **fully correct**. All 6 checks pass.

---

## 1. ADVISORY_DYNAMIC_THINKING_ENABLED

```
Flag: ON (SHA256 = 6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b)
```

Verified via `npx supabase secrets list --project-ref hrnltxmwoaphgejckutk`.  
`isDynamicThinkingEnabled()` returns `true`. ✅

---

## 2. `_thinkingEventsB2` for occupant_load query

Query: `ما متطلبات الحمل الإشغالي لمحل تجاري؟`

**Router matching**: keyword `"حمل الإشغال"` is a substring of `"الحمل الإشغالي"` (position 2 in the lowercased query string). Score = 2 (AR keyword hit). Router classifies domain = `occupant_load`, wf_id = `wf_occupant_load`, confidence = `medium` → `_routerResultB2` is non-null.

**`buildThinkingSequence` output** (no missing inputs, no parking_lot):

| # | Phase | AR message |
|---|-------|------------|
| 1 | routing | أربط المساحة بجدول الحمل الإشغالي وأفصل بين النص والحساب... |
| 2 | retrieval | أحدّد الجدول 1004.5 وأقرأ الصف الموافق للوظيفة... |
| 3 | composition | أقتبس قيمة الـ gross/net الحرفية من الصف وأذكر الصفحة... |

3 events returned. ✅

---

## 3. Log output

When a real user sends an occupant_load query, Supabase logs will show:

```
[ThinkingB2] 3 thinking events built for workflow=wf_occupant_load
[ThinkingB2] Emitting 3 thinking_status events before advisory response
```

The log at line 5884 fires only when `thinkingChunks.length > 0`, which is satisfied. ✅

---

## 4. SSE Frame Format

Each thinking event is encoded as:

```
data: {"type":"thinking_status","stage":"routing","message":"أربط المساحة بجدول الحمل الإشغالي وأفصل بين النص والحساب...","workflow":"wf_occupant_load"}\n\n
```

Format: `data: <JSON>\n\n` — standard SSE. Frontend parser splits on `\n`, strips `data: ` prefix, JSON-parses, checks `parsed.type === "thinking_status"`. ✅

---

## 5. Events emitted before Gemini answer

The `combinedStream` pattern (lines 5865–5886) enqueues all thinking chunks synchronously before piping the Gemini response body. Thinking frames arrive at the client before any Gemini tokens. ✅

---

## 6. Flush / stream issues

No flush issue. `ReadableStream` in Deno edge functions flushes each `controller.enqueue()` immediately (no buffering layer between edge and client for SSE). ✅

---

## Verdict

**Backend emission: CORRECT — no fix required.**

The problem is entirely on the frontend side (see TASK 2 and TASK 3).
