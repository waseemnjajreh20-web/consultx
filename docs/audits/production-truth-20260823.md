# Production Truth Audit — 2026-08-23

Read-only verification against the live Supabase project (`hrnltxmwoaphgejckutk`). No writes, no deploys, no secret values printed. All queries and CLI commands are recorded next to their results.

## Summary Table

| # | Question | Verdict |
|---|---|---|
| 1 | Renewal cron actually running & authorized | **CONFIRMED BROKEN** — job is scheduled and fires hourly, but every invocation gets HTTP 401 from the edge function. Zero renewals/conversions are happening. |
| 2 | `card_verified_at`, `amount_base`, `amount_vat` columns exist | **CONFIRMED ABSENT** — none of the three columns exist in production yet. |
| 3 | Live billing state | **CONFIRMED** — 23 active, 4 trialing, 3 cancelled, 58 expired subscriptions. 0 webhook dead letters. Only 2 payment_transactions rows, both `checkout`/`initiated`. No seat_count>100 rows. No trialing-with-null-trial_end rows. |
| 4 | Live plan prices match frontend's 99/245/399/549 SAR claim | **CONFIRMED MISMATCH** — live prices are 99 / 245 / 349 SAR (not 399), plus two enterprise-team tiers at 1197 / 2745 SAR that don't fit the quoted 4-tier list. |
| 5 | Deployed function versions vs local source | **CONFIRMED STALE** — the payment-critical functions (`process-subscription-renewal`, `moyasar-webhook`, `moyasar-initiate-token-payment`, `moyasar-create-subscription`, `check-subscription`) are all running code deployed in April–May 2026. Local `main` has at least two billing fix commits from today (2026-08-23) plus further uncommitted changes that were never pushed. Two functions (`delete-account`, `send-contact-message`) exist locally but are not deployed at all. |
| 6 | Required secrets present | **CONFIRMED PRESENT** — `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `GOOGLE_GEMINI_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET` all exist as Edge Function secrets. (Presence only — see Q1 for why CRON_SECRET being "present" does not mean the cron auth works.) |

---

## 1. CRON — the launch blocker

**pg_cron extension**: installed (`pg_cron` v1.6.4).
```sql
SELECT extname, extversion FROM pg_extension WHERE extname='pg_cron';
-- {"extname":"pg_cron","extversion":"1.6.4"}
```

**Scheduled job**: exists, active, hourly.
```sql
SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid;
```
Result: jobid 4, `process-subscription-renewal`, schedule `0 * * * *`, `active = true`. The **live command differs from the migration file** (see Drift note below) — production actually reads the secret from Supabase Vault, not from `current_setting('app.cron_secret')`:
```sql
select net.http_post(
  url := 'https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/process-subscription-renewal',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
  ),
  body := '{}'::jsonb
);
```

**Run history** (`cron.job_run_details`, last 20 runs, back to 2026-08-22 13:00 UTC): every run status is `succeeded` with `return_message = "1 row"`. This only means the SQL executed and pg_net queued the HTTP request — it does **not** mean the edge function accepted the call.

**Actual HTTP responses** (`net._http_response`, which only retains a short recent window — 6 rows available, 2026-08-23 03:00–08:00 UTC):
```sql
SELECT id, status_code, created, left(content,300) AS body_preview, error_msg
FROM net._http_response ORDER BY created DESC LIMIT 10;
```
All 6 of 6 recorded responses: **`status_code = 401`, body `{"error":"Unauthorized"}`**. Zero 200s in the visible window.
```sql
SELECT count(*) total, count(*) FILTER (WHERE status_code=401) count_401,
       count(*) FILTER (WHERE status_code=200) count_200 FROM net._http_response;
