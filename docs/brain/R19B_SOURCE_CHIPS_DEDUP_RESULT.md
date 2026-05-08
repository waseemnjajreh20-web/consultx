# R19B — Source Chips Dedup + Label Cleanup Result

**Date:** 2026-05-08
**Sprint:** R19B Mobile UX + Source Display Cleanup
**Task:** TASK 2

---

## Files Modified

- `src/utils/sourceMetadata.ts` — `formatSourceLabel`
- `src/components/ChatInterface.tsx` — `SourceChipsRow`

---

## Fix A — `formatSourceLabel` (sourceMetadata.ts)

**Before:**
```typescript
if (meta.pageStart !== null && meta.pageEnd !== null && meta.precision === "page_range") {
  return `📖 ${code} — Pages ${meta.pageStart}–${meta.pageEnd}`;
}
return `📖 ${code}`;
```

**After:**
```typescript
// R19B: show page range for ALL precisions (not just "page_range")
if (meta.pageStart !== null && meta.pageEnd !== null) {
  return lang === "en"
    ? `📖 ${code} · pp. ${meta.pageStart}–${meta.pageEnd}`
    : `📖 ${code} · صفحات ${meta.pageStart}–${meta.pageEnd}`;
}
return `📖 ${code}`;
```

**Effect:** Files with `precision: "chunk_range_only"` that have a page range from the filename (e.g. `SBC201-1001-1250.json`) now show as `📖 SBC 201 · صفحات 1001–1250` instead of `📖 SBC 201`. This makes the two SBC201 chunk files visually distinct.

---

## Fix B — `SourceChipsRow` dedup (ChatInterface.tsx)

Replaced the single-pass sort with a two-pass filter:

**Pass 1** — Collect which document families already have a specific (non-bare) chip:
```typescript
const coveredFamilies = new Set<string>();
for (const meta of rawSorted) {
  const lbl = formatSourceLabel(meta, language);
  const bareLabel = `📖 ${rawCode.replace("-", " ")}`;
  if (lbl !== bareLabel) coveredFamilies.add(rawCode);
}
```

**Pass 2** — Label dedup + suppress bare generic labels:
```typescript
const seenLabels = new Set<string>();
return rawSorted.filter(meta => {
  const lbl = formatSourceLabel(meta, language);
  if (seenLabels.has(lbl)) return false;
  seenLabels.add(lbl);
  // Hide bare "📖 SBC 201" if richer chip already covers that family
  if (lbl === bareLabel && meta.origin !== "structured_table" && coveredFamilies.has(rawCode)) {
    return false;
  }
  return true;
});
```

---

## Before → After for Typical Occupant Load Answer

**Before (broken):**
```
المصادر:
🗂️ SBC 201 — جدول 1004.5 (دليل منظم)
📖 SBC 201
📖 SBC 201
+1 أخرى
```

**After (fixed):**
```
المصادر:
🗂️ SBC 201 — جدول 1004.5 (دليل منظم)
📖 SBC 201 · صفحات 1001–1250
```

- `SBC201_Ch10_v2_chunks.json` (pageStart=null) → bare `📖 SBC 201` → suppressed (family already covered by structured_table)
- `SBC201-1001-1250.json` (pageStart=1001, pageEnd=1250) → `📖 SBC 201 · صفحات 1001–1250` ✓
- Structured table sentinel → `🗂️ SBC 201 — جدول 1004.5 (دليل منظم)` ✓

---

## Rules Satisfied

| Rule | Status |
|---|---|
| structured table source appears first | ✓ (sort remains unchanged) |
| No duplicate generic family labels | ✓ (label dedup) |
| Bare "SBC 201" hidden when richer chip covers it | ✓ (coveredFamilies filter) |
| Max 3 sources visible | ✓ (MAX_VISIBLE = 3 unchanged) |
| No same family/source type twice without different ref/page | ✓ |
