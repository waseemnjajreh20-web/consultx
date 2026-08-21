# Archive Index — Repository Cleanup

This document records what was removed from the working tree during the
repository cleanup, why it was removed, and how to retrieve it.

## 1. `docs/brain/` — 128 development round reports

**Removed from:** working tree (still in git history)
**Last commit containing them:** `7cfcac8`

These were per-round status/closeout reports produced during the Advisory Brain
development rounds (`ADVISORY_BRAIN_B2_*`, `R16_*` through `R26_*`). They are
historical process documentation, not runtime code or product documentation.

**How to retrieve a single file:**

```bash
git show 7cfcac8:docs/brain/R26_OCCUPANT_LOAD_REGRESSION_CLOSEOUT.md
```

**How to list everything that was there:**

```bash
git ls-tree -r --name-only 7cfcac8 -- docs/brain
```

**How to restore the whole folder:**

```bash
git checkout 7cfcac8 -- docs/brain
```

## 2. `supabase/functions/fire-safety-chat-v2/`

**Removed from:** working tree and Supabase deployment (no longer deployed)

An alternate, older implementation of the advisory chat edge function.
Confirmed unused: zero frontend references, no invocation from any other
edge function, and the deployed instance was deleted from project
`hrnltxmwoaphgejckutk`. It contained an earlier GraphRAG retrieval implementation
(`localSearch` / `globalSearch` / `driftSearch` / `fetchContextRouter`) that
may be worth lifting into a shared module later — see `docs/promise-ledger.md`.

Its `[functions.fire-safety-chat-v2]` entry remains removed from `supabase/config.toml`.

**Retrieve source with:**

```bash
git show 5f0e4ac:supabase/functions/fire-safety-chat-v2/index.ts
```

## 3. Retired Tap Payments integration

**Removed from:** working tree (still in git history) and Supabase deployment

Tap Payments was retired in favor of Moyasar. The following edge functions were
removed from the working tree and are no longer deployed:

- `supabase/functions/tap-webhook/`
- `supabase/functions/tap-create-subscription/`
- `supabase/functions/tap-charge-subscription/`
- `supabase/functions/create-checkout/` (Tap checkout creation)
- `supabase/functions/verify-payment/` (Tap charge verification)
- `supabase/functions/payment-webhook/` (unsafe generic webhook; never deployed)

The `TAP_SECRET_KEY` Supabase secret was deleted. No frontend references remain;
active payment flows use `moyasar-create-subscription`, `moyasar-webhook`,
`moyasar-initiate-token-payment`, and `process-subscription-renewal`.

**Retrieve source with:**

```bash
git show HEAD~1:supabase/functions/tap-webhook/index.ts
git show HEAD~1:supabase/functions/payment-webhook/index.ts
```

## 4. `generated/consultx_brain_v1/` and `generated/consultx_brain_full_v3/`

**Removed from:** working tree (still in git history)

Superseded generations of the knowledge-graph build output. The live version is
`generated/consultx_brain_full/`, which is what
`supabase/functions/fire-safety-chat/brain_b1_loader.ts` and the B2 tests
reference (`generated/consultx_brain_full/v4/advisory_brain/runtime_package/`).

Both can be regenerated from `data/` using the builders in `scripts/`
(`build-consultx-brain-v1.cjs`, `build-consultx-brain-full-v3.cjs`).

## 5. Build artifacts and dev leftovers

Deleted, not archived — all are regenerable or disposable:

- `dist/` — Vite build output (`npm run build`)
- `temp/founding10-email-preview*.html` — local email template previews
- `console.log(e.message` — stray empty file created by a malformed shell redirect
- `bun.lock`, `bun.lockb` — the project standardises on **npm** (`package-lock.json`)

## 6. Stale git worktrees

31 worktrees under `.claude/worktrees/` (plus `D:/ConsultX_Clean_next`) left over
from previous agent sessions were removed with `git worktree remove --force`.
The branches themselves are untouched — only the checked-out working copies were
removed. List remaining worktrees with `git worktree list`.

## 7. Untracked root reports

Seven `*_REPORT.md` files at the repository root were **never committed to git**,
so they have no history. They were moved to the local (gitignored) `.archive/reports/`
folder pending consolidation into a single authoritative status document.

Files: `FINAL_TESTSPRITE_EXECUTION_REPORT.md`, `LOCAL_PRODUCTION_VALIDATION_REPORT.md`,
`PHASE1_ANALYSIS_REPORT.md`, `PRODUCTION_AUDIT_REPORT.md`,
`PRODUCTION_READINESS_FINAL_REPORT.md`, `PROJECT_CURRENT_STATE_REPORT.md`,
`TEST_COVERAGE_REPORT.md`.

## 8. Local archive folder

`.archive/` at the repository root holds local copies of the items above. It is
gitignored and is **not** a backup of record — git history is. It can be deleted
at any time.