-- {"total":"6","count_401":"6","count_200":"0"}
```

**`app.cron_secret` database setting**:
```sql
SELECT current_setting('app.cron_secret', true) IS NOT NULL AS is_set;
-- {"is_set": false}
```
Not set — but this is a red herring, because the live cron job does not use it (see Drift note). The live job instead pulls from Postgres Vault:
```sql
SELECT name, (decrypted_secret IS NOT NULL) AS has_value, length(decrypted_secret) AS len
FROM vault.decrypted_secrets WHERE name = 'cron_secret';
-- {"name":"cron_secret","has_value":true,"len":45}
```
Vault **does** have a `cron_secret` value (45 characters). The Edge Function secret `CRON_SECRET` is also present (see Q6). The function's auth check (`supabase/functions/process-subscription-renewal/index.ts:53-60`) compares `Deno.env.get("CRON_SECRET")` against the incoming `x-cron-secret` header verbatim:
```
const cronSecret = Deno.env.get("CRON_SECRET");
const provided = req.headers.get("x-cron-secret");
// mismatch -> 401 "Unauthorized"
```
**Both sides are populated but do not match.** This is the launch blocker: trial-to-paid conversion and hourly renewal have not fired successfully at least since 2026-08-23 03:00 UTC (the oldest response row in the retention window), and there is no evidence of any 200 in the retained history at all.

**Migration-vs-production drift (secondary finding)**: `supabase/migrations/20260401000001_renewal_scheduler.sql` documents and creates the job using `current_setting('app.cron_secret', true)`, but the job actually running in production was later hand-modified (via `cron.alter_job` or a manual re-`cron.schedule`) to read from Vault instead. The migration file is stale documentation of what's actually deployed — worth reconciling so the next person doesn't "fix" `app.cron_secret` and wonder why nothing changes.

### LAUNCH BLOCKER
Fix requires making the Vault `cron_secret` value and the Edge Function `CRON_SECRET` value identical (owner action — secret rotation/comparison is owner-only per repo policy; this agent cannot read or move secret values). Until they match, **no trial ever converts to paid and no renewal ever charges**, silently, because pg_cron reports "succeeded" while the actual call is rejected.

---

## 2. SCHEMA — billing columns

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('user_subscriptions','payment_transactions')
ORDER BY table_name, ordinal_position;
```

- `user_subscriptions.card_verified_at` — **does not exist**.
- `payment_transactions.amount_base` — **does not exist**.
- `payment_transactions.amount_vat` — **does not exist**.

This matches what commit `0184d0a` ("fix(billing): close 7 of 8 defects found by adversarial review", 2026-08-23) already documents in its own message: *"the 1 SAR credit was granted only when `card_verified_at` was set, but that column does not exist in production yet"* — the fix adds fallback predicates that don't need the new column. So the code is already aware of and has worked around this gap; it is not a fresh discovery, but it is confirmed still true in production right now.

**Full column list — `payment_transactions`** (14 columns): `id`, `user_id`, `subscription_id`, `tap_charge_id`, `amount` (integer, no base/VAT split), `currency` (default `SAR`), `status` (default `initiated`), `payment_type` (default `verification`), `created_at`, `moyasar_payment_id`, `updated_at`, `failure_code`, `failure_message`, `retry_count`.

**Full column list — `user_subscriptions`** (24 columns): `id`, `user_id`, `plan_id`, `status` (default `trialing`), `trial_start`, `trial_end`, `current_period_start`, `current_period_end`, `tap_customer_id`, `tap_card_id`, `tap_payment_agreement_id`, `card_brand`, `card_last_four`, `created_at`, `updated_at`, `moyasar_payment_id`, `moyasar_card_token`, `past_due_since`, `cancel_at_period_end`, `cancelled_at`, `next_billing_date`, `dunning_notified_at`, `moyasar_given_id`, `seat_count` (default 1).

Note: both tables still carry legacy `tap_*` columns from the retired Tap integration (`tap_charge_id`, `tap_customer_id`, `tap_card_id`, `tap_payment_agreement_id`) alongside the current `moyasar_*` columns — harmless but confirms Tap was never cleaned out of the schema, only retired at the integration layer.

---

## 3. LIVE BILLING STATE

**`user_subscriptions` by status**:
```sql
SELECT status, count(*) FROM user_subscriptions GROUP BY status ORDER BY status;
```
| status | count |
|---|---|
| active | 23 |
| cancelled | 3 |
| expired | 58 |
| trialing | 4 |

No `past_due` rows currently exist.

**`webhook_dead_letters`**: 0 rows (`SELECT count(*) FROM webhook_dead_letters` → 0). No recent-5 listing needed. Table schema is still Tap-era (`charge_id`, `tap_status`, `reason`, `payload`, `created_at`) — never renamed/migrated for Moyasar, but currently empty so not an active risk.

**`payment_transactions`**: only 2 rows total, both `payment_type = checkout`, `status = initiated`. No `payment_type/status` breakdown beyond that single combination — i.e. no successful charge has ever been recorded in this table in production.

**Seat-count trap** (`seat_count > 100`, which the new `MAX_BILLABLE_SEATS` clamp would under-bill): 0 rows.

**Trial null-end trap** (`status='trialing' AND trial_end IS NULL`): 0 rows.
```sql
SELECT (SELECT count(*) FROM user_subscriptions WHERE seat_count > 100) seat_gt_100,
       (SELECT count(*) FROM user_subscriptions WHERE status='trialing' AND trial_end IS NULL) trialing_null_trial_end;
-- {"seat_gt_100":"0","trialing_null_trial_end":"0"}
```
Both known traps are clean in current data.

