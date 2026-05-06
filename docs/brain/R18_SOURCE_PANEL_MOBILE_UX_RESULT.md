# R18 — SourcePanel Mobile UX

**Date:** 2026-05-06  
**Task:** TASK 4 — SourcePanel Mobile UX

---

## Audit

`src/components/SourcePanel.tsx` was reviewed for mobile issues:

| Area | Status |
|------|--------|
| Panel width | ✅ `w-full` on mobile, `sm:w-[480px]` on sm+, `lg:w-[520px]` on lg+ |
| Scrolling | ✅ `overflow-y-auto` on list body |
| PDF loading state | ✅ Loader2 spinner overlay fades in/out on iframe load |
| PDF error state | ✅ AlertTriangle + "فتح في نافذة جديدة" link |
| Empty-sources fallback | ✅ "لا توجد مصادر" centered message |
| No-PDF-URL fallback | ✅ "ملف PDF لهذا المصدر غير متوفر." with source filename |
| Escape key close | ✅ `keydown` listener present |
| Backdrop click close | ✅ overlay div has `onClick={onClose}` |

## Issue Found: Structured Table Evidence Indistinguishable from Broken Sources

**Before:** Structured table entries (`origin === "structured_table"`) had `pdfUrl = null`, so they received `cursor-default opacity-50` — same styling as truly unavailable PDF sources. Users saw a faded, apparently broken reference with no explanation.

**Fix applied in `PanelBody`:**

1. Added `const isStructuredTable = meta.origin === "structured_table"` per row.
2. Style selector:
   - `meta.pdfUrl` → clickable, cyan accent  
   - `isStructuredTable` → `cursor-default` (no opacity reduction) — it's working, just non-navigable
   - otherwise → `cursor-default opacity-40` (truly unavailable)
3. BookOpen icon color:
   - Available PDF → `#00D4FF` (cyan)
   - Structured table → `#FFC107` (amber) — signals "database reference"
   - Unavailable → `rgba(255,255,255,0.2)` (faded)

## Other Mobile UX Observations

- `print-source-panel` class and print header/footer injection use DOM APIs — function correctly on mobile (print dialog opens in mobile Safari/Chrome).
- Source prev/next navigation arrows are `w-3 h-3` — touch targets acceptable given the surrounding `p-1` button padding.
- `overflow-hidden` on the panel body wrapper combined with `overflow-y-auto` on the list div ensures content doesn't bleed outside the panel on mobile.

## Files Changed

- `src/components/SourcePanel.tsx` — structured table vs unavailable distinction in PanelBody

## Verdict

SourcePanel mobile layout is solid. One UX gap fixed: structured table evidence now renders with amber BookOpen icon and no opacity reduction, clearly indicating "database reference" rather than "broken link."
