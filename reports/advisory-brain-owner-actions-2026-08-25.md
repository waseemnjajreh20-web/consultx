# العقل الاستشاري — قائمة إجراءات المالك | 2026-08-25

**إلى:** وسيم · **الفرع:** `recovery/stabilization-2026-08-23` · **النطاق:** الطرح
الكامل لطبقة "العقل الاستشاري" (Advisory Brain) — إصلاح المتن، الترحيلات،
رسم الإحالات، ثم رفع الأعلام.

هذه الوثيقة **تنفيذية**: كل خطوة تُنفَّذ بالترتيب المكتوب، ولا تبدأ خطوة قبل أن
يعبر ما قبلها بوّابته. الترتيب مأخوذ حرفياً من `docs/advisory-brain-runbook.md`
ومن `reports/corpus-repair-freshness-2026-08-25.md` — **لم يُعَد ترتيبه هنا**.

**تصنيف الادعاءات المستخدم في هذه الوثيقة:** CONFIRMED (مقيس مباشرة) ·
LIKELY · HYPOTHESIS · UNKNOWN · NOT VERIFIED.

---

## 0. قبل أن تبدأ — شروط مسبقة

| # | الشرط | الحالة |
|---|---|---|
| 0-أ | مفتاح `service_role` جاهز في يدك (من Supabase Dashboard → Project Settings → API) | مطلوب للخطوات 2 و3 و5 و6 |
| 0-ب | مفتاح Gemini جاهز (`GOOGLE_GEMINI_API_KEY`) | مطلوب للخطوة 2 والخطوة 5 |
| 0-ج | صلاحية SQL Editor على مشروع `hrnltxmwoaphgejckutk` | مطلوبة للخطوات 1 و4 و6 |
| 0-د | لا يوجد نشر (deploy) جارٍ لـ `fire-safety-chat` أثناء الخطوات 1–4 | لتفادي قراءة نصف-مُصلَحة |

**قاعدة عابرة لكل الخطوات:** لا تُلصق أي مفتاح في محادثة، ولا في ملف داخل
المستودع، ولا في رسالة commit. المفاتيح تُمرَّر كوسيط سطر أوامر أو كمتغيّر بيئة
في جلستك فقط.

---

## 1. تشغيل إصلاح المتن — `docs/audits/corpus-repair-20260823.sql`

### ماذا تُشغّل

في **Supabase Dashboard → SQL Editor**، افتح
`docs/audits/corpus-repair-20260823.sql` والصق **قسماً واحداً في كل مرة**،
بالترتيب: القسم 1 ← القسم 2 ← القسم 3 ← القسم 4. القسم 5 **توصية فقط ولا يُنفَّذ**
(لا يحتوي أي `DELETE` منفَّذ).

نمط كل قسم كما هو مكتوب في رأس الملف:

1. شغّل أولاً الـ `SELECT` المعلَّق فوقه `-- EXPECTED: N`.
2. طابق الرقم. إن لم يطابق → **توقّف، لا تُشغّل الـ `UPDATE`**.
3. شغّل الـ `BEGIN` والكتابة، ثم اقرأ الـ `SELECT` التحققي **قبل** كتابة `COMMIT`.
4. إن بدا شيء خاطئاً → `ROLLBACK` بدل `COMMIT`.

### المُخرَج المتوقع والتحقق

الأرقام أدناه أُعيد التحقق منها مقابل الإنتاج بتاريخ **2026-08-25** قراءةً فقط،
والنتيجة **CONFIRMED: صفر انحراف منذ 2026-08-23** — المرجع:
`reports/corpus-repair-freshness-2026-08-25.md`، جدول "Verdict".

| القسم | المُتوقَّع | ما رآه فحص 2026-08-25 |
|---|---|---|
| 1 — `code_type`: محتوى SBC801 مُعنوَن SBC201 | `rows_to_fix = 308` | 308 — مطابق |
| 2 — `language`: الجدول كله موسوم `AR` خطأً | `4630 / 4622 / 8` | مطابق |
| 3 — `metadata`: صفوف فهرس بنقاط قائدة | `71 / 0` | مطابق |
| 4 — `source_registry` + الإصدارات | edition 2024، `vector_indexed=false`، ناقص التضمينات `36 / 0`، الثمانية الغائبة غائبة | مطابق |

### لماذا هي آمنة

- كل قسم يأخذ **نسخة احتياطية** للصفوف التي يلمسها في جدول
  `*_backup_20260823_*` قبل الكتابة، وكل نسخة تُنشأ مع
  `ENABLE ROW LEVEL SECURITY` و`REVOKE ALL ... FROM PUBLIC, anon, authenticated`
  فوراً — أي لا تُنشر نسخة عامة من بيانات سلامة.
- كل قسم **idempotent**: إعادة تشغيله لا تفعل شيئاً لأن شرط `WHERE` لا يطابق إلا
  الصفوف التي ما زالت تحتاج الإصلاح.
- عبارة الاسترجاع (rollback) مكتوبة نصاً داخل الملف لكل قسم.
- لا حذف نهائي لأي بيان حي.

### ممنوع في هذه الخطوة

