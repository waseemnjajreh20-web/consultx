# ConsultX — Deploy Runbook — 2026-08-23

Operator runbook for shipping the `recovery/stabilization-2026-08-23` branch to
production. Written by sub-agent C2. **This document does not execute
anything** — every step below is performed by وسيم (or by the orchestrator,
where explicitly authorized) in the order given. Order is load-bearing: see
"Why this order" in each step.

Project ref: `hrnltxmwoaphgejckutk`. All SQL runs in the Supabase Dashboard →
SQL Editor. All CLI commands run from the repo root. Never `supabase db push`
— this project has confirmed migration drift between the migrations folder
and the live schema (see `docs/audits/production-truth-20260823.md`, Section 5
and the cron migration-vs-production drift note).

## Why this order, in one paragraph

Production is currently running April–May 2026 payment code. The fixed
`process-subscription-renewal` closes a runaway-hourly-recharge bug
(`462ded7`). The production cron is currently 401ing on every call — which
means that bug is dormant right now, purely by accident, because the request
never reaches the charging logic. If the cron secret is fixed **before** the
corrected function code is deployed, the moment the cron starts succeeding it
will recharge live saved cards on an hourly loop. That is why the cron secret
is Step 7 — dead last — and why Step 3 (function deploy) must land first.
Symmetrically, the frontend must not go live pointing at a backend that still
runs stale functions (Step 5 after Step 3), and the storage bucket must not
flip to private before the frontend that knows how to fetch signed URLs is
live (bucket flip after Step 5, not with it). Step 2 is now two sub-steps:
2a confirms the seat-RPC hardening applied in Step 1a, and 2b revokes
`anon`/`authenticated` execute privilege on the six quota-RPC functions — a
CONFIRMED CRITICAL, currently-open production hole
(`docs/audits/SECURITY-quota-rpc-bypass-20260823.md`). 2b runs before Step 3
deliberately: it is a pure grant revocation with no code dependency, and
every real caller of those six functions already runs as `service_role`
(unaffected by the revoke), so there is no reason to leave a confirmed
quota/billing bypass open for even one extra step of the deploy window.

---

## Step 1 — Apply migrations in the SQL Editor

Six files dated 2026-08-23 exist in or are inbound to the repo. Every one is
accounted for below with an explicit disposition — this table exists because
a `20260823000004` file went missing from an earlier draft of this runbook
by simple omission; nothing here is allowed to be unaccounted for again.

| Migration file | Status (verified read-only against production, 2026-08-23) | Applied in |
|---|---|---|
| `20260823000001_restore_missing_profile_preference_columns.sql` | CONFIRMED already applied — all four columns present with correct types/defaults | **Step 1d** — verify only (expected no-op) |
| `20260823000002_seat_rpc_hardening.sql` | Pending | **Step 1a** |
| `20260823000003_billing_columns.sql` | Pending | **Step 1b** |
| `20260823000004_job_locks.sql` | CONFIRMED absent — `public.job_locks` table and both `try_acquire_job_lock`/`release_job_lock` RPCs do not exist | **Step 1c** |
| `20260823000010_source_pdfs_private.sql` | Pending | **Step 5b** — deliberately **NOT** applied here |
| `20260823000011_decrement_daily_usage.sql` | Landed during this runbook's drafting (produced by a parallel lane); `public.decrement_daily_usage` CONFIRMED absent in production (its sibling `increment_daily_usage` CONFIRMED present) | **Step 1e** |

Apply 1a, 1b, 1c now, in that order. **1c is mandatory, not precautionary**
— its two RPCs and their table are CONFIRMED absent in production as of
2026-08-23, not merely "may be missing" — and it must land before Step 7
arms the cron (see Step 7's preconditions). 1d is a verify-then-apply step,
expected to be a no-op given the confirmation above; run its check anyway.
1e's file has since landed (see Step 1e for what was verified against its
actual contents) and can be applied any time relative to the others — see
its own ordering note. **1a, 1b, and 1c must all land before Step 7** — each
bears directly on renewal correctness or safety (seat cap, VAT/verification
columns, the single-flight lease). 1d and 1e do not gate Step 7 specifically
— neither touches the renewal/cron path — but both should be in place by
the time Step 3 deploys, since that is what the newly deployed
`fire-safety-chat` code already assumes on the profiles and quota side; see
each step's own ordering note.

### 1a. `supabase/migrations/20260823000002_seat_rpc_hardening.sql`

What it does: replaces `public.update_subscription_seat_count` (a
`SECURITY DEFINER` RPC granted to `authenticated`) with a hardened version
using `CREATE OR REPLACE FUNCTION` (preserves existing ownership/grants per
PostgreSQL docs). The old version let any authenticated owner write
`seat_count` directly with no upper bound and no status check — the R3-C1
defect: a user could self-grant seats (e.g. `seat_count = 5000`) on a
`trialing` row that has a stored card, arming an unattended overcharge on the
next cron conversion. The new version:
- hard-caps `p_seat_count` at 100 (`SEAT_CAP_EXCEEDED` exception above that —
  this constant must equal `MAX_BILLABLE_SEATS` in `_shared/billing.ts` and
  `SEAT_CAP` in `moyasar-create-subscription/index.ts`; do not raise one
  without the other two),
- only accepts the write when the target row's `status = 'active'`
  (`SEAT_CHANGE_REQUIRES_CHECKOUT` otherwise — every other status must go
  through checkout, which promotes plan/seats only against a captured
  Moyasar payment via the webhook),
- preserves every previously-existing check verbatim (auth, positive integer,
  row exists, caller owns the row, plan is a per-seat plan, `plan.min_seats`
  floor, linked-org active-member floor).

Between this step landing and Step 5a shipping the frontend, a seat-cap or non-active-status rejection surfaces to the user as a raw Postgres exception (`SEAT_CAP_EXCEEDED` / `SEAT_CHANGE_REQUIRES_CHECKOUT`, no frontend handler yet) rather than a friendly message — accepted deliberately, since shipping the frontend first would leave the seat-abuse hole (R3-C1) open even longer.

Run the full file contents in the SQL Editor (it is wrapped in its own
`BEGIN; ... COMMIT;`).

**Expected output:** `Success. No rows returned` (the migration is DDL —
`CREATE OR REPLACE FUNCTION`, `COMMENT ON`, `REVOKE`, `GRANT` — none of which
return rows).

**Verify it worked:**
```sql
SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%SEAT_CAP_EXCEEDED%' AS has_cap_check,
       pg_get_functiondef(p.oid) LIKE '%SEAT_CHANGE_REQUIRES_CHECKOUT%' AS has_status_check,
       (SELECT string_agg(acl::text, ', ')
          FROM aclexplode(p.proacl) acl
          JOIN pg_roles r ON r.oid = acl.grantee
         WHERE r.rolname = 'authenticated') AS authenticated_grant
FROM pg_proc p
WHERE p.proname = 'update_subscription_seat_count';
```
Expected: one row, `has_cap_check = true`, `has_status_check = true`,
`authenticated_grant` shows `EXECUTE` for `authenticated` (the function must
still be callable by real owners doing a legitimate active-subscription seat
change — Step 2 below is a documentation/verification step, not a revocation,
because this migration already re-grants `EXECUTE` deliberately at its own
bottom).

**If it did not work:** if the `SELECT` returns zero rows, the
`CREATE OR REPLACE FUNCTION` did not run — re-paste the full file (a partial
paste is the most common cause). If `has_cap_check` or `has_status_check` is
`false`, an older or hand-edited version of the function body ran — re-run
the exact file from `git show HEAD:supabase/migrations/20260823000002_seat_rpc_hardening.sql`
to rule out a stale clipboard.

### 1b. `supabase/migrations/20260823000003_billing_columns.sql`

What it does: adds the three billing columns confirmed absent in production
(`docs/audits/production-truth-20260823.md`, Section 2) —
`user_subscriptions.card_verified_at` (timestamptz),
`payment_transactions.amount_base` (integer),
`payment_transactions.amount_vat` (integer) — all via
`ADD COLUMN IF NOT EXISTS`, plus three `COMMENT ON COLUMN` statements. Fully
idempotent; safe to re-run. `amount_vat` is a database identifier that
carries no customer-facing tax claim — its value is always `0` while the
seller is not tax-registered (billing contract Section 1.1).

**Expected output:** `Success. No rows returned`.

