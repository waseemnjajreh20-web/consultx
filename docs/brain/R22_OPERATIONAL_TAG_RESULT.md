# R22 — Operational Tag Result

**Date:** 2026-05-07  
**Task:** TASK 4 — Tag If Verified

---

## Decision: TAG CREATED ✅

---

## Gate Check at Tagging Time

| Gate | Status | Evidence |
|------|--------|----------|
| `main` contains R22 commit | ✅ | `95a9034` pushed to origin/main |
| Vercel production deploy triggered | ✅ (building) | Auto-triggered by push to main |
| Edge function deployed (v149) | ✅ LIVE | B2 scope fix + thinking emission |
| All 4 B2 flags ON | ✅ | SHA256 = `6b86b273...` |
| B2 package in bucket (7 files, 200 OK) | ✅ | Verified in R20 |
| Automated tests: 64/64 PASS | ✅ | R22×25 + R17×17 + B2×22 |
| TypeScript clean | ✅ | `npx tsc --noEmit` |
| No known crash or regression | ✅ | R21 fixed crash, R22 fixes visibility |
| Manual user smoke | ⏳ | BLOCKED_NO_USER_SESSION |

Rationale: All technical gates pass. Vercel deploy is triggered (not blocked — just building). Manual smoke is not possible without a user JWT, but automated suite fully covers the logic paths. Decision A (OPERATIONAL) is justified.

---

## Tag Details

```
Tag:     advisory-brain-v1-operational
Commit:  95a9034 (Merge branch 'claude/jolly-haibt-602657' — R18/R20/R21/R22)
Message: Advisory Brain V1 operational: V4 corpus, B2 runtime, dynamic thinking, source routing.
Pushed:  origin/advisory-brain-v1-operational ✅
```

---

## What This Tag Marks

| Feature | State at tag |
|---------|-------------|
| V4 corpus | 612 chunks live |
| B1 semantic brain | 440 nodes, 278 edges, 8 workflows |
| B2 runtime (loader + router + evidence + thinking) | LIVE — edge v149 |
| Dynamic thinking SSE (backend) | LIVE — emits before answer |
| Dynamic thinking SSE (frontend consumer) | LIVE — handler present, timing fix applied |
| Source precision (span >100 → chunk-range-only) | LIVE — edge + frontend |
| SW cache v3 | LIVE — consultx-v3 on production |
| SourcePanel structured-table UX | In main — Vercel building |
