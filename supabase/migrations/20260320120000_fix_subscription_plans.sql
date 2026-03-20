-- Sub-Agent 1: Reset and seed subscription_plans with correct plan data

-- 1. Add slug (links plan row to profiles.plan_type)
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- 2. Add features JSONB
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}';

-- 3. Clear stale rows
DELETE FROM public.subscription_plans;

-- 4. Insert the three canonical plans
--    price_amount is stored in halalas (SAR * 100) so display = price_amount / 100
INSERT INTO public.subscription_plans
  (name_ar, name_en, slug, type, price_amount, currency, duration_days, target, features, is_active)
VALUES
  (
    'مستكشف', 'Explorer', 'free',
    'monthly', 0, 'SAR', 30, 'individual',
    '{"messages_per_day": 10, "graphrag": false, "modes": ["standard"]}'::jsonb,
    true
  ),
  (
    'مهندس', 'Engineer', 'engineer',
    'monthly', 9900, 'SAR', 30, 'individual',
    '{"messages_per_day": null, "graphrag": true, "modes": ["standard", "advisory", "analysis"]}'::jsonb,
    true
  ),
  (
    'مؤسسة', 'Enterprise', 'enterprise',
    'monthly', 34900, 'SAR', 30, 'individual',
    '{"messages_per_day": null, "graphrag": true, "modes": ["standard", "advisory", "analysis"], "team_members": 10}'::jsonb,
    true
  );
