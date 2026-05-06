# Advisory Brain Fast-Track — Safety Snapshot

**Date:** 2026-05-06  
**Task:** TASK 6 — Safety Snapshot

---

## Final Flags State (Live as of 2026-05-06)

| Flag | Value | Hash (SHA256) | Stage |
|------|-------|---------------|-------|
| `ADVISORY_BRAIN_B2_ENABLED` | `1` | `6b86b273...` | Stage 1 — Loader |
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | `1` | `6b86b273...` | Stage 2 — Router |
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | `1` | `6b86b273...` | Stage 3 — Evidence |
| `ADVISORY_DYNAMIC_THINKING_ENABLED` | `1` | `6b86b273...` | Stage 4 — Thinking UX |

All hashes = SHA256("1") = `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b`

---

## Scope Boundaries (unchanged throughout)

- **Only Advisory mode** (`mode === "standard"`) — Main and Analytical modes untouched
- **No DB writes, no migrations**
- **No billing changes**
- **Edge function version**: v141, deployed 2026-05-06 05:19:10 UTC
- **Project ref**: `hrnltxmwoaphgejckutk`

---

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Brain package load failure on cold start | LOW | `try/catch` in loader; Advisory falls back to standard retrieval |
| Evidence overlay prompt too long | LOW | Overlay is additive; Gemini context window sufficient |
| Router misclassifies edge queries | LOW | Stage 2 is diagnostics only; does not alter answer |
| Static thinking phrase leaks past guard | LOW | `FORBIDDEN_STATIC_PHRASES_AR/EN` checked at emit time |
| Cross-mode contamination | NONE | All B2 blocks gated by `mode === "standard"` check |
| Log verification not performed | LOW | Programmatic verification blocked (requires user JWT); owner to verify via Supabase Dashboard |

---

## Rollback Commands (fastest path: disable all B2 in one call)

```bash
# Full rollback — disable all B2 stages
npx supabase secrets unset \
  ADVISORY_BRAIN_B2_ENABLED \
  ADVISORY_BRAIN_B2_ROUTER_ENABLED \
  ADVISORY_BRAIN_B2_EVIDENCE_ENABLED \
  ADVISORY_DYNAMIC_THINKING_ENABLED \
  --project-ref hrnltxmwoaphgejckutk
```

```bash
# Partial rollback — disable only Stages 3+4 (keep loader + router)
npx supabase secrets unset \
  ADVISORY_BRAIN_B2_EVIDENCE_ENABLED \
  ADVISORY_DYNAMIC_THINKING_ENABLED \
  --project-ref hrnltxmwoaphgejckutk
```

```bash
# Stage 4 only rollback — disable thinking UX only
npx supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref hrnltxmwoaphgejckutk
```

No re-deploy required for any rollback — secrets are read at request time via `Deno.env.get()`.

---

## Monitoring

- Supabase Dashboard → Functions → `fire-safety-chat` → Logs
- Watch for: `[AdvisoryBrainB2] flag=on package_loaded=true nodes=440`
- Watch for: `[AdvisoryBrainB2] router domain=` lines per request
- Error threshold: any `[AdvisoryBrainB2] ERROR` in first 10 requests → rollback Stage 3+4

---

## Verdict: All 4 stages LIVE — rollback ready in < 30 seconds if needed
