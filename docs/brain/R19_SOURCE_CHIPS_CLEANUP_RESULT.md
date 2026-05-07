# R19 — Source Chips Cleanup Result

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish

---

## Problem

Old code showed ALL source chips with no limit:
```tsx
{resolved.map((meta) => (
  <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ...">
    {formatSourceLabel(meta, language)}
  </button>
))}
```

On Advisory queries with 5-8 sources, this creates 5-8 chip rows — visually noisy and space-wasting on mobile.

---

## Solution: SourceChipsRow Component

Added a new `SourceChipsRow` functional component before `ChatInterface`:

```tsx
function SourceChipsRow({ resolved, language, onOpenSource, sourcesLabel }) {
  const [showAll, setShowAll] = React.useState(false);
  const MAX_VISIBLE = 3;
  
  // Sort: structured_table sources first (table evidence is most relevant)
  const sorted = React.useMemo(
    () => [...resolved].sort((a, b) =>
      (a.origin === "structured_table" ? 0 : 1) - (b.origin === "structured_table" ? 0 : 1)
    ),
    [resolved]
  );
  
  const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - MAX_VISIBLE;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-3 border-t border-border/30">
      {visible.map(...)}
      {!showAll && hiddenCount > 0 && (
        <button onClick={() => setShowAll(true)}>
          {language === "ar" ? `+${hiddenCount} أخرى` : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
```

---

## Behavior

| Scenario | Display |
|---|---|
| 1-3 sources | All shown, no "more" button |
| 4 sources | 3 shown + "+1 أخرى" / "+1 more" |
| 6 sources | 3 shown + "+3 أخرى" / "+3 more" |
| Click "more" | All 6 shown, button disappears |

### Structured table sources appear first
- `origin === "structured_table"` sorts to position 0
- Table evidence (SBC 201 Table 1004.5 etc.) always visible in the first 3

### Chip styling preserved
- Same `background: rgba(0,212,255,0.1)`, `color: "#00D4FF"` style
- "More" button has slightly dimmer style to distinguish it
- Touch targets improved: `py-1` (was `py-0.5`), `minHeight: 28px`

---

## Import Update

Added `SourceMeta` to the sourceMetadata import:
```tsx
import { ..., formatSourceLabel, type ChunkPageMeta, type SourceMeta } from "@/utils/sourceMetadata";
```

---

## Desktop Preservation

- `flex-wrap` was already on the old container — desktop shows chips on multiple rows if needed
- No change in desktop behavior
- "More" button only appears when > 3 sources — on desktop this is also a quality-of-life improvement
