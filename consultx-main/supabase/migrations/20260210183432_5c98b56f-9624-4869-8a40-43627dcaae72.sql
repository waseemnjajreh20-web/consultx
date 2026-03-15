-- Add foreign key: payment_transactions.subscription_id -> user_subscriptions.id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_subscription_id_fkey') THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_subscription_id_fkey
      FOREIGN KEY (subscription_id) REFERENCES public.user_subscriptions(id);
  END IF;
END $$;

-- Create trigger for updated_at on user_subscriptions (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_subscriptions_updated_at') THEN
    CREATE TRIGGER update_user_subscriptions_updated_at
      BEFORE UPDATE ON public.user_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;