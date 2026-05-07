# R18 — Mobile Production Smoke Runbook

**Date:** 2026-05-06  
**Task:** TASK 9 — Owner Smoke Runbook

---

## Prerequisites

Before testing:
1. ✅ Branch `claude/jolly-haibt-602657` merged to `main`
2. ✅ Vercel auto-deployed (~2 minutes after merge)
3. ✅ Edge function v148 ACTIVE (source precision fix)
4. ✅ All 4 B2 flags ON

Force a fresh frontend on mobile before testing:
- iOS Safari: Settings → Safari → Advanced → Website Data → Remove site data for your domain
- Android Chrome: Site settings → Clear data
- Or: Open in Incognito / Private browsing

---

## Test 1 — Dynamic Thinking Visible (Advisory mode)

**Mode:** Advisory (النمط الاستشاري)  
**Question:** `ما متطلبات الحمل الإشغالي لمحل تجاري؟`

**Expected before answer:**
```
تصنيف نوع الاستفسار وتحديد مسار المعالجة...     ← routing
البحث في أقسام SBC 201 المرتبطة بالسؤال...        ← retrieval
تجميع الإجابة مع الأدلة والمراجع الدقيقة...       ← composition
```

**Expected in answer:**
- Reference to SBC 201 Table 1004.5
- Occupant load factor for Group M (Mercantile)
- No SBC 801 content mixed in

**Pass criteria:**
- [ ] At least 2 dynamic thinking messages visible before answer
- [ ] Messages animate (fade-in on each new one)
- [ ] Static "جاري التفكير..." does NOT appear once events arrive
- [ ] Answer appears after thinking messages

---

## Test 2 — Source Precision: Tight Range Shows, Broad Does Not

**Mode:** Advisory  
**Question:** `اعطني الجدول 1004.5 من SBC 201`

**Expected sources in Source Panel:**
- If tight range (≤100 pages): "📖 SBC 201 — صفحات N–M (دقيق)" chip shown
- If broad range (>100 pages): "📖 SBC 201" chip shown with NO page numbers
- Structured table evidence (if any): amber-tinted 🗂️ icon, not faded

**Pass criteria:**
- [ ] No source chip shows "صفحات 1–600" or other full-book ranges
- [ ] Structured table entries are NOT grayed out / opacity-reduced
- [ ] PDF sources are clickable (opens iframe PDF viewer)

---

## Test 3 — Sprinkler Domain (SBC 801)

**Mode:** Advisory  
**Question:** `ما متطلبات نظام الرش الآلي لمبنى تجاري؟`

**Expected before answer:**
```
أفصل بين نوع الإشغال ومساحة منطقة الحريق قبل تطبيق عتبات الرش...
```

**Expected in answer:**
- SBC 801 references (not SBC 201)
- No cross-contamination of code families

**Pass criteria:**
- [ ] Sprinkler-domain thinking message appears
- [ ] Answer cites SBC 801, not SBC 201

---

## Test 4 — Main Mode Unaffected

**Mode:** Main (الرئيسي)  
**Question:** `مرحبا، ما هو دورك؟`

**Expected:**
- Normal answer — no thinking status messages
- No "جاري التفكير..." shown (since this mode never had advisory loader)
- Fast response (no B2 routing overhead)

**Pass criteria:**
- [ ] Answer arrives normally
- [ ] No thinking status messages visible
- [ ] Mode dot color is cyan (not orange)

---

## Test 5 — Service Worker Cache Refresh

On mobile after Vercel deploy:
1. Open the app without Incognito
2. Hard reload (pull-to-refresh or force-close + reopen)
3. Check: old "consultx-v2" SW should be replaced by "consultx-v3"

**Expected:** App loads latest JS (new SourcePanel, formatSourceLabel guard, dynamic thinking consumer)

**Pass criteria:**
- [ ] App loads without stale JS errors in console
- [ ] Dynamic thinking messages visible (confirms new frontend loaded)

---

## Supabase Log Verification

In Supabase Dashboard → Functions → fire-safety-chat → Logs, search for:

```
[ThinkingB2] Emitting 3 thinking_status events before advisory response
[AdvisoryBrainB2] flag=on package_loaded=true nodes=440
[AdvisoryBrainB2] router domain=occupant_load
```

---

## Rollback (Edge Function — Instant)

To disable dynamic thinking without a deploy:
```bash
npx supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref hrnltxmwoaphgejckutk
```

Frontend immediately falls back to timer-based static messages. No broken UX.

To re-enable:
```bash
npx supabase secrets set ADVISORY_DYNAMIC_THINKING_ENABLED=1 --project-ref hrnltxmwoaphgejckutk
```
