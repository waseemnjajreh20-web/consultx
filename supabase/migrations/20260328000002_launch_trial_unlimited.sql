-- Migration: Launch Trial — Unlimited 3-day access model
-- Replaces per-mode daily cap system with simple unlimited trial window.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the old CHECK constraint on launch_trial_status and add new states
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_launch_trial_status_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_launch_trial_status_check
  CHECK (launch_trial_status IN (
    'eligible_existing_pending',  -- existing user, trial not yet started
    'trial_active',               -- 3-day unlimited full access running
    'trial_expired',              -- 3-day window ended, not paid
    'paid',                       -- has active paid subscription
    'ineligible'                  -- campaign window closed before activation
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add new columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS launch_trial_consumed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS launch_source TEXT
    CHECK (launch_source IN ('new_signup', 'existing_user', 'manual_grant'));

-- launch_trial_welcomed already exists as BOOLEAN — no change needed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Migrate existing data: map old states → new states
-- ─────────────────────────────────────────────────────────────────────────────

-- 'eligible_new' → 'trial_active'  (new users already had trial activated)
UPDATE profiles
  SET launch_trial_status = 'trial_active',
      launch_trial_consumed = TRUE
  WHERE launch_trial_status = 'eligible_new';

-- 'eligible_existing_active' → 'trial_active'
UPDATE profiles
  SET launch_trial_status = 'trial_active',
      launch_trial_consumed = TRUE
  WHERE launch_trial_status = 'eligible_existing_active';

-- 'expired' → 'trial_expired'
UPDATE profiles
  SET launch_trial_status = 'trial_expired'
  WHERE launch_trial_status = 'expired';

-- 'ineligible_window_closed' → 'ineligible'
UPDATE profiles
  SET launch_trial_status = 'ineligible'
  WHERE launch_trial_status = 'ineligible_window_closed';

-- 'eligible_existing_pending' stays as-is
-- 'paid' stays as-is

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Drop the three per-mode daily usage functions (no longer used for enforcement)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_mode_daily_count(uuid, text);
DROP FUNCTION IF EXISTS increment_mode_daily_count(uuid, text);
DROP FUNCTION IF EXISTS decrement_mode_daily_count(uuid, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. mode_daily_usage table — kept for analytics, no longer used for enforcement
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: The mode_daily_usage table is intentionally retained.
-- It may still be written to for analytics/reporting purposes.
-- It is NO LONGER consulted for trial access enforcement.
-- The trial model is now: 3 days of unlimited full access from trial_start.
