# R23 — Vercel Deployment Inspection

**Date:** 2026-05-07  
**Task:** TASK 2 — Inspect current Vercel deployment state  
**Result:** STALE CACHED BUILD IDENTIFIED

---

## Deployment List (latest 5)

| Deployment ID | Status | Commit | Branch | Timestamp |
|---|---|---|---|---|
| dpl_G6btptcwDZqYYefAw7GsP3w5iHgM | READY | 0f64d035 | main | 1778168842253 |
| dpl_9HGsc3J3Dkc9EewFe1a4hPvMk59B | READY | 2853b74e | main | 1778168494510 |
| dpl_3H5MP8GmXUtcfzyA1RFgvan5zeUu | READY | 95a90342 | main | 1778167633651 |
| dpl_EEaLwqAP8N13ygz9fcYqBCTkuWjf | READY | 7d7749c2 | main | 1778090869735 |
| dpl_CnSeKx5xHy2upyv3BJaCZjQA7E57 | READY | 3be82141 | main | 1777691046338 |

**Active alias:** `consultx.app` → `dpl_G6btptcwDZqYYefAw7GsP3w5iHgM` (commit `0f64d035`)

---

## Production Bundle State

```
URL:         https://consultx.app/assets/index-W5b-0r0S.js
Size:        668,508 bytes
Cache:       X-Vercel-Cache: HIT
grep "thinking_status" → 0 matches
```

---

## Root Cause: Stale Vercel Build Cache

### What Vercel deployed
Vercel ran builds for all 5 deployments. However, for deployments after `dpl_EEaLwqAP8N13ygz9fcYqBCTkuWjf` (commit `7d7749c`), Vercel reused a **cached build output** because it detected no changes to JS/TS source files between intermediate merges.

### Evidence: Local vs Production bundle comparison

| Aspect | Production (`W5b-0r0S.js`) | Local build (0f64d03) |
|---|---|---|
| Bundle structure | 1 file: `index-W5b-0r0S.js` (668KB) | 2 files: `index-BZdLOu3k.js` (660KB) + `ChatInterface-DPeS9fx3.js` (577KB) |
| `thinking_status` | NOT present | Present (2 matches in ChatInterface chunk) |
| Code splitting | No ChatInterface split | ChatInterface split as separate chunk |

### Why the cache was stale
- Commits `2853b74` and `0f64d03` only changed `.md` docs files, no `.ts/.tsx` files
- Vercel's build cache key does NOT include docs changes
- The cached build predates commit `95a9034` (the R22 merge that added `thinking_status`)
- Result: deployments `dpl_9HGsc3J3Dkc9EewFe1a4hPvMk59B` and `dpl_G6btptcwDZqYYefAw7GsP3w5iHgM` served old bundle

### Commit `95a9034` — the R22 merge
This commit merged the R22 fix (`0441b17: fix(advisory): show dynamic thinking status`).
Deployment `dpl_3H5MP8GmXUtcfzyA1RFgvan5zeUu` was built for this commit, but:
- Only served for a short window (~7 minutes) before `2853b74` was deployed
- `2853b74` triggered a build that reused cache from BEFORE `95a9034`

---

## Fix Required

A **forced fresh build** is required that:
1. Bypasses Vercel build cache
2. Builds from source at commit `0f64d03` (latest main)
3. Produces new bundle files with code splitting and `thinking_status`

→ Proceed to TASK 3: trigger production redeploy
