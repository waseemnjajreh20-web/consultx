# R20 — Advisory Brain Tag Result

**Date:** 2026-05-06  
**Task:** TASK 8 — Tag if Ready

---

## Decision: B — OPERATIONAL_WITH_MANUAL_SMOKE_PENDING

Per the readiness decision (TASK 7):
- All infrastructure is production-ready
- No final `advisory-brain-v1-operational` tag created (Decision B, not A)

## Tag: PENDING

The tag `advisory-brain-v1-operational` will be created by the owner after:
1. Branch merged to main → Vercel deploys
2. Manual smoke passes (package_loaded=true, dynamic thinking visible)

## Tag Command (for owner after smoke)

```bash
git tag -a advisory-brain-v1-operational -m "Advisory Brain V1 operational: V4 corpus, semantic B2 runtime, dynamic thinking, source routing."
git push origin advisory-brain-v1-operational
```

## What the Tag Will Mark

| Feature | State at tag |
|---------|-------------|
| V4 corpus | 612 chunks live |
| B1 semantic brain | 440 nodes, 278 edges, 8 workflows |
| B2 runtime | loader + router + evidence + dynamic thinking |
| Advisory SSE stream | thinking_status events before answer |
| Source precision | tight ranges only, structured table UX |
| Mobile frontend | SW v3, SourcePanel fixes, dynamic thinking consumer |