---

## 4. PLANS

```sql
SELECT slug, name_ar, name_en, price_amount, price_per_seat, min_seats, duration_days, is_active
FROM subscription_plans ORDER BY price_amount;
```

| slug | name_en | price (halalas) | price (SAR) | price_per_seat | min_seats | active |
|---|---|---|---|---|---|---|
| free | Explorer | 0 | 0 | — | 1 | true |
| engineer | Engineer | 9900 | 99 | — | 1 | true |
| *(null slug, duplicate)* | Engineer | 9900 | 99 | — | 1 | **false** |
| pro | Pro | 24500 | 245 | — | 1 | true |
| enterprise | Enterprise | 34900 | **349** | — | 1 | true |
| enterprise_team | Enterprise Team | 119700 | 1197 | 39900 (399/seat) | 3 | true |
| enterprise_office | Enterprise Office | 274500 | 2745 | 54900 (549/seat) | 5 | true |

**Mismatch against the quoted 99/245/399/549 SAR list**: the live single-tier prices are actually **99 / 245 / 349** SAR (not 399) for Engineer/Pro/Enterprise. The 399 and 549 figures do exist in the data, but as **per-seat** rates on the two enterprise multi-seat plans (`enterprise_team` at 399/seat×min 3, `enterprise_office` at 549/seat×min 5), not as flat single-user tier prices. If frontend copy anywhere states a flat "549 SAR" or "399 SAR" plan price, that does not match any live `price_amount` — confirm which UI surface is quoting these before launch.

Also flagged: a second, inactive (`is_active=false`) row for "Engineer" with a **null slug** — harmless dead data but worth cleaning up so no query ever accidentally matches it.

---

## 5. DEPLOYED FUNCTIONS vs LOCAL SOURCE

`npx supabase functions list --project-ref hrnltxmwoaphgejckutk` succeeded (no auth issue). 18 functions deployed, all `status: ACTIVE`.

| function | deployed version | deployed updated_at (UTC) | local last commit (converted to UTC) | local working tree |
|---|---|---|---|---|
| check-subscription | 38 | 2026-04-30T19:22:58Z | 2026-08-23T07:35:11Z | clean now, but 3.8 months of undeployed commits |
| fire-safety-chat | 157 | 2026-08-22T01:45:40Z | 2026-08-23T07:35:11Z | clean now |
| moyasar-webhook | 30 | 2026-05-26T09:35:19Z | 2026-08-23T07:35:11Z | **uncommitted changes present** |
| moyasar-initiate-token-payment | 14 | 2026-05-26T09:34:05Z | 2026-08-23T07:35:11Z | **uncommitted changes present** |
| moyasar-create-subscription | 23 | 2026-05-26T09:33:15Z | 2026-08-23T06:03:28Z | clean now |
| process-subscription-renewal | 24 | 2026-04-30T18:53:44Z | 2026-08-23T07:59:31Z | clean now |
| admin-manage-user | 19 | 2026-04-10T06:31:25Z | 2026-08-20T13:55:28Z | clean |
| sbc-graph-indexer | 40 | 2026-08-21T06:44:38Z | 2026-08-21T06:46:20Z | clean |
| _shared/billing.ts (bundled into several of the above) | n/a | n/a | 2026-08-23T07:35:11Z | **uncommitted changes present** |
| delete-account | **not deployed** | — | new, untracked | untracked, never deployed |
| send-contact-message | **not deployed** | — | new, untracked | untracked, never deployed |

**Reading this**: the payment-critical functions (`process-subscription-renewal`, `moyasar-webhook`, `moyasar-initiate-token-payment`, `moyasar-create-subscription`, `check-subscription`) are all running **April–May 2026** code. Local `main`/current branch has at least two billing-fix commits made **today**:
- `0184d0a` (2026-08-23T10:35:11+03) — "fix(billing): close 7 of 8 defects found by adversarial review" — fixes trial conversion never firing, wrong price shown at checkout, the trial card-gate being decorative, and the pre-migration overcharge (the `card_verified_at` workaround from Q2).
- `462ded7` (2026-08-23T10:59:31+03) — "fix(billing): stop runaway hourly charging; publish legal entity identity" — fixes a `.maybeSingle()` discarded-error bug in `process-subscription-renewal` that would recharge a customer's saved card every hour once a subscription had two matching `renewal` rows (reachable in normal operation).

**None of this is live.** On top of that, `git status` currently shows `_shared/billing.ts`, `moyasar-webhook/index.ts`, and `moyasar-initiate-token-payment/index.ts` with **further uncommitted changes** beyond those two commits.

