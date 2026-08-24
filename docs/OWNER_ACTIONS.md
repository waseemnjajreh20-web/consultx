# Owner Action Items — ConsultX

Tasks that require the project owner. The agent cannot perform these because they
need dashboard access, billing authority, or a human decision.

Status legend: `[ ]` pending · `[x]` done

---

## 🔴 URGENT — Credential rotation

These secrets were committed to the git repository and must be assumed compromised.
The code no longer contains them (commit `34fbeb5`), but the old values are still
readable in git history and must be revoked at the source.

| # | Task | Where | Why | Status |
|---|---|---|---|---|
| 1 | **Rotate Supabase `service_role` key** | Supabase Dashboard → Project Settings → API → *Reset service_role key* | Full read/write bypass of all RLS on the production database. Was hardcoded in `scripts/setup-admins.cjs`, valid until 2036. | `[ ]` |
| 2 | Update the new key everywhere it is consumed | Supabase Edge Function secrets + Vercel env vars + local `.env.local` | Rotating without updating consumers will break edge functions. Do steps 1 and 2 together. | `[ ]` |
| 3 | **Rotate Google Gemini API key** | Google AI Studio / Google Cloud Console → delete old key, create new | Was hardcoded in three scripts. Billable, and it is the AI engine for the whole product. | `[ ]` |
| 4 | **Change admin account passwords** | ConsultX app or Supabase Auth dashboard | Plaintext passwords for `waseemnjajreh20@gmail.com` and `njajrehwaseem@gmail.com` were committed. | `[ ]` |
| 5 | Rotate TestSprite API key *(low priority)* | TestSprite dashboard | Present in `opencode.json`. Now gitignored, and the service is currently returning 500s. | `[ ]` |

No action needed: the Vercel OIDC token expired on its own, and the Supabase
**anon** key is public by design.

---

## 🔴 URGENT — Production RLS hole (found 2026-08-23)

| # | Task | Where | Why | Status |
|---|---|---|---|---|
| 19 | ~~**Drop the mis-scoped policy on `mode_daily_usage`**~~ **DONE 2026-08-23** | Supabase Dashboard → SQL Editor | A policy named "Service role full access" was granted `TO public` as `ALL / USING(true) / WITH CHECK(true)`. PUBLIC includes `anon`, so **anyone holding the public anon key can read, zero out, or delete any user's daily quota rows** — an entitlement bypass on the table gating Advisory and Analytical, both billed at `gemini-2.5-pro`. Verified against production with `SET LOCAL ROLE anon`: 18 rows across 5 users visible with no JWT. **Fixed and re-verified: anon now sees 0 rows.** | `[x]` |
| 20 | **Change the two test-account passwords** | Supabase Auth dashboard | `njajrehwaseem+consultxrelease1@`, `+consultxrelease2@`, `+consultxinvite1@`. Passwords were committed in the E2E scripts and remain in git history. Code no longer contains them (commit `2630d3f`). | `[ ]` |

Exact SQL, verification queries, rollback and post-apply smoke test:
`docs/audits/rls-audit-20260823.md`, Section 6. The fix is one reversible
statement and mutates no data — every code path uses `SECURITY DEFINER` RPCs
that bypass RLS, so nothing depends on the open policy.

Also in that report, needing a decision rather than a fix:
`sbc_documents` SELECT is granted to `public`, so the full 66 MB retrieval
corpus is scrapeable without an account (same content question as the
`source-pdfs` bucket, item 2 in the readiness report); and the knowledge-graph
tables plus `user_public_profiles.phone` are readable by any signed-in user.

---

## 🟠 Required to unblock development

| # | Task | Detail | Blocks | Status |
|---|---|---|---|---|
| 6 | Provide a working **Gemini API key** locally | Put it in `.env.local` as `GOOGLE_GEMINI_API_KEY` | Cannot run or debug the advisory chat end-to-end | `[ ]` |
| 7 | Grant **Supabase dashboard access** or supply service-role credentials | Invite, or `SUPABASE_SERVICE_ROLE_KEY` + DB password in `.env.local` | Cannot inspect real schema/RLS, run migrations, or read edge function logs | `[ ]` |
| 8 | Grant **Vercel project access** | Team invite | Cannot verify production env vars or deployment state | `[ ]` |

---

## 🟡 Business / configuration decisions

