-- Synthetic monitoring + SLO storage (2026-09-03).
--
-- Backs supabase/functions/synthetic-probe (scheduled probe that measures
-- real fire-safety-chat latency/correctness per mode) and
-- src/pages/AdminHealth.tsx (the /admin/health dashboard).
--
-- Three tables:
--   perf_events   -- one row per probe request (source='synthetic' today;
--                    'rum' reserved for a future real-user-monitoring path,
--                    never written by anything shipped in this batch).
--   slo_targets   -- the thresholds synthetic-probe evaluates each run.
--   probe_state   -- generic key/value bookkeeping: the question-rotation
--                    index, per-target consecutive-breach counters, and the
--                    last observed cron status (for the admin page).
--
-- Access model (mirrors admin_audit_log in
-- supabase/migrations/20260409000001_admin_access_management.sql): RLS
-- enabled on all three tables, NO insert/update/delete policy for
-- anon/authenticated at all (only the service role — which bypasses RLS
-- entirely — ever writes here), and a SELECT policy scoped to admins via
-- the existing profiles.role mechanism that same migration seeded
-- ('admin' | 'super_admin' for njajrehwaseem@gmail.com /
-- waseemnjajreh20@gmail.com). The USING clause below is a correlated
-- subquery on profiles for the CALLER'S OWN row, which is always readable
-- under profiles' own "Users can view their own profile" policy
-- (auth.uid() = user_id) — no SECURITY DEFINER helper needed.
--
-- Idempotent by construction — safe to re-run. Applied to production via the
-- Management API (no `supabase db push`, per the operating contract) or
-- pasted into the Supabase SQL Editor. Part A (schema) is inert on its own;
-- see the clearly-marked Part B at the end for the one step that actually
-- arms the live cron.

-- ============================================================
-- PART A — schema. Safe to apply any time; nothing reads or writes these
-- tables until synthetic-probe is deployed and its secrets are set.
-- ============================================================

-- ── perf_events ──────────────────────────────────────────────────────────
create table if not exists public.perf_events (
  id              bigserial primary key,
  ts              timestamptz not null default now(),
  source          text not null check (source in ('synthetic', 'rum')),
  mode            text,
  region          text,
  headers_ms      int,
  first_status_ms int,
  first_text_ms   int,
  done_ms         int,
  chars           int,
  sources_count   int,
  engine          text,
  fallback_reason text,
  error_code      text,
  ok              boolean,
  extra           jsonb
);

comment on table public.perf_events is
  'One row per synthetic-probe (or future RUM) request against fire-safety-chat: '
  'timing marks (headers/first_status/first_text/done, all ms from request start), '
  'content size, retrieval metadata, and pass/fail. ok=true only when chars>0 and '
  'error_code is null. Written by the service role only; read by admins only (RLS).';

create index if not exists idx_perf_events_ts on public.perf_events (ts desc);
create index if not exists idx_perf_events_mode_ts on public.perf_events (mode, ts desc);