One silver lining: because the cron auth is currently broken (Q1), the "runaway hourly charging" bug in the deployed renewal function is not actively firing — every hourly attempt 401s before it reaches the charging logic. But this means fixing Q1's auth mismatch **without also deploying `462ded7`'s fix first** would re-expose the recharge bug the moment the cron starts succeeding. **Deploy order matters**: ship the code fix, then fix the secret mismatch — not the other way around.

`delete-account` and `send-contact-message` exist locally (untracked) with no deployed counterpart at all.

---

## 6. SECRETS PRESENCE (names + last-updated only, no values)

`npx supabase secrets list --project-ref hrnltxmwoaphgejckutk` succeeded.

| secret | present | last updated |
|---|---|---|
| MOYASAR_SECRET_KEY | yes | 2026-04-27 |
| MOYASAR_WEBHOOK_SECRET | yes | 2026-04-23 |
| GOOGLE_GEMINI_API_KEY | yes | 2026-03-24 |
| RESEND_API_KEY | yes | 2026-05-24 |
| CRON_SECRET | yes | 2026-04-04 |

All five requested secrets are present. (Full secret list also includes `APP_ORIGIN`, `FROM_EMAIL`, several `ADVISORY_*` feature flags, and the standard `SUPABASE_*` platform-injected secrets — not requested, not detailed here.)

**Presence is not sufficient**: as shown in Q1, `CRON_SECRET` (edge function secret, set 2026-04-04) and the Vault `cron_secret` (used by the live cron job) do not currently match, producing 401s despite both technically "being set." Fixing this requires an owner action to reconcile the two values — this agent did not and cannot read either value.

---

## LAUNCH BLOCKERS

1. **CRON AUTH MISMATCH (CONFIRMED, active right now)** — `CRON_SECRET` (Edge Function secret) and Vault's `cron_secret` (used by the live pg_cron job's `x-cron-secret` header) do not match. Every hourly `process-subscription-renewal` call gets HTTP 401 despite pg_cron logging "succeeded." **No trial has converted to paid and no renewal has charged since at least 2026-08-23 03:00 UTC** (oldest visible sample; could be older — `net._http_response` retention is short). Owner action: reconcile the two secret values, then verify a 200 response appears in `net._http_response` on the next hourly tick.

2. **PAYMENT-CRITICAL EDGE FUNCTIONS ARE 3-4 MONTHS STALE IN PRODUCTION (CONFIRMED)** — `process-subscription-renewal`, `moyasar-webhook`, `moyasar-initiate-token-payment`, `moyasar-create-subscription`, and `check-subscription` are all running code from April–May 2026. Two same-day local commits (`0184d0a`, `462ded7`) fix: trial conversion never firing, wrong price shown at checkout, a decorative trial card-gate, a pre-migration overcharge, and a runaway-hourly-recharge bug — **none of these fixes are live**. There are also further uncommitted changes in `_shared/billing.ts`, `moyasar-webhook/index.ts`, and `moyasar-initiate-token-payment/index.ts` beyond those commits. Deploy order matters: ship `462ded7`'s recharge fix **before** resolving blocker #1, or the moment the cron starts succeeding it will recharge any subscription with a duplicate `renewal` row every hour.

3. **PRICING COPY MISMATCH (CONFIRMED)** — if any customer-facing surface states a flat 399 SAR or 549 SAR single-user plan, no such plan exists live. The real single-tier prices are 99/245/349 SAR; 399 and 549 exist only as *per-seat* rates on the two enterprise multi-seat plans. Needs a copy check across the frontend.

4. **`card_verified_at`, `amount_base`, `amount_vat` DO NOT EXIST IN PRODUCTION (CONFIRMED)** — not itself blocking (the shipped code already has fallback logic per commit `0184d0a`), but any future code path that assumes these columns exist will fail. Needs a proper migration before code that hard-depends on them ships.

5. **TWO NEW FUNCTIONS NEVER DEPLOYED (CONFIRMED, informational)** — `delete-account` and `send-contact-message` exist locally, untracked, with no production counterpart. Not payment-critical, but any frontend code calling them in production will 404 until deployed.

### Not blockers (verified clean)
- No `seat_count > 100` rows (MAX_BILLABLE_SEATS clamp risk is theoretical, not present in current data).
- No `trialing` row with `trial_end IS NULL` (the known invisible-trap scenario is not present).
- `webhook_dead_letters` is empty — no known failed webhook backlog.
- All 5 required Edge Function secrets are present by name (though see blocker #1 for why "present" ≠ "working" for CRON_SECRET).
