-- ============================================================
-- Renewal Scheduler
-- Enables pg_cron + pg_net and schedules the
-- process-subscription-renewal Edge Function to run every hour.
-- ============================================================

-- pg_cron: PostgreSQL cron scheduler (Supabase managed, always available)
-- pg_net:  Async HTTP from within PostgreSQL (required to call Edge Functions)
-- pg_cron installs into the pg_catalog / cron schema; pg_net into the net schema.
-- Do NOT force them into the extensions schema — use their canonical schemas.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Schedule the renewal job ──────────────────────────────────────────────
-- Runs at the top of every hour (cron: "0 * * * *").
-- A 60-minute cadence matches the 1-hour safety window in the function:
-- no subscription due in the current window will ever be missed by a
-- late-firing cron.
--
-- Secret auth:
--   The function checks the CRON_SECRET environment variable if set.
--   To enable secret validation:
--     1. Add CRON_SECRET to Edge Function secrets in the Supabase dashboard.
--     2. Run once (not in migration — keep secrets out of git):
--          ALTER DATABASE postgres SET app.cron_secret = 'your-secret-value';
--   The job below reads app.cron_secret via current_setting(). If the
--   setting is absent it passes an empty string; the function will accept
--   this only when CRON_SECRET env var is also not set.
SELECT cron.schedule(
  'process-subscription-renewal',  -- unique job name (idempotent: re-run is safe)
  '0 * * * *',                     -- every hour at :00
  $cron$
  SELECT net.http_post(
    url     := 'https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/process-subscription-renewal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(current_setting('app.cron_secret', true), '')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $cron$
);
