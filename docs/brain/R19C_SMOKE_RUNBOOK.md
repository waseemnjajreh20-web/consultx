# R19C — Smoke Runbook

**Date:** 2026-05-08
**Sprint:** R19C Advisory Answer Layout & Final UX Polish
**Task:** TASK 8

---

## Environment

- URL: `https://consultx.app`
- Mode: Advisory (Standard / Consultant)
- Language: Arabic (RTL)
- Test on: iOS Safari (375px width) AND desktop Chrome (≥1024px)

---

## Q1: ما متطلبات الحمل الإشغالي لمحل تجاري؟

### Expected Answer Structure

✅ Starts with heading (e.g. "## المرجع الحاكم")
✅ Table with 3 rows: 2.8 / 5.6 / 28 م²/شخص + column headers
✅ Section asking for floor area (## المدخلات المطلوبة or similar)

### Visual Checks

| Check | Expected |
|---|---|
| Heading underline color | Amber (advisory mode) |
| Gap between heading and table | ≥12px (space-y-3) |
| Table scrolls horizontally on mobile | Visible scroll if >400px wide |
| Table header background | Muted with amber-tinted heading border |
| "SBC 201 Table 1004.5" bold link | Cyan underline, clickable |
| Source chips below answer | 🗂️ SBC 201 — جدول 1004.5 (amber chip) + at most 1 cyan PDF chip |
| No "SBC 801" chip | ✓ absent |
| UtilityBar (copy/export/pdf) | Below source chips, full-width buttons on mobile |

---

## Q2: اعطني النص المرجعي لجدول SBC 201 Table 1004.5

### Expected

✅ Model quotes the table text or reproduces it
✅ Possibly uses blockquote `>` syntax
✅ Source chip: 🗂️ SBC 201 — جدول 1004.5 (amber)

### Visual Checks

| Check | Expected |
|---|---|
| Blockquote has left border in LTR? / right border in RTL? | border-s-2 = inline-start (logical) |
| Blockquote padding on correct side | ps-4 = inline-start |
| Blockquote text | Muted italic, leading-[1.8] |
| Empty lines between paragraphs | 16px (h-4) visible gap |

---

## Q3: اعطني النص المرجعي لجدول SBC 201 Table 1006.3.3

### Expected

✅ Section text with possibly sub-table
✅ Source: SBC-201 chunk PDF chip (cyan)

### Visual Checks

| Check | Expected |
|---|---|
| If table present: horizontal scroll on mobile | ✓ |
| Scroll gradient affordance (right-edge fade) | Visible |
| Table minWidth 400px (not 480px) | Slightly more mobile-friendly |
| Citation tokens [SBC 201 | Section 1006.3.3 | ...] | Cyan underline, clickable |

---

## Q4: اعطني نص SBC 801 Section 903.2.7

### Expected

✅ Model provides verbatim text from SBC 801
✅ Source chip: 📖 SBC 801 · صفحات... (cyan)
✅ NO SBC 201 chip unless both families are in sources

### Visual Checks

| Check | Expected |
|---|---|
| Answer direction | RTL (Arabic heading detection) |
| Heading underline in primary mode (no advisory) | Cyan |
| No SBC 201 chip appearing | ✓ |
| Blockquote if present | border-s-2 (correct side) |

---

## Cross-Cut Checks (All Questions)

| Check | Expected |
|---|---|
| Dynamic thinking animation | Shows while waiting, disappears when response starts streaming |
| No Service error 503 | ✓ (R25 Gemini resilience active) |
| Copy button | Copies clean text to clipboard |
| PDF button | Opens print dialog with branded header |
| Share/Export button | Opens native share sheet on iOS; copies on desktop |
| Source chips no overflow | flex-wrap keeps them on multiple lines if needed |
| "+N أخرى" button | Appears if >3 chips after dedup |
| Structured_table chip color | Amber (🗂️) — distinct from PDF chunks (blue 📖) |
| SourcePanel on chip click | - PDF chunk: opens PDF frame or page detail |
| | - Structured_table: amber icon panel "جدول 1004.5" |

---

## Known Acceptable Non-Issues

- Bundle size warning (>500kB): pre-existing, not R19C
- Browserslist data age warning: pre-existing
- `caniuse-lite` update notice: pre-existing
