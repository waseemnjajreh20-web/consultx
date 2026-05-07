# R26 — Occupant Load Regression Test Result

**Date:** 2026-05-07
**Sprint:** R26 Emergency Regression Fix

---

## R26 Tests (49/49 PASS)

```
node scripts/validate_r26_occupant_load_regression.cjs
```

| Group | Tests | Result |
|---|---|---|
| TASK 1: Routing — occupant_load detection | 4 | ✓ 4 PASS |
| TASK 2: R24 safe_answer_rules | 9 | ✓ 9 PASS |
| TASK 3: buildEvidenceOverlay mandatory protocol | 9 | ✓ 9 PASS |
| TASK 3b: Ordering — protocol before stop instruction | 2 | ✓ 2 PASS |
| TASK 4: Source pollution fix — SBC201-only | 13 | ✓ 13 PASS |
| TASK 5: No SBC801 in context | 2 | ✓ 2 PASS |
| TASK 6: Mode isolation (Main + Analytical) | 7 | ✓ 7 PASS |
| TASK 7: R24 regression check | 3 | ✓ 3 PASS |

**Total: 49 PASS, 0 FAIL**

---

## R24 Tests (48/48 PASS)

```
node scripts/validate_r24_occupant_load_quality.cjs
```

**Total: 48 PASS, 0 FAIL** — No regression from R26 changes.

---

## TypeScript Check

```
npx tsc --noEmit --project tsconfig.app.json
```

Exit code 0. Same pre-existing errors as before R26 (unrelated to modified files).
No new TypeScript errors introduced by R26.

---

## Frontend Build

```
npm run build
```

Exit: ✓ 0, built in 22.59s

Bundle: `ChatInterface-CTvhjiv8.js 578.71 kB` — same content hash as R19 (frontend NOT changed in R26).
Only edge function files modified.

---

## No Mobile Automated Tests

R26 modifies only the edge function (`index.ts`, `workflow_constraints.ts`).
Frontend is untouched. No mobile test suite needed for R26.

---

## Checks Summary

| Check | Result |
|---|---|
| R26 validation tests | ✓ 49/49 PASS |
| R24 validation tests | ✓ 48/48 PASS |
| TypeScript | ✓ No new errors |
| npm build | ✓ exit 0 |
| Frontend bundle | ✓ Unchanged (CTvhjiv8) |
