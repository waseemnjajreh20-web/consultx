# R26 — Occupant Load Source Filter Fix

**Date:** 2026-05-07
**Sprint:** R26 Emergency Regression Fix
**File:** `supabase/functions/fire-safety-chat/index.ts`

---

## Problem

Two compounding bugs caused SBC801 sources to appear in occupant_load answers:

1. **`getTargetChapters` cross-reference** (lines 1965–1973):
   - Any query hitting SBC 201 Chapter 10 triggers `sbc801Chapters.add(6, 7)`
   - occupant_load queries always hit Chapter 10 → SBC801 always added

2. **File scoring fallback** (lines 2136–2149):
   - Files without page ranges in names (e.g. `SBC801_Ch10_v2_chunks`) score 1 (not 0)
   - `targeted801` is non-empty → `max801 = min(n, 4)` → 4 SBC801 files selected

---

## Fix A: `getTargetChapters` — Conditional Cross-Reference

**Changed** the cross-reference to only add SBC801 when fire/egress intent is detected:

```typescript
// Before (always cross-ref):
if (sbc201Chapters.has(9) || sbc201Chapters.has(10)) {
  sbc801Chapters.add(6);
  sbc801Chapters.add(7);
}

// After (R26 — conditional on fire/egress intent):
const hasFireOrEgressIntent = /مخرج|egress|exit|sprinkler|رشاش|إنذار|alarm|..../i.test(lower);
if (sbc201Chapters.has(9) || (sbc201Chapters.has(10) && hasFireOrEgressIntent)) {
  sbc801Chapters.add(6);
  sbc801Chapters.add(7);
}
```

Keywords triggering fire/egress cross-ref: مخرج, egress, exit, sprinkler, رشاش, إنذار, alarm, حماية حريق, fire protection, standpipe, smoke control.

Pure occupant_load queries ("ما متطلبات الحمل الإشغالي") don't contain these → no SBC801 added.

---

## Fix B: `fetchSBCContext` — SBC201-Only Restriction

**Added** `restrictToSBC201: boolean = false` parameter.

When `true`:
1. After `getTargetChapters`: `sbc801Chapters = []` — zero SBC801 chapters
2. `scored801 = []` — no SBC801 files scored
3. `max801 = 0` — no SBC801 files selected (overrides fallback)
4. Cache key includes `"sbc201only:"` prefix — prevents stale contaminated cache hits
5. `remaining` filter excludes "801" filenames in the padding step

**Cache key:**
```typescript
// Before:
const cacheKey = query.slice(0, 200).toLowerCase();

// After:
const cacheKey = `${restrictToSBC201 ? "sbc201only:" : ""}${query.slice(0, 200).toLowerCase()}`;
```

---

## Fix C: Call Site — Router-Aware Restriction

**Updated** the `fetchSBCContext` call in the advisory path:

```typescript
// Before:
const { context: sbcContext, files, sourceMeta: keywordMeta } = await fetchSBCContext(userQuery);

// After (R26):
const _restrictToSBC201 = _routerResultB2?.workflow_id === "wf_occupant_load";
const { context: sbcContext, files, sourceMeta: keywordMeta } = await fetchSBCContext(userQuery, undefined, _restrictToSBC201);
```

`_routerResultB2` is assigned at line 5435 (before `fetchSBCContext` at ~5450), so workflow_id is always available.

---

## Allowed Sources for occupant_load

| Source | Allowed |
|---|---|
| SBC 201 Table 1004.5 (structured table) | ✓ |
| SBC 201 Chapter 10 chunks | ✓ |
| SBC 201 any chapter | ✓ |
| SBC 801 any chapter | ✗ |
| SBC801_Ch10_v2_chunks | ✗ |
| SBC801_Ch9_v1_chunks | ✗ |

---

## Impact on Other Workflows

| Workflow | Impact |
|---|---|
| occupant_load | ✓ SBC801 excluded |
| egress | ✓ Unchanged — hasFireOrEgressIntent=true → SBC801 still cross-referenced |
| sprinkler | ✓ Unchanged |
| fire_alarm | ✓ Unchanged |
| general code lookup | ✓ Unchanged |
| Main mode | ✓ Unchanged — fetchSBCContext called without restrictToSBC201 |
| Analytical | ✓ Unchanged — uses fetchSBCContextVector, separate function |

---

## Constraints Not Violated

- لا DB write, لا migrations, لا bucket write
- لا B1 package changes, لا corpus changes
- Analytical, Main, Enterprise — غير متأثرة
