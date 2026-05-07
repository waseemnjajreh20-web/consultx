# R19 — Table / Long Answer Readability Result

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish

---

## Tables — Changes Applied (ChatMarkdownRenderer.tsx)

### 1. Compact Cell Padding on Mobile

**Before:**
```tsx
// Header cells
className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap"

// Body cells  
className="px-4 py-2.5 text-foreground align-top leading-[1.8]"
```

**After:**
```tsx
// Header cells
className="px-3 py-2 sm:px-4 sm:py-3 text-right font-semibold text-foreground whitespace-nowrap text-xs sm:text-sm"

// Body cells
className="px-3 py-2 sm:px-4 sm:py-2.5 text-foreground align-top leading-[1.7] text-xs sm:text-sm"
```

On mobile: `px-3 py-2` = 12px/8px (was 16px/10-12px). Slightly more compact.  
`text-xs sm:text-sm` = 12px on mobile, 14px on sm+.

### 2. Scroll Affordance Shadow

Added subtle right-edge fade as visual cue that table scrolls horizontally:
```tsx
<div style={{
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
  background: "linear-gradient(to right, transparent 85%, rgba(0,212,255,0.04) 100%)",
}}>
```

The faint cyan tint at the right edge signals to users they can swipe right.

---

## Existing Table Behavior (Preserved)

| Feature | Status |
|---|---|
| `overflowX: auto` horizontal scroll | ✓ Already present |
| `WebkitOverflowScrolling: touch` | ✓ Already present |
| `minWidth: 480px` forces scroll on phone | ✓ Already present |
| Zebra row striping | ✓ Preserved |
| RTL: `text-right` on headers | ✓ Preserved |
| Rounded corners | ✓ Preserved |
| Border styling | ✓ Preserved |

---

## Long Advisory Answers

Long advisory answers (occupant load, fire suppression, etc.) render via ChatMarkdownRenderer with:
- **Headings** (`##`, `###`) → rendered as visual separators
- **Accordions** (`<details>`) → collapsible — already implemented
- **Bullets** → geometric icons per mode
- **Bold text** → mode-colored highlights
- **Auto-scroll** → `scrollToBottom()` fires on `chatItems` change ✓

**No backend content change needed** — presentation layer is sufficient.

---

## RTL Preservation

- Table `text-right` headers preserved on mobile ✓
- Arabic text `break-words` added to dynamic thinking spans ✓
- No `direction` attribute changes ✓

---

## Long-Press on Code/Text

No change — clipboard copy works via UtilityBar. Native long-press remains available for users who prefer it.