| # | Task | Detail | Status |
|---|---|---|---|
| 9 | **Configure Moyasar production keys** | `VITE_MOYASAR_PUBLISHABLE_KEY` is empty in the saved production env. Live payments cannot complete without it. Also set `MOYASAR_SECRET_KEY` and `MOYASAR_WEBHOOK_SECRET` as Supabase secrets. | `[ ]` |
| 10 | **~~Decide: is Tap Payments still used?~~** | Tap Payments is retired. Source edge functions (`tap-webhook`, `tap-create-subscription`, `tap-charge-subscription`, `create-checkout`, `verify-payment`) and the unsafe `payment-webhook` were removed; `TAP_SECRET_KEY` was rotated/deleted from Supabase secrets. | `[x]` |
| 11 | **Decide: is Lovable Cloud still used?** | `README.md` still describes a Lovable AI Gateway architecture, but the code migrated to Gemini directly in March 2026. Confirm so the docs can be corrected. | `[ ]` |
| 12 | **~~Decommission the `fire-safety-chat-v2` edge function~~** | Deployed instance deleted from the project; no source references remain. See `docs/ARCHIVE_INDEX.md`. | `[x]` |
| 13 | **Decide on error monitoring** | No Sentry or equivalent is installed. Approve a provider and supply a DSN if you want production error visibility. | `[ ]` |
| 14 | **Decide on product analytics** | No analytics installed. Approve a provider (PostHog, etc.) if wanted. | `[ ]` |
| 18 | **Decide the free-trial policy** | Who gets the 7-day Engineer trial: every new signup, or only corporate-email signups? The code currently does both at once through two different tables, so the two answers contradict each other and the UI locks out most trial users. Details and options in `docs/TRIAL_POLICY_DECISION.md`. **Blocks the fix.** | `[ ]` |

---

## 🟢 Optional / lower priority

| # | Task | Detail | Status |
|---|---|---|---|
| 15 | Consider scrubbing git history | The rotated secrets remain readable in old commits. `git filter-repo` would erase them but rewrites all commit hashes and breaks existing clones. **Recommendation: skip** — rotation (tasks 1–5) is sufficient. | `[ ]` |
| 16 | Restore TestSprite or replace it | The MCP service returns HTTP 500, so automated E2E coverage is currently unavailable. | `[ ]` |
| 17 | Enable branch protection on `main` | Prevents direct pushes and accidental history rewrites. | `[ ]` |

---

## SAFETY ALERT — curated code tables give inverted engineering guidance (2026-08-23)

**CRITICAL. Live in production right now. Fire and life-safety impact.**

`public.sbc_code_tables` (93 rows) is injected into the AI prompt labelled
`STRUCTURED CODE TABLES (DB-AUTHORITATIVE — CITE THESE VERBATIM)`
(`fire-safety-chat/index.ts:1970`). Verified directly against production and the
original SBC PDF:

Table 1017.2 (exit access travel distance) has its sprinkler columns INVERTED for
Group H. The stored row tells an engineer that a non-sprinklered H-1 detonation
hazard building may have 75 ft of travel distance and that a SPRINKLERED H-1 is
"Not Permitted". SBC 201-CC-2024 says the exact opposite: Not Permitted without
sprinklers, 23 m with. Every H and I row grants a distance where the code says
Not Permitted. The values are imperial (IBC), not the SBC's metric.

The error is self-evidently impossible: no code grants a LONGER travel distance
without sprinklers than with them.

Scope: 57 of 93 rows (61%) carry imperial units. An audit checked 7 rows in depth
against the PDFs; 5 failed, including the single-exit table (1006.2.1, deletes
every non-sprinklered "Not Permitted") and the corridor width table (1018.1, gives
914 mm where the code requires 1100 mm).

**Update 2026-08-23 — the initial reversible quarantine has already been run.**
The owner executed the Section 4 quarantine from
`docs/audits/SAFETY-ALERT-code-tables-20260823.md`. Verified directly against
production: **42 quarantined / 51 active, zero imperial units among the
active rows**, and table 1006.2.1 (the single-exit table called out above) is
quarantined. The "57 quarantined / 36 active" figures earlier in this item
were the pre-quarantine estimate and are now stale — do not use them.

**Remaining action: the full rebuild**, not another quarantine pass. The
forward plan is `docs/audits/code-tables-rebuild-20260823.sql`, which
re-derives the table from source PDFs and ends at **16 verified-active / 77
quarantined**. Operator steps for running it are in
`docs/launch/deploy-runbook-20260823.md` — specifically the code-tables
rebuild step, which follows the edge-function deploy step in that runbook.
Run the rebuild SQL from there rather than improvising a new quarantine
statement here.

Status: `[ ]` pending — quarantine done, rebuild SQL not yet run

---

## Cron secret mismatch — LAUNCH BLOCKER (found 2026-08-23)

**CONFIRMED in production.** The hourly pg_cron job `process-subscription-renewal`
exists, is active, and fires on schedule, but every recorded HTTP response in
`net._http_response` is `401 {"error":"Unauthorized"}` (six consecutive hourly
runs verified directly, 05:00-10:00 UTC on 2026-08-23).

Cause: the job sends the Vault secret named `cron_secret` in the `x-cron-secret`
header; the edge function compares it to the `CRON_SECRET` edge-function secret.
The two values do not match. Consequence: **no trial has ever converted to paid
and no renewal has ever charged.** Nothing in the billing layer works until this
is reconciled.

### Fix (owner, two steps, ORDER MATTERS)

**Step 0 - do NOT fix the secret yet.** Production still runs April-May billing
code. The renewal function deployed today contains the runaway-recharge bug that
commit 462ded7 fixed. If the cron starts succeeding before the fixed functions
are deployed, that bug goes live against real saved cards. Deploy first
(see the release checklist), then:

