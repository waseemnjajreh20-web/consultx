# R17 — Dynamic Thinking Mobile Verification Plan

**Date:** 2026-05-06  
**Task:** TASK 7 — Verification Plan

---

## Prerequisites

Before testing:
1. Branch `claude/jolly-haibt-602657` must be merged to main
2. Vercel must have deployed the updated frontend (ChatInterface.tsx)
3. Edge function v147 must be ACTIVE (already deployed ✅)
4. `ADVISORY_DYNAMIC_THINKING_ENABLED=1` must be set (already ON ✅)

---

## Test Questions

### سؤال 1 — Occupant Load (occupant_load workflow)

```
ما متطلبات الحمل الإشغالي لمحل تجاري؟
```

**Expected before answer:**
```
تصنيف نوع الاستفسار وتحديد مسار المعالجة...   ← routing phase
التحقق من مدخلات المشروع الأساسية...            ← inputs_check phase
البحث في أقسام SBC 201 المرتبطة بالسؤال...       ← retrieval phase
تجميع الإجابة مع الأدلة والمراجع الدقيقة...      ← composition phase
```

**Expected in answer:**
- Reference to SBC 201 Table 1004.5
- Occupant load factor for Group M (Mercantile)
- No SBC 801 content

### سؤال 2 — Exact Table Reference (occupant_load or general_code_lookup)

```
اعطني النص المرجعي لجدول SBC 201 Table 1004.5
```

**Expected before answer:**
- Dynamic routing message for `occupant_load` or `general_code_lookup` domain
- No static "جاري التفكير..."

**Expected in answer:**
- Table 1004.5 content or pointer to Source panel
- SBC 201 family only

### سؤال 3 — Sprinkler Requirement (sprinkler workflow)

```
اعطني نص SBC 801 Section 903.2.7
```

**Expected before answer:**
- Routing message for `sprinkler` domain
- Retrieval message mentioning SBC 801
- Possibly parking-lot notice if Section 903.2.7 not in corpus

**Expected in answer:**
- SBC 801 content or parking-lot redirect message
- No SBC 201 content mixed in

---

## What to Watch

| Signal | Where to Check |
|--------|---------------|
| Dynamic thinking messages appear | Loading indicator area (below typing dots) |
| Static "جاري التفكير..." does NOT appear when events arrive | Same area |
| Thinking messages animate (fade-in) on each new phase | Visual |
| Answer starts after all thinking events are displayed | Sequence |
| `[ThinkingB2] Emitting N thinking_status events` | Supabase Dashboard → Logs |
| `package_loaded=true nodes=440` | Supabase Dashboard → Logs |
| `[AdvisoryBrainB2] router domain=occupant_load` | Supabase Dashboard → Logs |

---

## If Dynamic Messages Don't Appear on Mobile

1. Check Vercel deploy — confirm frontend version includes ChatInterface.tsx change
2. Force refresh on mobile: Chrome → Site settings → Clear data
3. Open Incognito and test
4. Check Supabase logs for `[ThinkingB2] Emitting` — if present, backend is working; if frontend still shows static, Vercel hasn't deployed yet

---

## Rollback (Edge Function Only — Instant)

```bash
npx supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref hrnltxmwoaphgejckutk
```

This disables thinking events without redeploying. Frontend fallback activates immediately (timer-based static messages).
