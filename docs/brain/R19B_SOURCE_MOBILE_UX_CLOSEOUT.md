# R19B — Source Mobile UX Closeout

**Date:** 2026-05-08
**Sprint:** R19B Mobile UX + Source Display Cleanup
**Status:** COMPLETE

---

## 1. What Was Fixed

### Source Chips (ChatInterface.tsx + sourceMetadata.ts)

**Root cause:** `formatSourceLabel` gated page range display behind `precision === "page_range"`. Files loaded with `chunk_range_only` precision (e.g. `SBC201-1001-1250.json`) produced the identical label `📖 SBC 201` as files with no page data, causing duplicate-looking chips.

**Fixes applied:**
1. `formatSourceLabel`: Show page range for ALL precision levels → `📖 SBC 201 · صفحات 1001–1250`
2. `SourceChipsRow`: Two-pass filter — label-based dedup (removes identical chips) + suppress bare generic family chips when a richer chip already covers that document family

### Source Panel (SourcePanel.tsx)

**Root cause:** Clicking a structured_table chip opened the detail view, which fell through to the generic fallback: "ملف PDF غير متوفر" + raw chunk filename.

**Fixes applied:**
1. Dedicated structured_table view: amber icon, table reference (e.g. "SBC 201 — جدول 1004.5"), friendly explanation
2. Removed raw `sourceFile` from generic fallback — user never sees `__sbc_table__::SBC-201::1004.5` or `SBC201_Ch10_v2_chunks.json`
3. List view page range: removed `precision === "page_range"` gate — all files with page data show their range; only `page_range` precision gets the "دقيق/exact" badge

### UtilityBar (ChatInterface.tsx)

**Root cause:** Comment claimed "44px touch target compliance" but `minHeight` was `32px`.

**Fix:** `minHeight: "44px"` + `justifyContent: "center"` added to BASE button style.

### Mobile Long Answer / Table (inspection only)

All issues addressed in R19. `ChatMarkdownRenderer.tsx` already has `overflowX: auto`, `WebkitOverflowScrolling: touch`, responsive sizing, and RTL detection. No additional changes needed.

---

## 2. Test Results

| Check | Result |
|---|---|
| TypeScript | ✓ Exit 0 |
| R26 validation (49 tests) | ✓ 49/49 PASS |
| R24 validation (48 tests) | ✓ 48/48 PASS |
| npm build | ✓ Exit 0, 2m 36s |
| Frontend bundle | ✓ `ChatInterface-D8H_3-WA.js` 579.10 kB |

---

## 3. Production State After R19B

| Layer | Status |
|---|---|
| Source chips dedup | ✓ Fixed (label dedup + bare chip suppression) |
| formatSourceLabel page range | ✓ Fixed (all precisions) |
| SourcePanel structured_table view | ✓ Fixed (dedicated amber panel) |
| SourcePanel raw filename exposure | ✓ Fixed (removed) |
| SourcePanel list page range | ✓ Fixed (all precisions) |
| UtilityBar touch target | ✓ Fixed (44px) |
| Mobile table overflow | ✓ (R19, unchanged) |
| occupant_load answer order | ✓ R26 (unchanged) |
| SBC801 source contamination | ✓ R26 (unchanged) |
| R24 rules | ✓ Active (unchanged) |
| Advisory Brain B2 — 4 flags | ✓ All ON (unchanged) |
| Gemini 503 resilience | ✓ R25 (unchanged) |
| Edge function | Unchanged (R26 — deployed dbbb204) |
| Frontend | ✓ Deployed (R19B — 34a6a78) |

---

## 4. Smoke Test Checklist (Manual)

After Vercel deploy completes:

- [ ] Ask "ما متطلبات الحمل الإشغالي لمحل تجاري؟"
  - Source chips: should show `🗂️ SBC 201 — جدول 1004.5` + at most one `📖 SBC 201 · صفحات ...` chip (no bare duplicate)
  - No `SBC801` chips
- [ ] Click the `🗂️` chip — should open structured_table panel with amber icon and table ref title, NOT "PDF غير متوفر"
- [ ] Open any answer, tap Copy / Export / PDF — buttons should be visually taller (44px touch target)
- [ ] Check on narrow mobile viewport — UtilityBar buttons should wrap to second line (not overflow)

---

## 5. Parking Lot

- **Source label i18n:** `formatSourceLabel` now uses `·` (middle dot) for pdf chunks and `—` (em dash) for structured_table labels. Consistent within each type but different between types — by design.
- **`chunk_range_only` page ranges:** These come from the chunk filename (e.g. `-1001-1250` suffix). If the edge function emits chunk-level page_start/page_end metadata, the precision would upgrade to `page_range` and the label would show the tighter range — no code change needed.
