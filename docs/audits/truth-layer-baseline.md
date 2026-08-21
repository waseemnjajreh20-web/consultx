# ConsultX — خط أساس طبقة الحقيقة (المرحلة 0)

**التاريخ:** 2026-08-21
**المشروع:** `hrnltxmwoaphgejckutk`
**النطاق:** جرد بالأدلة فقط. **لم يُعدَّل أي كود أو مخطط في هذه المرحلة.**
**المنهج:** كل رقم أدناه ناتج عن استعلام `SELECT` فعلي على قاعدة الإنتاج أو عن `rg` على شجرة المصدر.

---

## 0. تصحيح جوهري لاستنتاج سابق

في جولة سابقة استُنتج من قراءة الكود أن:

> «مسار الاسترجاع المتجهي ميت — `match_sbc_documents` غير موجود.»

**هذا الاستنتاج خاطئ.** الاستعلام الفعلي على `pg_proc` يثبت العكس:

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'match_sbc_documents';
```

```text
match_sbc_documents | query_embedding extensions.vector, match_count integer, filter_code text
```

الإضافة `vector 0.8.0` مثبتة، والدالة تعمل على جدول `sbc_documents`. مصدر الخطأ كان تعليقًا قديمًا داخل
`fire-safety-chat/index.ts:5463` يدّعي عدم التوفر. **التعليق هو الخطأ، لا قاعدة البيانات.**

---

## 1. جرد طبقة الحقيقة — الأرقام الفعلية

### 1أ. جداول المحتوى

| الجدول | الصفوف | ملاحظة |
|---|---:|---|
| `sbc_documents` | **4,630** | **4,594 منها تحمل `embedding`** — هذا هو الـ corpus المتجهي الحي |
| `sbc_code_tables` | 93 | جداول مهيكلة (كان المتوقع 68) |
| `sbc_pages` | **0** | فارغ تمامًا — كان هدف الدالة المحذوفة `import_sbc_json` |
| `document_tables` | 7 | غير مستخدم في الكود |

تفصيل `sbc_documents`:

| `code_type` | chunks | embedded | ملفات | نطاق الصفحات |
|---|---:|---:|---:|---|
| SBC201 | 2,775 | 2,739 | 10 | 1–500 |
| SBC801 | 1,855 | 1,855 | 8 | 1–261 |

> **فجوة:** 36 مقطعًا في SBC201 بلا `embedding` — غير قابلة للاسترجاع المتجهي.

### 1ب. طبقة الـ Knowledge Graph

| الجدول | الصفوف | المستهلك |
|---|---:|---|
| `graph_nodes` | 171 | **لا يوجد** |
| `graph_edges` | 133 | **لا يوجد** |
| `community_summaries` | 10 | **لا يوجد** — بل `fire-safety-chat/index.ts:95` يمنعها صراحة |
| `graph_indexing_status` | 18 | يُقرأ من `get_indexed_chunk_count()` فقط |

الكاتب الوحيد هو `sbc-graph-indexer`. المستهلك الوحيد كان `fire-safety-chat-v2` الذي حُذف.
النتيجة: **بنية تحتية تُكتب ولا تُقرأ.**

### 1ج. طبقة الـ Provenance — **موجودة بالفعل ومهجورة**

| الجدول | الصفوف | مرجع في `src/` أو `supabase/functions/` | migration محلي |
|---|---:|---|---|
| `source_registry` | 11 | لا — فقط في `types.ts` المولَّد | **لا يوجد** |
| `source_versions` | 2 | لا | **لا يوجد** |
| `corpus_coverage` | 18 | لا | **لا يوجد** |
| `validation_runs` | 8 | لا | **لا يوجد** |

`source_registry` يحتوي بالضبط الحقول المطلوبة لطبقة الحقيقة:
`source_id`, `authority_level` (**normative / commentary / informative**), `edition_year`,
`tier`, `jurisdiction`, `ingestion_status`, `vector_indexed`, `coverage_verified`, `total_pages`.

محتواه الحالي:

| `source_id` | `authority_level` | `edition_year` | `ingestion_status` | `vector_indexed` |
|---|---|---:|---|---|
| SBC201 | normative | 2018 | partial | **false** |
| SBC801 | normative | 2018 | partial | **false** |
| SBC801_COMM | **commentary** | 2018 | pending | false |
| NFPA13 / NFPA72 / NFPA101 / NFPA2 / NFPA30 | normative | — | absent | false |
| SFPE | informative | — | absent | false |
| IBC / IFC | normative | — | absent | false |

> **تناقض مثبت:** `vector_indexed = false` لـ SBC201 و SBC801 بينما يوجد فعليًا 4,594 embedding.
> السجل **قديم ولا يعكس الواقع**، ولا توجد أي عملية تحدّثه.

### 1د. حاويات التخزين

| Bucket | عام؟ | كائنات | الحجم |
|---|---|---:|---|
| `ssss` | **نعم** | 57 | 77 MB |
| `source-pdfs` | **نعم** | 19 | 229 MB |
| `sbc_pdfs_private` | لا | 38 | 244 MB |
| `chat-images` | نعم | 682 | 386 MB |
| `ConsultX _file` | لا | 36 | 53 MB |
| `enterprise-case-documents` | لا | 1 | 553 kB |

---

## 2. النتيجة الحرجة — وضع الاسترجاع الفعلي لكل Mode

| Mode | دالة الاسترجاع | المسار | السطر |
|---|---|---|---|
| **Analytical** (`analysis`) | `fetchSBCContextVector` | **متجهي** عبر `match_sbc_documents` | `index.ts:4689` |
| **Advisory** (`standard`) | `fetchSBCContext` | **كلمات مفتاحية** من bucket `ssss` | `index.ts:5466` |

السطر المسؤول:

```text
5463 | // Use keyword/storage path directly — vector RPC (match_sbc_documents) is not provisioned
5466 | const { context: sbcContext, files, sourceMeta: keywordMeta } = await fetchSBCContext(...)
```

**الخلاصة:** الوضع الاستشاري — وهو واجهة المنتج الأساسية — يعمل باسترجاع كلمات مفتاحية،
بينما 4,594 embedding جاهزة ومتاحة ويستخدمها الوضع التحليلي بالفعل. سبب الحرمان
**تعليق قديم غير صحيح**، وليس قيدًا تقنيًا.

هذا يفسّر مباشرة الشكوى المزمنة من دقة الاستشهاد في الوضع الاستشاري.

---

## 3. فروقات الهجرات — الأخطر على الحوكمة

| المصدر | العدد | المدى |
|---|---:|---|
| `supabase/migrations/*.sql` محليًا | 43 | `20260119153131` → `20260501000001` |
| `supabase_migrations.schema_migrations` في الإنتاج | 57 | `20260314072026` → `20260413175515` |
| **التقاطع** | **0** | **لا يوجد أي إصدار مشترك** |

**التبعات:**

1. مجلد `supabase/migrations/` **ليس** مصدر الحقيقة لمخطط الإنتاج.
2. مخطط الإنتاج طُبِّق عبر مسار آخر (لوحة التحكم / Lovable Cloud) ولم يُسجَّل محليًا.
3. `supabase db push` سيحاول تطبيق 43 هجرة على قاعدة تحتوي المخطط أصلًا — **عملية عالية الخطورة
   ويجب عدم تنفيذها قبل مصالحة السجلّين**.
4. جداول `source_registry` و`source_versions` و`corpus_coverage` و`validation_runs`
   موجودة في الإنتاج ولا يوجد لها أي ملف هجرة محلي — وهي **درفت خالص**.

---

## 4. مصفوفة RLS

- **47 جدولًا** في `public`، و**RLS مفعّل على 47 منها (100٪)**.
- **38 جدولًا** لها سياسات، و**9 جداول بلا أي سياسة**:

| الجدول | التقييم |
|---|---|
| `user_subscriptions` | RLS + 0 سياسات = رفض كامل للعميل؛ الوصول عبر `service_role` فقط. **آمن بالتصميم** |
| `webhook_dead_letters` | آمن — خدمي فقط |
| `enterprise_case_counters` | آمن — خدمي فقط |
| `sbc_pages` | فارغ أصلًا |
| `source_registry` / `source_versions` / `corpus_coverage` / `validation_runs` / `document_tables` | مهجورة؛ الرفض الافتراضي مقبول مؤقتًا |

> RLS مفعّل + صفر سياسات = **رفض افتراضي**، وهو وضع آمن لا ثغرة. يُسجَّل كملاحظة تصميم لا كخطر.

---

## 5. حالة الاستحقاق — العطل مُقاس بأرقام الإنتاج

| المقياس | القيمة |
|---|---:|
| صفوف `user_subscriptions` | 84 |
| مستخدمون متمايزون فيها | 70 |
| **مستخدمون لديهم أكثر من اشتراك** | **8** |
| صفوف `profiles` | 71 |

توزيع `profiles.plan_type` مقابل آخر اشتراك:

| `profiles.plan_type` | `user_subscriptions.status` | مستخدمون |
|---|---|---:|
| **free** | **trialing** | **24** |
| engineer | active | 14 |
| free | expired | 9 |
| engineer | trialing | 3 |
| enterprise | active | 3 |
| **free** | **trialing** (خطة أخرى) | **2** |
| … | … | … |

**العطل المثبت:** **26 مستخدمًا** (≈37٪ من قاعدة المستخدمين) لديهم `profiles.plan_type = 'free'`
بينما `user_subscriptions.status = 'trialing'`.

- الخادم يعتبرهم في تجربة نشطة ويصرّح لهم بالعمل.
- الواجهة تقرأ `profiles` عبر `getUserActivePlan()` (`src/utils/planAccess.ts:7`)، فتراهم `free`
  وتقفل وضعي Standard و Analysis عبر `canAccessMode()`.

النتيجة: **26 مستخدمًا مُنحوا تجربة لا يستطيعون رؤيتها ولا استخدامها.**
هذا لم يعد افتراضًا نظريًا في `docs/TRIAL_POLICY_DECISION.md` — إنه **مقاس على بيانات حية**.

بالإضافة إلى **8 مستخدمين** بصفوف اشتراك مكررة، وهو أثر سباق `check-then-insert` في `auto-trial`
عند غياب قيد `UNIQUE` على `user_subscriptions.user_id`.

---

## 6. حجم الملف الحرج

`supabase/functions/fire-safety-chat/index.ts` = **6,008 سطرًا** في ملف واحد يضم
الـ prompts والاسترجاع والتحقق من الاستشهاد والتوجيه. أي تعديل فيه عالي المخاطر بطبيعته.

---

## 7. ملخص النتائج ودرجات الخطورة

| # | النتيجة | الخطورة | الدليل |
|---|---|---|---|
| T1 | الوضع الاستشاري يتجاهل 4,594 embedding ويستخدم keyword، بسبب تعليق قديم غير صحيح | **CRITICAL** | `index.ts:5463,5466` مقابل `pg_proc` + عدّ الصفوف |
| T2 | تطابق صفري بين 43 هجرة محلية و57 هجرة إنتاج | **CRITICAL** | `schema_migrations` مقابل `rg --files` |
| T3 | 26 مستخدمًا (37٪) بتجربة نشطة على الخادم ومقفولة في الواجهة | **HIGH** | استعلام `profiles ⋈ user_subscriptions` |
| T4 | 4 جداول provenance موجودة بالبيانات، مهجورة، وبلا هجرة محلية | **HIGH** | `source_registry` 11 صفًا + `rg` = صفر مراجع |
| T5 | `source_registry.vector_indexed=false` مع وجود 4,594 embedding | **HIGH** | تناقض مباشر |
| T6 | 8 مستخدمين بصفوف اشتراك مكررة (لا `UNIQUE` على `user_id`) | **HIGH** | استعلام التكرار |
| T7 | KG (171 عقدة / 133 حافة / 10 ملخصات) يُكتب ولا يُقرأ | **MEDIUM** | صفر مراجع قراءة |
| T8 | 36 مقطعًا في SBC201 بلا embedding | **MEDIUM** | `count(*)` مقابل `count(embedding)` |
| T9 | فصل Normative/Commentary موجود في `source_registry` لكنه غير مربوط بالاسترجاع | **MEDIUM** | `authority_level` غير مستخدم |
| T10 | حاويات `ssss` و`source-pdfs` عامة وتحوي 306 MB من محتوى الأكواد | **MEDIUM** | `storage.buckets.public = true` |
| T11 | `fire-safety-chat/index.ts` = 6,008 سطرًا | **LOW** | عدّ الأسطر |

---

## 8. أثر ذلك على الخطة المعتمدة

| بند الخطة | الحالة بعد القياس |
|---|---|
| المرحلة 1أ «حذف كود pgvector الميت» | **يُلغى ويُعكس.** الكود سليم والبنية حية؛ المطلوب **تفعيله** للوضع الاستشاري لا حذفه |
| المرحلة 1ج «إضافة حقول وصفية جديدة» | **يُبسَّط.** الحقول موجودة في `source_registry`؛ المطلوب **ربطها** لا اختراعها |
| المرحلة 2 «فصل Normative/Commentary» | **يُبسَّط.** `authority_level` موجود بثلاث قيم؛ المطلوب استهلاكه في المحقق |
| المرحلة 5أ «قيد UNIQUE» | **يُؤكَّد ويُرفع لأولوية أعلى** — 8 حالات فعلية |
| المرحلة 7 «فروقات الهجرات» | **يُرفع من P2 إلى P0** — التطابق صفر، و`db push` خطر |

---

## 9. القرارات المطلوبة قبل المرحلة 1

1. **تفعيل الاسترجاع المتجهي في الوضع الاستشاري** — أعلى عائد مقابل أقل تغيير (سطر واحد + قياس).
   يُنصح بتنفيذه خلف علم تشغيل قابل للتراجع ومقارنة benchmark قبل/بعد.
2. **مصالحة سجل الهجرات** — استيراد مخطط الإنتاج كخط أساس، أم إعادة بناء المجلد المحلي من الإنتاج؟
3. **مصير الـ KG** — تقاعد / إحياء / تجميد.
4. **سياسة التجربة** — A / B / C، مع معالجة الـ26 حالة القائمة بأثر رجعي.
5. **الحاويات العامة** — هل نشر ملفات الأكواد علنًا مقصود ومرخّص؟
