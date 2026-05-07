# R23 — Vercel Redeploy Closeout

**Date:** 2026-05-07  
**Task:** TASK 5 — Final closeout  
**Result:** COMPLETE

---

## R23 Summary

R23 was initiated to investigate and fix why the production Vercel deployment was serving an old bundle (`index-W5b-0r0S.js`) that predated the R22 dynamic thinking fix.

### Root Cause
Vercel's build cache. After R22 was merged to main (`95a9034`), subsequent commits (`2853b74`, `0f64d03`) only changed `.md` documentation files. Vercel detected no JS/TS source changes and reused a cached build from BEFORE the R22 merge. The cached build was a **monolithic** bundle (668 kB) without code splitting, and **without** the `thinking_status` handler.

### Fix Applied
A fresh deploy via Vercel CLI (`vercel deploy --prod --archive=tgz`) forced a full source upload and fresh `vite build`. The resulting build correctly code-splits ChatInterface into its own chunk containing the `thinking_status` handler.

---

## Tasks Completed

| Task | Status | Key Finding |
|---|---|---|
| TASK 1: Vercel Auth Check | PASS | Token at `com.vercel.cli/Data/auth.json`, user verified |
| TASK 2: Deployment Inspection | PASS | Stale cache identified — 668KB monolithic bundle missing `thinking_status` |
| TASK 3: Production Redeploy | PASS | `dpl_62YGSniXSDBfginXmQK7SDHurtgy` deployed, aliased to `consultx.app` |
| TASK 4: Bundle Verify | PASS | `ChatInterface-BSYRQ396.js` — 2× `thinking_status` confirmed |
| TASK 5: Closeout | PASS | This document |

---

## Production State After R23

| Asset | Deployment |
|---|---|
| Active deployment | `dpl_62YGSniXSDBfginXmQK7SDHurtgy` |
| Aliased domains | `consultx.app`, `www.consultx.app` |
| Entry bundle | `index-W5b-0r0S.js` (app shell, router, vendors) |
| Chat bundle | `ChatInterface-BSYRQ396.js` — contains `thinking_status` handler |
| R22 timing fix | Confirmed live (no `loadingStage !== "connecting"` guard) |

---

## Advisory Dynamic Thinking — Full End-to-End Status

| Layer | Component | Status |
|---|---|---|
| Edge function | `fire-safety-chat/index.ts` — emits `thinking_status` SSE | LIVE (deployed `39de9ca`) |
| Feature flag | `ADVISORY_DYNAMIC_THINKING_ENABLED` | ON (SHA256 of "1") |
| Frontend parse | `streamChat` → `onThinkingStatus` | LIVE (`ChatInterface-BSYRQ396.js`) |
| State | `dynamicThinkingMsg` | LIVE |
| Display | `getLoadingMessage()` — no `connecting` guard | LIVE (R22 timing fix) |
| SW cache | `consultx-v3` | LIVE (clears old cache) |

**Overall: Dynamic thinking visibility is fully operational in production.**

---

## Constraints Respected (R23)

- [x] No code changes made
- [x] No DB writes
- [x] No migrations
- [x] No bucket writes
- [x] No billing changes
- [x] No flags changes
- [x] No edge function deploy
- [x] No rollback
- [x] Redeploy from main / commit `0f64d035` ✓

---

## Cross-Reference

- R22 fix commit: `0441b17` — `fix(advisory): show dynamic thinking status in advisory chat`
- R22 merge commit: `95a9034` — merged to main
- R23 new deployment: `dpl_62YGSniXSDBfginXmQK7SDHurtgy`
- Source: `D:\ConsultX_Clean` (main branch, commit `0f64d03`)
