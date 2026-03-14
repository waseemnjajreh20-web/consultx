# Gemini API Migration — ConsultX

## تاريخ التحويل: 2026-03-14
## المؤلف: Eng. Waseem Njajreh

---

## ملخص التحويل

تم تحويل طبقة AI API من **Lovable Gateway** إلى **Google Gemini API** مباشرة.

### قبل التحويل
```
URL: https://ai.gateway.lovable.dev/v1/chat/completions
Auth: Bearer ${LOVABLE_API_KEY}
Format: OpenAI-compatible (messages[], model, stream)
Response: SSE → data: {"choices":[{"delta":{"content":"..."}}]}
```

### بعد التحويل
```
URL (streaming):     https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={key}&alt=sse
URL (non-streaming): https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
Auth: API Key in URL parameter
Format: Gemini native (systemInstruction, contents[], generationConfig)
Response: SSE → transformed to OpenAI format via TransformStream
```

---

## الموديلات المُستخدمة

| الوضع | الموديل القديم (Lovable) | الموديل الجديد (Gemini) |
|-------|--------------------------|-------------------------|
| الأساسي (primary) | google/gemini-2.5-flash | gemini-2.5-flash-preview-05-20 |
| الاستشاري (standard) | google/gemini-2.5-pro | gemini-2.5-pro-preview-05-06 |
| التحليلي (analysis) | google/gemini-2.5-pro | gemini-2.5-pro-preview-05-06 |

---

## الملف المُعدّل

### `supabase/functions/fire-safety-chat/index.ts`

| التعديل | الوصف |
|---------|-------|
| متغير البيئة | `LOVABLE_API_KEY` → `GOOGLE_GEMINI_API_KEY` |
| دالة جديدة | `convertToGeminiFormat()` — تحويل OpenAI messages → Gemini contents |
| دالة مُعدّلة | `callAINonStreaming()` — استخدام Gemini generateContent endpoint |
| قسم مُعدّل | Streaming call — استخدام streamGenerateContent + TransformStream |
| حذف | خطأ 402 (خاص بـ Lovable credits) |

### ما لم يتغيّر
- ❌ System Prompts (الأسطر 94-314)
- ❌ RAG Logic & fetchSBCContext (الأسطر 972-1226)
- ❌ Vision Pipeline Prompts (الأسطر 1257-1359)
- ❌ Citation Logic
- ❌ Daily Limits & Auth
- ❌ Frontend ChatInterface.tsx

---

## متغيرات البيئة

### المطلوب (Supabase Secrets)
```bash
supabase secrets set GOOGLE_GEMINI_API_KEY=your-api-key-here
```

### المُزال
- `LOVABLE_API_KEY` — لم يعد مطلوباً للـ AI (لا يزال مطلوباً لـ OAuth إذا استُخدم)

---

## طبقة التحويل (TransformStream)

الـ Frontend يتوقع تنسيق OpenAI SSE:
```
data: {"choices":[{"delta":{"content":"text chunk"}}]}
data: [DONE]
```

Gemini API تُعيد تنسيق مختلف:
```
data: {"candidates":[{"content":{"parts":[{"text":"text chunk"}]}}]}
```

تم إنشاء `TransformStream` في الـ Edge Function يقرأ Gemini SSE ويُعيد كتابته بتنسيق OpenAI.
→ **النتيجة:** الـ Frontend لا يحتاج أي تعديل.

---

## تحويل تنسيق الرسائل

### OpenAI Format (قبل)
```json
{
  "messages": [
    {"role": "system", "content": "system prompt"},
    {"role": "user", "content": "message"},
    {"role": "assistant", "content": "response"}
  ]
}
```

### Gemini Format (بعد)
```json
{
  "systemInstruction": {"parts": [{"text": "system prompt"}]},
  "contents": [
    {"role": "user", "parts": [{"text": "message"}]},
    {"role": "model", "parts": [{"text": "response"}]}
  ]
}
```

### Vision (صور)
```json
// OpenAI:
{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}

// Gemini:
{"inline_data": {"mime_type": "image/jpeg", "data": "base64..."}}
```

---

## اختبار التحويل

1. **الوضع الأساسي:** أرسل سؤال بسيط → يجب أن يرد سريعاً (Flash)
2. **الوضع الاستشاري:** أرسل سؤال عن SBC → يجب أن يرد مع استشهادات (Pro)
3. **الوضع التحليلي + صورة:** ارفع مخطط هندسي → يجب أن يعمل Vision Pipeline
4. **Streaming:** النص يظهر تدريجياً في الواجهة
5. **الحد اليومي:** بعد تجاوز الحد → خطأ 429
