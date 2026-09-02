# ConsultX — Synthetic Monitoring Runbook (A1)

**Date:** 2026-09-03 · **Branch:** recovery/stabilization-2026-08-23

What this ships: a scheduled probe (`supabase/functions/synthetic-probe`)
that calls `fire-safety-chat` in all three modes every 15 minutes using the
dedicated smoke account, records timing/correctness into `perf_events`,
evaluates `slo_targets`, and emails وسيم when a target breaches for 2
consecutive runs (with a matching recovery email when it clears) — plus an
admin dashboard at `/admin/health` to read the same data visually.

Nothing in this batch is deployed or applied yet. Every step below is an
owner (or orchestrator-with-explicit-authorization) action, in order.

---

## 1. Deploy the function

```powershell
npx supabase functions deploy synthetic-probe --project-ref hrnltxmwoaphgejckutk
```

`synthetic-probe` deliberately has **no** `verify_jwt = false` entry in
`supabase/config.toml` (unlike `process-subscription-renewal` or
`admin-stats`). That means the platform's default JWT gate still applies on
top of the function's own token check — every caller needs **two** headers,
not one:

| Header | Value | Checked by |
|---|---|---|
| `Authorization` | `Bearer <anon/publishable key>` | Supabase platform (default `verify_jwt=true`) — the anon key is public by design (`docs/OWNER_ACTIONS.md`), it does not need to be a real user session |
| `x-probe-token` | the `PROBE_TASK_TOKEN` secret value | the function's own code, constant-time compared, fails closed with 401 if the env var is unset |

This is the exact same two-gate shape `ingest-sbc-2024` already uses in
production (see its runbook, `docs/launch/new-source-codes-runbook-20260831.md`).
It was chosen specifically so this batch needs **zero changes to
`supabase/config.toml`** — that file belongs to another agent's scope today.

## 2. Set secrets

```powershell
npx supabase secrets set PROBE_TASK_TOKEN="<generate: openssl rand -hex 32>" --project-ref hrnltxmwoaphgejckutk
npx supabase secrets set ALERT_EMAIL="waseem@consultx.app" --project-ref hrnltxmwoaphgejckutk
```

`RESEND_API_KEY` and `FROM_EMAIL` already exist as Edge Function secrets
(used by `send-contact-message`, campaign emails, etc.) — nothing to add
there. If either is somehow unset, `synthetic-probe` logs
`"cannot send alert (RESEND_API_KEY or ALERT_EMAIL missing)"` and continues
without sending (never throws — a missing alert channel must not break the
probe run itself).

Never paste the generated `PROBE_TASK_TOKEN` value in chat or commit it
anywhere. You will need it again in Step 4.

## 3. Apply the SQL (Part A only, for now)

Run `docs/db/20260903_perf_events.sql` **Part A** in the Supabase SQL Editor
(or via the Management API, per the operating contract — never
`supabase db push`). Part A creates `perf_events`, `slo_targets` (seeded with
6 threshold rows), `probe_state`, and the `last_cron_status()` function. It
is idempotent and inert: nothing calls any of it until the function is
deployed and Part B (below) is run.

Verify:

```sql
select count(*) from public.slo_targets;   -- expect 6
select proname from pg_proc where proname = 'last_cron_status';  -- expect 1 row
```

## 4. Smoke-test one manual run

```powershell
$anon = "<VITE_SUPABASE_PUBLISHABLE_KEY from .env.local>"
$tok  = "<PROBE_TASK_TOKEN value from Step 2>"
Invoke-RestMethod -Method Post `
  -Uri "https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/synthetic-probe" `
  -Headers @{ Authorization = "Bearer $anon"; "x-probe-token" = $tok } `
  -ContentType "application/json" -Body "{}"
