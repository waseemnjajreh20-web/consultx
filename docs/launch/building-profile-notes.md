# ملاحظات الإطلاق — C1a: أساس معطيات المبنى + مولّد تقرير الامتثال

**التاريخ:** 2026-09-03 · **الفرع:** recovery/stabilization-2026-08-23
**الحالة:** الطبقة النقية (SQL doc + مكتبتا TypeScript + الاختبارات) جاهزة وموثّقة أدناه.
لم يُلمس أي من: `src/components/ChatInterface.tsx`، أي دالة حافة، `src/App.tsx` — التوصيل موصوف هنا فقط، لم يُنفَّذ.

## الملفات المُسلَّمة

| الملف | الدور |
|---|---|
| `docs/db/20260903_building_profiles.sql` | تعريف `public.building_profiles` + RLS مملوكة للمستخدم + trigger + فهرس + وصفة اختبار أمني |
| `src/lib/buildingProfile.ts` | الأنواع، `validateBuildingProfile`، `profileToPromptBlock`، `profileCompleteness`، `suggestProfileFromText` |
| `src/lib/complianceReport.ts` | `buildComplianceReportHtml`، `buildComplianceReportFilename`، محوّل ماركداون آمن مستقل |
| `src/__tests__/buildingProfile.test.ts` | 25 اختبار (تحقق، اكتمال، استخلاص، الكتلة النصية) |
| `src/__tests__/complianceReport.test.ts` | 24 اختبار (أقسام، تعقيم، RTL، الاستشهادات) |

## 1) ترتيب التطبيق (لا تُبدَّل الخطوات)

1. **مراجعة بشرية لقائمة `occupancy_group`** في `docs/db/20260903_building_profiles.sql` مقابل نص SBC 201 المنشور رسمياً — القائمة مطابقة لما ورد في تكليف هذه المهمة، لكنها لم تُقابَل حرفياً مع جدول التصنيفات الرسمي. راجعها مع وسيم قبل التطبيق على الإنتاج.
2. **تطبيق SQL على الإنتاج عبر Management API فقط** (ممنوع `supabase db push` — قاعدة تشغيل ثابتة). القسم 1-3 من الملف idempotent وآمن لإعادة التشغيل.
3. **التحقق الفوري** بتشغيل وصفة القسم 4 (الاختبار الأمني) من SQL Editor أو psql — يجب أن يرى المستخدم B صفر صفوف لمستخدم A، ويُرفض إدخال/تعديل/حذف عبر المستخدمين. النتيجة تُوثَّق هنا بعد التنفيذ.
4. **نشر مكتبتي TypeScript** ضمن دورة النشر المعتادة — لا أثر لهما وحدهما (لا يستوردهما أي مكوّن بعد)، فنشرهما آمن ومنفصل زمنياً عن أي شيء آخر.
5. **توصيل الواجهة** (قسم 2 أدناه) خلف بطاقة/حوار جديدين لا يُفعَّلان تلقائياً بأي علم — مجرد عناصر UI معزولة.
6. **توصيل الخادم** (قسم 3 أدناه) خلف `BUILDING_PROFILE_ENABLED` — يبقى مطفأ افتراضياً (أي سلوك مطابق بايتاً لما قبل التغيير) حتى تفعيله صراحة على بيئة معاينة أولاً.
7. **فحص الأوضاع الثلاثة** (`primary`/`standard`/`analysis`) مع العلم مفعّلاً على بيئة معاينة — قاعدة تشغيل ثابتة: أي تغيير في `fire-safety-chat` يُفحص على الأوضاع الثلاثة قبل الإنتاج.
8. **تفعيل `BUILDING_PROFILE_ENABLED=1`** على الإنتاج بعد نجاح الفحص.
9. **تفعيل `COMPLIANCE_REPORT_ENABLED`** للزر في شريط الأدوات — مستقل تماماً عن الخطوة 8، يمكن تأجيله.

## 2) خطة توصيل الواجهة (لم تُنفَّذ — وصف فقط)

- **بطاقة المبنى في رأس المحادثة:** عنصر مضغوط بجانب اختيار الوضع (primary/standard/analysis) يعرض ملخصاً (`تصنيف الإشغال · الطوابق · نوع الإنشاء`) واستخدام `profileCompleteness()` لعرض شريط تقدّم/عدّاد "الحقول الناقصة". يُحمَّل الصف عبر `.from("building_profiles").select().eq("conversation_id", id).maybeSingle()` تحت RLS العادية (لا حاجة لصلاحيات خاصة، المستخدم يرى صفّه فقط).
- **حوار التعديل:** نموذج يمرّر مدخلات المستخدم إلى `validateBuildingProfile()` قبل أي `upsert`؛ رسائل الخطأ (عربية جاهزة من الدالة) تُعرض تحت كل حقل. القوائم المنسدلة لـ`occupancy_group`/`construction_type` تُبنى من `OCCUPANCY_GROUPS`/`CONSTRUCTION_TYPES` المُصدَّرتين — مصدر واحد للحقيقة، لا تكرار للقيم في الواجهة.
- **زر "اقتراح من المحادثة":** يمرّر آخر N رسائل من المستخدم (وليس رسائل المساعد) إلى `suggestProfileFromText()`، ثم **يعرض الاقتراح للمراجعة في نفس حوار التعديل** — لا يُطبَّق تلقائياً أبداً، ولا يستبدل حقلاً يدوياً مضبوطاً مسبقاً إلا بموافقة صريحة (الدالة متحفظة عمداً؛ راجع التعليق التوثيقي فوق `OCCUPANCY_KEYWORDS` بخصوص افتراض "سكني" العام → R-2).
- **زر التقرير في شريط الأدوات:** بجانب أزرار Copy/Export/PDF الحالية في `UtilityBar` (`src/components/ChatInterface.tsx`, حوالي السطر 139-507)، خلف `professionalReportEnabled`-مثيل جديد مبني على علم `COMPLIANCE_REPORT_ENABLED`. عند الضغط: تجميع عناصر المحادثة (سؤال/جواب/استشهادات مُحلَّلة عبر `resolveSourcesWithMeta` الموجودة + `parseCitationToken`) إلى `ComplianceReportItem[]`، واستدعاء `buildComplianceReportHtml()`، ثم **نفس نمط `handlePdf` الموجود بالضبط**: `new Blob([html],{type:"text/html;charset=utf-8"})` → `URL.createObjectURL` → `window.open` → طباعة/حفظ من المتصفح. اسم الملف من `buildComplianceReportFilename()`.