**Verify it worked** (the same query the audit used):
```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'user_subscriptions' AND column_name = 'card_verified_at')
    OR (table_name = 'payment_transactions' AND column_name IN ('amount_base', 'amount_vat'))
  )
ORDER BY table_name, column_name;
```
Expected: exactly 3 rows —
`payment_transactions.amount_base` (integer, nullable),
`payment_transactions.amount_vat` (integer, nullable),
`user_subscriptions.card_verified_at` (timestamp with time zone, nullable).

**If it did not work:** zero or fewer than 3 rows means the `ALTER TABLE`
statements did not all run — re-paste the full file. The backend already has
a fallback (`isUndefinedColumnError` retry path in `_shared/billing.ts`) for
the case where this migration is delayed, so a missed run here is not an
outage, but `card_verified_at` stays `null` in `check-subscription` responses
until it is applied (Section 4 of the billing contract).

### 1c. `supabase/migrations/20260823000004_job_locks.sql`

What it does: creates `public.job_locks`, a TTL-lease table, plus two
`SECURITY DEFINER` RPCs — `try_acquire_job_lock(text, text, integer)` and
`release_job_lock(text, text)` — that serialise concurrent runs of
`process-subscription-renewal` (finding H5). RLS is enabled on `job_locks`
with deliberately **no policy**, so no client role can read or write it at
all; both RPCs are `REVOKE`d from `PUBLIC`/`anon`/`authenticated` and
`GRANT`ed to `service_role` only. Idempotent per its own header:
`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `COMMENT ON`,
and the `REVOKE`/`GRANT` lines are all no-ops on a re-run. The file ends with
`NOTIFY pgrst, 'reload schema';` — that statement is part of the file
contents, not a separate step; do not omit it when pasting.

**Why this is CRITICAL, not optional:** `public.job_locks`,
`public.try_acquire_job_lock`, and `public.release_job_lock` are **CONFIRMED
absent** in production as of 2026-08-23 (verified read-only) — this is not
a "may be missing" hedge. The deployed `process-subscription-renewal`
(`supabase/functions/process-subscription-renewal/index.ts`, lines 122-140)
takes this lease before touching any subscription, and because the lock RPC
does not exist today, the function does **not** fail closed — it fails soft
and keeps charging without the lease, logging this verbatim
(`index.ts:816-821`):

> "Renewal job: SINGLE-FLIGHT LOCK UNAVAILABLE — public.try_acquire_job_lock
> does not exist. Apply supabase/migrations/20260823000004_job_locks.sql by
> hand in the Supabase SQL Editor (never `supabase db push`), then run:
> NOTIFY pgrst, 'reload schema'. Continuing WITHOUT the lease so trials
> still convert and renewals still run — until the migration is applied,
> two overlapping runs of this job could double-charge a stored card."

Two overlapping invocations of the job (the hourly tick plus a manual
invocation, or a slow run overlapping the next tick) can both pass the
per-subscription idempotency checks and both charge the same stored card.
That is a double-charge risk on the very first armed cron tick if this step
is skipped — the exact failure class this runbook's whole ordering exists to
prevent elsewhere. **Apply this before Step 7 arms the cron.**

Run the full file contents in the SQL Editor, in one paste (the `NOTIFY` at
the end matters — see below).

**Expected output:** `Success. No rows returned` for the whole batch
(`CREATE TABLE`, `COMMENT ON`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`,
`REVOKE`, `GRANT`, `CREATE OR REPLACE FUNCTION`, `NOTIFY` — none return
rows).

**Verify it worked:**
```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('try_acquire_job_lock', 'release_job_lock')
ORDER BY p.proname;
```
Expected: two rows — `try_acquire_job_lock` (args `text, text, integer`) and
`release_job_lock` (args `text, text`), both with `svc = t`, `anon = f`,
`authed = f`.

**If it did not work:** if the query returns zero or one row, the
`CREATE OR REPLACE FUNCTION` statements did not both run — re-paste the full
file. If `svc = f` on either row, the `GRANT EXECUTE ... TO service_role`
line did not apply — re-run the `Grants` block at the bottom of the file.
Either way, also confirm the **schema reload** actually took effect: trigger
the function once (or wait for the next tick) and check its logs for the
SINGLE-FLIGHT LOCK UNAVAILABLE line. If it still appears after the `SELECT`
above shows both functions present and correctly granted, PostgREST's cache
lagged the DDL — re-run `NOTIFY pgrst, 'reload schema';` by itself and
re-check.

### 1d. `supabase/migrations/20260823000001_restore_missing_profile_preference_columns.sql` — verify, then apply only if absent

Unlike 1a-1c, this file is already **committed** to git, and its own header
comment states it was already applied directly to production on 2026-08-23
(via `supabase db query --linked`, not `supabase db push`) and independently
re-verified afterward (an `information_schema` check, an anon-key REST smoke
test, and a `tsc --noEmit` pass that dropped two dependent type errors).