```

Expected: `{"ok":true,"question_index":0,"results":[{"mode":"primary","ok":true},...],"cron_status":null}`
(`cron_status` is `null` until Part B has run at least once — see caveat in
Step 6). Then verify rows landed:

```sql
select mode, ok, first_status_ms, first_text_ms, done_ms, chars, engine
from public.perf_events order by ts desc limit 3;
```

Each manual/cron run rotates the smoke account's password and consumes one
entry from the 3-question rotation (see `PROBE_QUESTIONS` in
`supabase/functions/synthetic-probe/logic.ts`) — running it twice in a row is
safe and expected, not a bug.

## 5. Arm the live cron (Part B)

Only after Steps 1–4 all succeeded. In `docs/db/20260903_perf_events.sql`,
**Part B**:

1. Run the `vault.create_secret(...)` line by hand in the SQL Editor,
   replacing the placeholder with the real `PROBE_TASK_TOKEN` value from
   Step 2 (never commit the real value — paste it directly in the editor,
   run once, clear the editor afterward).
2. In the `cron.schedule(...)` statement, replace
   `<VITE_SUPABASE_PUBLISHABLE_KEY>` with the real anon key value, then run
   it.

This creates a pg_cron job named `synthetic-probe` firing every 15 minutes.
Verify:

```sql
select jobname, schedule, active from cron.job where jobname = 'synthetic-probe';
select status_code, created from net._http_response order by created desc limit 3;
```

**Rollback at any time:** `select cron.unschedule('synthetic-probe');` — stops
the schedule without touching the deployed function or any data.

## 6. Reading `/admin/health`

Sign in as an admin (`njajrehwaseem@gmail.com` / `waseemnjajreh20@gmail.com`
— same gate as `/admin`) and open `/admin/health`. It shows, per mode, the
last 24h p50/p95 of first-status / first-text / done, the ok rate, the last
20 raw runs, and the last observed cron status. All reads go through
Supabase RLS (admin-only `SELECT` on all three tables — see the SQL file's
Part A comments), not through a new edge function.

**`cron_status` shows "—" (unknown) until Part B has run and
`synthetic-probe` has executed at least once after that** — the value is
`last_cron_status()`'s result, persisted into `probe_state` at the end of
every run specifically so the page can show it without needing `EXECUTE` on
that `SECURITY DEFINER` function itself (granted to `service_role` only).

Caveat carried into the page and worth knowing when reading it:
`last_cron_status()` reads the single shared `net._http_response` log, which
records every `net.http_post`/`net.http_get` call in the database — not only
this one. If another cron job (e.g. `process-subscription-renewal`) happens
to fire in the same narrow window, the displayed status could reflect that
call instead. Documented, not hidden — see the SQL file's comment on the
function. Acceptable for a 15-minute-cadence coarse health signal.

## 7. Testing an alert safely

Do **not** wait for a real regression. Instead, temporarily tighten a
threshold so the next real run breaches it on purpose:

```sql
-- Pick something the live system will legitimately exceed, e.g. force
-- first_status_ms's 2s budget down to 1ms:
update public.slo_targets set threshold = 1 where key = 'first_status_ms_all';
```

Wait for two consecutive runs (cron: ~30 minutes: or trigger two manual runs
per Step 4, ~1 minute apart is enough — the 2-consecutive-run counter has no
minimum spacing requirement). You should receive one Arabic alert email at
`ALERT_EMAIL` after the 2nd breach, and **not** on the 3rd/4th/... while it
stays breached (the `nextBreachState` state machine in `logic.ts` fires the
alert exactly once per incident). Then restore the real threshold:

```sql
update public.slo_targets set threshold = 2000 where key = 'first_status_ms_all';
```

One more manual/cron run afterward should send the matching recovery email.
`select value from public.probe_state where key = 'breach:first_status_ms_all';`
lets you watch the counter directly (`{"count": N}`) without waiting on
email delivery.

## 8. Smoke-account password-rotation caveat

`synthetic-probe` mints its session exactly like
`evals/live/bench-live2.mjs` and the scratchpad `ttfb_probe.mjs`: find the
shared smoke account (`smoke_retrieval_042026@mailnull.com`) by email, rotate
its password to a fresh random value, sign in. **The password is shared
infrastructure** — if a human bench run (`bench-live2.mjs`) happens to rotate
the password in the narrow window between this probe's own rotation and its
own sign-in call, the probe's sign-in can fail with "Invalid login
credentials" purely from the race, even though nothing is actually broken.

This is expected and self-healing, not a bug to chase: `synthetic-probe`
routes smoke-auth failure through the same 2-consecutive-run breach counter
(`breach:smoke_auth`) as every other alarm class, specifically so **one**
racy failure never pages the owner — only a login that stays broken across
two consecutive 15-minute ticks (30 minutes) does. If you are about to run a
long live bench session and want to avoid even a one-off logged warning,
there is nothing you need to do differently; if you see a single
`smoke auth failed` line in the function logs during a bench run, that is
this caveat, not a regression.

## 9. Rollback / disable

| Action | Command |
|---|---|
| Stop the cron only | `select cron.unschedule('synthetic-probe');` |
| Stop alert emails but keep measuring | `npx supabase secrets unset ALERT_EMAIL --project-ref hrnltxmwoaphgejckutk` |
| Full stop | Unschedule the cron **and** `npx supabase functions delete synthetic-probe --project-ref hrnltxmwoaphgejckutk` |
| Data cleanup (rarely needed — small table) | `delete from public.perf_events where ts < now() - interval '90 days';` |

`perf_events` has no automatic retention/pruning in this batch — it is a
small table at 3 requests/15min (~860 rows/day), so this was judged
unnecessary for a first cut. Revisit if `/admin/health` ever needs more than
a year of history.
