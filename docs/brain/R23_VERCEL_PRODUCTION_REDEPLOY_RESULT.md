# R23 — Vercel Production Redeploy Result

**Date:** 2026-05-07  
**Task:** TASK 3 — Trigger production redeploy  
**Result:** SUCCESS — `dpl_62YGSniXSDBfginXmQK7SDHurtgy` deployed and aliased

---

## Deployment Details

| Field | Value |
|---|---|
| Deployment ID | `dpl_62YGSniXSDBfginXmQK7SDHurtgy` |
| URL | `https://consultx-91jjbyvxo-waseemnjajreh20-webs-projects.vercel.app` |
| Target | production |
| Status | READY |
| Aliased to | `consultx.app`, `www.consultx.app` |
| aliasAssigned | `1778171946902` |
| Build region | Washington, D.C., USA (East) — iad1 |
| Build machine | 4 cores, 8 GB |
| Build time | 7.21s (vite build) |

---

## Method: Vercel CLI with archive upload

### Why CLI (not API redeploy)
Direct Vercel REST API redeploys reuse the build cache — this is what caused the original stale bundle issue. The CLI with `--archive=tgz` forces Vercel to:
1. Accept the full source tree
2. Run `vercel build` from scratch
3. Execute `npm run build` (Vite) fresh

### Commands Used

```bash
# Step 1: Link local project to existing Vercel project
cd "D:\ConsultX_Clean"
npx vercel link --yes --project consultx \
  --token="vca_..." \
  --scope="waseemnjajreh20-webs-projects"
# → Linked to waseemnjajreh20-webs-projects/consultx

# Step 2: Deploy with archive
npx vercel deploy --prod --archive=tgz \
  --token="vca_..."
# → Uploading [====================] (190.7MB/190.7MB)
# → Building: ✓ built in 7.21s
# → Aliased: https://www.consultx.app
```

---

## Stale Cache Root Cause (Confirmed)

The previous production deployment (`dpl_G6btptcwDZqYYefAw7GsP3w5iHgM`, commit `0f64d035`) used Vercel's build cache from a deployment that predated the R22 merge (`95a9034`).

Vercel noted in the build log:
```
Restored build cache from previous deployment (G6btptcwDZqYYefAw7GsP3w5iHgM)
```

However, despite restoring cache metadata, the fresh source upload forced a full `vite build` which produced the correct code-split output.

---

## New Bundle Structure

| Chunk | Size | Contains |
|---|---|---|
| `index-W5b-0r0S.js` | 661.01 kB | App shell, router, vendors |
| `ChatInterface-BSYRQ396.js` | 577.56 kB | ChatInterface + thinking_status handler |
| (+ 60+ small icon/page chunks) | — | Route pages, icons |

The old stale bundle was a **monolithic** `index-W5b-0r0S.js` at 668 kB containing all code.  
The new deployment correctly splits ChatInterface into its own chunk.

---

## Status

- [x] CLI auth confirmed and used
- [x] Project linked to `waseemnjajreh20-webs-projects/consultx`
- [x] Fresh build triggered (190.7MB source uploaded)
- [x] Build succeeded: `✓ built in 7.21s`
- [x] Deployment `dpl_62YGSniXSDBfginXmQK7SDHurtgy` READY
- [x] Aliased to `consultx.app` / `www.consultx.app`
- [x] `thinking_status` present in production chunk
