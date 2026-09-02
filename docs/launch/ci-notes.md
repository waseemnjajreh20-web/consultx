# ConsultX — CI Notes (A3 Continuous Verification Gate)

Companion to `.github/workflows/ci.yml`. A minimal `ci.yml` (typecheck +
test + build, triggered only on `main`) was already committed at
`5575b04`; this change expands it to run on every branch/PR, adds the
`deno check` gate and the `pii-guard` job, and moves the build's Supabase
placeholders to repository Variables. The workflow enforces the CLAUDE.md
"Verification minimum" automatically. It is read-only against the repo:
no deploy step, no Supabase migration is applied, nothing is pushed to
production.

## What it runs, and when

Triggers: any `push` (all branches) and every `pull_request`. Runs are
grouped per ref with `cancel-in-progress: true`, so pushing again to the
same branch cancels the previous in-flight run instead of queuing behind
it.

Two jobs, running in parallel:

**`verify`** (ubuntu-latest, Node 20 — no `.nvmrc`/`engines` field exists in
this repo, so 20 is a fixed choice, not a detected one):

1. `npm ci`
2. `npx tsc --noEmit -p tsconfig.app.json` — CLAUDE.md minimum
3. `npx tsc --noEmit -p tsconfig.node.json` — predates this change (covers
   vite/tailwind/tooling config); kept so this rewrite doesn't quietly drop
   coverage
4. `npm test -- --pool=threads --reporter=dot` — CLAUDE.md minimum.
   `--pool=threads` is required: the default forks pool has a known
   teardown hang in this repo
5. `npm run lint` — non-blocking (`continue-on-error: true`), pre-existing
   lint debt, unrelated to this change
6. `npm run build` — CLAUDE.md minimum
7. `denoland/setup-deno@v2` (pinned `deno-version: 2.x`), then `deno check`
   over every `supabase/functions/*/index.ts` plus every
   `supabase/functions/_shared/*.ts` — CLAUDE.md minimum
   (`npx deno check <changed functions>`)

**`pii-guard`**: runs `node .githooks/pii-guard.mjs --check-diff-base
origin/main` if that file exists at run time, otherwise logs a notice and
passes. That script is being built in a separate, parallel change; this job
picks it up automatically the first time it lands — no workflow edit
needed.

## The deno-check known-failing allowlist

Four functions have pre-existing type errors, first recorded 2026-08-24 and
reverified still failing on 2026-09-03 by running `npx deno check` locally
against this branch:

- `admin-manage-user` — 1 error (`User` → `Record<string, unknown>` cast,
  line ~123)
- `admin-stats` — 1 error (`total` read off a union branch that can be
  `{ users: [] }`, line ~139)
- `get-public-case-tracking` — 37 errors (a Supabase RPC result types as a
  generic string-error shape instead of the expected row type)
- `sbc-graph-indexer` — 2 errors (early-return object missing `partial` /
  `nextChunk` fields)

These four still run every time (visibility is kept), but a failure there
only emits an `::warning::` — it does not fail the job. Every other
function is blocking and confirmed passing clean as of this writing,
including `fire-safety-chat` and every billing function (`moyasar-*`,
`check-subscription`, `cancel-subscription`,
`process-subscription-renewal`). Do not add to this allowlist — fix the
four instead, or get explicit sign-off before widening it.

## Reading a failure

Open the failed run and expand the step — the name says which CLAUDE.md
command failed (`Typecheck (app)`, `Test`, `Build`, `Deno check (edge
functions)`). `Test` prints the vitest failure list directly. `Deno check`
failures show the offending file path and a `TS####`-style error; the
function name is the parent directory. A failing `pii-guard` job means the
diff touched something the guard flags — its own output names the match;
running `node .githooks/pii-guard.mjs --check-diff-base origin/main`
locally against the same branch reproduces it exactly, no network needed.

## What this does NOT cover yet: staging smoke

This gate is entirely static (typecheck / unit test / build / deno check)
— it never calls a real Supabase project, so it cannot catch a broken Edge
Function deployment, an RLS regression, or Moyasar webhook signature drift.
A follow-up "staging smoke" job would need:

- A dedicated staging Supabase project, separate from production, with
  migrations already applied there.
- A valid probe/service credential scoped to that staging project only,
  stored as a GitHub Actions **secret** (`secrets.*`, never `vars.*`) and
  never printed in logs.
- A `synthetic-probe` function now exists in this checkout, and project
  memory records an older probe account already returning 403 (card
  declined) — this task did not review either, so treat both as unverified
  and not reusable as-is; a staging smoke job needs its own fresh
  credential, confirmed live against staging (never production) before it
  is wired into CI.
- A small set of read-only assertions only (auth session check, one
  retrieval query, one billing-status read) — no state-changing calls, no
  real Moyasar charge, ever.

Not built in this change. Track it as a separate follow-up once a staging
project exists.

## Enabling this gate

1. This file and `.github/workflows/ci.yml` are ready to commit and push;
   the workflow registers itself on whichever branch it first appears on.
2. In GitHub → Settings → Secrets and variables → Actions → **Variables**
   tab, add repository variables `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` with the real project ref / publishable
   key. These are public/publishable values already shipped in the browser
   bundle — safe as Variables, not Secrets. Until set, the workflow falls
   back to harmless placeholders and still runs.
3. Once `verify` has gone green at least once on the target branch, go to
   Settings → Branches → branch protection rule for `main` → require
   status checks to pass before merging → select `Typecheck, test, build,
   deno check` (add `PII guard (diff scan)` once `.githooks/pii-guard.mjs`
   exists). That step is what turns this gate from advisory into
   load-bearing — it is an owner action in the GitHub UI, not something
   this change does automatically.

Nothing in this workflow writes to Supabase, Vercel, or any production
system.
