-- Add dunning_notified_at to user_subscriptions.
--
-- Records the timestamp when the first-failure dunning email was sent to the
-- subscriber. Serves as the authoritative deduplication flag: once set, no
-- further dunning emails are sent for this past_due episode, regardless of
-- how many retry attempts are made or whether tap-webhook and
-- process-subscription-renewal race on the first failure.
--
-- Cleared to NULL when the subscription recovers to active (i.e., when
-- past_due_since is cleared), so a future episode can trigger a fresh email.
--
-- Additive and nullable — safe to apply without downtime.
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS dunning_notified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN user_subscriptions.dunning_notified_at IS
  'Timestamp of the first-failure dunning email send. NULL = not yet sent. '
  'Used to deduplicate: only one email fires per past_due episode.';
