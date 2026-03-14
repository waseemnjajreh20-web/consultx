-- Daily message usage table
CREATE TABLE public.daily_message_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  message_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, usage_date)
);

ALTER TABLE public.daily_message_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.daily_message_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own usage"
  ON public.daily_message_usage FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own usage"
  ON public.daily_message_usage FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Increment daily usage function (SECURITY DEFINER for edge functions)
CREATE OR REPLACE FUNCTION public.increment_daily_usage(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
BEGIN
  INSERT INTO daily_message_usage (user_id, usage_date, message_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET message_count = daily_message_usage.message_count + 1, updated_at = now()
  RETURNING message_count INTO current_count;
  RETURN current_count;
END;
$$;

-- Get daily usage function
CREATE OR REPLACE FUNCTION public.get_daily_usage(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT message_count FROM daily_message_usage WHERE user_id = p_user_id AND usage_date = CURRENT_DATE),
    0
  );
$$;