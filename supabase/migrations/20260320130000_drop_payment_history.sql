-- Sub-Agent 3: Drop orphaned payment_history table.
-- payment_transactions is the single canonical payment log used by all
-- edge functions (tap-create-subscription, create-checkout, tap-webhook)
-- and the Account.tsx frontend. payment_history was never written to.
DROP TABLE IF EXISTS public.payment_history;
