# Seat-enforcement boundary — next-sprint TODO

## Current state (after migration 20260430000001)

**Self-service per-seat plans are live:**
- `enterprise_team` — 399 SAR/seat/month, min 3 seats
- `enterprise_office` — 549 SAR/seat/month, min 5 seats

**What this sprint shipped (billing layer):**
- `subscription_plans.price_per_seat` and `min_seats`
- `user_subscriptions.seat_count`
- `moyasar-create-subscription` accepts and validates `seat_count`
- `process-subscription-renewal` charges `price_per_seat × max(seat_count, min_seats, 1)`
- `moyasar-webhook` verifies the per-seat amount on renewal
- `check-subscription` recognises new slugs as enterprise tier
- Frontend (`Subscribe.tsx`, `PricingLanding.tsx`) shows per-seat pricing and a seat picker

**What this sprint did NOT ship (organisation layer):**
- Paying for `enterprise_team` / `enterprise_office` does **not** automatically create an organization
- `org_members.status='active'` count is **not** enforced against `user_subscriptions.seat_count`
- Owners can still invite unlimited members regardless of paid seats
- There is no `organization_subscriptions` table linking org to subscription

## Next sprint — the work to close the loop

1. **Auto-create org on paid activation**
   When `moyasar-webhook` flips an `enterprise_team` / `enterprise_office` subscription to `active`, create an organization (if the user has none) and insert the founding owner row. Link `organizations.subscription_id` (new column) → `user_subscriptions.id`.

2. **Enforce seat_count in invite flow**
   In `useOrganization.inviteMember` and the corresponding RLS / RPC layer:
   - Count active members (`org_members.status='active'`) plus pending invitations not yet accepted.
   - Reject inviteMember when `(active + pending) >= subscription.seat_count`.
   - Surface "upgrade seats" UI when the limit is reached.

3. **Allow seat_count adjustment after activation**
   Owner-only RPC `update_subscription_seat_count(p_seat_count int)`:
   - Validate against `min_seats`.
   - On increase: prorate the new monthly amount on next renewal (Moyasar handles billing-cycle math; we just persist the new seat_count).
   - On decrease: only allowed if active member count would still be ≤ new seat_count.

4. **Phase E8 organization_subscriptions (longer-term)**
   The migration comments in `20260426000001_enterprise_organization_core_schema.sql` already anticipate this as Phase E8 — once enforcement above is in place, lifting billing from `user_subscriptions` to `organization_subscriptions` is a clean refactor with no user-visible behaviour change.

## Risks deferred

- Today, an owner who pays for 3 seats can still invite 30 members. Acceptable for the launch sprint because the customer expects to be billed for what they paid; over-invitation is a UX issue, not a revenue leak. **Must be closed before any GA marketing push.**
- Renewal charges always use the stored `seat_count`; if the customer wants to change seats they currently must cancel + resubscribe. **Add the adjustment RPC in next sprint.**
