# R19C — Markdown Readability Polish Result

**Date:** 2026-05-08
**Sprint:** R19C Advisory Answer Layout & Final UX Polish
**Task:** TASK 2

---

## File Modified

`src/components/ChatMarkdownRenderer.tsx`

---

## Changes Applied

### 1. Outer Container Spacing: `space-y-1` → `space-y-3`

```typescript
// Before
className="prose prose-invert prose-sm max-w-none space-y-1"

// After (R19C)
className="prose prose-invert prose-sm max-w-none space-y-3"
```

**Impact:** All top-level sections (headings, text blocks, tables, accordions) now have 12px gap instead of 4px. The answer structure is immediately more scannable.

---

### 2. Paragraph Margin: `my-1` → `my-2`

```typescript
// Before
<p key={index} className="text-foreground leading-[1.8] my-1">

// After (R19C)
<p key={index} className="text-foreground leading-[1.8] my-2">
```

**Impact:** Paragraphs within a section now have 8px top/bottom margin instead of 4px. Multiple paragraphs no longer feel like one wall of text.

---

### 3. Empty Line Height: `h-1.5` → `h-4`

```typescript
// Before
if (!line.trim()) return <div key={index} className="h-1.5" />;

// After (R19C)
if (!line.trim()) return <div key={index} className="h-4" />;
```

**Impact:** A blank line in the model's output now creates 16px of visible breathing room (vs. 6px before). This is the single highest-impact change — the model uses blank lines as paragraph separators and now they're actually visible.

---

### 4. TextRenderer Wrapper: `my-0.5` → `my-2`

```typescript
// Before
<div key={index} className="my-0.5">

// After (R19C)
<div key={index} className="my-2">
```

**Impact:** Adjacent text sections now have 8px top/bottom margin instead of 2px.

---

### 5. Blockquote Logical Properties: `border-r-2 pr-4` → `border-s-2 ps-4`

```typescript
// Before (physical — wrong for LTR English)
className="border-r-2 border-primary/40 pr-4 my-2 ..."

// After (R19C — logical — correct for both RTL Arabic and LTR English)
className="border-s-2 border-primary/40 ps-4 my-3 ..."
```

**Impact:** Blockquotes now correctly show their accent border on the inline-start edge (right for Arabic, left for English), with proper padding direction. Also bumped `my-2` → `my-3` for blockquote breathing room.

---

### 6. Table minWidth: `480px` → `400px`

```typescript
// Before
style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "480px" }}

// After (R19C)
style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "400px" }}
```

**Impact:** Tables on 390px-wide phones (iPhone 14/15) now fit more content before triggering horizontal scroll. 400px is a reasonable minimum for SBC table columns.

---

## Before / After Readability

**Before (tight):**
```
[4px gap] ## المرجع الحاكم [4px]
[2px wrapper] [4px paragraph] SBC 201 Table 1004.5...
[6px empty line]
[2px wrapper] [4px paragraph] المعامل هو 2.8 م²...
[4px gap] ## معاملات الحساب [4px]
[table]
```

**After (breathable):**
```
[12px gap] ## المرجع الحاكم [12px]
[8px wrapper] [8px paragraph] SBC 201 Table 1004.5...
[16px empty line]
[8px wrapper] [8px paragraph] المعامل هو 2.8 م²...
[12px gap] ## معاملات الحساب [12px]
[table]
```
