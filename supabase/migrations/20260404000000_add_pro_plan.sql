-- Add Pro plan (245 SAR/month) and update Engineer plan with mode-specific limits

-- 1. Update Engineer plan features with specific mode limits
UPDATE public.subscription_plans
SET features = '{
  "messages_per_day": null,
  "graphrag": true,
  "modes": ["primary", "standard", "analysis"],
  "advisory_limit": 20,
  "analysis_limit": 10
}'::jsonb
WHERE slug = 'engineer';

-- 2. Insert Pro plan (245 SAR = 24500 halalas)
INSERT INTO public.subscription_plans
  (name_ar, name_en, slug, type, price_amount, currency, duration_days, target, features, is_active)
VALUES
  (
    'برو',
    'Pro',
    'pro',
    'monthly',
    24500,
    'SAR',
    30,
    'individual',
    '{
      "messages_per_day": null,
      "graphrag": true,
      "modes": ["primary", "standard", "analysis"],
      "advisory_limit": 100,
      "analysis_limit": 50
    }'::jsonb,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  price_amount = EXCLUDED.price_amount,
  features = EXCLUDED.features,
  is_active = true;

-- 3. Ensure Enterprise has unlimited features (no limits)
UPDATE public.subscription_plans
SET features = '{
  "messages_per_day": null,
  "graphrag": true,
  "modes": ["primary", "standard", "analysis"],
  "team_members": 10
}'::jsonb
WHERE slug = 'enterprise';