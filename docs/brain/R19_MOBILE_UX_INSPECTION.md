# R19 — Mobile UX Inspection

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish  
**Files inspected:**
- `src/components/ChatInterface.tsx`
- `src/components/SourcePanel.tsx`
- `src/components/AppShell.tsx`
- `src/components/ChatMarkdownRenderer.tsx`
- `src/components/BottomNav.tsx`
- `src/index.css`

---

## 1. Header Height — ISSUE ⚠️

**Location:** `ChatInterface.tsx` line 1369  
```tsx
<header className="flex items-center justify-between px-6 py-4 ...">
```
- `px-6 py-4` = 24px horizontal, 16px vertical → ~72px total header height on mobile
- Logo is `w-10 h-10` (40px) — takes width on a narrow phone
- App tagline `text-xs` is visible even on small phones — wastes vertical space
- On a 375×667px phone, 72px header + ~100px input + 64px BottomNav = 236px chrome. Only 431px for chat.
- When iOS keyboard is visible (~250px), only ~180px for messages.

**Severity:** MEDIUM — header is not broken, just suboptimal.  
**Fix:** Reduce to `px-3 py-2.5 sm:px-6 sm:py-4`, shrink logo `sm:w-10 sm:h-10` to `w-8 h-8`, hide tagline on mobile.

---

## 2. Mode Indicator — OK ✓

- Desktop: mode selector in header (`hidden md:flex`) ✓
- Mobile: BottomNav has a mode dot + mode sheet — correctly hidden on desktop ✓
- Below input: `<span class="mode-indicator-dot">` + mode label — visible on all screens ✓

---

## 3. Back Button — N/A ✓

No back button in ChatInterface; navigation handled by AppShell sidebar on desktop and BottomNav on mobile.

---

## 4. Language Toggle — OK ✓

`<LanguageToggle />` in header — small button, doesn't crowd on mobile.

---

## 5. Input Area — MINOR ISSUE ⚠️

**Location:** `ChatInterface.tsx` line 1995  
```tsx
<div className="border-t border-border/50 bg-card/30 backdrop-blur-xl p-4">
```
- Input padding `p-4` (16px) is fine
- Below input: `flex items-center justify-between mt-2 px-1` — mode indicator + daily counter
- On very small screens (320px), these two elements may be tight when counter text is long
- `BottomNav` spacer `h-16` is present, correctly creating room

**Fix:** Reduce input container to `p-3 sm:p-4` for slightly more chat area on mobile.

---

## 6. Message Bubbles — MINOR ⚠️

**Location:** `ChatInterface.tsx` line 1664  
```tsx
<div className="flex-1 max-w-3xl rounded-2xl p-4 ...">
```
- `flex-1 max-w-3xl` — bubble fills available width, correct
- `p-4` (16px) padding inside bubble — somewhat generous on mobile
- `chat-bubble-max` in CSS: `max-width: 85% !important` — only applies if using that class
- The bubble itself uses `flex-1` not `chat-bubble-max`, so it takes full available width. Fine.
- Avatar `w-10 h-10` + `gap-4` takes 56px per message row — leaves ~319px for bubble on 375px phone. Adequate.

**No change needed**, the bubble layout is acceptable.

---

## 7. Dynamic Thinking Message — ISSUE ⚠️

**Location:** `ChatInterface.tsx` line 1960-1966  
```tsx
<div className="flex items-center gap-3">
  <TypingIndicator mode={chatMode} label={t("typingIndicator")} />
  <span className="text-muted-foreground text-sm animate-fade-in" key={...}>
    {getLoadingMessage()}
  </span>
</div>
```
- `flex items-center` with no wrapping — if dynamic thinking message is long (e.g., "تحديد الأنظمة المطلوبة... ⏳"), combined with TypingIndicator width, may force overflow on narrow screens
- No `min-w-0` or `break-words` on the text span
- `gap-3` (12px) is generous for narrow screens

**Fix:** Add `flex-wrap`, `min-w-0`, `break-words` to prevent horizontal overflow.

---

## 8. Long Advisory Answers — OK ✓

- `overflow-y-auto` on the messages container handles long answers correctly
- `max-w-4xl mx-auto` centers content on desktop, fills on mobile
- Accordions (`<details>`) for structured sections collapse correctly
- No hard overflow detected

---

## 9. Tables — MINOR ⚠️

**Location:** `ChatMarkdownRenderer.tsx` line 556  
```tsx
<div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
  <table style={{ minWidth: "480px" }}>
```
- `overflowX: auto` is correctly set ✓
- `minWidth: 480px` forces horizontal scroll on phones — correct ✓
- Table cell padding `px-4 py-3` is adequate but slightly spacious
- No visual "scrollable" indicator (subtle shadow) — user may not know to swipe
- RTL is respected via `text-right` on `<th>` elements ✓