**Step 1 - generate ONE new value** (never reuse an old one, never paste it in
chat or commit it). Example: `openssl rand -hex 32`.

**Step 2 - set it in BOTH places with the same value:**

  a) Edge-function secret (terminal, value read from an env var, not typed
     inline into history):
       npx supabase secrets set CRON_SECRET="$env:NEW_CRON_SECRET" --project-ref hrnltxmwoaphgejckutk

  b) Vault secret (Supabase SQL Editor). Replace <VALUE> by hand in the editor:
       select vault.update_secret(
         (select id from vault.secrets where name = 'cron_secret'),
         '<VALUE>'
       );

**Step 3 - verify** (read-only, the orchestrator can run this):
       select status_code, created from net._http_response
       order by created desc limit 3;
   The next hourly run must show `200`. Then confirm the function log shows
   `Renewal job:` lines rather than `rejected`.

Status: `[ ]` pending

---

## Repository visibility — CLOSED 2026-08-23

The GitHub repository `waseemnjajreh20-web/consultx` was **PUBLIC** until
2026-08-23. Commit `5f0e4ac4`, reachable from `origin/main`, still contains in
its tree:

| File | Secret |
|---|---|
| `scripts/setup-admins.cjs` | Supabase `service_role` key (full RLS bypass) |
| `scripts/test-gemini.mjs` | Google Gemini API key |
| `scripts/list-models.mjs` | Google Gemini API key |
| `scripts/test-embeddings.mjs` | Google Gemini API key |

Commit `34fbeb5` removed them from the working tree but not from history, so for
the whole period the repository was public these values were world-readable and
indexable by automated secret scanners.

**Owner set the repository to private on 2026-08-23.** Verified anonymously:
`curl -o /dev/null -w "%{http_code}" https://github.com/waseemnjajreh20-web/consultx`
returns **404** (was 200).

**This stopped the exposure; it did NOT invalidate the keys.** Anyone who copied
them while the repo was public still holds working credentials. Rotation
(items 1-4 above) remains REQUIRED — it is now a planned task rather than an
emergency, so it can be done via the no-downtime path below instead of a JWT
secret rotation that would log out every user.

### Recommended rotation path (no forced logout)

The project already has new-style keys provisioned (`sb_publishable_...` and
`sb_secret_...` on the API Keys page). Rotating the legacy `service_role` key
means rotating the JWT secret, which invalidates the anon key AND every live
user session. The migration path avoids that.

**Update 2026-08-23 — the code side of this is already shipped**, and the
step below that used to say "migrate the edge functions to a manually-set
secret holding the `sb_secret_...` value" was wrong on two counts and is
corrected here:

1. Nothing in the shipped code reads a manually-set secret named anything
   like that. The shipped design is the dual-mode helper
   `supabase/functions/_shared/supabaseKeys.ts`: it prefers the
   **platform-injected** `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS`
   env vars — JSON objects keyed by name, read via
   `JSON.parse(...)["default"]` — and falls back to the legacy plain
   `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` until legacy keys are
   disabled. Every edge function that touches these keys already goes
   through that helper.
2. The `SUPABASE_` prefix is reserved by the platform, so a custom secret
   named `SUPABASE_...` cannot even be set via `supabase secrets set` —
   the old instruction described something that is not possible to do.

The helper is already deployed and inert (it just takes the legacy-fallback
branch) until the owner flips the switch below. Actual remaining steps:

1. Point the frontend `VITE_SUPABASE_PUBLISHABLE_KEY` (Vercel) at the
   `sb_publishable_...` key's **value** and redeploy. The variable **name**
   does not change, and `src/integrations/supabase/client.ts` needs no code
   change — it already reads that same env var name.
2. Confirm the edge functions carrying `_shared/supabaseKeys.ts` are deployed
   (they are part of this release — see the deploy runbook). Do this BEFORE
   step 3; disabling legacy keys first would break every function still on
   the old direct `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` pattern, if any
   remained un-deployed.
3. Only then disable the legacy `anon` / `service_role` keys in the Supabase
   dashboard. This is now safe specifically because step 2 is done.

**Dev-tooling caveat:** three local scripts are NOT part of the shipped
edge-function code and do NOT go through `_shared/supabaseKeys.ts` — they
read the legacy anon key straight from the environment and will **silently
stop working** the day legacy keys are disabled. This is expected, not a
bug to chase:

- `orchestrator.cjs:9` — `process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY`
- `scripts/upload-source-pdfs.mjs`
- `scripts/build-source-map.mjs`

Gemini rotation is independent and has no such constraint: delete the old key in
AI Studio, create a new one, update the `GOOGLE_GEMINI_API_KEY` Supabase secret.

---

## Reference

- What was deleted during cleanup and how to recover it: `docs/ARCHIVE_INDEX.md`
- Environment variables required by the project: `.env.example`