alter table public.perf_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'perf_events'
      and policyname = 'perf_events_select_admin'
  ) then
    create policy "perf_events_select_admin"
      on public.perf_events for select
      using (
        exists (
          select 1 from public.profiles
          where profiles.user_id = auth.uid()
            and profiles.role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;
-- No insert/update/delete policy for anon/authenticated: the service role
-- (synthetic-probe) bypasses RLS entirely and is the only writer.


-- ── slo_targets ──────────────────────────────────────────────────────────
create table if not exists public.slo_targets (
  key            text primary key,
  mode           text not null,          -- 'all' | 'primary' | 'standard' | 'analysis'
  metric         text not null,          -- 'first_status_ms' | 'first_text_ms' | 'ok_rate' | 'empty_streams'
  threshold      numeric not null,
  comparator     text not null,          -- '<=' | '>=' | '='
  window_minutes int not null default 1440
);

comment on table public.slo_targets is
  'Thresholds synthetic-probe evaluates every run. mode=''all'' means the '
  'metric is aggregated across all three modes combined; a mode-specific row '
  'aggregates only that mode. threshold/comparator/window_minutes are '
  'operator-tunable in place (see docs/launch/synthetic-probe-runbook.md for '
  'how to safely lower a threshold to test alerting) -- re-running this file '
  'never resets a row that already exists (ON CONFLICT DO NOTHING below).';

alter table public.slo_targets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'slo_targets'
      and policyname = 'slo_targets_select_admin'
  ) then
    create policy "slo_targets_select_admin"
      on public.slo_targets for select
      using (
        exists (
          select 1 from public.profiles
          where profiles.user_id = auth.uid()
            and profiles.role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;

-- Seed the 6 target rows (first_text_ms is split per-mode: primary has a
-- tighter budget than standard/analysis). ON CONFLICT DO NOTHING so a value
-- an operator has since tuned (e.g. for a deliberate alert test) is never
-- silently reverted by re-running this file.
insert into public.slo_targets (key, mode, metric, threshold, comparator, window_minutes) values
  ('first_status_ms_all',      'all',      'first_status_ms', 2000,  '<=', 1440),
  ('first_text_ms_primary',    'primary',  'first_text_ms',   5000,  '<=', 1440),
  ('first_text_ms_standard',   'standard', 'first_text_ms',   20000, '<=', 1440),
  ('first_text_ms_analysis',   'analysis', 'first_text_ms',   20000, '<=', 1440),
  ('ok_rate_all',               'all',      'ok_rate',         0.99,  '>=', 1440),
  ('empty_streams_all',         'all',      'empty_streams',   0,     '=',  1440)
on conflict (key) do nothing;


-- ── probe_state ──────────────────────────────────────────────────────────
create table if not exists public.probe_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.probe_state is
  'Generic key/value bookkeeping for synthetic-probe: rotation:question_index '
  '({index}), breach:<slo_targets.key> and breach:cron_status and '
  'breach:smoke_auth (each {count} — consecutive-breach counters consumed by '
  'logic.ts''s nextBreachState), and cron_status ({status_code, checked_at} '
  '-- the last observed last_cron_status(), persisted so the admin page can '
  'display it without needing execute on the SECURITY DEFINER function '
  'itself, which is service-role-only).';

alter table public.probe_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'probe_state'
      and policyname = 'probe_state_select_admin'
  ) then
    create policy "probe_state_select_admin"
      on public.probe_state for select
      using (
        exists (
          select 1 from public.profiles
          where profiles.user_id = auth.uid()
            and profiles.role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;


-- ── last_cron_status() ──────────────────────────────────────────────────
-- Reads the most recent row of pg_net's response log. CAVEAT (documented,
-- not hidden): net._http_response is a single shared table across EVERY
-- net.http_post/net.http_get call in this database, not scoped to
-- synthetic-probe's own cron job specifically -- if another cron job (e.g.
-- process-subscription-renewal) fires in the same window, "latest row"
-- could reflect that call instead. This is the same table and the same
-- "order by created desc limit N" convention already used to verify the
-- renewal cron in docs/OWNER_ACTIONS.md ("Cron secret mismatch" item) --
-- not a new assumption, just documented here explicitly. Acceptable for a
-- 15-minute-cadence health signal; a tighter fix would require pg_net to
-- expose the request URL on the response row, which it does not.
-- 2026-09-03: restricted to responses whose body carries the renewal job's
-- "processed" counter. The keep-warm cron (every 5 minutes, unauthenticated
-- POST → fast 401) shares the same pg_net log and would otherwise be read as
-- a failing renewal cron and alert the owner hourly.
create or replace function public.last_cron_status()
returns integer
language sql
stable
security definer
set search_path = public
as $func$
  select status_code
  from net._http_response
  where content::text like '%"processed"%'
  order by created desc, id desc
  limit 1;
$func$;

comment on function public.last_cron_status() is
  'Latest HTTP status code pg_net recorded for ANY net.http_post/get call in '
  'this database (see caveat in this file) -- used by synthetic-probe as a '
  'coarse cron-health signal. SECURITY DEFINER so it can read net._http_response '
  '(not otherwise readable by the calling role); execute is service_role-only.';

-- REVOKE FROM PUBLIC alone leaves Supabase's default anon/authenticated
-- EXECUTE grants in place (pg_default_acl) — revoke them by name.
revoke all on function public.last_cron_status() from public, anon, authenticated;
grant execute on function public.last_cron_status() to service_role;


-- ============================================================
-- PART B — OWNER-RUN ONLY. Everything above is inert schema. This part
-- ARMS THE LIVE PRODUCTION CRON: every 15 minutes, Postgres itself calls the
-- deployed synthetic-probe function, which calls fire-safety-chat three
-- times (one per mode) using the smoke account and can send real alert
-- emails via Resend. Do not run this section until, in order:
--   1) supabase/functions/synthetic-probe is deployed
--      (npx supabase functions deploy synthetic-probe --project-ref hrnltxmwoaphgejckutk)
--   2) Part A above has been applied (tables/function must exist)
--   3) Edge Function secrets PROBE_TASK_TOKEN and ALERT_EMAIL are set
--      (RESEND_API_KEY / FROM_EMAIL already exist -- see
--      docs/launch/synthetic-probe-runbook.md)
-- ============================================================

-- pg_cron / pg_net are already enabled in this project (confirmed
-- 2026-08-21, docs/audits/schema-baseline-20260501/extensions.json) --
-- these two lines are a no-op safety net, not a fresh install, and match
-- the exact pattern already live for process-subscription-renewal
-- (supabase/migrations/20260401000001_renewal_scheduler.sql).
-- (Part B statements are commented out so applying this whole file is always
-- safe; uncomment them deliberately when arming the cron.)
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

-- Store the probe's auth token in Vault. NEVER paste the real token value in
-- this file or in chat -- replace the placeholder by hand in the Supabase
-- SQL Editor, run once, then discard/clear the statement from your editor
-- history. If the secret already exists (re-arming after a token rotation),
-- use vault.update_secret(...) instead -- see the cron_secret precedent in
-- docs/OWNER_ACTIONS.md ("Cron secret mismatch" item) for the exact form.
--
-- select vault.create_secret(
--   '<PROBE_TASK_TOKEN VALUE -- same value set via `supabase secrets set PROBE_TASK_TOKEN=...`>',
--   'probe_task_token',
--   'x-probe-token header value for the synthetic-probe cron (docs/launch/synthetic-probe-runbook.md)'
-- );

-- synthetic-probe is deployed with verify_jwt = false (supabase/config.toml),
-- exactly like process-subscription-renewal: the function's own constant-time
-- x-probe-token check is the gate, so the cron statement carries no anon key.
--
-- select cron.schedule(
--   'synthetic-probe',               -- unique job name (idempotent: re-run updates schedule/command)
--   '*/15 * * * *',                  -- every 15 minutes
--   $cron$
--   select net.http_post(
--     url     := 'https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/synthetic-probe',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-probe-token', (select decrypted_secret from vault.decrypted_secrets where name = 'probe_task_token')
--     ),
--     body    := '{}'::jsonb
--   ) as request_id;
--   $cron$
-- );

-- Rollback (stop the cron without touching data or the deployed function):
--   select cron.unschedule('synthetic-probe');
-- Full rollback (also drop the auth token):
--   select vault.delete_secret((select id from vault.secrets where name = 'probe_task_token'));