- لا تُشغّل الملف كاملاً دفعة واحدة.
- لا تتخطَّ الـ `SELECT` صاحب `EXPECTED`.
- لا تُشغّل القسم 5 (`document_tables`) — هو **توصية**، وقراره منفصل.
- لا تُشغّل `scripts/build-xref-graph.sql` قبل أن يُثبَّت القسم 1 بـ `COMMIT`:
  رأس ذلك الملف ينصّ صراحة أن كامل الرسم مبنيّ على `code_type` الصحيح، وتشغيله
  قبل الإصلاح يُفسد فهرس التعريفات وكل حافة تُحلّ عليه.

---

## 2. تعبئة التضمينات الناقصة — `generate-embeddings.mjs --backfill`

### ماذا تُشغّل

**أولاً، تشغيل جاف (لا يكتب شيئاً):**

```
node scripts/generate-embeddings.mjs <SERVICE_KEY> <GEMINI_KEY> --backfill --dry-run
```

**ثم، وفقط إذا طبع الرقم الصحيح، التشغيل الحقيقي:**

```
node scripts/generate-embeddings.mjs <SERVICE_KEY> <GEMINI_KEY> --backfill
```

### المُخرَج المتوقع والتحقق

التشغيل الجاف يجب أن يطبع:

```
Mode: BACKFILL (DRY RUN — no writes)
Predicate: sbc_documents.embedding IS NULL

Rows selected: 36
  by code_type:
    SBC201: 36
  ...
  (table holds 4630 rows in total; 36 of them have no embedding)

DRY RUN: no embedding requests were made and no rows were written.
```

