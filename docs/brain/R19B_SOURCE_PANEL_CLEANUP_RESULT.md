# R19B — Source Panel Cleanup Result

**Date:** 2026-05-08
**Sprint:** R19B Mobile UX + Source Display Cleanup
**Task:** TASK 3

---

## File Modified

- `src/components/SourcePanel.tsx` — `PanelBody`

---

## Fix A — Structured Table Dedicated View

When `activeMeta?.origin === "structured_table"` and `!activeMeta?.pdfUrl`, instead of the generic "PDF غير متوفر" fallback, a dedicated informational view is shown:

```tsx
if (activeMeta?.origin === "structured_table") {
  const tableRef = activeMeta.tableRef ?? activeMeta.sectionRef ?? "—";
  const codeLabel = activeMeta.documentCode.replace("-", " ");
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <div style={{ background: "rgba(255,193,7,0.1)", border: "1px solid rgba(255,193,7,0.25)" }} ...>
        <BookOpen className="w-6 h-6" style={{ color: "#FFC107" }} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-white/90">
          {`SBC 201 — جدول 1004.5`}
        </p>
        <p className="text-xs text-white/45 ...">
          هذا المصدر مستخرج من قاعدة بيانات الجداول المنظمة — لا يوجد PDF مرتبط.
        </p>
      </div>
    </div>
  );
}
```

**Visual:** Amber BookOpen icon (matching the list-view amber for structured_table), table reference title, friendly explanation in Arabic and English. No technical filename exposed.

---

## Fix B — Remove Raw sourceFile from Fallback

**Before:**
```tsx
<p className="text-xs text-muted-foreground/60 text-center font-mono break-all">
  {activeMeta?.sourceFile}
</p>
```

**After:** Line removed entirely. The generic fallback now only shows:
- BookOpen icon
- "ملف PDF لهذا المصدر غير متوفر حالياً." / "The PDF for this source is not currently available."

No raw chunk filename (`SBC201_Ch10_v2_chunks.json`) is ever visible to the user.

---

## Fix C — List View Page Range Gate Removed

**Before:**
```tsx
{meta.pageStart !== null && meta.pageEnd !== null && meta.precision === "page_range" && (
  ... show pages + "دقيق" badge
)}
```

**After:**
```tsx
{meta.pageStart !== null && meta.pageEnd !== null && (
  ... show pages
  {meta.precision === "page_range" && (
    <span>دقيق</span>  // "exact" badge only for page_range precision
  )}
)}
```

Files with `chunk_range_only` precision now show their page range in the panel list (e.g. "صفحات 1001–1250") without the "دقيق/exact" badge. This is consistent with `formatSourceLabel` showing the range in chips.

---

## Before → After

**Clicking a structured_table chip — Before:**
```
📚 [icon]
"ملف PDF لهذا المصدر غير متوفر."
"__sbc_table__::SBC-201::1004.5"   ← raw filename exposed
```

**Clicking a structured_table chip — After:**
```
🟡 [amber BookOpen icon in circle]
"SBC 201 — جدول 1004.5"
"هذا المصدر مستخرج من قاعدة بيانات الجداول المنظمة — لا يوجد PDF مرتبط."
```
