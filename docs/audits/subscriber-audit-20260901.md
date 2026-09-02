# Subscriber entitlement audit — 2026-09-01

Owner-ordered pre-campaign audit ("تذكير بالاشتراك خلال 14 يوماً").
Source of truth: production DB (auth.users + profiles + user_subscriptions),
queried via Management API. Test accounts (mailnull) excluded; 3 of 4 were
deleted this session, `smoke_retrieval_042026@mailnull.com` (engineer) kept as
the sole test account.

> PII note (2026-09-02): the original version of this file listed the
> subscribers' email addresses. Customer PII is never committed to git; the
> lists live only in the owner's local, gitignored `docs/campaigns/*.csv`
> files. This copy keeps every finding and every count, minus the identities.

## Headline numbers

- Real users: **79**
- Unique ACTIVE paid subscribers: **22** (17 engineer + 5 enterprise)
- Their current periods end **2027-04-10 → 2027-05-15** — **nobody's paid
  period ends within 14 days**. A "renewal due" reminder now has zero
  legitimate targets; a re-subscribe campaign to lapsed users does.
- Lapsed/free pool: 40 free|expired + 9 stale-paid-label users (below).

## The 22 active paid subscribers (campaign list)

17 engineer-plan users + 5 enterprise-plan users (one enterprise row is the
owner's own account family). One engineer-plan address is on a
disposable-looking domain. Full dedup'd list: local `docs/campaigns/` CSVs.

## Findings (verified, with counts)

1. **Duplicate subscription rows** — 8 users hold 2-5 rows each (one user x5,
   three users x3, four users x2). Four of them mix ACTIVE with
   cancelled/expired rows. Any code that reads a user's subscription without
   `order by created_at desc limit 1` can pick a random row for these users.
   Cleanup (keep newest row per user) proposed — NOT executed (data deletion
   needs explicit owner approval).
2. **All 23 active sub rows have `moyasar_card_token = NULL`** — no stored
   card, so auto-renewal cannot charge anyone. Every 2027-04/05 renewal will
   require a manual payment journey. This makes reminder campaigns essential.
   (Resolved 2026-09-01: the webhook stores tokens on real payments; founding
   grants never paid, so none exist — not a bug.)
3. **9 users have a paid `profiles.plan_type` but NO active/trialing sub** —
   stale labels (their gate access is already free). Campaign targeting must
   key off `user_subscriptions.status='active'`, never `profiles.plan_type`.
4. **4 stale `trialing` rows** — the owner's own +consultx test aliases,
   trial_end 2026-08-28 already passed; cosmetic. (Closed by the first
   renewal sweep on 2026-09-01: `trials_expired: 4`.)
5. Admin accounts show enterprise + expired sub — harmless (admin bypass),
   label-only.
6. (Added 2026-09-02) The single "active but overdue" row (period ended
   2026-05-02) turned out to be the kept smoke test account itself — extended
   to 2027-12-31 as a billing-inert fixture. No real customer was affected.

## Recommended next steps (owner call)

- [ ] Approve duplicate-row cleanup (keep newest per user; 12 stale rows go).
- [ ] Decide campaign target: 22 actives (renewal far away) vs lapsed pool
      (win-back draft prepared 2026-09-02).
- [x] Investigate the missing card tokens — resolved, see finding 2.