**بوّابة:** الرقم **36** بالضبط، وكلها `SBC201`. (CONFIRMED مقابل الإنتاج
2026-08-25 — تقرير الطزاجة، صف "Section 4 missing embeddings SBC201 / SBC801 =
36 / 0".) إن ظهر رقم أكبر بكثير → **توقّف**: يعني ذلك أن الاختيار اتّسع وأنك على
وشك إعادة تضمين المتن كله على حسابك.

إن ظهر تحذير `content shorter than 20 chars` → لا تتجاهله؛ تلك الصفوف **لن**
تُضمَّن وتحتاج قراراً بشرياً.

بعد التشغيل الحقيقي، أعِد التشغيل الجاف مرة أخرى — يجب أن يطبع:

```
Rows selected: 0
Nothing to do — every row already has an embedding. (Idempotent no-op.)
```

### لماذا هي آمنة

- الوضع `--backfill` **لا يقرأ أي ملف** ولا يُدخل أي صف جديد. كل كتابة هي
  `UPDATE ... SET embedding WHERE id = $1` على صف واحد بمفتاحه الأساسي.
- العمود الوحيد المكتوب هو `embedding`. لا يُمسّ `content` ولا `metadata` ولا
  `code_type` ولا `section_number` ولا غيرها.
- الاختيار على `embedding IS NULL` يجعل العملية قابلة للاستئناف: انقطاع في
  المنتصف يترك فقط ما لم يُصلَح بعد.
- الأثر المقصود: 36 صفاً من بينها أقسام حرجة للخروج (1006.2.1 مخرج وحيد،
  1010.2.9 الأبواب، 1020.3 الممرات، 903.3.1 تصميم الرشاشات) كانت **غير مرئية**
  لاسترجاع المتّجهات لأن المسافة NULL تُرتَّب أخيراً.

### ممنوع في هذه الخطوة

- لا تُشغّل السكربت **بدون** `--backfill` — الوضع الافتراضي هو INGEST من مجلد
  ملفات محلي وسيحاول إدخال صفوف جديدة.
- لا تُشغّل التشغيل الحقيقي قبل أن ترى 36 في الجاف.
- لا تضع المفاتيح في متغيّر داخل السكربت — تُمرَّر كوسيطين على سطر الأوامر فقط.

---

## 3. رفع الملفات الثلاثة المُعاد بناؤها + إغلاق دلو `ssss`

### 3-أ. الشرط المسبق (تحقّق قبل أي شيء)

**التحقق مطلوب: هل `fetchSBCContext` يقرأ عبر عميل الإدارة (service role)؟**

**CONFIRMED — نعم.** في `supabase/functions/fire-safety-chat/index.ts`:
المفتاح يُحلّ عبر `getSecretKeyOrNull()` ثم
`const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)` (السطور
1048–1056)، وكل وصول إلى الدلو يمرّ عبره:
`supabaseAdmin.storage.from("ssss").list(...)` (1058)،
و`supabaseAdmin.storage.from("ssss").download(...)` (1211 و1274).
كذلك `fire-safety-chat/brain_b1_loader.ts` و`sbc-graph-indexer/index.ts` يمرّان
عبر عميل إدارة. **لا يوجد أي قارئ يبني رابطاً عاماً (public URL) للدلو `ssss`
— لا في `src/` ولا في أي دالة حافة.**

**النتيجة:** جعل الدلو خاصاً **لا يكسر أي مسار استرجاع**، لأن `service_role`
يتجاوز خصوصية الدلو.

### 3-ب. رفع الملفات الثلاثة

الملفات المُعاد بناؤها موجودة محلياً في
`.archive/laneB-20260823/rebuilt_chunks/`:

```
SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json
SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json
SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json
```

**الطريقة:** Supabase Dashboard → Storage → الدلو `ssss` → ارفع الملفات الثلاثة
مع **الكتابة فوق القائم (overwrite/upsert)**، مع **الحفاظ على الاسم حرفاً بحرف**.
`fetchSBCContext` يسرد الملفات ويطابقها بالاسم، فتغيير حرف واحد يُخرج الملف من
الاسترجاع بصمت.

**لا تستخدم `scripts/upload-sbc-files.cjs` كما هو:** ثابت `SOURCE_DIR` فيه يشير
إلى مجلد `Downloads` وليس إلى `.archive/laneB-20260823/rebuilt_chunks/`، فتشغيله
كما هو يرفع النسخ الخاطئة (المبتورة).

### المُخرَج المتوقع والتحقق

الحالة الحالية في الإنتاج (CONFIRMED 2026-08-25، تقرير الطزاجة): الثلاثة ما زالت
مبتورة عند **249,003 / 12,245 / 200 بايت** بالضبط.

بعد الرفع، الحجم في واجهة Storage يجب أن يطابق الحجم المحلي تقريباً:
**1,029,906 / 1,007,765 / 527,061 بايت**. الملف `801-1000` هو الأوضح: من **200
بايت** إلى **527 كيلوبايت** — أي أن النسخة الحية كانت عملياً فارغة.

تحقق وظيفي بعد الرفع: اطرح سؤالاً في الوضع الاستشاري يخصّ فصلاً من SBC 801 في
الصفحات 801–1000، وتأكد أن الإجابة تستشهد بمصدر من ذلك المدى.

**انتبه — هذا تغيير حيّ.** رفع النسخ الكاملة يغيّر ما يخدمه مسار الاسترجاع
بالكلمات المفتاحية فوراً (المسار الحيّ المُتحقَّق منه اليوم). الأثر المقصود
"محتوى أكثر وأصح"، لكنه ليس تغييراً محايداً — راقب الإجابات بعده.

### 3-ج. توصية: اجعل الدلو `ssss` خاصاً

**السبب:** المتن المرفوع هو محتوى SBC كامل ومحمي بحقوق نشر. دلو عام يعني أن أي
شخص يملك الرابط ينسخ المتن كاملاً دون حساب. هذه عقبة إطلاق رقم 8 في
`docs/audits/production-final-readiness.md` (بند "`ssss` bucket public exposure").

**حالة الملف:** ذلك التقرير سجّل البند **مغلقاً** بتاريخ 2026-08-21 بقيمة
`storage.buckets.public = false`. لكن هذا **NOT VERIFIED اعتباراً من 2026-08-25**
— فحص الطزاجة قاس أحجام الـ blobs فقط، لا علم الدلو.

**الإجراء:** في Storage → `ssss` → Settings، تحقق من `Public bucket`.
- إن كان **مغلقاً بالفعل** → لا شيء لتفعله، سجّل التأكيد وانتقل.
- إن كان **مفتوحاً** → أغلقه.

**التحقق بعد الإغلاق:** جرّب رابطاً عاماً لأحد ملفات الدلو من متصفّح خارج جلستك
— يجب أن يعود 400/404 لا 200. ثم اطرح سؤالاً استشارياً واحداً وتأكد أن
الاسترجاع ما زال يعمل (يجب أن يعمل — راجع 3-أ).

### ممنوع في هذه الخطوة

- لا ترفع الملفات بأسماء جديدة أو داخل مجلد فرعي.
- لا تحذف الملفات المبتورة قبل نجاح الرفع فوقها.
- لا تُعد الإدخال (re-ingest) إلى `sbc_documents` من الملفات المبتورة — انظر
  قائمة "لا تفعل".

---

## 4. تطبيق الترحيلات `20260824100001..100006` عبر SQL Editor

**ملاحظة على الترقيم:** الملفات في المستودع **خمسة**، لا ستة —
`20260824100003` **غير موجود**. الفجوة مقصودة في الترقيم وليست ملفاً ناقصاً.

**الطريقة:** لكل ملف: افتحه، انسخ محتواه كاملاً، الصقه في **Supabase SQL
Editor**، شغّله، ثم شغّل استعلام التحقق أدناه. **بالترتيب المذكور.**

### 4-أ. `20260824100001_match_sbc_documents_v2.sql`

**الغرض في سطر:** ينشئ دالة `match_sbc_documents_v2` **جديدة بجانب** القائمة —
تضيف أرضية تشابه داخل SQL وفكّ تعادل حتمي (`ORDER BY ... , d.id ASC`) — ولا
يُعدِّل `match_sbc_documents` الحيّة إطلاقاً.

**التحقق بعد التطبيق:**

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'match_sbc_documents%'
order by 1;
```
المتوقع: **صفّان** — `match_sbc_documents` (كما هي) و`match_sbc_documents_v2`.

```sql
select has_function_privilege('anon',
         'public.match_sbc_documents_v2(vector,int,text,float)', 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated',
         'public.match_sbc_documents_v2(vector,int,text,float)', 'EXECUTE') as auth_exec,
       has_function_privilege('service_role',
         'public.match_sbc_documents_v2(vector,int,text,float)', 'EXECUTE') as sr_exec;
```
المتوقع: `false / false / true`.

### 4-ب. `20260824100002_sbc_documents_formalize.sql`

**الغرض في سطر:** يُوثّق شكل `sbc_documents` القائم فعلاً في الإنتاج (الامتداد،
الجدول، الفهارس الثلاثة) كترحيل idempotent — **لا يغيّر شيئاً في الإنتاج**، فقط
يمنح الجدول نسباً في سجلّ الترحيلات.

**التحقق بعد التطبيق:**

```sql
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'sbc_documents' order by 1;
```
المتوقع: يتضمّن `idx_sbc_documents_code_type`، `idx_sbc_documents_embedding`،
`idx_sbc_documents_section`.

```sql
select count(*) from public.sbc_documents;
```
المتوقع: **4630** — أي أن الترحيل لم يمسّ صفاً واحداً.

### 4-ج. `20260824100004_sbc_xref_graph.sql`

**الغرض في سطر:** ينشئ **مخططاً فقط** لثلاثة جداول فارغة
(`sbc_section_defs`، `sbc_xref_edges`، `sbc_xref_indegree`) لرسم الإحالات — صفر
قرّاء، صفر كتّاب، صفر أثر على أي إجابة.

**التحقق بعد التطبيق:**

```sql
select (select count(*) from public.sbc_section_defs)  as defs,
       (select count(*) from public.sbc_xref_edges)    as edges,
       (select count(*) from public.sbc_xref_indegree) as indeg;
```
المتوقع: `0 / 0 / 0`.

```sql
select relname, relrowsecurity from pg_class
where relname in ('sbc_section_defs','sbc_xref_edges','sbc_xref_indegree') order by 1;
```
المتوقع: `relrowsecurity = true` للثلاثة.

```sql
select has_table_privilege('anon','public.sbc_xref_edges','SELECT') as anon_sel,
       has_table_privilege('authenticated','public.sbc_xref_edges','SELECT') as auth_sel,
       has_table_privilege('service_role','public.sbc_xref_edges','SELECT') as sr_sel;
```
المتوقع: `false / false / true`.

### 4-د. `20260824100005_sbc_external_refs.sql`

**الغرض في سطر:** ينشئ جدول `sbc_external_refs` (مخطط فقط، فارغ) لتسجيل
**إحالات** المدوّنة إلى معايير خارجية (NFPA/ASTM/UL...) — وهو ميزة **أمانة**:
دليل على وجود إحالة، **لا** دليل على امتلاكنا للمعيار.

**التحقق بعد التطبيق:**

```sql
select count(*) from public.sbc_external_refs;
```
المتوقع: **0**.

```sql
select relrowsecurity from pg_class where relname = 'sbc_external_refs';
```
المتوقع: `true`.

### 4-هـ. `20260824100006_profiles_audience_pref.sql`

**الغرض في سطر:** يضيف عمود `profiles.audience_preference` (نصّي، nullable، بلا
DEFAULT) لتخزين تفضيل جمهور العرض — تخزين فقط، بلا أي قارئ ولا تغيير سلوك.

**التحقق بعد التطبيق:**

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name='audience_preference';
```
المتوقع: `text` / `YES` / `column_default = NULL`.

```sql
select conname from pg_constraint where conname = 'profiles_audience_preference_check';
```
المتوقع: صفّ واحد.

```sql
select count(*) from public.profiles where audience_preference is not null;
```
المتوقع: **0** — كل صف قائم يصبح NULL، والـ NULL يعني "engineer" (سلوك HEAD
الحالي) لأي قارئ مستقبلي.

### لماذا هذه الخطوة آمنة

- الخمسة **idempotent** بالكامل (`IF NOT EXISTS` / `CREATE OR REPLACE` / كتلة
  `DO` تفحص وجود القيد قبل إضافته) — إعادة التشغيل لا تؤذي.
- **صفر قرّاء**: لا شيء في `fire-safety-chat` أو الواجهة يستدعي
  `match_sbc_documents_v2`، ولا يقرأ أي جدول من الجداول الأربعة الجديدة، ولا
  يقرأ العمود الجديد. الحالة بعد التطبيق = سلوك HEAD بايتاً.
- **RLS لا تُضعَّف**: كل جدول جديد يُنشأ مع RLS مُفعَّلة، بلا سياسة لـ anon أو
  authenticated، مع `REVOKE` صريح منهما و`GRANT` صريح لـ `service_role` فقط.
- الترحيل 100002 لا يكتب بياناً أصلاً.

### ممنوع في هذه الخطوة

- **لا `supabase db push` إطلاقاً** — سجلّ الترحيلات على هذا المشروع مُنحرف
  معروف، وكل ملف من الخمسة يذكر هذا في رأسه صراحة.
- لا تُطبّق الترحيلات قبل أن تكتمل الخطوة 1 بـ `COMMIT`.
- لا تُضِف `DEFAULT` للعمود في 100006 — سيغيّر صامتاً كل صف مستخدم قائم قبل
  وجود أي واجهة تشرح السبب.
- لا تُعدّل `match_sbc_documents` القديمة "لتوحيدها" مع v2 — ذلك قرار جودة
  استرجاع في الإنتاج له بوّابة قياس خاصة به.

---

## 5. تزويد مفاتيح بيئة القياس (bench)

### ماذا تُوفّر

أربع قيم، تُمرَّر كمتغيّرات بيئة في **جلسة الطرفية التي تُشغّل القياس فقط**:

| المتغيّر | من أين | ملاحظة |
|---|---|---|
| `CONSULTX_EDGE_URL` | Supabase Dashboard → Functions → `fire-safety-chat` → URL | الشكل: `https://<project-ref>.supabase.co/functions/v1/fire-safety-chat` |
| `CONSULTX_SERVICE_KEY` | Project Settings → API → `service_role` | نفس المفتاح المستخدم في الخطوتين 2 و3 |
| `SMOKE_USER_ID` | `select id from auth.users where email = 'smoke_retrieval_test_042026@mailnull.com';` | UUID |
| مفتاح تضمين Gemini | Google AI Studio | نفس المفتاح المستخدم في الخطوة 2 |

مثال تمرير (PowerShell، القيم من متغيّرات جلستك لا مكتوبة سطراً):

```
$env:CONSULTX_EVAL_LIVE   = "1"
$env:CONSULTX_EDGE_URL    = "<url>"
$env:CONSULTX_SERVICE_KEY = "<service-role-jwt>"
$env:SMOKE_USER_ID        = "<uuid>"
```

### التحقق

شغّل تشغيلاً جافاً أولاً للتأكد من أن الحزام يعمل أصلاً:

```
npm run bench:dry
```

هذا **ليس** بوّابة إطلاق — يثبت فقط أن `evals/advisory_benchmark.jsonl` يُحلَّل
وأن التقرير يُبنى. لا يفتح أي مقبس شبكة (لا `--allow-net`) ولا يستدعي الدالة.

### لماذا هي آمنة

- المفاتيح لا تدخل المستودع ولا سجلّ الأوامر إن مُرِّرت من متغيّر بيئة.
- التشغيل الجاف لا يلمس الإنتاج إطلاقاً.
- التشغيل الحيّ يقرأ فقط: يرسل أسئلة إلى دالة منشورة ويسجّل الردود.

### ممنوع في هذه الخطوة

- **لا تُودِع `CONSULTX_SERVICE_KEY` ولا أي مفتاح Gemini/Supabase في git** ولا
  في ملف داخل المستودع ولا في محادثة.
- لا تضع أعلام `ADVISORY_*` في صدفة القياس — القياس يستدعي الدالة **المنشورة**
  عبر HTTP، فالعَلَم يجب أن يكون حيّاً **على الدالة** في Supabase ليُقاس أصلاً.
- لا تعتبر `npm run bench:dry` الأخضر مبرّراً لرفع أي عَلَم.

---

## 6. بناء رسم الإحالات ثم مراجعة عيّنة الخمسين حافة

### ماذا تُشغّل — بالترتيب

**6-أ. البناء (SQL Editor، قسماً قسماً):** `scripts/build-xref-graph.sql`

نفس نمط الخطوة 1: قبل كل `INSERT`/`DELETE` يوجد `SELECT` مع `-- EXPECTED: N`،
وبتسامح **±5%**. شغّل الفحص أولاً؛ إن خرجت النتيجة عن النطاق → **توقّف، لا تكتب**
وقارن الـ regex في ذلك القسم بقسم التصميم المُستشهَد به.

**6-ب. التحقق الآلي:**

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/build-xref-graph-verify.mjs
```

**6-ج. سحب عيّنة المراجعة البشرية:**

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sample-xref-edges.mjs
```

يكتب جدول مراجعة إلى `reports/xref-edge-review-2026-08-25.md`. العيّنة
**حتمية** (مولّد LCG ببذرة `20260825`، لا `Math.random`)، أي أن نفس البذرة على
نفس البيانات تُنتج نفس الخمسين معرّفاً — قابلة للتدقيق والإعادة.

### المُخرَج المتوقع والبوّابة

بوّابات G0 الخمس من `docs/audits/graphrag-design-20260823.md`، قسم
"G0 — البناء دون قارئ":

| # | البوّابة | المتوقع |
|---|---|---|
| 1 | أعداد الحواف ضمن **±5%** من تقدير التصميم | `section_ref ≈ 9,296` · `cross_code ≈ 358` · `prefix_fallback ≈ 168` |
| 2 | **صفر** حواف إلى `sbc_code_tables` | 0 — قيد مطلق |
| 3 | **صفر** حواف مصدرها إحالة إلى معيار خارجي | 0 — تُفحص مباشرة على عمود `evidence` |
| 4 | **مراجعة بشرية لخمسين حافة: دقّة ≥ 90%** | ≥ 45 من 50 صحيحة مقابل الصفحة المطبوعة |
| 5 | `npx tsc --noEmit -p tsconfig.app.json` · `npm test` · `npm run build` · `npx deno check` | كلها خضراء |

**البند 4 بوّابة بشرية لا آلية، وهي الوحيدة التي تقيس الدقّة بدل العدّ.**
**المراجع = وسيم أو مهندس وقاية من الحريق مرخَّص. بلا هذه المراجعة لا يجوز
الانتقال إلى G1.**

عمود `evidence` (مقتطف ≤ 200 حرف مع عبارة الإشارة) موجود تحديداً ليتمكن المراجع
من الحكم على الحافة **دون** إعادة تشغيل المُستخرِج.

### لماذا هي آمنة

- البناء كله **G0: صفر قرّاء**. لا سطر في `fire-safety-chat/index.ts` أو
  `promptContract.ts` أو `retrievalPolicy.ts` يقرأ هذه الجداول، فلا أثر على أي
  إجابة يعطيها المنتج اليوم.
- كل قسم كتابة **idempotent**: يحذف فقط صفوفه (`extractor_ver='xref_v1'`
  مُقيَّدة بـ `edge_kind`/`cue` حيث يلزم) ويُعيد الإدخال من الصفر، مع
  `ON CONFLICT` صريح حيث يمكن لقسمين إنتاج نفس المفتاح.
- السكربتان `build-xref-graph-verify.mjs` و`sample-xref-edges.mjs` **للقراءة
  فقط**.
- الجداول الثلاثة مقفلة على `service_role` وحده (الخطوة 4-ج).

### ممنوع في هذه الخطوة

- لا تُشغّل `build-xref-graph.sql` قبل تثبيت القسم 1 من إصلاح المتن (الخطوة 1)
  — الرأس ينصّ على ذلك مع تعليمة ABORT صريحة.
- لا تتجاوز فارقاً خارج نطاق ±5% بحجّة "قريب بما يكفي".
- لا تُنشئ أي حافة إلى `sbc_code_tables` — قيد مطلق؛ حافة رسمية إلى صفّ غير
  موثّق تمنحه شرعية بنيوية لا يملكها، وهو بالضبط نمط العطل في تنبيه السلامة
  الخاص بجداول المدوّنة.
- لا تعتبر التحقق الآلي (6-ب) بديلاً عن المراجعة البشرية (البند 4).
- لا تنتقل إلى G1 أو ترفع `ADVISORY_GRAPH_EXPANSION_ENABLED` قبل عبور الخمسة.

---

## 7. رفع الأعلام — بالترتيب الصارم، كلٌّ ببوّابة قياس حيّ

### الترتيب (من `docs/advisory-brain-runbook.md`، القسم 2 — **غير قابل لإعادة الترتيب**)

```
ADVISORY_VECTOR_RETRIEVAL_ENABLED
  -> ADVISORY_VECTOR_ANALYSIS_ENABLED
  -> ADVISORY_CITATION_TOKENS_ENABLED
  -> ADVISORY_GRAPH_EXPANSION_ENABLED
  -> ADVISORY_QUERY_ANALYSIS_ENABLED
  -> الأعلام الفرعية
```

### القاعدة المشتركة لكل عَلَم

1. اضبط العَلَم **كسرّ دالة حافة في Supabase** (لا في صدفة القياس).
2. شغّل قياساً **حيّاً**:

```
CONSULTX_EVAL_LIVE=1 \
CONSULTX_EDGE_URL=... CONSULTX_SERVICE_KEY=... SMOKE_USER_ID=... \
npx deno run --allow-read --allow-write --allow-env --allow-net \
  evals/run_advisory_benchmark.ts
```

`npx deno` وليس `deno` المجرّد: Deno غير مثبَّت على PATH هنا وليس تبعية معلنة في
`package.json`.

3. **صفر تراجع على أي سؤال `safety_critical: true`.** تراجع واحد = رسوب، مهما
   تحسّنت بقية المقاييس. الحزام يفرض هذا آلياً: قائمة
   `safety_critical_regressions` غير الفارغة تفرض `pass: false`، تطبع لافتة
   `*** REGRESSION ***` بمعرّفات الأسئلة، وتُنهي العملية بكود **غير صفري**.
4. عند الرسوب: **أعِد العَلَم إلى آخر قيمة معروفة سليمة** (OFF افتراضاً)، وسجّل
   معرّفات الأسئلة الراسبة والمقياس المتراجع والأرقام قبل/بعد في ملف مؤرّخ تحت
   `docs/audits/`، وسلّم القرار. **لا تُعِد المحاولة ببذرة أخرى ولا بعتبة
   مُرخاة.**
5. **عَلَم واحد في كل قياس.** رفع علمين معاً يجعل نسب أي تراجع إلى أحدهما
   مستحيلاً.
6. النتائج تُحفظ في `evals/results/{YYYY-MM-DD}/results.json` و`report.md` —
   احتفظ بالاثنين، فهما أثر التدقيق.

### البوّابة الخاصة بكل عَلَم

| العَلَم | البوّابة |
|---|---|
| `ADVISORY_VECTOR_RETRIEVAL_ENABLED` | الأرضية المعايَرة (`REL=0.85`، `ABS=0.70`) + **صفر تراجع** على أي سؤال حرج للسلامة. توصية القياس الحالية في `advisory-vector-bench-20260823.md` القسم 10 هي **OFF** — رفعه قرار قياس جديد لا افتراض. |
| `ADVISORY_VECTOR_ANALYSIS_ENABLED` | **لا بوّابة معرَّفة بعد.** عَلَم فرعي بتصميم مفتاحين: بلا معنى ما لم يكن العَلَم الرئيسي `1`. اكتب البوّابة كمذكرة تصميم مؤرّخة قبل رفعه. |
| `ADVISORY_CITATION_TOKENS_ENABLED` | انضباط الاستشهاد ≥ 80% + صحّة الرفض **100%** + معدّل الهلوسة ≤ 5%. **انتبه:** انضباط الاستشهاد اليوم **tier-B غير بوّابي** في `computeMetrics()` لأن لا مُنتِج يُصدر الرمز بعد — إعادة تحويله إلى بوّابي جزء من نفس التغيير الذي يرفع هذا العَلَم. |
| `ADVISORY_GRAPH_EXPANSION_ENABLED` | استرجاع سلسلة الاستشهاد يتحرك بين OFF وON (يظهر القسمان المرتبطان لا واحد) + دقّة التوسعة ≥ 60% + إزاحة البذور = 0 + جاذبية المراكز ≤ 5% + دلتا الكمون p95 ≤ +150ms. **سقوط أيّ واحد يُسقط العَلَم.** ويشترط قبله عبور G0 كاملاً (الخطوة 6). |
| `ADVISORY_QUERY_ANALYSIS_ENABLED` | **لا بوّابة معرَّفة بعد** — نفس معالجة العَلَم الفرعي أعلاه. |
| الأعلام الفرعية (`…_CROSSCODE`، `…_TABLES`، `…_HOP2`، `…_LISTS`، `…_NEIGHBOR`، `…_NORMATIVE`) | لكلٍّ بوّابة **مستقلة** في جدول G2 — لا بوّابة مشتركة، ولا حزم. `…_TABLES` هو **الأعلى خطراً** (4,578 حافة مركّزة في 211 تسمية). |
| `ADVISORY_AUDIENCE_LAYER_ENABLED` | يبوّب طبقة عرض الجمهور (مهندس/صاحب قرار/صاحب مشروع/فني). بوّابته: جولة بنشمارك حيّة تؤكد أن كل صيغة جمهور تحافظ على الاستشهادات وسقف لغة الأدلة (invariant مُختبَر) + صفر تراجع حرج. **ملاحظة منتج:** زرّ الاختيار في الواجهة ظاهر ويعمل محليًا حتى مع العَلَم مطفأ — لكنه بلا أثر على الإجابة حتى يُرفع العَلَم في دالة الحافة؛ ارفعه في نافذة نشر الواجهة نفسها أو أخفِ الزر خلف `VITE_ADVISORY_AUDIENCE_LAYER_ENABLED` حتى ذلك الحين. |
| `VISION_PAGE_MANIFEST_ENABLED` | يبوّب حقن `PAGE RENDER MANIFEST` ووعي الـ legend في مسار الرؤية. بوّابته: تقييم `evals/vision` قبل/بعد يظهر تحسّن استخراج بلا أي تراجع في smoke الصور على **الأوضاع الثلاثة** (الطلبات المصوّرة تمرّ به في primary/standard/analysis كلها) + كمون ضمن سقف القبول. |

### 7-ز. `ADVISORY_QUERY_DERIVATION_ENABLED` — شرط إضافي

هذا العَلَم يبوّب تلميحات `deriveTargetSections`. إضافةً إلى كل ما سبق، **يشترط
مراجعة مهندس وقاية من الحريق مرخَّص للخريطة المنسَّقة `DERIVATION_MAP`** قبل
ضبطه في أي مكان يصله مستخدم حقيقي — تسعة مدخلات فيها موسومة صراحةً كـ
"استقراء" (extrapolation) في نصّ `why` الخاص بها. **المراجعة الهندسية شرط، لا
توصية.**

### 7-ح. ملاحظة على العَلَم الأمامي

`VITE_ADVISORY_CITATION_DRIFT_HONESTY_ENABLED` **ليس** سرّ دالة حافة — هو متغيّر
بناء Vite، فرفعه يتطلب **إعادة بناء ونشر الواجهة**، لا ضبط سرّ في Supabase.
وله قرار مالك مفتوح: مع العَلَم ON يظهر شارة قسم سماوية في مسار الرقم المضبوط
حيث لم يكن HEAD يُظهر شيئاً.

### لماذا هذه الخطوة آمنة

- كل عَلَم افتراضه **OFF في الكود**، ولا يُرفع إلا بمتغيّر بيئة صريح. الحالة
  الافتراضية = سلوك HEAD.
- كل رفع مسبوق بقياس حيّ ومتبوع بأثر مؤرّخ.
- التراجع (rollback) لأي عَلَم = حذف/تصفير متغيّر البيئة — فوري وعكوس تماماً.

### ممنوع في هذه الخطوة

- **لا رفع عَلَم بلا قياس حيّ.** التشغيل الجاف يثبت أن الحزام يُحلّل، ولا يسجّل
  أبداً مخرجات نموذج حقيقي.
- لا تُغيّر ترتيب الأعلام ولا تتخطَّ واحداً لأنه "يبدو مستقلاً" — الترتيب سلسلة
  اعتماد حقيقية: رموز الاستشهاد تفترض استرجاعاً متّجهياً جديراً بالثقة، وتوسعة
  الرسم تفترض مجموعة بذور مستقرة.
- لا تُرخِ عتبة ولا تُوسّع قائمة جُمل الرفض المقبولة لتمرير قياس راسب.
- **إن رسبت `refusal_correctness` في أول قياس حيّ، اقرأ السبب قبل أن تُصلح:**
  هذه **فجوة عقد مطالبات (prompt contract)** موثَّقة مسبقاً — `ADV-020`
  (طُعم الدفاع المدني) **بلا أي صياغة رفض مُلقَّنة أصلاً**، وقاعدة SOURCE_SCOPE
  رقم 4 مقصورة على NFPA/SFPE، و`ABSENT_STANDARDS` لا تتضمن الدفاع المدني.
  ليست تراجعاً في النموذج ولا عطلاً في الحزام، وإصلاحها تغيير في
  `promptContract.ts` بمراجعته الخاصة وإعادة تحقّق على الأوضاع الثلاثة.

---

## لا تفعل — قائمة الممنوعات المطلقة

1. **لا `supabase db push` إطلاقاً.** سجلّ الترحيلات على هذا المشروع مُنحرف
   معروف، وله سوابق موثّقة. كل تغيير مخطط يُطبَّق يدوياً في SQL Editor ثم
   يُتحقَّق منه حيّاً ثم يُوثَّق.
2. **لا إعادة إدخال (re-ingest) إلى `sbc_documents` من ملفات `ssss` المبتورة.**
   الثلاثة مبتورة عند 249,003 / 12,245 / 200 بايت (CONFIRMED 2026-08-25)؛
   إعادة الإدخال منها تكتب متناً ناقصاً فوق متن سليم. النسخ الصحيحة في
   `.archive/laneB-20260823/rebuilt_chunks/` — وهي تُرفَع (الخطوة 3)، لا تُعاد
   إدخالها.
3. **لا رفع أي عَلَم `ADVISORY_*` بلا قياس حيّ ناجح** (`CONSULTX_EVAL_LIVE=1`
   مقابل الدالة المنشورة) وبصفر تراجع على أي سؤال `safety_critical`.
4. **لا إعادة ترتيب تسلسل إصلاح cron-401.** نشر الدوال المُصلَحة **أولاً**، ثم
   مطابقة `CRON_SECRET`. عكس الترتيب يُطلق خطأ إعادة الشحن المتكرّر على بطاقات
   حقيقية محفوظة لحظة نجاح أول نبضة cron. **طرح العقل الاستشاري يركب دليل
   الإطلاق القائم (`docs/launch/deploy-runbook-20260823.md`) ولا يستبقه ولا
   يُدرَج قبل خطواته.**
5. **لا تخطّي فحص `EXPECTED`** في أي ملف SQL (إصلاح المتن أو بناء الرسم).
6. **لا إيداع أي مفتاح** (`service_role`، Gemini، `CRON_SECRET`) في المستودع أو
   في محادثة أو في ملف تقرير.
7. **لا إضعاف RLS** ولا فتح جدول جديد لـ anon/authenticated "مؤقتاً للتجربة".
8. **لا ادعاء بامتلاك مصادر غير موجودة.** `sbc_external_refs` يسجّل أن المدوّنة
   **تُحيل** إلى NFPA/ASTM/UL — ولا يعني إطلاقاً أن ConsultX يملك نصّها أو
   يستطيع اقتباسها أو التحقق مقابلها.
9. **لا انتقال إلى G1** (قارئ خلف عَلَم) قبل عبور بوّابات G0 الخمس، ومنها
   المراجعة البشرية للخمسين حافة بدقّة ≥ 90%.

---

## المراجع

- `docs/advisory-brain-runbook.md` — ترتيب الأعلام وبوّاباتها (المصدر الملزم).
- `reports/corpus-repair-freshness-2026-08-25.md` — إعادة التحقق من كل قيمة
  `EXPECTED`، صفر انحراف.
- `docs/audits/corpus-repair-20260823.sql` — الخطوة 1.
- `scripts/generate-embeddings.mjs` — الخطوة 2.
- `.archive/laneB-20260823/rebuilt_chunks/` — الخطوة 3.
- `supabase/migrations/20260824100001` · `100002` · `100004` · `100005` ·
  `100006` — الخطوة 4.
- `evals/results/README.md` · `evals/run_advisory_benchmark.ts` — الخطوة 5.
- `scripts/build-xref-graph.sql` · `scripts/build-xref-graph-verify.mjs` ·
  `scripts/sample-xref-edges.mjs` — الخطوة 6.
- `docs/audits/graphrag-design-20260823.md` — بوّابات G0–G3 ومعايير القياس.
- `docs/audits/advisory-vector-bench-20260823.md` — اشتقاق أرضية التشابه.
- `docs/advisory-acceptance.md` — نحو رمز الاستشهاد وعقد الرفض.
- `docs/launch/deploy-runbook-20260823.md` — تسلسل الإطلاق وإصلاح cron-401.
- `docs/audits/production-final-readiness.md` — البند 8 (`ssss`).
