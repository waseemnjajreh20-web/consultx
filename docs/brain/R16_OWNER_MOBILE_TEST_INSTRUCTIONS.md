# R16 — Owner Mobile Test Instructions

**Date:** 2026-05-06  
**Task:** TASK 6 — Owner Mobile Test Instructions

---

## قبل الاختبار — تعليمات مسح الكاش

### الخطوة 1: أغلق التبويب أو التطبيق

أغلق المتصفح أو التبويب بالكامل على الهاتف.

### الخطوة 2: افتح الموقع من جديد

افتح `https://consultx.app` في المتصفح.

### الخطوة 3: إذا بقي الموقع يبدو قديمًا

**Android Chrome:**
- اضغط طويلاً على أيقونة التطبيق أو افتح الإعدادات
- Site settings → Clear data → Clear

**أو:** افتح نافذة Incognito جديدة وزر الموقع منها

---

## اختبار Advisory Mode

انتقل لوضع **الاستشاري (Advisory)** — اللون البرتقالي.

### سؤال 1

```
ما متطلبات الحمل الإشغالي لمحل تجاري؟
```

**المتوقع ظهوره:**
- إجابة تذكر SBC 201 Table 1004.5 مع أرقام (مثلاً 2.8 م²/شخص)
- لا تلوث من SBC 801 في إجابة سؤال SBC 201

### سؤال 2

```
اعطني النص المرجعي لجدول SBC 201 Table 1004.5
```

**المتوقع ظهوره:**
- نص الجدول أو أقرب محتوى متاح
- إشارة لـ SBC 201 فقط، لا SBC 801

---

## ما الذي يعمل الآن (B2 Stage 3)

- **تحسين جودة الإجابة** — Evidence Augmentation (Stage 3) يضيف context إضافي للـ Gemini prompt
- **منع cross-pollution** — عدم خلط SBC 201 / SBC 801 في نفس الإجابة
- **Citation verification** — التحقق من صحة المراجع قبل إرسالها

## ما الذي لا يُرى بعد (Implementation Gap)

- **Dynamic Thinking Messages** — تظهر "جاري التفكير..." الثابتة وليس الرسائل الديناميكية المتعلقة بالـ workflow
- السبب: الـ backend يبني thinking events لكنها لم تُضف إلى SSE stream بعد
- هذا لا يؤثر على جودة الإجابة — يؤثر فقط على رسائل التحميل

---

## التحقق من Supabase Logs

افتح: [Supabase Dashboard](https://app.supabase.com) → Project `hrnltxmwoaphgejckutk` → Functions → `fire-safety-chat` → Logs

ابحث عن هذه الأسطر بعد إرسال السؤال:
```
[AdvisoryBrainB2] flag=on package_loaded=true nodes=440 edges=278 workflows=8
[AdvisoryBrainB2] router domain=occupant_load
[ThinkingB2] N thinking events built for workflow=wf_occupant_load
```

إذا ظهرت هذه الأسطر → B2 يعمل بشكل صحيح على backend.  
إذا لم تظهر → أرسل النتيجة لتشخيص سبب فشل تحميل الـ package.

---

## النتيجة المتوقعة بعد الإصلاح الكامل

| الميزة | الحالة |
|--------|--------|
| Evidence Augmentation (Stage 3) | ✅ يعمل — يحسّن جودة الإجابة |
| Citation Verification | ✅ يعمل — يتحقق من المراجع |
| Cross-family Isolation | ✅ يعمل — لا تلوث SBC201/SBC801 |
| Dynamic Thinking Messages | ⏳ لا تُعرض — implementation gap في SSE emission |
| Static Thinking ("جاري التفكير...") | ✅ يعمل — timer-based كما كان |
