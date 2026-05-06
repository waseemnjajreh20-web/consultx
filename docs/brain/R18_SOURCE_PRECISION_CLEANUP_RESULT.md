# R18 — Source Precision Cleanup

**Date:** 2026-05-06  
**Task:** TASK 3 — Source Precision Cleanup

---

## Problem

When multiple chunks from the same PDF were selected across non-contiguous page ranges (e.g., pages 10–20, 200–210, 550–570), the backend reported precision `'page_range'` with a span of 560 pages. The frontend displayed this as "صفحات 10–570 (دقيق)" — a misleadingly broad range labeled "exact."

## Root Cause

`fetchSBCContext` keyword path (index.ts ~line 2284) computed `min(pageStart)..max(pageEnd)` across all selected chunks for a file, then set `precision: 'page_range'` regardless of how wide that span was.

## Fix

### 1. `supabase/functions/fire-safety-chat/index.ts`

In `fetchSBCContext`, added span check: if `pageEnd - pageStart > 100`, downgrade precision from `'page_range'` to `'chunk_range_only'`.

```typescript
const span = (m && m.minPage != null && m.maxPage != null) ? m.maxPage - m.minPage : 0;
precision: (hasPages && span <= 100) ? 'page_range' : 'chunk_range_only',
```

**Why 100 pages?** Chunks within a 100-page window are plausibly contiguous (e.g., Chapter 10 of SBC 201). Broader spans indicate non-contiguous retrieval — the range is not a useful navigation target.

### 2. `src/utils/sourceMetadata.ts` — `formatSourceLabel`

Added `meta.precision === "page_range"` guard before emitting page range in chip label:

```typescript
if (meta.pageStart !== null && meta.pageEnd !== null && meta.precision === "page_range") {
  // show "📖 SBC 201 — صفحات N–M"
}
// else: "📖 SBC 201" (no range)
```

### 3. `src/components/SourcePanel.tsx` — `PanelBody`

Added same `meta.precision === "page_range"` guard to the page-row in the source list. Since `page_range` is always true in that branch now, removed the redundant `"exact"` badge conditional and show it always.

## Precision Hierarchy (enforced)

| Source type | Condition | Shown label |
|-------------|-----------|-------------|
| Structured table | `origin === "structured_table"` | `🗂️ SBC 201 — جدول X (دليل منظم)` |
| Tight page range | `precision === "page_range"` (span ≤ 100) | `📖 SBC 201 — صفحات N–M` + "دقيق" badge |
| Broad chunk range | `precision === "chunk_range_only"` | `📖 SBC 201` (no page numbers) |
| Unknown | no mapping | bare title |

## Files Changed

- `supabase/functions/fire-safety-chat/index.ts` — precision downgrade for broad spans
- `src/utils/sourceMetadata.ts` — formatSourceLabel page-range guard
- `src/components/SourcePanel.tsx` — page-row guard + cleaned up "exact" badge

## Verdict

Broad page ranges (span > 100 pages) no longer mislead users with "دقيق" labels. Tight ranges (≤ 100 pages) continue to display with full precision. Structured table evidence is unaffected.
