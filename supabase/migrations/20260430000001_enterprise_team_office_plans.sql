-- ============================================================
-- Enterprise self-service per-seat plans
--
-- Adds two new public Enterprise plans with per-seat billing:
--   enterprise_team    399 SAR / seat / month, min 3 seats
--   enterprise_office  549 SAR / seat / month, min 5 seats
--
-- Adds the schema columns needed to support per-seat billing:
--   subscription_plans.price_per_seat  INTEGER NULL
--   subscription_plans.min_seats       INTEGER NOT NULL DEFAULT 1
--   user_subscriptions.seat_count      INTEGER NOT NULL DEFAULT 1
--
-- Legacy enterprise (slug='enterprise', 349 SAR flat) is preserved
-- intact. Pre-migration baseline shows 1 live trialing subscriber on
-- that plan, so this migration does NOT toggle is_active. The frontend
-- hides slug='enterprise' from public checkout; admin override and
-- existing subscriber renewal continue to work unchanged.
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify free / engineer / pro rows
--   * does NOT modify the legacy enterprise row
--   * does NOT modify existing subscription rows
--   * does NOT alter payment_transactions
--   * does NOT touch organization tables, RLS, or Enterprise workspace
--   * does NOT touch fire-safety-chat, Analytical Mode, or corpus
--
-- Idempotent. Safe to re-apply.
--
-- Apply via controlled SQL execution against project hrnltxmwoaphgejckutk.
-- Do NOT use supabase db push (CLI tracking is divergent).
--
-- Rollback notes (if ever needed -- review before running):
--   DELETE FROM public.subscription_plans WHERE slug IN ('enterprise_team','enterprise_office');
--   ALTER TABLE public.user_subscriptions DROP COLUMN IF EXISTS seat_count;
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS price_per_seat;
--   ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS min_seats;
--   ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_min_seats_positive_chk;
--   ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_price_per_seat_positive_chk;
--   ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_seat_count_positive_chk;
-- ============================================================

BEGIN;

-- -- 1. New columns on subscription_plans -----------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_per_seat INTEGER;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS min_seats INTEGER NOT NULL DEFAULT 1;

-- -- 2. New column on user_subscriptions ------------------------------------
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS seat_count INTEGER NOT NULL DEFAULT 1;

-- -- 3. CHECK constraints (idempotent via existence probe) -----------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_plans_min_seats_positive_chk'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_min_seats_positive_chk
      CHECK (min_seats >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_plans_price_per_seat_positive_chk'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_price_per_seat_positive_chk
      CHECK (price_per_seat IS NULL OR price_per_seat > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subscriptions_seat_count_positive_chk'
  ) THEN
    ALTER TABLE public.user_subscriptions
      ADD CONSTRAINT user_subscriptions_seat_count_positive_chk
      CHECK (seat_count >= 1);
  END IF;
END $$;

-- -- 4. enterprise_team plan (399 SAR/seat, min 3) -------------------------
-- price_amount stores the displayable monthly total at min_seats
-- (399 x 3 = 1,197 SAR = 119700 halalas). Renewal computes the live
-- amount from price_per_seat * seat_count.
INSERT INTO public.subscription_plans
  (name_ar, name_en, slug, type, price_amount, price_per_seat, min_seats,
   currency, duration_days, target, features, is_active)
VALUES (
  'فريق المؤسسات',
  'Enterprise Team',
  'enterprise_team',
  'monthly',
  119700,
  39900,
  3,
  'SAR',
  30,
  'enterprise_self_service',
  '{
    "graphrag": true,
    "modes": ["primary", "standard", "analysis"],
    "messages_per_day": null,
    "advisory_limit": null,
    "analysis_limit": null,
    "team_members": 3,
    "min_seats": 3,
    "price_per_seat": 39900
  }'::jsonb,
  true
)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  name_ar        = EXCLUDED.name_ar,
  name_en        = EXCLUDED.name_en,
  type           = EXCLUDED.type,
  price_amount   = EXCLUDED.price_amount,
  price_per_seat = EXCLUDED.price_per_seat,
  min_seats      = EXCLUDED.min_seats,
  currency       = EXCLUDED.currency,
  duration_days  = EXCLUDED.duration_days,
  target         = EXCLUDED.target,
  features       = EXCLUDED.features,
  is_active      = EXCLUDED.is_active;

-- -- 5. enterprise_office plan (549 SAR/seat, min 5) -----------------------
-- price_amount = 549 x 5 = 2,745 SAR = 274500 halalas.
INSERT INTO public.subscription_plans
  (name_ar, name_en, slug, type, price_amount, price_per_seat, min_seats,
   currency, duration_days, target, features, is_active)
VALUES (
  'مكتب المؤسسات',
  'Enterprise Office',
  'enterprise_office',
  'monthly',
  274500,
  54900,
  5,
  'SAR',
  30,
  'enterprise_self_service',
  '{
    "graphrag": true,
    "modes": ["primary", "standard", "analysis"],
    "messages_per_day": null,
    "advisory_limit": null,
    "analysis_limit": null,
    "team_members": 5,
    "min_seats": 5,
    "price_per_seat": 54900
  }'::jsonb,
  true
)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  name_ar        = EXCLUDED.name_ar,
  name_en        = EXCLUDED.name_en,
  type           = EXCLUDED.type,
  price_amount   = EXCLUDED.price_amount,
  price_per_seat = EXCLUDED.price_per_seat,
  min_seats      = EXCLUDED.min_seats,
  currency       = EXCLUDED.currency,
  duration_days  = EXCLUDED.duration_days,
  target         = EXCLUDED.target,
  features       = EXCLUDED.features,
  is_active      = EXCLUDED.is_active;

-- -- 6. Legacy enterprise (slug='enterprise') ----------------------------
-- Pre-migration baseline: 1 trialing subscriber. This row is intentionally
-- NOT modified by this migration. The frontend hides it from public
-- checkout; admin override and renewal of the existing trialing user
-- continue to work because slug='enterprise' is still recognized as
-- enterprise-tier in check-subscription.

COMMIT;