## 3) خطة توصيل الخادم (لم تُنفَّذ — وصف فقط)

في `supabase/functions/fire-safety-chat/index.ts`، بجانب نمط `USER_MEMORY_ENABLED` الموجود فعلياً (حوالي السطر 1238-1263: `userMemoryEnabled()` + `fetchUserMemory()`)، يُضاف نمط مطابق تماماً:

```ts
function buildingProfileEnabled(): boolean {
  return (Deno.env.get("BUILDING_PROFILE_ENABLED") ?? "").trim() === "1";
}
async function fetchBuildingProfile(adminClient, conversationId, userId) {
  const { data } = await adminClient.from("building_profiles")
    .select("*").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle();
  return data ?? null;
}
```

**قاعدة صارمة:** الكتلة الناتجة من `profileToPromptBlock(profile, language)` تُحقن كـ **رسالة/جزء `system` مستقل**، منفصلة تماماً عن سياق الاسترجاع (`sbc_documents` chunks) وعن أي شيء يمرّ عبر `parseCitationToken`/`ADVISORY_CITATION_TOKENS_ENABLED`. الدالة نفسها تُصدِّر النص بترويسة صريحة ("من إدخال المستخدم — ليست نصاً من الكود") بالعربية والإنجليزية معاً، لكن الالتزام الحقيقي يقع على نقطة الحقن في الخادم: **يُمنع** دمجها في نفس الحقل النصي الذي يحمل المقاطع المسترجَعة، حتى لا يستطيع النموذج الاستشهاد بها كـ `[SBC-XXX ...]`. يُنصح بحقنها كرسالة `system` منفصلة قبل رسالة المستخدم مباشرة، وبعد كتلة `user_memory` إن وُجدت.

الفحص المطلوب: تأكيد أن تعطيل العلم (الوضع الافتراضي) يعيد سلوكاً مطابقاً بايتاً لما قبل التغيير — نفس نمط كل الأعلام الأخرى في هذا الملف.

## 4) جدول الأعلام الجديدة

| العلم | الافتراضي | الأثر عند `"1"` |
|---|---|---|
| `BUILDING_PROFILE_ENABLED` | مطفأ | `fire-safety-chat` يجلب صف `building_profiles` للمحادثة الحالية ويحقن `profileToPromptBlock()` كرسالة نظام منفصلة |
| `COMPLIANCE_REPORT_ENABLED` | مطفأ | زر "تقرير" إضافي يظهر في `UtilityBar` (مستقل عن `professionalReportEnabled` الحالي الخاص بوضع analysis فقط) |

## 5) مخاطر ونقاط مفتوحة

- **افتراض "سكني" العام → R-2:** موثّق في التعليق فوق `OCCUPANCY_KEYWORDS` بـ `src/lib/buildingProfile.ts` — قرار هندسي معقول (مبنى متعدد الوحدات أشيع من فيلا عند غياب التفصيل) لكنه افتراض، لا استخلاص مؤكد. يُعرض دائماً للمراجعة عبر زر "اقتراح من المحادثة"، لا يُطبَّق تلقائياً.
- **قائمة `occupancy_group`/`construction_type`:** يجب مقابلتها حرفياً مع نص SBC 201 الرسمي قبل الاعتماد النهائي (انظر خطوة 1 أعلاه).
- **`hazard_class` نص حر بلا CHECK:** لا يوجد تصنيف معياري ثابت طُلب في التكليف؛ اختراع قائمة هنا كان سيُعد ادّعاء مصدر لا يملكه النظام — تُرك للإدخال اليدوي عمداً.
- **لا استخلاص تلقائي لـ`hazard_class` أو `name`:** نفس المبدأ — الاستخلاص من نص حر لهذين الحقلين خطر كاذب-إيجابي أعلى من قيمته.
- **RLS:** الوصفة الأمنية (قسم 4 من ملف SQL) لم تُشغَّل بعد ضد الإنتاج (الجدول غير موجود بعد) — إلزامية قبل أي `BUILDING_PROFILE_ENABLED=1`.
