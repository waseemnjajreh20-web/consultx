# R19C — Final Source Area Presentation

**Date:** 2026-05-08
**Sprint:** R19C Advisory Answer Layout & Final UX Polish
**Task:** TASK 4

---

## Post-R19B Status Check

### Source Chips Layout

| Check | Status |
|---|---|
| Appears below answer with `border-t` separator | ✓ |
| `flex-wrap` prevents overflow on narrow screens | ✓ |
| "+N أخرى" button clear and tappable (28px min-height) | ✓ |
| Structured table chip label: "🗂️ SBC 201 — جدول 1004.5" | ✓ (R19B) |
| Label-based dedup: no duplicate family chips | ✓ (R19B) |
| Bare generic chips suppressed if covered | ✓ (R19B) |

### Source Chips vs UtilityBar

Both have their own `border-t` separator. Stack order within the `space-y-3` message div:
1. Answer content (ChatMarkdownRenderer)
2. SourceChipsRow (border-t border-border/30)
3. UtilityBar (border-t rgba(255,255,255,0.08))

No overlap or collision observed.

---

## R19C Fix: Structured Table Chip Color

**Before (R19B):** All chips used cyan — structured_table chips looked identical to PDF chunk chips, just with a different icon.

**After (R19C):** Structured_table chips use amber to match the SourcePanel amber indicator.

```typescript
// R19C: structured_table chips use amber to match SourcePanel indicator
const isTable = meta.origin === "structured_table";
const chipStyle = isTable
  ? { background: "rgba(255,193,7,0.1)", color: "#FFC107", border: "1px solid rgba(255,193,7,0.3)", minHeight: "28px" }
  : { background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)", minHeight: "28px" };
```

**Visual result:**
```
المصادر:
🗂️ SBC 201 — جدول 1004.5   ← amber chip (structured DB)
📖 SBC 201 · صفحات 1001–1250  ← cyan chip (PDF chunk)
```

Now the two types of sources are visually distinct at a glance, matching the color language in SourcePanel.

---

## No Changes Needed

- Source chips `minHeight: 28px` — acceptable (smaller than 44px but chips are not primary navigation)
- `+N أخرى` style — consistent with chip style
- `sourcesLabel` text ("المصادر:") — clear
- SourcePanel open behavior — unchanged (structured_table → amber detail panel from R19B)
