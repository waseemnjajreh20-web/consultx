-- Restore per-mode daily usage RPCs for the Pro plan tier
-- These RPCs work with the existing mode_daily_usage table

-- Increment counter for a specific mode, returning the new count
CREATE OR REPLACE FUNCTION public.increment_mode_daily_count(p_user_id UUID, p_mode TEXT)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
AS $$
  INSERT INTO public.mode_daily_usage (user_id, usage_date, mode, count)
  VALUES (p_user_id, CURRENT_DATE, p_mode, 1)
  ON CONFLICT (user_id, usage_date, mode)
  DO UPDATE SET
    count = public.mode_daily_usage.count + 1,
    updated_at = NOW()
  RETURNING count;
$$;

-- Get current count for a specific mode
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
  );
$$;

-- Decrement counter (used for rollback when limit exceeded)
CREATE OR REPLACE FUNCTION public.decrement_mode_daily_count(p_user_id UUID, p_mode TEXT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  UPDATE public.mode_daily_usage
  SET count = GREATEST(0, count - 1),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND usage_date = CURRENT_DATE
    AND mode = p_mode;
$$;

-- Get all mode counts in one call (for check-subscription)
CREATE OR REPLACE FUNCTION public.get_all_mode_daily_counts(p_user_id UUID)
RETURNS TABLE(mode TEXT, count INTEGER)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT m.mode, COALESCE(u.count, 0)::INTEGER
  FROM (VALUES ('primary'), ('standard'), ('analysis')) AS m(mode)
  LEFT JOIN public.mode_daily_usage u
    ON u.user_id = p_user_id
   AND u.usage_date = CURRENT_DATE
   AND u.mode = m.mode;
$$;