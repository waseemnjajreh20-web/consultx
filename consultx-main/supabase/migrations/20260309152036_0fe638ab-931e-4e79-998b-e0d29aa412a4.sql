-- Add missing columns to profiles table (skip if already exists)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tap_charge_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_message_count INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_message_date DATE;

-- Create payment_history table for direct checkout payments
CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tap_charge_id TEXT,
  amount DECIMAL(10,2),
  currency TEXT DEFAULT 'SAR',
  plan TEXT,
  billing_cycle TEXT,
  status TEXT DEFAULT 'INITIATED',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on payment_history
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_history
CREATE POLICY "Users can view own payment_history"
  ON public.payment_history FOR SELECT
  USING (auth.uid() = user_id);