# R19 — Mobile Advisory UX Polish Closeout

**Date:** 2026-05-07  
**Scope:** Mobile UX polish for Advisory mode  
**Result:** COMPLETE

---

## 1. هل نسخة الهاتف صارت usable؟ ✓

**نعم.** التحسينات الرئيسية:
- Header أكثر ضغطاً — يوفر مساحة إضافية للمحادثة على الهاتف
- Source chips منظمة (أهم 3 فقط + زر "أخرى")
- Dynamic thinking يعرض بشكل نظيف بدون overflow
- UtilityBar لا تتسرب خارج الشاشة
- SourcePanel لا تقطعه مؤشر الـ Home في iPhone
- الجداول تسمح بالتمرير الأفقي مع إشارة بصرية

---

## 2. أهم المشاكل التي أُصلحت

| المشكلة | الحل |
|---|---|
| Source chips بلا حد — تُعرض 5-8 chips | كاب عند 3 + زر "+ N أخرى" |
| Header ثقيل على الهاتف (24px/16px padding) | `px-3 py-2.5 sm:px-6 sm:py-4` |
| Dynamic thinking يتجاوز عرض الشاشة | `flex-wrap min-w-0 break-words` |
| UtilityBar 3 buttons تتجاوز 320px | `flexWrap: "wrap"` + `minHeight: 32px` |
| SourcePanel مقطوع بـ iPhone home indicator | `env(safe-area-inset-bottom)` |
| Retry count "(1/3)" مزعج | استُبدل بـ "الرجاء الانتظار..." |
| رسالة 503 ثنائية اللغة في toast | رسالة أحادية اللغة حسب اللغة الحالية |
| Messages container قد يتسرب أفقياً | `overflow-x-hidden` |
| Input padding زائد | `p-3 sm:p-4` |

---

## 3. هل dynamic thinking أفضل؟ ✓

- `flex-wrap` يمنع النص الطويل من تجاوز عرض الشاشة
- `break-words min-w-0` على الـ span يضمن الالتفاف
- `gap-3` → `gap-2` لتوفير مساحة
- الرسائل نفسها (من B2) لم تتغير — تبقى أنيقة وغير تشخيصية

---

## 4. هل المصادر أصبحت أنظف؟ ✓

- `SourceChipsRow` component جديد مع local state للـ "show more"
- أول 3 مصادر فقط — structured_table يظهر أولاً
- زر "+ N أخرى" للتوسع عند الحاجة
- `minHeight: 28px` لتحسين touch targets

---

## 5. هل SourcePanel تحسن؟ ✓

- `env(safe-area-inset-bottom, 0px)` أضيف للـ body div
- لا تغيير في الهيكل الأساسي — slide-over من اليمين (أو اليسار في RTL) يبقى
- Close button موجود ✓

---

## 6. هل الجداول والردود الطويلة أفضل؟ ✓

- `px-3 py-2 sm:px-4 sm:py-3` — خلايا أصغر على الهاتف
- `text-xs sm:text-sm` — نص أصغر قليلاً على الهاتف
- Scroll shadow (linear-gradient fade) كإشارة بصرية للتمرير الأفقي
- `overflowX: auto` + `WebkitOverflowScrolling: touch` محفوظان

---

## 7. هل tests pass؟ ✓

| Test | Result |
|---|---|
| TypeScript (R19 files) | ✓ No new errors |
| npm build | ✓ exit 0 |
| R24 tests (48 tests) | ✓ 48/48 PASS |

---

## 8. هل production deploy تم؟ ✓

```
git push origin main
→ eb3de39..65b1804  main -> main
```

Vercel auto-deploy triggered from main.  
New bundle: `ChatInterface-CTvhjiv8.js` (was `BSYRQ396`)  
Edge function: لم يُعاد نشره (لا تغيير في edge code)

---

## 9. ما بقي parking-lot؟

| Item | Priority |
|---|---|
| Bottom-sheet للـ SourcePanel (بدلاً من full-screen slide-over) | MEDIUM |
| Touch target للـ UtilityBar إلى 44px (Apple HIG minimum) | LOW |
| Suggested questions scrollable على الهاتف في وضع رأسي | LOW |
| Auto-collapse accordions في الردود الطويلة جداً | LOW |
| Source chip label truncation لـ labels الطويلة | LOW |

---

## 10. أول 3 مهام للـ parking-lot

1. **Touch targets 44px** — زيادة `minHeight: 44px` في UtilityBar
2. **Suggested questions layout** — تأكيد scroll أفقي على الهاتف في وضع primary
3. **Source chip truncation** — `max-width: 160px; overflow: hidden; text-overflow: ellipsis` لـ chips الطويلة

---

## Change Summary (R19)

| File | Change |
|---|---|
| `src/components/ChatInterface.tsx` | Header fix, SourceChipsRow, dynamic thinking wrap, retry msg, 503 toast, UtilityBar wrap, overflow-x-hidden, input padding |
| `src/components/SourcePanel.tsx` | iOS safe area bottom |
| `src/components/ChatMarkdownRenderer.tsx` | Compact table cells, scroll shadow |
| `docs/brain/R19_*.md` | 10 documentation files |

---

## Production State After R19+R25

| Layer | Status |
|---|---|
| Advisory Brain B2 | ON — all 4 flags |
| Dynamic Thinking | ON — visible (R22+R23+R24) |
| Occupant Load Quality | Fixed (R24: GROSS rules) |
| Gemini 503 Resilience | Fixed (R25: fallback+retry) |
| Mobile Header | Reduced (R19) |
| Source Chips | Capped at 3 (R19) |
| Dynamic Thinking Display | Wraps gracefully (R19) |
| SourcePanel iOS | Safe area fixed (R19) |
| Tables Mobile | Compact + scroll hint (R19) |
| Error Messages | Localized (R19) |
| Bundle | `ChatInterface-CTvhjiv8.js` |
