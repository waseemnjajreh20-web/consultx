# R19 — Mobile UX Smoke Runbook

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish  
**Device:** iPhone / Android in portrait mode, Advisory mode (الاستشاري)

---

## Setup

1. Open `https://consultx.app` on mobile browser
2. Log in with a non-free account (trial or subscribed)
3. Switch to **Advisory mode (الاستشاري)** via BottomNav → mode icon
4. Language: Arabic (default)

---

## Test 1: ما متطلبات الحمل الإشغالي لمحل تجاري؟

**Query:** "ما متطلبات الحمل الإشغالي لمحل تجاري؟"

### Expected behavior:
- [ ] Header fits on screen without overflow — logo, title, buttons all visible
- [ ] Input sends without UI freeze
- [ ] Dynamic thinking message appears within ~500ms:
  - Shows text like "جاري استخلاص حقائق التصميم والاشتراطات... 📐"
  - Text does NOT overflow horizontally — wraps cleanly
  - No JSON or workflow internals visible
- [ ] Progress bar shows below thinking text
- [ ] Answer arrives: "2.8 م²/شخص" and "5.6 م²/شخص" and "28 م²/شخص" mentioned with GROSS qualifier
- [ ] Source chips show (max 3 visible):
  - First chip: "SBC 201 · Table 1004.5" or similar
  - If > 3 sources: "+ N أخرى" button present
- [ ] Copy / Export / PDF buttons below answer — all visible, no horizontal overflow
- [ ] No red toast error
- [ ] Input area visible below answer (not covered by response)

---

## Test 2: اعطني النص المرجعي لجدول SBC 201 Table 1004.5

**Query:** "اعطني النص المرجعي لجدول SBC 201 Table 1004.5"

### Expected behavior:
- [ ] Dynamic thinking shows during wait
- [ ] Answer contains a markdown table
- [ ] Table wraps in horizontal scroll container — does NOT break page layout
- [ ] Subtle scroll affordance visible at right edge of table (faint cyan tint)
- [ ] Swipe left on table scrolls horizontally without scrolling entire page
- [ ] Table text is readable (`text-xs sm:text-sm`)
- [ ] Source chips: max 3 shown, structured table source first (amber icon in panel)

---

## Test 3: اعطني النص المرجعي لجدول SBC 201 Table 1006.3.3

**Query:** "اعطني النص المرجعي لجدول SBC 201 Table 1006.3.3"

### Expected behavior:
- [ ] Answer renders correctly
- [ ] If answer has multiple sources (>3): "+N أخرى" shows
- [ ] Tapping a source chip opens SourcePanel
- [ ] SourcePanel:
  - Opens full-width on mobile ✓
  - Close X button visible at top ✓
  - Content not clipped behind home indicator (iOS safe area) ✓
  - If PDF available: loads in iframe ✓
  - If structured table: shows "المصادر المرجعية" list with amber icon, no "PDF غير متوفر" error ✓

---

## Test 4: اعطني نص SBC 801 Section 903.2.7

**Query:** "اعطني نص SBC 801 Section 903.2.7"

### Expected behavior:
- [ ] SBC 801 source appears (not SBC 201 — no cross-contamination)
- [ ] Section reference "903.2.7" is a deep link in the answer text
- [ ] Tapping the link opens SourcePanel and navigates to correct PDF page
- [ ] Source chips show SBC 801 source only
- [ ] No mixing of SBC 201 / SBC 801 chips

---

## Failure Scenarios

### If red toast appears:
- 503: should say "الخدمة مشغولة مؤقتًا، حاول مرة أخرى بعد لحظات." (NOT "Service error: 503")
- 429: should say "Daily message limit exceeded"
- Other: should say "حدث خطأ في الخدمة"

### If loading stuck > 60s:
- `getWaitingMessage()` kicks in with "تحديد الأنظمة والاشتراطات المطلوبة... ⏳"
- After 5 min: auto-retry (RefreshCw icon + "الرجاء الانتظار...")
- Should NOT show "(1/3)" retry count

---

## Visual Regression Checks (Desktop — confirm unchanged)

1. Open `https://consultx.app` on desktop
2. Same 4 queries above
3. Verify:
   - [ ] Header has full padding (px-6 py-4) and tagline visible
   - [ ] Logo is full size (w-10 h-10)
   - [ ] Source chips all show (no cap on desktop... actually cap applies on desktop too but 3 is enough for most answers)
   - [ ] Mode selector in header visible (not BottomNav)
   - [ ] Source panel opens as 480px right-side pane (not full-screen)
   - [ ] 3-pane layout works (sidebar + chat + source)
