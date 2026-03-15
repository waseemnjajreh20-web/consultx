
-- Remove direct client SELECT access to user_subscriptions
-- All access should go through the check-subscription edge function (service role)
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.user_subscriptions;

-- The table still has RLS enabled, so now NO client-side queries can read it
-- Edge functions using service_role key bypass RLS and can still access it
