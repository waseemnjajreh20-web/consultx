-- ============================================================
-- Launch Trial System — Migration
-- Campaign: 2026-03-28 → 2026-04-28 (1-month window)
-- Trial duration: 3 days from first activation
-- Mode limits during trial:
--   primary:  50 / day  (high, near-open access)
--   standard:  2 / day  (limited to show value)
--   analysis:  1 / day  (limited to show value)
-- ============================================================

-- 1. Add launch trial columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS launch_trial_status TEXT
    CHECK (launch_trial_status IN (
      'eligible_new',              -- New user (created >= campaign launch), trial = account creation + 3d
      'eligible_existing_pending', -- Existing user (created < launch), not yet activated
      'eligible_existing_active',  -- Existing user, trial is running
      'expired',                   -- Trial 3-day window ended
      'paid',                      -- Active paid subscription — excluded from trial layer
      'ineligible_window_closed'   -- Campaign window ended before user activated
    )),
  ADD COLUMN IF NOT EXISTS launch_trial_start    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS launch_trial_end      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS launch_trial_welcomed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Mode-specific daily usage table
CREATE TABLE IF NOT EXISTS public.mode_daily_usage (
  id          UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
  mode        TEXT         NOT NULL CHECK (mode IN ('primary', 'standard', 'analysis')),
  count       INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, usage_date, mode)
);

ALTER TABLE public.mode_daily_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own mode usage (for UI indicators)
CREATE POLICY "Users can read own mode usage"
  ON public.mode_daily_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (used by edge functions)
CREATE POLICY "Service role full access to mode_daily_usage"
  ON public.mode_daily_usage
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Helper: get today's count for a user+mode
CREATE OR REPLACE FUNCTION public.get_mode_daily_count(p_user_id UUID, p_mode TEXT)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT count FROM public.mode_daily_usage
     WHERE user_id = p_user_id
       AND usage_date = CURRENT_DATE
       AND mode = p_mode),
    0
  )
$$;

-- 4. Helper: increment and return new count for a user+mode
CREATE OR REPLACE FUNCTION public.increment_mode_daily_count(p_user_id UUID, p_mode TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO public.mode_daily_usage (user_id, usage_date, mode, count)
  VALUES (p_user_id, CURRENT_DATE, p_mode, 1)
  ON CONFLICT (user_id, usage_date, mode)
  DO UPDATE SET
    count      = public.mode_daily_usage.count + 1,
    updated_at = NOW()
  RETURNING count
$$;

-- 5. Helper: decrement (used when stream fails / aborted before real content)
CREATE OR REPLACE FUNCTION public.decrement_mode_daily_count(p_user_id UUID, p_mode TEXT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  UPDATE public.mode_daily_usage
  SET count      = GREATEST(0, count - 1),
      updated_at = NOW()
  WHERE user_id    = p_user_id
    AND usage_date = CURRENT_DATE
    AND mode       = p_mode
$$;

-- 6. Index for fast daily lookups
CREATE INDEX IF NOT EXISTS idx_mode_daily_usage_lookup
  ON public.mode_daily_usage (user_id, usage_date, mode);

-- 7. Index for launch trial status lookups
CREATE INDEX IF NOT EXISTS idx_profiles_launch_trial_status
  ON public.profiles (launch_trial_status)
  WHERE launch_trial_status IS NOT NULL;
