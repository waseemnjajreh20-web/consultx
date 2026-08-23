# ثغرة الحصص ما زالت مفتوحة — من باب الدوال لا الجدول

**التاريخ:** 2026-08-23 · **الخطورة: حرجة** · **الحالة: مفتوحة، تحتاج إجراءً من المالك**
**التحقق:** المنظّم أثبتها بنفسه بتنفيذ استعلام كدور `anon` على الإنتاج داخل معاملة مُلغاة (ROLLBACK). لم تُكتب أي بيانات.

---

## 1. الخلاصة

في وقت سابق اليوم أُغلقت سياسة RLS المعطوبة على `mode_daily_usage`، وتحقّقنا أن الزائر المجهول لم يعد يرى أي صف. **ذلك الإصلاح صحيح لكنه غير كافٍ.**

عدّادات الحصص تُقرأ وتُكتب في الإنتاج عبر دوال `SECURITY DEFINER` — وهذه الدوال **تتجاوز RLS بحكم تعريفها**. وهي ممنوحة لدور `anon`، وتأخذ `user_id` **كمعامل** بدل أن تشتقّه من هوية المستدعي. فأي شخص يملك المفتاح العام (وهو منشور في حزمة الواجهة بالتصميم) يستطيع استدعاءها لأي مستخدم.

بعبارة أخرى: أغلقنا باب الجدول، وباب الدوال ما زال مفتوحاً على مصراعيه.

---

## 2. الدليل

### أ. المسح العام (CONFIRMED)

| القياس | النتيجة |
|---|---|
| دوال `public` | 51 |
| منها ينفّذها `anon` | **51 (كلها)** |
| منها `SECURITY DEFINER` وينفّذها `anon` | **47** |
| منها `SECURITY DEFINER` + `anon` + **بلا أي فحص لـ** `auth.uid()` | **15** |

السبب الجذري ليس هجرة بعينها: `pg_default_acl` لمخطط `public` يمنح `anon=X` لكل دالة تُنشأ فيه تلقائياً. لذلك `REVOKE ... FROM PUBLIC` لم يُزلها قط — لأنها منحة صريحة لدور مسمّى.

### ب. الإثبات العملي (CONFIRMED)

نُفِّذ على الإنتاج داخل `BEGIN ... ROLLBACK`، بلا JWT:

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) FROM public.get_all_mode_daily_counts(
  (SELECT user_id FROM public.mode_daily_usage LIMIT 1));
ROLLBACK;
```

**النتيجة: 3 صفوف.** دور `anon` قرأ عدّادات مستخدم آخر بنجاح.

### ج. الدوال المكشوفة

| الدالة | النوع |
|---|---|
| `decrement_mode_daily_count(p_user_id uuid, p_mode text)` | **كتابة — تصفير الحصة** |
| `increment_mode_daily_count(p_user_id uuid, p_mode text)` | كتابة |
| `increment_daily_usage(p_user_id uuid)` | كتابة |
| `get_mode_daily_count(p_user_id uuid, p_mode text)` | قراءة |
| `get_all_mode_daily_counts(p_user_id uuid)` | قراءة |
| `get_daily_usage(p_user_id uuid)` | قراءة |

**لم يُستدعَ أي من دوال الكتابة** — تنفيذها كان سيعني كتابة على الإنتاج. الإثبات لا يحتاجها: المنحة والتوقيع متطابقان مع دالة القراءة التي نجحت، والفرق بينهما هو ما تفعله لا من يستطيع استدعاءها.

### د. الأثر
`decrement_mode_daily_count` تُنقص عدّاد أي مستخدم. تكرار الاستدعاء = وصول غير محدود للوضعين الاستشاري والتحليلي، وكلاهما يوجَّه إلى `gemini-2.5-pro` — أي فاتورة حقيقية عليك. وتُسرَّب أنماط الاستخدام لكل مستخدم لمن لا يملك حساباً.

---

## 3. لماذا الإصلاح آمن (CONFIRMED)

كل مستدعٍ لهذه الدوال في الشيفرة هو `adminClient` — أي مفتاح `service_role`:

```
check-subscription/index.ts:223,229          adminClient.rpc("get_daily_usage" / "get_all_mode_daily_counts")
fire-safety-chat/index.ts:2758,2767,2781,2790,2805,2896   adminClient.rpc(...)
fire-safety-chat/geminiResilience.ts:290,295 adminClient.rpc("decrement_mode_daily_count" / "decrement_daily_usage")
```

**صفر استدعاء من `src/`** — لا الواجهة ولا أي كود يعمل بدور `anon` أو `authenticated` يلمسها. و`service_role` يملك `BYPASSRLS` ومنحه منفصل، فلا يتأثر بالسحب.

النتيجة: سحب التنفيذ من `anon` و`authenticated` **محايد سلوكياً بالكامل** — لا شيء في المنتج يتوقف.

---

## 4. الإجراء المطلوب من المالك

يُشغَّل في Supabase SQL Editor:

```sql
REVOKE EXECUTE ON FUNCTION public.decrement_mode_daily_count(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_mode_daily_count(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mode_daily_count(uuid, text)       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_mode_daily_counts(uuid)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_daily_usage(uuid)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_daily_usage(uuid)                  FROM anon, authenticated;

-- تحقق: يجب أن تعود f لكل من anon وauthenticated، وt لـ service_role
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%mode_daily%' OR p.proname LIKE '%daily_usage%')
ORDER BY p.proname;
```

للعكس عند الحاجة: `GRANT EXECUTE ON FUNCTION ... TO authenticated;`

**بعد التنفيذ:** أعيد تشغيل إثبات دور `anon` (ROLLBACK) — يجب أن يفشل بـ `permission denied for function`.

---

## 5. المسألة الأوسع — قرار مؤجَّل لا مهمَل

الـ 15 دالة `SECURITY DEFINER` المكشوفة لـ `anon` بلا فحص هوية ليست كلها بنفس الخطورة؛ معظم البقية دوال مساعدة للـ RLS نفسها (`is_org_owner`، `is_active_case_member`، `get_org_member_role`، …) وتُستدعى من داخل سياسات RLS حيث السياق موثوق. لكن وجودها قابلة للاستدعاء مباشرة من `anon` يستحق مراجعة مستقلة:

- `can_access_enterprise_document_object` — تُرجع قراراً أمنياً؛ استدعاؤها مباشرة قد يكشف وجود مستندات.
- `get_unindexed_chunks` / `get_indexed_chunk_count` — قد تكشف بنية المدوّنة.
- دوال المؤسسات (`is_org_owner`، `is_org_owner_or_admin`، `is_active_org_member`، `is_case_assignee`) — تكشف علاقات عضوية بالاستقصاء.

**التوصية:** بعد إغلاق دوال الحصص، مراجعة منفصلة لوضع المنح على مستوى المخطط (`ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM anon`) بحيث لا تولد الدوال الجديدة مكشوفة. لا يُنفَّذ ضمن هذه الجولة — أثره أوسع من نطاقها ويحتاج فحص كل مستدعٍ.

---

## 6. الدرس

إغلاق سياسة RLS لا يغلق دالة `SECURITY DEFINER`، لأن الأخيرة مصمَّمة لتجاوز RLS. أي تدقيق أمني لهذا المشروع يجب أن يفحص **مصفوفة منح الدوال** كما يفحص سياسات الجداول — وهو ما لم يفعله تدقيق RLS السابق، ولذلك أُعلن الإغلاق قبل أوانه.
