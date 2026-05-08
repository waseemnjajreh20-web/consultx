# R19C — Answer Layout Inspection

**Date:** 2026-05-08
**Sprint:** R19C Advisory Answer Layout & Final UX Polish
**Task:** TASK 1

---

## Files Inspected

- `src/components/ChatMarkdownRenderer.tsx` (933 lines — full read)
- `src/components/ChatInterface.tsx` — bubble layout, SourceChipsRow, UtilityBar

---

## Simulated Answers

### Q1: ما متطلبات الحمل الإشغالي لمحل تجاري؟

Expected advisory output (post-R26):
```
## المرجع الحاكم
SBC 201 Table 1004.5 هو المرجع الحاكم...

## معاملات الحساب
| نوع المساحة | معامل الإشغال |
...

## المدخلات المطلوبة
لإتمام الحساب أحتاج منك مساحة المحل...
```

### Q2–Q4: نص مرجعي / Section 903.2.7

Expected: blockquote or H1 + paragraph of verbatim code text.

---

## Evaluation Matrix

| Check | Finding | Severity |
|---|---|---|
| الرد يبدأ بعنوان واضح؟ | H2 headings render correctly | ✓ |
| الجداول قابلة للقراءة؟ | overflowX+zebra rows good, but minWidth:480px too wide for small phones | Minor |
| Bullets متباعدة جيدًا؟ | mb-[10px] per item — OK | ✓ |
| Arabic RTL مضبوط؟ | dir detection based on first 300 chars | ✓ |
| الأرقام والوحدات واضحة؟ | Bold-highlighted via ** | ✓ |
| "لذلك أحتاج منك" واضح؟ | Only stands out if model uses a heading; plain paragraph is dense | Needs fix |
| المصدر منفصل بصريًا؟ | border-t separator on SourceChipsRow — good | ✓ |
| أزرار copy/export/pdf مزعجة؟ | UtilityBar always rendered even for short answers | Minor |
| Overflow على الهاتف؟ | None observed | ✓ |

---

## Root Issues Found

### 1. Critical: Outer container spacing too tight

```typescript
// Current
className="prose prose-invert prose-sm max-w-none space-y-1"
//                                                  ^^^^^^^^ 4px between ALL sections
```

With `space-y-1`, headings + paragraphs + tables all run into each other with only 4px separation.

### 2. Critical: TextRenderer wrapper margin nearly zero

```typescript
// Current
<div key={index} className="my-0.5">  // 2px top+bottom
```

Adjacent text sections (two paragraphs in a row) have only 2px gap between them.

### 3. Medium: Paragraph margin too tight

```typescript
// Current
<p key={index} className="text-foreground leading-[1.8] my-1">  // 4px
```

Paragraphs within a section have only 4px top/bottom margin. Multiple paragraphs feel like one wall of text.

### 4. Medium: Empty line too small

```typescript
// Current
if (!line.trim()) return <div key={index} className="h-1.5" />;  // 6px
```

A blank line in the model output should create visible breathing room. 6px is imperceptible, especially with line-height 1.8.

### 5. Minor: Table minWidth too aggressive

```typescript
minWidth: "480px"  // Forces scroll even on 390px phones for tables that could fit
```

### 6. Minor: Blockquote logical properties

```typescript
className="border-r-2 ... pr-4"  // Physical right — correct for RTL Arabic but wrong for LTR English
```

Should use logical properties `border-s-2 ps-4` for correct behavior in both directions.

### 7. Minor: H1/H2 heading borders always primary (cyan)

Advisory mode uses amber (#FF8C00) accent, but headings always have `border-primary/40` (cyan). Visual inconsistency with the bubble's left border color.

---

## Message Structure (Order)

```
┌─────────────────────────────────┐
│ ChatMarkdownRenderer (answer)   │
│   H1/H2 headings                │
│   Paragraphs                    │
│   Tables (scrollable)           │
│   Bullets/numbered lists        │
├─────────────────────────────────┤  ← border-t
│ SourceChipsRow                  │
├─────────────────────────────────┤  ← border-t
│ UtilityBar (Copy/Export/PDF)    │
└─────────────────────────────────┘
```

Source chips and UtilityBar are visually separated — good. The content area is the problem.

---

## Fixes Planned

| Fix | Location | Change |
|---|---|---|
| Outer spacing | ChatMarkdownRenderer | `space-y-1` → `space-y-3` |
| TextRenderer wrapper | ChatMarkdownRenderer | `my-0.5` → `my-2` |
| Paragraph margin | renderTextLine | `my-1` → `my-2` |
| Empty line | renderTextLine | `h-1.5` → `h-4` |
| Table minWidth | TableRenderer | `480px` → `400px` |
| Blockquote direction | renderTextLine | `border-r-2 pr-4` → `border-s-2 ps-4` |
| H2 mode-adaptive border | ChatMarkdownRenderer | inline style using mode |