**Fix:** Add subtle right-edge scroll shadow as visual affordance.

---

## 10. Source Chips — ISSUE ❌

**Location:** `ChatInterface.tsx` line 1905-1931  
```tsx
<div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 border-t border-border/30">
  {resolved.map((meta) => (<button ...>{formatSourceLabel(meta, ...)}`))}
</div>
```
- **No cap on source count** — all sources shown, can be 5-10 chips
- On mobile, multiple rows of chips create significant visual noise
- `formatSourceLabel` can return long labels (e.g., "SBC 201 · Chapter 10 · Table 1004.5")
- Structured table sources not sorted to front

**Fix:** 
- Cap visible chips at 3 by default
- Sort structured_table sources first
- Show `+N أخرى` / `+N more` collapse button
- Clicking expands all sources

---

## 11. SourcePanel — MINOR ⚠️

**Location:** `SourcePanel.tsx` line 491  
```tsx
<div className="fixed top-0 bottom-0 z-50 flex flex-col w-full sm:w-[480px] lg:w-[520px]">
```
- `w-full` on mobile — correct, fills viewport width ✓
- `top-0 bottom-0` — full height but does not account for iOS safe area at the bottom
- Panel content can be clipped behind iPhone home indicator
- Close button present in header ✓
- No bottom-sheet behavior on mobile (comes in as full-screen overlay) — acceptable

**Fix:** Add `env(safe-area-inset-bottom)` padding to the panel body div.

---

## 12. Copy/Export/PDF Buttons — MINOR ⚠️

**Location:** `ChatInterface.tsx` line 414  
```tsx
<div style={{ display: "flex", alignItems: "center", gap: "6px", paddingTop: "10px" }}>
  <button style={{ padding: "3px 11px", whiteSpace: "nowrap" }}>نسخ</button>
  <button ...>تصدير</button>
  <button ...>PDF</button>
</div>
```
- Container is `flex` without `flexWrap: "wrap"` — on 320px screens, 3 buttons may overflow
- Button touch targets: `3px 11px` padding → ~28px height, below Apple's 44px minimum
- On narrow phones, buttons may be cut off

**Fix:** Add `flexWrap: "wrap"` to container; increase button `paddingTop/Bottom` on mobile for touch targets.

---

## 13. Loading/Retry Display — MINOR ⚠️

**Location:** `ChatInterface.tsx` line 1954-1957  
```tsx
{retryCount > 0 ? (
  <div className="flex items-center gap-3">
    <RefreshCw className="w-5 h-5 text-destructive animate-spin" />
    <span className="text-muted-foreground">{t("retrying")} ({retryCount}/{MAX_RETRIES})...</span>
  </div>
) : ...}
```
- Shows raw count `(1/3)`, `(2/3)` — slightly alarming UX
- Could be replaced with quieter message

**Fix:** Hide the count `(N/MAX)` — just show "الرجاء الانتظار..." / "Please wait..."

---

## 14. Horizontal Overflow — POTENTIAL ⚠️

- `body { overflow-x: hidden }` is set in `index.css` line 69 ✓
- The messages container `overflow-y-auto` handles vertical scrolling
- No `overflow-x: hidden` on the messages container itself
- Long unbreakable Arabic/English words in user messages could theoretically overflow
- Table overflow is handled via `WebkitOverflowScrolling: touch` ✓

**Fix:** Add `overflow-x: hidden` to the messages scroll container.

---

## 15. Sticky Bottom / Input Behavior — OK ✓

- Input div is naturally sticky (not fixed) inside `flex-col h-[100dvh]` — correct
- `h-[100dvh]` handles iOS viewport-height correctly
- `env(safe-area-inset-bottom)` on BottomNav: present ✓
- `h-16` spacer for BottomNav: present ✓
- No content overlap detected in logic review

---

## Priority Fix List (by impact)

| # | Issue | Severity | File |
|---|---|---|---|
| 1 | Source chips no cap — too many chips on mobile | HIGH | ChatInterface.tsx |
| 2 | Header padding wastes vertical space on mobile | MEDIUM | ChatInterface.tsx |
| 3 | Dynamic thinking text overflows on narrow screens | MEDIUM | ChatInterface.tsx |
| 4 | UtilityBar buttons don't wrap, touch targets small | MEDIUM | ChatInterface.tsx |
| 5 | SourcePanel missing iOS safe area bottom padding | MEDIUM | SourcePanel.tsx |
| 6 | Retry message shows alarming count (1/3) | LOW | ChatInterface.tsx |
| 7 | 503 error shows bilingual string as toast | LOW | ChatInterface.tsx |
| 8 | Messages container missing overflow-x: hidden | LOW | ChatInterface.tsx |
| 9 | Tables missing scroll affordance | LOW | ChatMarkdownRenderer.tsx |