**Verified applied to production 2026-08-23** (read-only check, separate
from this runbook and from the file's own header): all four columns are
present with the correct types and defaults. On the current database this
step is an **expected no-op** — run the check below anyway and expect four
rows back; an empty-looking result here is the success case, not something
to read as a failure or as this step having been skipped. This step stays in
verify-then-apply form (rather than being deleted outright) so the runbook
remains correct and executable from a clean database too, where the four
columns would genuinely be missing.

What it does, if it turns out it needs to run: adds four columns to
`public.profiles` via `ADD COLUMN IF NOT EXISTS` (idempotent, safe to re-run
even if some already exist) —
`ai_memory_level text DEFAULT 'session'` (`CHECK` in
`('none','session','persistent')`),
`output_format text DEFAULT 'detailed'` (`CHECK` in
`('concise','detailed','report')`),
`preferred_standards text[] DEFAULT '{}'`, and
`launch_trial_welcomed boolean NOT NULL DEFAULT false`.

**Verify first:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN ('ai_memory_level', 'output_format', 'preferred_standards', 'launch_trial_welcomed')
ORDER BY column_name;
```
Expected if already applied: 4 rows, matching the types/defaults above.

**If all 4 rows come back:** nothing to do. Do not run the file's
`ALTER TABLE` statements — this step is verify-only in that case.

**If fewer than 4 rows come back:** run the file's full contents in the SQL
Editor (every statement is `ADD COLUMN IF NOT EXISTS`), then re-run the
verification query above and confirm all 4 rows now appear.

### 1e. `supabase/migrations/20260823000011_decrement_daily_usage.sql`

This file did not exist when this step was first drafted; it has since
landed, and everything below was re-read from its actual contents (not
carried over from the earlier draft).

**What it does:** creates `public.decrement_daily_usage(p_user_id uuid)` —
`SECURITY DEFINER`, `SET search_path = public`, `LANGUAGE sql` — which runs:
```sql
UPDATE public.daily_message_usage
SET message_count = GREATEST(0, message_count - 1),
    updated_at    = now()
WHERE user_id    = p_user_id
  AND usage_date = CURRENT_DATE;
```
against `public.daily_message_usage` (`user_id`, `usage_date`,
`message_count`, `updated_at`; `UNIQUE (user_id, usage_date)`). Two
deliberate properties, per the file's own header: `GREATEST(0, ...)` means a
double rollback is harmless and the counter can never go negative (a
negative counter would hand the user free quota for the rest of the day),
and there is **no insert-if-absent** — a rollback with no row to decrement
is a no-op rather than fabricating usage history that never happened. The
whole `CREATE OR REPLACE FUNCTION` plus the `REVOKE`/`GRANT` block below are
wrapped in the file's own `BEGIN; ... COMMIT;`.

**Why this is needed:** `public.increment_daily_usage` CONFIRMED **exists**
in production; `public.decrement_daily_usage` CONFIRMED **absent** — the
increment side of this flat daily counter was shipped, the rollback side was
not. `supabase/functions/fire-safety-chat/geminiResilience.ts:295` already
calls `adminClient.rpc("decrement_daily_usage", { p_user_id: userId })` to
give back a quota unit when a Gemini call fails, wrapped in a `try/catch`
that (per the file's own header, and matching what I read directly in
`geminiResilience.ts`) swallows the error and logs
`` `[Quota] Rollback failed: ${...}` `` — so the call fails soft, not loud,
and today it fails on every attempt because the function does not exist.
The mode-scoped rollback (`public.decrement_mode_daily_count`) does exist,
so Advisory/Analytical mode quotas already roll back correctly; only the
flat counter used by Main (`primary`) mode and by trialing users does not.
Net effect while this is unapplied: a transient upstream failure silently
costs the user one message from their daily allowance for an answer they
never received, with nothing surfacing to them or to logs beyond that one
swallowed-error line.

**The `REVOKE`, said explicitly because it is easy to treat as
boilerplate:** the file's own comment states the same lesson the quota-RPC
audit established (`docs/audits/SECURITY-quota-rpc-bypass-20260823.md`,
Section 2a) — `pg_default_acl` on schema `public` grants `anon` an
`EXECUTE` grant on every newly created function automatically, so a
brand-new `SECURITY DEFINER` function in `public` is **born** with `anon`
access unless explicitly revoked. This migration's `REVOKE ALL ... FROM
PUBLIC / anon / authenticated` plus `GRANT EXECUTE ... TO service_role` is
the only thing standing between this new function and the same class of bug
Step 2b exists to close — without it, any authenticated user could call
this RPC in a loop and grant themselves unlimited daily messages (the
file's own stated rationale for revoking by name, not just from `PUBLIC`).

**Operational note the file's own structure makes easy to miss:** the
`NOTIFY pgrst, 'reload schema';` line and the file's own suggested
verification query appear **after** the `COMMIT;`, written as plain SQL
comments (`--`-prefixed), not as live statements — unlike Step 1c, where
`NOTIFY` is an executable line at the end of the pasted block. Pasting this
entire file (including its trailing comments) into the SQL Editor runs only
the `BEGIN...COMMIT` block; it does **not** trigger the schema reload by
itself. The `NOTIFY` must be copied out and run as its own, separate
statement after the transaction commits — skipping it reproduces exactly
the "SQL applied but the RPC still looks missing" false negative that Step
1c warns about, just for this function instead.

**Ordering:** no dependency on 1a-1d, Step 2, or Step 3 — the calling code in
`geminiResilience.ts` is part of what Step 3 deploys, and (confirmed above)
the RPC call fails soft rather than blocking the request when the function
is absent, unlike 1c's double-charge exposure. Apply 1e whenever convenient
relative to the others; doing it before Step 3 means the quota-rollback fix
is live the moment the new `fire-safety-chat` code is, rather than leaving a
window where the rollback call silently fails on every failed Gemini
request.

**Expected output:** `Success. No rows returned` for the `BEGIN...COMMIT`
block (DDL only — `CREATE OR REPLACE FUNCTION`, `REVOKE`, `GRANT`). Then run
`NOTIFY pgrst, 'reload schema';` separately and expect the same
"no rows returned" style confirmation (it is a notification, not a query).

**Verify it worked:**
```sql
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'decrement_daily_usage';
```
Expected: one row, `anon = f`, `authed = f`, `svc = t`. (The file's own
trailing comment suggests a cruder equivalent — dumping `p.proacl` directly
— if a raw ACL cross-check is ever wanted instead; the query above answers
the same question as plain booleans.)

**If it did not work:** zero rows means the `CREATE OR REPLACE FUNCTION`
did not run — re-paste the `BEGIN...COMMIT` block. `anon = t` or
`authed = t` means the `REVOKE` lines did not run — re-paste the same
block rather than issuing a one-off `REVOKE` by hand, so the fix stays in
source control. If the function and grants are all correct here but
`fire-safety-chat` still logs `[Quota] Rollback failed` for this RPC by
name, the schema reload did not happen — run `NOTIFY pgrst, 'reload
schema';` on its own and re-check.

**Note:** every 2026-08-23 migration file is accounted for above except
`supabase/migrations/20260823000010_source_pdfs_private.sql` (the
`source-pdfs` bucket flip to private), which is deliberately **NOT** applied
in this step even though its filename would otherwise sort into this
sequence. It is applied in **Step 5b**, after the frontend that fetches
signed URLs is live — flipping the bucket now would blank every PDF in the
sources panel for every current user (see the migration's own header comment
for the exact failure mode).

---

## Step 2 — Close the two open RPC-privilege holes

### 2a. Confirm the seat RPC grant is closed to abuse

This sub-step is a **verification**, not a second SQL change — 1a already
performs the fix. Restate why it matters and confirm the specific abuse path
is closed:

`update_subscription_seat_count` is `SECURITY DEFINER` and was granted
`EXECUTE` to `authenticated` with no upper bound and no status check. Any
signed-in user could call it directly (it is a Postgres RPC reachable over
PostgREST at `/rest/v1/rpc/update_subscription_seat_count`, not gated by any
frontend code) and set `seat_count` to an arbitrary value on their own
subscription row, including a `trialing` row carrying a saved card token.
Seat **enforcement** (`get_org_seat_usage`, `accept_org_invitation`) reads
that raw stored value immediately; seat **billing** only clamps at 100 seats
in TypeScript (`_shared/billing.ts`), so the stored value also armed the next
unattended cron charge at up to 100x the seat price. This is the R3-C1
defect from the Round 3 adversarial review.

**Verify it worked** (prove the abuse path is closed):
```sql
-- Attempt the old-style abuse shape against a role that is NOT the row owner
-- and NOT on an active row. This cannot be run as `authenticated` generically
-- from the SQL editor (it runs as postgres), so verify by re-reading the
-- function body instead of executing it destructively:
SELECT pg_get_functiondef(oid) LIKE '%c_max_billable_seats CONSTANT INTEGER := 100%' AS cap_is_100,
       pg_get_functiondef(oid) LIKE '%status IS DISTINCT FROM ''active''%' AS rejects_non_active
FROM pg_proc
WHERE proname = 'update_subscription_seat_count';
```
Expected: both `true`. This is the same check as Step 1a's verification
query, repeated here because Step 2 in the plan's safe order is specifically
"revoke or replace the seat RPC" and the answer is "already replaced, with
`EXECUTE` correctly still granted to `authenticated` for the one path that
remains legitimate (an owner adjusting seats on their own active
subscription)."

**If the abuse path is still open:** if `cap_is_100` or
`rejects_non_active` is `false`, do not proceed to Step 2b or Step 3. Re-run
Step 1a.

### 2b. Revoke the six quota-RPC functions from `anon` and `authenticated`

**What it does:** revokes `EXECUTE` on six `SECURITY DEFINER` quota functions
from the `anon` and `authenticated` roles. Unlike the seat RPC (2a), this is
a genuine, previously-unapplied SQL change — the runbook's earlier draft
covered only the seat RPC and left this hole out entirely.

**Why this exists:** `docs/audits/SECURITY-quota-rpc-bypass-20260823.md`
(Section 2) CONFIRMED that closing the `mode_daily_usage` RLS policy earlier
today was necessary but not sufficient. These six functions are
`SECURITY DEFINER` — they bypass RLS by definition — and take `p_user_id` as
a **parameter** instead of deriving it from the caller's own JWT. They were
EXECUTE-granted to `anon`, so anyone holding the public anon key (published
in the frontend bundle by design) can call them for **any** user id. The
audit proved this live, read-only, inside a rolled-back transaction:
`SET LOCAL ROLE anon; SELECT count(*) FROM public.get_all_mode_daily_counts(<any user_id>)`
returned 3 rows for a user that was not the caller. `decrement_mode_daily_count`
is a write RPC that zeroes a user's counter for `standard` or `analysis` mode
— both backed by `gemini-2.5-pro` — so repeated abuse is unlimited access to
the two paid-tier modes plus a real Gemini bill, on top of leaking every
user's usage pattern to unauthenticated callers.

**Why it is behaviourally safe:** every real caller of these six functions in
the codebase is `adminClient` (a `service_role` client) inside edge
functions, confirmed by grepping the six function names:
```
supabase/functions/check-subscription/index.ts:223   adminClient.rpc("get_daily_usage", ...)
supabase/functions/check-subscription/index.ts:229   adminClient.rpc("get_all_mode_daily_counts", ...)
supabase/functions/fire-safety-chat/index.ts:2651    adminClient.rpc("increment_mode_daily_count", ...)
supabase/functions/fire-safety-chat/index.ts:2660    adminClient.rpc("decrement_mode_daily_count", ...)
supabase/functions/fire-safety-chat/index.ts:2674    adminClient.rpc("increment_mode_daily_count", ...)
supabase/functions/fire-safety-chat/index.ts:2683    adminClient.rpc("decrement_mode_daily_count", ...)
supabase/functions/fire-safety-chat/index.ts:2698,2789,2819   adminClient.rpc("increment_daily_usage", ...)
supabase/functions/fire-safety-chat/geminiResilience.ts:290   adminClient.rpc("decrement_mode_daily_count", ...)
```
and **zero** calls to any of the six from `src/` (the only `src/` hits are
the generated type definitions in `src/integrations/supabase/types.ts` and a
mocked assertion in `src/__tests__/geminiResilience.test.ts` — neither is a
runtime caller). `service_role` has `BYPASSRLS` and its own separate grant
(unaffected by revoking `anon`/`authenticated`), so this revoke is
behaviourally neutral — nothing in the running product calls these six RPCs
as `anon` or `authenticated` today. (`get_mode_daily_count`, singular, has no
`adminClient.rpc(...)` caller found anywhere in the current codebase either —
UNKNOWN whether it is dead code or invoked some other way; it does not change
the safety conclusion, since it likewise has zero `src/` exposure.)

**Why it must run before Step 3 (function deploy) and before the cron:** this
is a pure grant revocation with no code dependency — it does not require any
function to be redeployed first. Leaving it until after the functions and
frontend are live would keep a confirmed quota/billing bypass open across the
entire remaining deploy window for no reason.

Run in the SQL Editor (copied verbatim from
`docs/audits/SECURITY-quota-rpc-bypass-20260823.md`, Section 4):
```sql
REVOKE EXECUTE ON FUNCTION public.decrement_mode_daily_count(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_mode_daily_count(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mode_daily_count(uuid, text)       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_mode_daily_counts(uuid)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_daily_usage(uuid)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_daily_usage(uuid)                  FROM anon, authenticated;

-- verify: must return f for anon and authed, t for svc, for all six functions
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%mode_daily%' OR p.proname LIKE '%daily_usage%')
ORDER BY p.proname;
```

**Verify it worked:** the `SELECT` at the bottom of the block above (the
comment inside it says exactly this) — re-run it any time after applying
the six `REVOKE` statements.

**Expected output:** `Success. No rows returned` for each of the six
`REVOKE` statements. The verification `SELECT` returns one row per
matching function — six or seven rows: seven once Step 1e
(`20260823000011`) has been applied, because that migration's new
`decrement_daily_usage` function also matches this query's
`%daily_usage%` filter. With `anon = f`, `authed = f`, `svc = t` on every
row — the seventh row, once present, must read the same.

**If it did not work:** if any row still shows `anon = t` or `authed = t`,
the root cause the audit identified (Section 2, part a) is `pg_default_acl`
on schema `public`, which automatically grants `anon=X` to every newly
created function. Concretely: if any migration run in Step 1 used
`CREATE OR REPLACE FUNCTION` on one of these six names, that re-create
silently re-granted `anon`. None of Step 1's migrations touch these six
functions today, but if that ever changes, **re-run this 2b `REVOKE` block
again after Step 3** and re-check the verification query — do not assume one
successful run here holds for the rest of the deploy.

**Rollback:** `GRANT EXECUTE ON FUNCTION <name> TO authenticated;` (per the
audit's Section 4 reversal line), one statement per function that needs it
back. This is only ever needed if some future legitimate `anon`/
`authenticated` caller is introduced for one of these six RPCs — none exists
today, so no rollback is expected to be needed as part of this deploy.

**Out of scope for this deploy, forward-pointer only:** the audit's Section 5
identifies a wider class of `SECURITY DEFINER` functions exposed to `anon`
with no identity check, and recommends a schema-level
`ALTER DEFAULT PRIVILEGES` change so newly created functions are not exposed
by default. That decision is deliberately deferred — see
`docs/audits/SECURITY-quota-rpc-bypass-20260823.md`, Section 5 — and is not
part of this runbook.

---

## Step 3 — Deploy all edge functions as ONE batch

**Why one batch, not staggered:** `_shared/billing.ts` is imported by
multiple payment functions (`moyasar-webhook`, `moyasar-initiate-token-payment`,
`moyasar-create-subscription`, `process-subscription-renewal`,
`check-subscription`). Deploying only some of them would leave a mix of old
and new `_shared` bundles live simultaneously across functions that must
agree on flow derivation, amount validation and status transitions.

`_shared` is **bundled into every function that imports it at deploy time**
— it is not, and cannot be, deployed on its own. There is no
`npx supabase functions deploy _shared` command; running one would error.

`delete-account`, `send-contact-message`, and `get-source-pdf-url` are
**first-time deploys** — they do not exist in production yet
(`docs/audits/production-truth-20260823.md`, Section 5, and this batch's own
list below). `get-source-pdf-url` is being produced by a parallel lane (C1)
for the signed-URL PDF panel refactor that Step 5b depends on; if its source
file is not yet present under `supabase/functions/get-source-pdf-url/` when
you run this step, deploy the other 20 now and deploy
`get-source-pdf-url` separately the moment it lands — do not block the whole
batch on it, but do not skip Step 5b's dependency on it being live either.

Run every line below (from the repo root; each is independent, order among
them does not matter since none of them import from each other except via
`_shared`, which is bundled per-function):

```bash
npx supabase functions deploy admin-manage-user --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy admin-stats --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy auto-trial --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy cancel-subscription --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy check-subscription --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy corporate-trial --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy delete-account --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy delete-case-document --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy fire-safety-chat --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy get-case-document-url --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy get-public-case-tracking --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy get-source-pdf-url --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy launch-trial-activate --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy moyasar-create-subscription --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy moyasar-initiate-token-payment --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy moyasar-webhook --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy process-subscription-renewal --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy sbc-graph-indexer --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy send-contact-message --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy send-eid50-campaign --project-ref hrnltxmwoaphgejckutk
npx supabase functions deploy send-founding10-campaign --project-ref hrnltxmwoaphgejckutk
```

That is 21 functions: the 18 that already exist in production
(`admin-manage-user`, `admin-stats`, `auto-trial`, `cancel-subscription`,
`check-subscription`, `corporate-trial`, `delete-case-document`,
`fire-safety-chat`, `get-case-document-url`, `get-public-case-tracking`,
`launch-trial-activate`, `moyasar-create-subscription`,
`moyasar-initiate-token-payment`, `moyasar-webhook`,
`process-subscription-renewal`, `sbc-graph-indexer`, `send-eid50-campaign`,
`send-founding10-campaign`) plus the three first-time deploys —
`delete-account`, `send-contact-message`, and `get-source-pdf-url`
(18 + 3 = 21).

**Expected output per line:** CLI prints a deploy progress indicator and
ends with something like
`Deployed Functions on project hrnltxmwoaphgejckutk: <name>` and a dashboard
URL. A non-zero exit or a `Bundling` error means that specific function's
deploy did not complete — the CLI does not silently continue past a failed
bundle for the same invocation, but it also does not stop you from running
the next line, so check each line's own output rather than assuming success
from the batch finishing.

**Verify it worked:**
```bash
npx supabase functions list --project-ref hrnltxmwoaphgejckutk
```
Expected: all 21 functions listed, every one `status: ACTIVE`, and
`updated_at` for every one of them stamped today's date/time — not the
April–May 2026 timestamps recorded in the production-truth audit. Pay
specific attention to `process-subscription-renewal`,
`moyasar-webhook`, `moyasar-initiate-token-payment`,
`moyasar-create-subscription`, and `check-subscription` — these are the
payment-critical functions that were confirmed 3–4 months stale; their
`updated_at` moving to today is the concrete proof the recharge-bug fix
(`462ded7`) is now live, which Step 7 depends on.

**If it did not work:** if a specific function still shows a stale
`updated_at`, re-run only that function's `deploy` line — deploys are
independent and idempotent (re-deploying the same source just creates a new
version). If the CLI reports an auth or project-ref error, confirm you are
logged in (`npx supabase login`) and linked to the correct project
(`hrnltxmwoaphgejckutk`) before retrying — do not proceed to Step 5 until
every payment-critical function's `updated_at` is today's.

---

## Step 4 — Rebuild the curated code tables and repair the corpus (before the frontend ships)

Three independent data-layer fixes land here, after the function deploy
(Step 3) and before the frontend deploy (Step 5). They share one step
number because all three are same-day, SQL-Editor- or Dashboard-driven,
backend-only data corrections with no code dependency of their own — not
because they depend on each other. 4a and 4b each carry their own ordering
rule in their own sub-step; 4c is explicitly independent of both.

### 4a. Apply `docs/audits/code-tables-rebuild-20260823.sql`

**What it does:** rewrites and re-labels rows in `public.sbc_code_tables`
— the curated table layer injected into the AI prompt verbatim as
"DB-AUTHORITATIVE" guidance
(`docs/audits/SAFETY-ALERT-code-tables-20260823.md`). Sixteen tables are
rebuilt from the original SBC PDFs with correct metric values and, where
the file's own header calls for it, corrected/renumbered `table_id`s; a
further batch of previously-active tables is quarantined for the first
time (their `table_id` gets a `QUARANTINED_` prefix so the retrieval code
no longer matches or injects them).

**Reference the file by name only — do not copy, quote, or inline its SQL
here.** Lane B is actively correcting two wrong cells in TABLE 601 inside
that same file while this runbook step is being written; anything copied
out of it here would go stale the moment lane B saves. Run the repo's
version of `docs/audits/code-tables-rebuild-20260823.sql` **as of deploy
time** — an earlier draft carried those two wrong TABLE 601 cells, so a
local copy taken before lane B's fix must be discarded and re-pulled from
the repo, never run from memory or a saved scratch copy.

**Pre-checks, taken from the file's own header (reflected here, not
invented):**
- The file's own deploy-order banner requires the updated `fire-safety-chat`
  Edge Function to be live FIRST — already satisfied, because this step
  runs after Step 3, not before it (see "Why this must come after Step 3"
  below).
- The file's own "REVERSIBILITY" note requires its Step 0 to run first: an
  idempotent
  `CREATE TABLE IF NOT EXISTS public.sbc_code_tables_backup_20260823 AS
  SELECT * FROM public.sbc_code_tables`, wrapped in the same
  `BEGIN; ... COMMIT;` as the rest of the file — do not skip ahead of it.
- Before each of the sixteen rebuilt-table blocks, the file has its own
  "Owner pre-check" `SELECT` showing that row as it stands before the
  change — run each pre-check immediately before its paired `UPDATE`, in
  the order the file presents them.

**Why this must come after Step 3:** the file's own header states the
ordering rule in its own words ("Deploy the updated `fire-safety-chat` Edge
Function FIRST. THEN apply this SQL") because the deployed code hard-codes
today's table ids in `KNOWN_TABLE_IDS` / `PARENT_ALIASES`; applying this
SQL against the currently-deployed (old) code would make the rebuilt
`1006.3.4(1)` table completely unreachable and degrade three others to
matching only when the user literally types the word "Table". Today that
rule lives only inside the SQL file's own header — nowhere
operator-facing — which is why it is being restated here rather than left
only in the file.

**The dark-to-live consequence — stated plainly, because it is the whole
risk of this step:** applying this file shrinks the curated-table layer
from 51 active rows to 16 verified-active rows — **16 verified-active /
77 quarantined**, out of 93 total, once this file lands. This is intended,
not a regression: fewer tables that are correct beats more tables where
some invert life-safety guidance, which is exactly what
`docs/audits/SAFETY-ALERT-code-tables-20260823.md` documented live in
production (the 1017.2 exit-travel-distance table telling an engineer a
**non**-sprinklered H-1 building may use a **longer** travel distance than
a sprinklered one — the opposite of what the Saudi code says). Do not read
a smaller active-table count after this step as something having gone
wrong.

**Expected output:** `Success. No rows returned` for the whole
`BEGIN...COMMIT` block (the file's `UPDATE`s and the guarded backup-table
`CREATE`, none of which return rows).

**Verify it worked:**
```sql
SELECT count(*) FILTER (WHERE table_id LIKE 'QUARANTINED_%') AS quarantined,
       count(*) FILTER (WHERE table_id NOT LIKE 'QUARANTINED_%') AS still_active
FROM public.sbc_code_tables;
```
Expected: `still_active = 16`, `quarantined = 77`. Re-run this at deploy
time rather than trusting the count above — production may have drifted
since it was last measured, the same as every other reconciliation query
in this runbook.

**If it did not work:** the file carries its own reversal block in a
trailing comment (a full restore from `sbc_code_tables_backup_20260823`,
and a narrower quarantine-only reversal) — use the file's own reversal by
name; do not hand-write a substitute from memory.

### 4b. Apply `docs/audits/corpus-repair-20260823.sql`

**What it does:** four independent, section-by-section data repairs
against `public.sbc_documents` and `public.source_registry` (produced by
sub-agent B5, knowledge lane; each verified against production by a direct
`SELECT` before it was written). Section 1 relabels 308 rows' `code_type`
from `SBC201` to `SBC801` where the in-text running header proves the
chunk is actually SBC 801 content (112 further rows are ambiguous by the
file's own stated rule and are deliberately left untouched — an owner/B1
follow-up, not a defect in this file). Section 2 flips `language` from
`AR` to `EN` on rows a full-table Arabic-Unicode sweep proves are actually
English, leaving the genuinely Arabic rows (8, by the file's own count)
flagged. Section 3 flags 71 TOC/index dot-leader junk chunks via metadata
(flagged, not deleted). Section 4 reconciles
`source_registry.edition_year` / `vector_indexed` / `ingestion_status` for
the SBC201/SBC801 rows. **Section 5 is a recommendation only — it
contains no executable `DELETE` and is not part of this step**; it is left
for a separate owner decision on `public.document_tables`.

**Why this is a step now and was not before:** this file already exists in
the repo but, until this line, was referenced in no operator-facing
document — Finding 7 of the adversarial review. Without a runbook step it
would sit in `docs/audits/` indefinitely and never actually run against
production.

**Expected output / how to run:** the file is written to be run ONE
SECTION AT A TIME, in order — do not paste the whole file at once. Before
every `UPDATE`/`DELETE` there is a `SELECT` carrying an `-- EXPECTED: N`
comment; run that `SELECT` first, and if the count returned does not match
N, STOP — production has drifted since the file was written and the
`WHERE` clause needs re-verification before the paired `UPDATE` runs. Each
section opens its own `BEGIN` and closes its own `COMMIT` around a second,
in-transaction verification `SELECT` — read that output before typing
`COMMIT`; type `ROLLBACK` instead if anything looks wrong.

**Verify it worked:** each section's own in-transaction verification
`SELECT`, described above — there is no single end-of-file check, because
the four sections touch different tables and columns.

**If it did not work:** each section backs up only the exact rows it
touches into its own `*_backup_20260823_*` table first, and states its own
rollback `UPDATE` in a trailing comment — use that section's own rollback,
not a hand-written substitute.

### 4c. Dashboard blob replacement — independent of 4a and 4b

**What it does:** replace three objects in Supabase Storage in place, using
the corrected local files staged at
`C:\Users\TOSHIBA\Desktop\consultx-blob-upload\`, keeping the exact same
object names/paths so no code or database reference changes are needed.

**This step has no dependency on 4a or 4b, and neither of them depends on
it — do not sequence it as if it depends on the corpus-repair step above.**
It is an owner-driven file replacement in Storage, not a SQL change.

**Destination:** Supabase Dashboard -> Storage -> bucket `ssss`. That is the
same bucket `fire-safety-chat` reads its retrieval corpus from, which is why
the object names must not change.

**The three objects, replaced IN PLACE with upsert/overwrite enabled** (names
are identical to the three files already staged in the folder above — do not
rename, do not add a folder prefix):

| Object name (unchanged) | Expected size after upload |
|---|---|
| `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` | 1,029,906 bytes |
| `SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json` | 1,007,765 bytes |
| `SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json` | 527,061 bytes |

Sizes verified against the staged local files on 2026-08-24. If the Dashboard
reports a different size after upload, the wrong file was selected — re-upload
before moving on.

**Expected output:** the Dashboard's own per-file upload-confirmation UI, with
each file showing as replaced rather than added alongside a duplicate.

**Verify it worked:** confirm the three objects carry the new sizes and fresh
timestamps:
```sql
SELECT name, (metadata->>'size')::bigint AS size_bytes, updated_at
FROM storage.objects
WHERE bucket_id = 'ssss'
  AND name IN (
    'SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json',
    'SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json',
    'SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json'
  )
ORDER BY name;
```
Expected: exactly 3 rows, sizes matching the table above, `updated_at` stamped
today. Fewer than 3 rows means an upload silently created a differently-named
object instead of replacing — check for duplicates in the bucket before
retrying.

**If it did not work:** re-upload from the same source folder — this is a
plain object replacement with no transactional state to roll back.

---

## Step 5 — Deploy the frontend, then flip the PDF bucket

### 5a. Merge to `main` and deploy

Vercel deploys from `main`. All of this work is on
`recovery/stabilization-2026-08-23`, currently 27 commits ahead of `main` (recount at deploy time — this number drifts) and
unmerged, so the recovery branch must be merged into `main` before Vercel
will ever serve it. **Deploying the frontend before Step 1 or Step 3 would
put a UI in front of a backend that cannot serve it** — e.g. a frontend that
reads `card_verified_at` from `check-subscription` while the column and the
deployed function are both still on the old code, or a UI that calls
`delete-account` / `send-contact-message` while those functions 404 in
production.

```bash
git checkout main
git pull origin main
git merge --no-ff recovery/stabilization-2026-08-23
git push origin main
```
Vercel auto-deploys on push to `main` (no manual trigger needed under the
existing Vercel Git integration).

**Expected output:** a clean fast-forward or merge commit, no conflicts (if
conflicts appear, stop — do not resolve them blind; that is a merge review,
not a deploy step). Vercel's dashboard shows a new deployment building for
the `main` branch, ending in `Ready`.

**Verify it worked:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.consultx.app/
```
Expected `200`. Then check the deployed asset hash changed (the frontend's
main JS bundle filename is content-hashed):
```bash
curl -s https://www.consultx.app/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'
```
Compare the hash against what was live before this deploy — a changed hash
confirms the new build is actually being served (not a stale CDN/edge
cache). If it did not change after several minutes, purge the Vercel deploy
cache or hard-check the Vercel dashboard's "Current Deployment" pointer —
Vercel can finish a build without yet promoting it to production if
promotion is misconfigured.

**If it did not work:** a failed Vercel build blocks promotion automatically
— the old deployment keeps serving, so there is no user-facing outage risk
from this specific step failing. Read the Vercel build log for the failing
step (typically `npm run build` / `tsc` errors) and fix before retrying;
do not force-promote a failed build.

### 5b. NOW apply the bucket-flip migration

Only after 5a is verified live. Apply
`supabase/migrations/20260823000010_source_pdfs_private.sql` in the SQL
Editor:
```sql
UPDATE storage.buckets
SET public = false
WHERE id = 'source-pdfs';
```
**Why last:** the currently-deployed `SourcePanel.tsx` (pre-refactor) builds
a direct public storage URL and loads it into an `<iframe>`. The frontend
deployed in 5a is the version that fetches short-lived signed URLs through
the new `get-source-pdf-url` function instead. Flipping the bucket to
private before that frontend is live breaks every PDF preview in the sources
panel for every user, immediately, because the old code has no signed-URL
fallback.

**Expected output:** `Success. No rows returned` (an `UPDATE` on the
`storage.buckets` catalog row, not a data table — no data is touched).

**Verify it worked:**
```sql
SELECT id, public FROM storage.buckets WHERE id = 'source-pdfs';
```
Expected: `public = false`. Then confirm the signed-URL path actually works
by opening any SBC-201/SBC-801 source citation in the live app and checking
the PDF preview loads (manual check — this is the one step in this runbook
that is easiest to verify by eye rather than by query, because it is a
rendering behavior).

**If it did not work / if the panel breaks:** see the rollback for this step
in Step 9 — it is a one-statement revert to public.

---

## Step 6 — Four read-only reconciliation queries (run BEFORE the cron is armed)

Run all four now, with fresh data — the counts in
`docs/audits/production-truth-20260823.md` are a 2026-08-23 snapshot and
**must be re-run at deploy time**; do not treat them as still current. The
audit confirmed **4 `trialing` rows total** as of that snapshot (not 4 rows
in the cohort below — query 6a determines how many of those 4, if any, are
actually past `trial_end` with a card on file) and confirmed (b), (c), (d)
were all `0` at that time.

### 6a. `trialing` rows past `trial_end` with a card on file

```sql
SELECT id, user_id, trial_end, moyasar_card_token IS NOT NULL AS has_card
FROM public.user_subscriptions
WHERE status = 'trialing'
  AND trial_end < now()
  AND moyasar_card_token IS NOT NULL;
```
**What this cohort means:** every row here is a lapsed trial with a saved
card — exactly the `trial_conversion_pending` population from the billing
contract (Section 4). The **first successful cron tick after Step 7**
charges every one of these via `post_trial_first_charge`
(`plan_price − 1.00 SAR` credit, per Section 8.1). Count them now so that
count is the expected volume for the first tick, not a surprise. **If this
number is unexpectedly large** (materially more than the ~4 total trialing
rows seen in the snapshot), stop before Step 7 and investigate why — it
means either trial volume grew a lot since the snapshot, or something is
silently keeping subscriptions in `trialing` past when they should have
lapsed to `expired`.

**Expected output:** a small row count, no larger than the total number of
`trialing` rows at deploy time (CONFIRMED 4 total in the 2026-08-23
snapshot, `docs/audits/production-truth-20260823.md` Section 3 — re-check
the live total at deploy time since this is exactly what re-running this
query is for). Zero rows is a healthy result too — it means no lapsed trial
currently has a saved card.

### 6b. `past_due` with `past_due_since IS NULL`

```sql
SELECT id, user_id, status, past_due_since, current_period_end
FROM public.user_subscriptions
WHERE status = 'past_due' AND past_due_since IS NULL;
```
**What this cohort means:** these rows are invisible to the grace-period
logic in `process-subscription-renewal` (which computes the 7-day grace
window from `past_due_since`) — a row with `status = 'past_due'` but a null
`past_due_since` can neither be correctly retried nor correctly expired on
schedule. **If non-empty:** these need `past_due_since` backfilled (e.g. to
`updated_at` or `now()`, a judgment call per row) before the cron is armed,
or they will sit in `past_due` indefinitely with grace-window logic unable
to act on them.

**Expected output:** `0` rows. CONFIRMED — `docs/audits/production-truth-20260823.md`
records no `past_due` rows at all in production as of the 2026-08-23
snapshot, so both this query and 6c below (which also filters on
`status = 'past_due'`) are expected empty. A non-zero count here means new
`past_due` rows have appeared since the snapshot without a `past_due_since`
stamp — re-check before treating it as routine.

### 6c. `past_due` older than the grace window

```sql
SELECT id, user_id, status, past_due_since, now() - past_due_since AS age
FROM public.user_subscriptions
WHERE status = 'past_due'
  AND past_due_since IS NOT NULL
  AND past_due_since < now() - interval '7 days';
```
**What this cohort means:** these rows are already past the 7-day grace
window (`GRACE_DAYS = 7`, billing contract Section 3). **On the first
successful cron tick, every one of these converts to `expired`** (or
`cancelled` if the user had opted out) and `profiles.plan_type` syncs to
`free`. If this number is large, expect a corresponding wave of access
revocations the moment the cron starts succeeding — not a bug, but size it
before Step 7 so it is not read as one.

**Expected output:** `0` rows, for the same reason as 6b — CONFIRMED no
`past_due` rows exist in production as of the 2026-08-23 snapshot
(`docs/audits/production-truth-20260823.md`). Re-run at deploy time rather
than trusting the snapshot; a non-zero count here sizes a real,
one-time wave of access revocations on the first tick, not a failure of
this query.

### 6d. `seat_count > 100`

```sql
SELECT id, user_id, plan_id, seat_count
FROM public.user_subscriptions
WHERE seat_count > 100;
```
**What this cohort means:** `MAX_BILLABLE_SEATS = 100` is the billing clamp
in `_shared/billing.ts` — any row above 100 seats would be **under-billed**
relative to its stored `seat_count` the moment a renewal or conversion fires
(the enforcement side reads the raw column; the billing side clamps at 100).
Step 1a's migration prevents new rows from reaching this state through the
RPC, but it does not retroactively fix any row that got here before the fix
was live. **If non-empty:** decide per-row whether to cap `seat_count` back
to 100 (undercharges the customer relative to what they're using) or to
manually true up billing outside the automated path — an owner decision, not
a default action this runbook should take.

**Expected output:** `0` rows. CONFIRMED — `docs/audits/production-truth-20260823.md`
Section 3 records no `seat_count > 100` rows as of the 2026-08-23 snapshot.
Re-run at deploy time; any row returned needs the owner decision above
before Step 7, not after.

---

## Step 7 — LAST: the cron secret, set in BOTH places with the SAME value

**Do not perform this step until Steps 1–6 above are complete and verified.**
This is intentionally the final step. Reproduced from
`docs/OWNER_ACTIONS.md` ("Cron secret mismatch — LAUNCH BLOCKER"):

**Step 0 — do NOT fix the secret before this point in the runbook.** Before
Step 3's deploy, production still runs the April–May renewal function with
the runaway-recharge bug. The cron currently 401s on every call, which is
the only thing preventing that bug from firing against real saved cards
right now. If the secret is reconciled before Step 3 lands, the very next
successful cron tick re-exposes that bug live. By the time you reach this
step, Step 3 has already put the fixed function (`462ded7`) into production
— confirmed by Step 3's own verification (`updated_at` = today on
`process-subscription-renewal`). Do not run this step out of order.
**Step 1c must also already be applied by this point**, alongside Step 3 —
without `public.job_locks` and its two RPCs in place, the now-deployed
function runs every tick in its fail-soft, unprotected mode (logging
SINGLE-FLIGHT LOCK UNAVAILABLE) and two overlapping runs could double-charge
a stored card the moment the cron starts succeeding. Confirm Step 1c's
verification query passed before arming the cron here.

**Step 1 — generate ONE new value.** Never reuse an old one. Never paste it
into chat, a commit, or any file in this repo. Example generation:
```bash
openssl rand -hex 32
```
Store it only in your own shell session as an environment variable (not
written to disk, not echoed to a log you'll keep).

**Step 2 — set it in BOTH places with the same value.**

a) Edge-function secret. Read the value from an environment variable — never
type it inline into shell history. This is PowerShell syntax (the owner's
shell on Windows) — do not run it in bash, where `$env:NAME` does not expand
and would set the literal string `:NEW_CRON_SECRET` as the secret:
```powershell
npx supabase secrets set CRON_SECRET="$env:NEW_CRON_SECRET" --project-ref hrnltxmwoaphgejckutk
```
(PowerShell reads the value from `$env:NEW_CRON_SECRET`, which you set in
your own session first — e.g. `$env:NEW_CRON_SECRET = <the value you
generated>` — and never type the raw value as a literal CLI argument. Bash
equivalent, if ever needed: `export NEW_CRON_SECRET=<value>` then
`npx supabase secrets set CRON_SECRET="$NEW_CRON_SECRET" --project-ref hrnltxmwoaphgejckutk`.)

b) Vault secret, in the Supabase SQL Editor. Replace `<VALUE>` by hand,
directly in the editor — this placeholder must never be filled in outside
that editor session:
```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  '<VALUE>'
);
```

**Expected output:** step (a) prints a CLI confirmation that the secret was
set (no value echoed back). Step (b) in the SQL Editor returns
`Success. No rows returned` (it's a `void`-returning vault function).

**Step 3 — verify** (read-only; safe to run repeatedly):
```sql
select status_code, created from net._http_response
order by created desc limit 3;
```
Expected: the next hourly tick (top of the next UTC hour) shows `200`, not
`401`. Then check the function's own logs (Supabase Dashboard → Edge
Functions → `process-subscription-renewal` → Logs) for lines beginning
`Renewal job:` rather than the `Renewal job rejected` / `Renewal job
refused` lines that indicate an auth failure.

**If it did not work:** if the next tick still shows `401`, the two values
still do not match — re-run Step 2 with a freshly generated value in both
places in the same sitting (do not assume the previous value from step (a)
is still what you think it is; regenerate and reset both). If it shows a
`500` instead of `401`/`200`, `CRON_SECRET` is unset entirely on the
function side — re-run step (a). **If it charges more accounts than Step
6a's count predicted**, treat that as an active incident — see the cron
rollback in Step 9, which is the fastest kill switch. Do not consider Step 7
closed out until Step 8's monitoring criteria are met.

---

## Step 8 — Monitor the first successful cron tick

Step 7 makes the cron secret match; it does not by itself prove renewals are
actually happening correctly. This step is the dedicated, time-boxed,
read-only observation window the approved safe order calls for as its final
item ("(7) first-tick monitoring") — it is deliberately separate from Step
7's own pass/fail check, because a `200` alone does not confirm charge
volume or catch a function that runs but silently does nothing.

**When:** the top of the next UTC hour after Step 7 (the job schedule is
`0 * * * *`, CONFIRMED in `docs/audits/production-truth-20260823.md`,
Section 1).

**Check A — the authoritative one: actual HTTP status.**
```sql
select status_code, created from net._http_response order by created desc limit 5;
```
Expect a `200`. CONFIRMED caveat from the audit (Section 1): `net._http_response`
only retains a short recent window, so check promptly after the top of the
hour rather than hours later.

**Check B — cron's own view (necessary but not sufficient).**
```sql
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details order by start_time desc limit 5;
```
`succeeded` here means only that the SQL ran and pg_net queued the HTTP
request — it is **not** evidence the function accepted the call. That
misreading (cron reporting "succeeded" on every one of the last 20 runs while
every actual response was a `401`) is exactly what hid this launch blocker
for months. Check A is the one that actually proves the call was accepted;
treat Check B only as a secondary confirmation that the job fired at all.

**Check C — the function's own logs.** Supabase Dashboard → Edge Functions →
`process-subscription-renewal` → Logs. Grep the log string itself — that
is the primary instruction here, not the line number next to it. Line
numbers in `supabase/functions/process-subscription-renewal/index.ts`
drift on every edit to the file (they have already drifted once since
this section was first drafted); treat every number below as approximate
and verify by searching for the quoted string, not by opening the file to
that exact line. Numbers below were refreshed by grepping the current
working-tree file on 2026-08-24:
- On success, when there is nothing due:
  `"Renewal job: no subscriptions due for conversion, renewal or retry"`
  (approximately line 243 — verify by string).
- On success, when something is due:
  `` `Renewal job: ${trialDueSubs?.length ?? 0} trials to convert, ${dueSubscriptions?.length ?? 0} active due, ${pastDueSubs?.length ?? 0} past_due retries, ${expiredTrials} trials expired (no card)` ``
  (approximately line 260), followed at the end of the run by
  `console.log("Renewal job complete:", JSON.stringify(summary))`
  (approximately line 618).
- On an auth rejection (mismatched secret): `"Renewal job rejected: invalid
  or missing x-cron-secret"` (approximately line 102), returned with HTTP
  `401`.
- On a missing secret on the function side: `"Renewal job refused:
  CRON_SECRET is not configured. This job charges stored cards and will not
  run unauthenticated. Set CRON_SECRET on the function and on the pg_cron
  caller."` (approximately line 92), returned with HTTP `500`.
- **Lease not acquired (approximately line 137):** `"Renewal job: lease
  not acquired (another run holds it, or the lock state is unknown) —
  skipping this tick"`, returned with HTTP `200`. Benign once — the work
  is picked up an hour later. Suspicious if it appears on every tick in a
  row, which means something is holding (or is believed to be holding) the
  lease continuously. If it is accompanied by a preceding line reading
  `"Renewal job: lock acquisition failed — treating the lock as HELD and
  skipping this tick: <message>"` (approximately line 829), the "locked"
  outcome was **not** ordinary contention with another run — the lock RPC
  itself errored (e.g. a grants or connectivity problem on
  `public.job_locks`) and the function is failing closed out of caution.
  That combination on repeated ticks needs investigation, not just
  patience.
- **Single-flight lock unavailable (approximately line 818 onward) — STOP
  AND FIX, not a warning to note:** `"Renewal job: SINGLE-FLIGHT LOCK
  UNAVAILABLE — public.try_acquire_job_lock does not exist. Apply
  supabase/migrations/20260823000004_job_locks.sql by hand in the Supabase
  SQL Editor (never \`supabase db push\`), then run: NOTIFY pgrst, 'reload
  schema'. Continuing WITHOUT the lease so trials still convert and
  renewals still run — until the migration is applied, two overlapping
  runs of this job could double-charge a stored card."` If this appears on
  any tick, Step 1c was not actually applied (or the PostgREST schema
  cache was not reloaded) despite Step 7 having been armed. The job is
  running unprotected against double-charging on stored cards. Go back to
  Step 1c, re-run its verification query, and re-check `NOTIFY pgrst,
  'reload schema';` before letting any further ticks fire.
**Check D — reconcile charge volume against Step 6a's cohort count.** Count
charges created in the last hour, using only columns confirmed to exist on
`payment_transactions` (`docs/audits/production-truth-20260823.md`, Section 2:
`created_at`, `status`, `payment_type`, `amount`):
```sql
select payment_type, status, count(*), sum(amount) as total_amount
from public.payment_transactions
where created_at >= now() - interval '1 hour'
group by payment_type, status
order by payment_type, status;
```
**Stop condition:** if the total row count here exceeds Step 6a's
pre-recorded cohort count, do not keep diagnosing — go immediately to the
emergency stop in Step 9.

**Stop conditions and what each means:**
- Still `401` — secrets still mismatched. Go back to Step 7's "If it did not
  work."
- `500` — `CRON_SECRET` is unset on the function side; re-run Step 7, sub-step
  2(a).
- `200` but zero `Renewal job:` lines showing any processed/converted rows —
  the function ran and found nothing to do; normal if Step 6a's cohort was
  empty, not itself a failure.
- `200` but the log shows SINGLE-FLIGHT LOCK UNAVAILABLE — Step 1c was not
  actually applied (or its schema reload did not take). The tick still ran
  and is unprotected against double-charging. Do not treat this as a benign
  `200`; go back to Step 1c before the next tick fires.
- `200` with "lease not acquired" (line 136) on every tick in a row, not
  just once — investigate whether something is genuinely holding the lease
  continuously, or whether the acquisition RPC is erroring (check for the
  preceding "lock acquisition failed" line, 828); do not assume it will
  clear itself indefinitely.
- More charges than Step 6a predicted — emergency stop; go straight to the
  cron rollback in Step 9 before investigating root cause.

**How long to watch:** the close-out criterion is **two consecutive
successful hourly ticks** (Check A `200` both times) with charge volume
matching Step 6a's cohort count (Check D). Only after that should Step 7/
Step 8 be considered closed and the deploy fully live.

---

## Step 9 — Rollback triggers and rollback commands

### A function deploy that breaks

**Symptom:** `functions list` shows the function `ACTIVE` but requests
return unexpected 500s, or behavior regresses (e.g. chat mode gating stops
working, checkout amounts are wrong).

**Rollback:** redeploy the previous known-good version from git history —
Supabase Functions do not have a one-click "previous version" restore via
this CLI, so the fix is to check out the last-good commit for that function
and redeploy it specifically:
```bash
git log --oneline -- supabase/functions/<function-name>/
git checkout <last-good-commit> -- supabase/functions/<function-name>/
npx supabase functions deploy <function-name> --project-ref hrnltxmwoaphgejckutk
git checkout HEAD -- supabase/functions/<function-name>/   # restore working tree after
```
Verify with the same `functions list` check as Step 3.

### The bucket flip (5b) breaking the sources panel

**Symptom:** PDF previews in the sources panel go blank, "Open in new tab"
gives a broken link, `PdfFrame`'s error handler fires for every SBC-201/801
citation.

**Diagnose FIRST — the two rollbacks below are not interchangeable, and
picking the wrong one fixes nothing.** Step 5a already documents how to
tell which frontend is actually live: compare the deployed
`/assets/index-*.js` hash against what was live before the Step 5 deploy
(Step 5a's own "Verify it worked"). Run that check now rather than
guessing from the symptom alone.

**If Step 5a is NOT actually promoted** (the old, pre-refactor bundle is
still being served): the rollback below is correct **for this case only**.
The old `SourcePanel.tsx` builds a direct public storage URL and loads it
into an `<iframe>`, with no signed-URL fallback, so the bucket must stay
(or go back to) public while that old frontend is what users are getting.

**Rollback — one statement, immediate:**
```sql
UPDATE storage.buckets SET public = true WHERE id = 'source-pdfs';
```
This is the same statement class as the forward migration, safe and
idempotent. It re-exposes the 229 MB corpus publicly again (the original
redistribution-exposure risk), so treat it as a temporary stop-the-bleeding
measure while the actual frontend deploy issue is fixed, not a permanent
answer — re-apply the private flip as soon as the frontend is confirmed
working.

**If Step 5a IS live:** re-publishing `source-pdfs` fixes nothing. **There
is no bucket flip that helps in this case.** The live frontend never reads
that bucket at all — it fetches `sbc_pdfs_private` through short-lived
signed URLs minted by `get-source-pdf-url`. The fix targets that function
(or `sbc_pdfs_private`'s own grants/RLS), using the same per-function
rollback pattern already given above under "A function deploy that
breaks":
```bash
git log --oneline -- supabase/functions/get-source-pdf-url/
git checkout <last-good-commit> -- supabase/functions/get-source-pdf-url/
npx supabase functions deploy get-source-pdf-url --project-ref hrnltxmwoaphgejckutk
git checkout HEAD -- supabase/functions/get-source-pdf-url/   # restore working tree after
```
Verify the same way as Step 3 (`functions list`, `updated_at` moved to
today) and by re-opening a source citation in the live app.

### The cron charging unexpectedly (EMERGENCY STOP)

**Symptom:** more accounts charged than Step 6a predicted, duplicate charges
on the same subscription, or any charge amount that does not match the
plan's published price. This is the fastest kill switch available and
should be the **first** action taken, before diagnosing root cause.

**Before doing anything else, capture the live job definition** so the
re-arm below is restored from truth, not guessed:
```sql
select jobid, jobname, schedule, command from cron.job
where jobname = 'process-subscription-renewal';
```
Save this output somewhere durable (not committed to the repo — it embeds
the project's function URL and job id, harmless on their own, but keep the
habit of not committing ad-hoc production dumps).

**Rollback:**
```sql
select cron.unschedule('process-subscription-renewal');
```
(Use the job name shown by `select jobid, jobname from cron.job;` if the
name differs from `process-subscription-renewal` at the time of the
incident — match by `jobid = 4`, the id confirmed in the production-truth
audit, if the name lookup is ambiguous.) This stops all future hourly ticks
immediately; it does not reverse any charge already made. Follow with a
read of `net._http_response` and the affected `payment_transactions` /
`user_subscriptions` rows to scope the blast radius before re-enabling.

**Re-arm only after the root cause is understood and fixed — and only from
the LIVE job definition you captured above, never from the migration file.**
`supabase/migrations/20260401000001_renewal_scheduler.sql` is **stale
documentation**: it defines the job reading its secret from
`current_setting('app.cron_secret', true)`, a database setting the
production-truth audit confirmed is **not set at all**
(`docs/audits/production-truth-20260823.md`, Section 1). The job actually
running in production was hand-modified at some point to read the secret
from Postgres Vault instead. Re-arming from the migration file would
recreate a job that sends an empty/null `x-cron-secret` header, which gets
401'd forever while `cron.job_run_details` reports "succeeded" — silently
re-introducing the exact launch blocker Step 7 exists to close, with no
visible symptom until someone notices renewals still are not happening. The
correct re-arm reproduces the LIVE command form (verbatim from the
production-truth audit, cross-checked against the `select ... from cron.job`
output you captured above before unscheduling):
```sql
select cron.schedule(
  'process-subscription-renewal',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/process-subscription-renewal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
```
After re-arming, confirm the next tick returns `200` in `net._http_response`
before considering the incident closed (same verification query as Step 7,
Step 3).

---

## Reference

- `docs/audits/production-truth-20260823.md` — evidence base for every claim
  in this runbook.
- `docs/OWNER_ACTIONS.md` — cron secret section, credential rotation, and
  other owner-only items not covered here.
- `docs/launch/billing-contract-20260823.md` — Section 8 (migration), Section
  4 (`check-subscription` fields), Section 3 (status/grace-window
  semantics) — all referenced above.
- Post-deploy smoke checks: `.verdent/testing/e2e/p3_smoke_*.py` (see each
  script's `--help` for usage; all read credentials from environment
  variables only). These are read-only / non-destructive except
  `p3_smoke_contact_form.py`, which sends one real, clearly-marked test email
  through the live contact form. A full run across all five scripts also
spends real product quota: the chat-mode scripts sign in as the free-tier
test account and send real chat messages, so a full run costs 5 of that
account's 10 messages/day — a same-day repeat run can come back HTTP
`429`, which means QUOTA EXHAUSTED on the test account, not a product
failure. Wait for the next daily reset or point the scripts at a fresh
test account instead of treating a `429` here as a regression.
