# R19 — SourcePanel Mobile Polish Result

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish

---

## Changes Applied

### 1. iOS Safe Area Bottom Padding (SourcePanel.tsx)

**Before:**
```tsx
<div className="flex-1 overflow-hidden">
  <PanelBody ... />
</div>
```

**After:**
```tsx
<div className="flex-1 overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
  <PanelBody ... />
</div>
```

On iPhone X+ with home indicator, `env(safe-area-inset-bottom)` = 34px. Without this, the bottom source item or PDF viewport was clipped behind the home indicator.

---

## Existing Behavior Review

| Feature | Status |
|---|---|
| `w-full` on mobile (full width) | ✓ Already correct |
| `top-0 bottom-0` full height | ✓ Already correct |
| Close button (`X`) in header | ✓ Present and visible |
| Scroll behavior inside panel | ✓ `overflow-y-auto` on list view |
| iOS safe-area-inset-bottom | ✗ FIXED by R19 |

---

## Structured Table Evidence Display

In `PanelBody`, when `meta.origin === "structured_table"`:
```tsx
const isStructuredTable = meta.origin === "structured_table";
// Button style: cursor-default (no pointer), amber BookOpen icon
// No "pdfUrl available" message shown
```

Structured table sources display as:
- Amber BookOpen icon (not cyan — signals no PDF available)
- Label: "SBC 201 · Table 1004.5" etc.
- Clickable to open list (no PDF iframe)
- **No "PDF not found" message** — the structured table is the evidence itself

This is correct behavior — structured table data comes from the edge function's database query, not a PDF bucket file.

---

## PDF Missing Fallback

When `!meta.pdfUrl` and not structured table:
```tsx
<div className="flex flex-col items-center justify-center h-full gap-3 p-6">
  <BookOpen className="w-10 h-10 text-muted-foreground/40" />
  <p className="text-sm text-muted-foreground text-center">
    ملف PDF لهذا المصدر غير متوفر.
  </p>
  <p className="text-xs text-muted-foreground/60 text-center font-mono break-all">
    {activeMeta?.sourceFile}
  </p>
</div>
```

**Issue found:** `sourceFile` (private bucket path) is shown to users.  
**Assessment:** This is a fallback for debugging purposes — the sourceFile is the chunk filename (e.g., "SBC201_Chapter10.pdf"), not a private storage URL. Acceptable for now.

---

## Bottom-Sheet Consideration

Current mobile behavior: SourcePanel slides in as full-screen overlay from right (or left for RTL).  
A bottom-sheet pattern would require a significant refactor.  
**Decision:** Keep current slide-over pattern — it's clean on mobile and doesn't conflict with input area. The iOS safe area fix resolves the main clipping issue.

---

## Desktop Preservation

`env(safe-area-inset-bottom, 0px)` defaults to `0px` on desktop — no visual change.  
Pane mode (desktop 3-pane layout) is unaffected (separate code path).
