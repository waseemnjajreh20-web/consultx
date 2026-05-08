# R19C — Advisory Visual Hierarchy Result

**Date:** 2026-05-08
**Sprint:** R19C Advisory Answer Layout & Final UX Polish
**Task:** TASK 3

---

## File Modified

`src/components/ChatMarkdownRenderer.tsx`

---

## Mode-Adaptive Heading Colors

Previous state: H1 and H2 headings always used `border-primary` (cyan `#00D4FF`) regardless of chat mode. This created visual inconsistency — an advisory (standard) answer with an amber left border on the bubble had cyan heading underlines inside.

### R19C Fix: Heading border adapts to mode

```typescript
// Computed once per render in ChatMarkdownRenderer
const headingAccent =
  mode === "standard" ? "rgba(255,140,0,0.5)"  :   // advisory  = amber
  mode === "analysis" ? "rgba(220,20,60,0.5)"  :   // analysis  = crimson
  "rgba(0,212,255,0.5)";                            // primary   = cyan

const headingAccentSoft =
  mode === "standard" ? "rgba(255,140,0,0.25)" :
  mode === "analysis" ? "rgba(220,20,60,0.25)" :
  "rgba(0,212,255,0.25)";
```

Applied to H1 and H2 via inline `borderBottom` style.

### Visual Result

| Mode | Bubble border | Heading underline |
|---|---|---|
| Primary (main) | Cyan | Cyan ✓ |
| Standard (advisory) | Amber | Amber ✓ |
| Analysis | Crimson | Crimson ✓ |

The heading hierarchy now feels visually unified with the mode identity of the bubble.

---

## Heading Margin Improvements

| Element | Before | After |
|---|---|---|
| H1 top margin | `mt-5` | `mt-6` |
| H2 top margin | `mt-4` | `mt-5` |
| H2 bottom margin | `mb-2.5` | `mb-3` |
| H1/H2 line-height | `leading-[1.8]` | `leading-[1.6]` |

The tighter `leading-[1.6]` for headings vs `1.8` for body text creates the expected typographic hierarchy (headings are more compact, body text has more breathing room).

---

## "المدخلات المطلوبة" Section

The model consistently uses an H2 heading like `## المدخلات المطلوبة` or `## المطلوب` before asking for user input. With the improved heading styling (mode-adaptive amber color in advisory, more top margin), this section now stands out clearly at the bottom of advisory answers.

No content post-processing was added — the heading detection is sufficient.

---

## Executive Summary Sections

The `isExecutive` detection (`الخلاصة التنفيذية` or `✅` in title) still applies, now using mode-adaptive colors for the background tint and border instead of always-cyan.

---

## Constraints Honored

- No model prompt changes
- No backend changes
- No complex content post-processing
- No strict answer template forcing
- CSS/style only
