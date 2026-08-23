# ConsultX — Billing Contract (Backend ↔ Frontend)

**Date:** 2026-08-23
**Branch:** `recovery/stabilization-2026-08-23`
**Owner decisions applied:** card required to start trial · full price charged at trial end · **the seller is NOT VAT-registered — no VAT is charged, displayed, or recorded** · 1 SAR card verification kept and deducted from the first invoice (no refund)
**Correction 2026-08-23:** an earlier revision of this file stated prices were VAT-inclusive. That was wrong and has been reversed everywhere (see Section 1 and Section 11).
**Status:** backend implemented, migration pending owner application (see "Migration (owner applies)")

This file is the single source of truth for the payment/subscription contract. The frontend
must read field names from here — they are fixed and will not change without a note in this file.

---

## Section 1. Money model

All amounts are integers in **halalas** (1 SAR = 100 halalas). Currency is always `SAR`.

### 1.1 VAT — the seller is NOT registered

The selling entity is **مؤسسة العباقرة الأوائل لتقنية نظم المعلومات**, CR `7042173794`. It is **not
registered for VAT with ZATCA**. A non-registered seller in Saudi Arabia must not:

- charge VAT,
- present a price as "VAT-inclusive" or "VAT-exclusive",
- describe itself as "VAT exempt" (the service is not exempt — the seller is simply not registered),
- issue a tax invoice or anything that resembles one.

**Therefore:** `subscription_plans.price_amount` / `price_per_seat` is the **whole consideration**.
There is no tax component. **No customer-facing surface may show any tax line**; the price is
rendered bare (99 / 245 / 399 / 549 SAR, unchanged).

Every charge records `chargeSplit(total)` — `_shared/billing.ts`:

```
base = total
vat  = 0
```

Example: Pro at `price_amount = 24500` (245.00 SAR)
→ `amount_base = 24500` · `amount_vat = 0` · `amount = 24500`.

`amount_base` / `amount_vat` are kept populated (rather than left NULL) so the columns carry an
unambiguous meaning — "0.00 tax was charged on this transaction" — instead of the ambiguous
"not recorded". They are never displayed to the customer.

`splitVat(total)` (the 15% arithmetic) is **retained, exported and unit-tested** but is **not applied
to any live charge**. It exists ready for the day the owner registers. The single switch is
`export const VAT_REGISTERED: boolean = false` in `_shared/billing.ts`; see Section 11.

**No amount charged changed with this correction.** Pro is still 24500 halalas.

Per-seat plans (`enterprise_team`, `enterprise_office`) have `price_per_seat != null`:

```
effective_seats = max(subscription.seat_count, plan.min_seats, 1)
plan_price      = price_per_seat * effective_seats
```

Flat plans (`engineer`, `pro`, legacy `enterprise`) have `price_per_seat = null` and use `price_amount`.

**Card verification amount:** `100` halalas (1.00 SAR). It is a real charge, never refunded, and is
**credited against the first real invoice**. Recorded as `amount_base = 100`, `amount_vat = 0`.

---

## Section 2. Billing flows

The server decides the flow — the client never sends an amount. The chosen flow is written into
the Moyasar payment `metadata.flow` and re-read from the Moyasar API by the webhook.

| flow | when | amount charged | resulting status |
|---|---|---|---|
| `trial_card_verification` | `status = "trialing"` AND `trial_end > now` | `100` (1.00 SAR) | stays `trialing`, card stored, `next_billing_date = trial_end` |
| `immediate_charge` | no active trial (expired trial, returning user, `pending_activation`, plan change) | full `plan_price` (or promo price) | `active`, new 30-day period |
| `post_trial_first_charge` | cron converts a trialing sub whose `trial_end` has passed and that has a saved card token | `plan_price - 100` on the first paid invoice (see the credit predicate below), otherwise full `plan_price` | `active` on success, `past_due` on failure |
| `renewal` | `status = "active"` and `next_billing_date` reached, or `past_due` retry inside the grace window | full `plan_price` | `active` on success, `past_due` on failure |

**Promotions** (`FOUNDING10`, `EID50`) apply to **`immediate_charge` only**. They are ignored for
`trial_card_verification`, `post_trial_first_charge`, and `renewal` (renewals always bill the full plan price).

**Promo restrictions (server-side, `_shared/billing.ts`):**

| code | plan restriction | window | first-month price |
|---|---|---|---|
| `FOUNDING10` | `pro` only (`FOUNDING10_PLAN_SLUG`) | `FOUNDING10_WINDOW_START_MS` .. `FOUNDING10_WINDOW_END_MS` | 10.00 SAR |
| `EID50` | `pro` only | none | 122.50 SAR |

The promo code is client-supplied text, so both checks run server-side in `promoAmountFor`.
Outside the window (or on any other plan) the code is inert and the full plan price is charged.
Webhook amount validation (`expectedAmountsFor`) keeps the plan restriction but deliberately
ignores the window, so a payment created just before the window closed is not stranded when its
webhook lands just after.

**OPEN REQUIREMENT — per-user redemption ledger (NOT implemented).** `FOUNDING10` and `EID50`
are still repeatable by the same user via cancel-and-resubscribe: each cycle creates a new
`immediate_charge` and nothing records that the user already redeemed the offer. Closing this
needs a new table, which is out of scope for a code-only change:

```sql
-- NOT APPLIED. Owner decision + migration required.
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promo_code   text NOT NULL,
  subscription_id uuid REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  redeemed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, promo_code)
);
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
-- service-role only; no client policy.
```

Until it exists, the plan restriction plus the date window are the only bounds on repeat
redemption. The exposure per repeat is capped at (Pro price − 10.00 SAR) rather than the
previous (enterprise_office at 100 seats − 10.00 SAR).

---

## Section 3. Subscription statuses

`user_subscriptions.status` values the frontend must handle:

| status | meaning | AI access |
|---|---|---|
| `pending_activation` | returning user; payment in flight, webhook not yet delivered | no |
| `trialing` | inside the 7-day free trial window (`trial_end > now`) | yes, if a card is on file (see Section 4) |
| `active` | paid, inside `current_period_end` | yes |
| `past_due` | a charge failed; 7-day grace window from `past_due_since`. At the end of the window `process-subscription-renewal` moves the row to `expired` (or `cancelled` if the user had opted out) and syncs `profiles.plan_type` to `free` | yes during grace, no after |
| `expired` | trial ended with no card, or period ended | no |
| `cancelled` | user cancelled and the period ended | no |

`GRACE_DAYS = 7` — must stay identical in `check-subscription`, `moyasar-webhook`,
`process-subscription-renewal`, `Workspace.tsx`, `Account.tsx`.

---

## Section 4. `check-subscription` response — new fields

Three fields are **added**. Every pre-existing field is unchanged.

```jsonc
{
  // ... all existing fields unchanged ...

  "trial_requires_card": true,          // constant. A card is required to start/keep the trial.
  "card_on_file": false,                // boolean. true when user_subscriptions.moyasar_card_token IS NOT NULL
  "card_verified_at": null,             // ISO 8601 string | null. When the 1 SAR verification succeeded.
  "trial_end": null,                    // ISO 8601 string | null. Raw user_subscriptions.trial_end.
  "trial_conversion_pending": false     // boolean. Lapsed trial + card on file, waiting for the cron.
}
```

Notes:
- `trial_requires_card` is always `true`. It exists so the frontend gating can be flipped from the
  backend later without a frontend release.
- `card_on_file` is `true` for any subscription row that has a stored Moyasar card token — trial or paid.
- `card_verified_at` is `null` until the migration in Section 8 is applied; treat `null` as
  "unknown, fall back to `card_on_file`". Never gate on `card_verified_at` alone.
- Admin-override responses also carry these fields (`card_on_file: true`,
  `card_verified_at: null`, `trial_end: null`, `trial_conversion_pending: false`) so the
  frontend never has to special-case admins.
- `trial_end` is the RAW trial window end. **The frontend must never treat
  `status === "trialing"` alone as "trial is active".** A lapsed trial with a card on file
  is deliberately left in status `trialing` (see below), so the only correct test is
  `status === "trialing" && trial_end > now` — identical to `isInTrial()` in
  `_shared/billing.ts`. `useEntitlement.isTrialActive` implements exactly this.
- `trial_conversion_pending` is `true` only when `status === "trialing"` AND
  `trial_end <= now` AND a card token is on file. The user is **not** active; the hourly
  `process-subscription-renewal` pass owes them a `post_trial_first_charge`.

**`check-subscription` must NOT expire a lapsed `trialing` row that has a card token.**
Doing so removes the row from the renewal job's `status = "trialing"` work queue, so the
conversion never fires, the customer is never charged, and the 1.00 SAR they already paid
buys them nothing. A lapsed `trialing` row is only expired when
`moyasar_card_token IS NULL` (nothing can ever be charged).

---

## Section 5. UX states the frontend must implement

Derive the state from `status` + `card_on_file`:

### 5.1 `trial_no_card`
`status === "trialing"` AND `card_on_file === false`.

The user is inside the trial window but has not added a card. **Block chat** and show the
add-card step. Copy:

> **AR:** لبدء تجربتك المجانية أضف بطاقتك. سنخصم **1.00 ريال** للتحقق من البطاقة فقط، **يُخصم من أول فاتورة**. لن نحصّل أي مبلغ آخر قبل انتهاء التجربة.
> **EN:** Add your card to start your free trial. We charge **SAR 1.00** to verify the card — it is **deducted from your first invoice**. Nothing else is charged before your trial ends.

Do **not** say "refunded" / "يُسترد" anywhere. There is no refund. The word is **"deducted" / "يُخصم"**.

### 5.2 `trial_card_on_file`
`status === "trialing"` AND `card_on_file === true`.

Full trial access. Show the trial countdown (`trial_days_remaining`, `expires_at`) and the
scheduled first charge. Copy:

> **AR:** تجربتك المجانية فعّالة. عند انتهائها في {expires_at} سنحصّل **{plan_price − 1.00} ريال** (سعر الخطة {plan_price} ريال ناقص 1.00 ريال التحقق المخصوم من أول فاتورة).
> **EN:** Your free trial is active. When it ends on {expires_at} we will charge **SAR {plan_price − 1.00}** (plan price SAR {plan_price} minus the SAR 1.00 verification, deducted from your first invoice).

No tax line follows the amount. See Section 1.1.

### 5.3 `active`
`status === "active"`. Normal paid state. Show `expires_at` as the next billing date and the
plan price **bare**. Never render any tax line — no "شامل ضريبة القيمة المضافة", no "Includes VAT",
no "excluding VAT", no "VAT exempt", and no base/tax/total breakdown.

### 5.4 `past_due`
`status === "past_due"`. Access continues until `past_due_since + 7 days` (`expires_at` already
carries the grace end). Show the update-card CTA. A dunning email has already been sent by the backend.

**The update-card path is the normal checkout.** `moyasar-create-subscription` and
`moyasar-initiate-token-payment` both accept a `past_due` subscription, so `/subscribe` refreshes
the payment session on the existing row and charges the full plan price as an `immediate_charge`,
which activates a new 30-day period. Promotion codes are ignored for a `past_due` row: an offer is
for a new checkout, never for repairing a failing card.

The cron keeps its own retry going in parallel, capped at `MAX_CHARGE_ATTEMPTS` attempts spaced by
`CHARGE_RETRY_BACKOFF_MS` (see Section 12.3).

### 5.5 `expired`
`status === "expired"` or `"cancelled"`. No access. Route to checkout, which will run
`immediate_charge` at the **full plan price** (not 1 SAR).

---

## Section 6. Amounts and descriptions shown at each step

| Step | Amount shown | Moyasar `description` |
|---|---|---|
| Add card to start trial | `1.00 SAR` | `ConsultX card verification (deducted from first invoice)` |
| Checkout with no active trial | full plan price | `ConsultX subscription — {plan.name_en}` |
| Checkout with `FOUNDING10` | `10.00 SAR` | `ConsultX Founding Engineers Offer — First Month` |
| Checkout with `EID50` (Pro only) | `122.50 SAR` | `ConsultX Eid Offer — First Month at 50% Off` |
| First invoice at trial end | plan price − `1.00 SAR` | `ConsultX subscription — {plan.name_en} (first invoice, less 1.00 SAR card verification)` |
| Renewal | full plan price | `Subscription renewal — {plan.name_en}` |

`moyasar-create-subscription` returns `amount` + `description` for the checkout screen; those are
now computed by the same server helper as the actual charge, so the displayed amount and the
charged amount cannot diverge.

---

## Section 7. Moyasar payment `metadata` written by the backend

```jsonc
{
  "subscription_id": "<uuid>",
  "given_id": "<uuid>",            // not present on cron-initiated charges
  "plan_id": "<uuid>",           // the plan THIS payment buys — see Section 12.1
  "seat_count": 5,               // the seats THIS payment buys — see Section 12.1
  "user_id": "<uuid>",
  "flow": "trial_card_verification" | "immediate_charge" | "post_trial_first_charge" | "renewal",
  "purpose": "card_verification" | "immediate_charge" | "founding10_first_month" | "eid50_first_month" | "post_trial_first_charge" | "renewal",
  "expected_amount": 100,          // halalas, string-or-number tolerant on read
  "amount_base": 100,              // halalas, equals expected_amount (no tax component)
  "amount_vat": 0,                 // halalas, always 0 while the seller is not VAT-registered
  "promo_code": "EID50"            // only when a promo was applied
}
```

The webhook re-fetches the payment from `GET https://api.moyasar.com/v1/payments/{id}` and reads
`metadata.flow` from **that** response — never from the webhook body, and never from client input.
If `metadata.flow` is absent (payments created before this change), the webhook falls back to
deriving the flow from the database row and to the legacy amount-validation rules.

---

## Section 8. Migration (owner applies)

`.claude/hooks/guard-migrations.js` blocks writes under `supabase/migrations/`, so the SQL lives
here. It is idempotent and safe to re-run. Apply it in the Supabase SQL Editor.

Verified against `src/integrations/supabase/types.ts`: all three columns are currently **missing**.

```sql
-- ConsultX billing 2026-08-23 — amount split + card verification stamp
-- Idempotent. Safe to re-run.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS card_verified_at timestamptz;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS amount_base integer;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS amount_vat integer;

COMMENT ON COLUMN public.user_subscriptions.card_verified_at IS
  'Timestamp of the successful 1.00 SAR card-verification charge. Presence means the 100-halala credit is owed against the first real invoice.';
COMMENT ON COLUMN public.payment_transactions.amount_base IS
  'Tax-exclusive base in halalas. The seller is NOT VAT-registered, so base = amount and no tax is charged. Becomes round(amount / 1.15) only if/when the seller registers for VAT.';
COMMENT ON COLUMN public.payment_transactions.amount_vat IS
  'Tax component in halalas. Always 0 while the seller is not VAT-registered.';
```

### 8.1 Verification-credit predicate before the migration

`card_verified_at` does not exist in production yet, so gating the 100-halala credit on it alone
charges **every** converting customer the full plan price while `TrialCardBanner` promised them
"plan price minus 1.00 SAR". `verificationCreditOwed(sub)` in `_shared/billing.ts` therefore
accepts three predicates, in order of authority:

1. `card_verified_at` is set (exact; post-migration only).
2. `has_captured_verification` — the caller counted a `captured` transaction with
   `payment_type = 'verification'` for this subscription. Needs no new column.
3. A stored `moyasar_card_token` on a row still in status `trialing`. During a trial the only
   code path that stores a token is the captured 1.00 SAR verification webhook.

The credit is still applied at most once: `priorPaidCount === 0` (no captured non-verification
transaction) remains a hard requirement. Erring toward granting the credit undercharges by at
most 1.00 SAR once; erring the other way overcharges every converting customer.

**Until this is applied:** the backend writes these columns *optimistically* and silently retries
without them when PostgREST reports an undefined column (`PGRST204` / SQLSTATE `42703`). Nothing
breaks; the amount split and `card_verified_at` are simply not persisted. `check-subscription` returns
`card_verified_at: null` in that state, which is why gating must use `card_on_file`.

After applying, no backfill is required for correctness. Optional backfill of historical rows —
**no VAT was ever charged on them, so the base is the full amount**:

```sql
UPDATE public.payment_transactions
   SET amount_base = amount,
       amount_vat  = 0
 WHERE amount_base IS NULL;
```

Do **not** run the old `round(amount / 1.15)` backfill — it would fabricate a tax split that was
never charged.

---

## Section 9. Backend files that implement this contract

| File | Role |
|---|---|
| `supabase/functions/_shared/billing.ts` | `computeCharge`, `chargeSplit` (applied to live charges), `splitVat` (dormant, kept for future registration), `expectedAmountsFor`, `deriveFlow`, `isUndefinedColumnError`, `isUniqueViolationError`, `chargeRetryEligibility`, `parsePaidPlanRef`, `trialChargeAuthorized` — pure, unit-tested |
| `supabase/functions/moyasar-create-subscription/index.ts` | returns the honest checkout `amount` / `description` for display |
| `supabase/functions/moyasar-initiate-token-payment/index.ts` | decides the flow server-side and creates the Moyasar charge |
| `supabase/functions/moyasar-webhook/index.ts` | verifies HMAC + re-verifies via API, then applies the flow-specific state transition |
| `supabase/functions/process-subscription-renewal/index.ts` | trial→paid conversion pass, renewal pass, past-due retry pass, no-card expiry pass |
| `supabase/functions/check-subscription/index.ts` | exposes `trial_requires_card`, `card_on_file`, `card_verified_at` |
| `src/__tests__/billing.test.ts` | contract tests for the pure helpers |

---

## Section 10. Open risks

1. **Cron.** The trial→paid conversion depends on `process-subscription-renewal` actually running
   hourly in production. If pg_cron is not scheduled, no trialing user is ever converted. This must
   be verified in production before launch.
2. **3DS on saved tokens.** Charging a stored Moyasar token server-side is already how the existing
   renewal pass works; a token charge can still return `initiated` (3DS required) instead of `paid`.
   The code treats that as "awaiting webhook", which for an unattended cron charge means the user
   never completes 3DS and the payment stalls. Confirm with Moyasar that recurring MIT charges on a
   saved token are exempt from 3DS for this merchant account.
3. **CLOSED (2026-08-23) — renewal idempotency inverted into runaway charging.**
   The `.maybeSingle()` idempotency check now uses `.limit(1)` with an array result and
   treats any query error as "skip this subscription". A second, independent runaway
   route (a `failed` transaction blocking nothing) was closed by the attempt cap in
   Section 12.3.

4. **No receipt document.** No receipt is issued and no receipt email is sent. A
   **non-VAT-registered** seller must issue a plain commercial receipt, **never** a tax invoice, and
   it must carry no VAT line and no VAT number. ZATCA e-invoicing (Fatoora) does **not** apply while
   the seller is not registered. Separate work item.

5. **NOT VERIFIED — registration threshold.** See Section 11. The 375,000 SAR figure recorded there
   is an ASSUMPTION for planning; it has not been confirmed with an accountant.

6. **CLOSED (2026-08-23) — `process-subscription-renewal` now calls `chargeSplit`.** No renewal or
   trial-conversion row records a VAT split any more. No charged amount changed.

7. **OWNER ACTION — `CRON_SECRET` is now mandatory.** `process-subscription-renewal` used to skip
   the secret check entirely when `CRON_SECRET` was unset, leaving an unauthenticated endpoint that
   charges stored cards. It now returns **500** when `CRON_SECRET` is missing and **401** on a wrong
   or missing `x-cron-secret` header. **If `CRON_SECRET` is not set in production, the renewal job
   stops running: no trial converts and no subscription renews.** Set the secret on the function
   and on the pg_cron caller before the next deploy, then confirm a 200 from one manual invocation.

8. **KNOWN MINOR — a mid-trial plan change costs a second 1.00 SAR verification.** A plan or seat
   change on a live trial is only promoted when a payment for it is captured (Section 12.1), and
   inside the trial window that payment is the 1.00 SAR card verification. A customer who changes
   plan mid-trial therefore pays 1.00 SAR twice while only one 1.00 SAR is credited against the
   first invoice. Accepted: it is the consent signal that closes the escalation hole, and the
   alternative (the previous behaviour) was a permanent 409 that made the trial un-payable.

---

## Section 11. When the owner registers for VAT

**Nothing in this section is active today.** It is the checklist for the day
مؤسسة العباقرة الأوائل لتقنية نظم المعلومات registers for VAT with ZATCA.

**ASSUMPTION — CONFIRM WITH AN ACCOUNTANT.** Mandatory VAT registration in Saudi Arabia is
understood to be triggered at **375,000 SAR of taxable revenue over 12 months** (voluntary
registration is possible from a lower figure). That number is recorded here for planning only. It
has **not** been verified against a current ZATCA source, thresholds and measurement windows can
change, and the decision must be taken on an accountant's advice — not on this document.

Also decide, at that moment, the commercial question this file cannot answer: does the current price
become **VAT-inclusive** (the customer keeps paying 245.00 SAR and the seller absorbs the tax), or is
VAT **added on top** (the customer starts paying 281.75 SAR)? That choice changes the charged amount
and is an owner decision requiring advance customer notice.

### What must change

| # | Area | Change |
|---|---|---|
| 1 | `_shared/billing.ts` | Flip `VAT_REGISTERED` to `true`. `chargeSplit` then returns `splitVat(total)` and every write path records a real split with no other code change. |
| 2 | Price basis | Apply the inclusive-vs-additive decision above to `subscription_plans.price_amount` / `price_per_seat`. If VAT is added on top, the stored prices must be raised and every existing customer notified before their next renewal. |
| 3 | Customer-facing display | Re-add an accurate tax line at every price: `PricingLanding.tsx`, `Subscribe.tsx` (plan grid, checkout copy, payment dialog), `Account.tsx`, `TrialCardGate.tsx`, `translations.ts` (`verificationChargeReturning`). Wording must match the basis chosen in row 2. |
| 4 | Checkout breakdown | Re-add the base / VAT / total block in `Subscribe.tsx` and the per-transaction split in `Account.tsx`. Both were removed by this correction. |
| 5 | Receipts | Switch from a plain commercial receipt to a compliant **tax invoice**: seller name, CR, **VAT registration number**, invoice date, taxable amount, VAT rate, VAT amount, total. |
| 6 | ZATCA e-invoicing (Fatoora) | Registration brings the e-invoicing obligation: the generation phase (structured XML / PDF-A3, QR code, UUID, hash chain) and, per ZATCA's wave assignment for this taxpayer, the integration phase (clearance / reporting to the ZATCA platform). This is an integration project, not a copy change. Confirm the applicable wave and dates with ZATCA or the accountant. |
| 7 | Historical data | Do **not** retro-split past transactions. Rows charged before registration genuinely carried no VAT; rewriting them would misstate closed periods. |
| 8 | Tests | `src/__tests__/billing.test.ts` — the `chargeSplit` describe block asserts `vat === 0`. It must be updated in the same change, not after. |

### 11.1 Outstanding patch — `process-subscription-renewal` (APPLIED 2026-08-23)

`process-subscription-renewal` imports and calls `chargeSplit`. Nothing outstanding here.

---

## Section 12. Second adversarial round — C1 / C2 / C3 (2026-08-23)

### 12.1 A plan or seat change is promoted ONLY when a payment for it is captured

**The defect.** `moyasar-create-subscription` wrote the requested `plan_id` and `seat_count`
straight onto the live `trialing` row before any payment, with no rollback if the checkout was
abandoned. Combined with a 409 that made a verified trial row permanently un-payable, a customer
could set 100 seats of `enterprise_office`, fail to pay, close the tab — and the cron would charge
100 x 54,900 halalas on the stored card at `trial_end`, with the webhook validating the amount
because `expectedAmountsFor` re-derived it from the same mutated row.

**The design.** `pending_plan_id` / `pending_seat_count` columns would be ideal but do not exist in
production and the migration hook blocks adding them, so the request travels in the payment instead:

| step | what happens |
|---|---|
| `moyasar-create-subscription` | For a live **`trialing`** or **`past_due`** row: **never** writes `plan_id` / `seat_count`. It refreshes only `moyasar_given_id` and returns the quote for the REQUESTED plan plus `plan_id` and `seat_count`. A `pending_activation` row is still updated in place — it holds no card token and no pass ever charges it, so nothing can be armed on it. |
| `Subscribe.tsx` | Echoes the returned `plan_id` / `seat_count` back to `moyasar-initiate-token-payment`. |
| `moyasar-initiate-token-payment` | Re-validates the plan (must exist; must be `is_active` when it differs from the stored one) and the seat count (integer, `min_seats`..`MAX_BILLABLE_SEATS`), prices the charge from it, and writes `plan_id` + `seat_count` into the Moyasar payment `metadata`. Omitted values fall back to the stored row. |
| `moyasar-webhook` | Reads `parsePaidPlanRef(metadata)` from the RE-VERIFIED payment, validates the amount against the plan actually paid for, and on a `paid` event promotes `plan_id` / `seat_count` onto the row. This is the only place a plan or seat escalation may land on a live subscription. |
| `process-subscription-renewal` | Before the unattended post-trial charge, re-fetches the payment referenced by `user_subscriptions.moyasar_payment_id` (the 1.00 SAR verification) and calls `trialChargeAuthorized(sub, ref)`. A plan mismatch, or a row billing MORE seats than were verified, **skips the charge**. A lookup failure also skips — unknown authorization is never "proceed to charge". A payment created before this change carries no `plan_id`, which is treated as "nothing to compare" so existing trials are not stranded. |

Billing FEWER seats than were verified is allowed: it can only undercharge.

### 12.2 A captured payment must never end with no subscription

`user_subscriptions_one_live_row_per_user` is a partial unique index over
(`active`,`trialing`,`past_due`). A lapsed customer who resubscribed got a new
`pending_activation` row (allowed by the partial index) whose activation UPDATE then collided with
their still-live `past_due` row. `isUndefinedColumnError` did not match SQLSTATE `23505`, so the
failure was only `console.error`'d and the handler returned 200: money captured, no subscription,
no dead letter, no retry.

- `process-subscription-renewal` now runs a **past-due expiry pass** (`expireLapsedPastDue`) that
  moves `past_due` rows past the grace window to `expired` (or `cancelled` when
  `cancel_at_period_end`) and syncs `profiles.plan_type` to `free`. `past_due` rows with a NULL
  `past_due_since` can never leave that status through any pass and are logged for ops rather than
  cut off silently.
- `moyasar-webhook`'s early idempotent ack (`existing transaction is captured` + `paid`) no longer
  fires unconditionally. The transaction row is written **before** the subscription update, so a
  captured transaction sitting beside a subscription still in `pending_activation` / `past_due`
  (or a captured verification whose card token never landed on a `trialing` row) is the signature
  of a failed activation. In that case the state transition is re-applied instead of acked, bounded
  to a 24-hour window so an ancient redelivery can never resurrect a closed period. Without this the
  dead-letter-and-retry below would have been dead code: every Moyasar retry was swallowed.
- `moyasar-webhook` now treats **any** failure to update `user_subscriptions` on a `paid` event as
  fatal: `insertDeadLetter` (which cannot throw — it wraps its own insert in try/catch) plus a
  **non-2xx** response so Moyasar redelivers. On a `23505` during activation it first retires the
  superseded **non-active** live rows of the same user and retries once; an `active` blocker is
  never touched, because that would be a genuine double subscription needing a human.

### 12.3 Charge attempts are capped and spaced

The renewal idempotency guard only matched `initiated` / `captured`, so a `failed` transaction
blocked nothing, `failedCount` was computed and never used, `next_billing_date` was not advanced,
and the past-due pass retried a declining card **every hour** for the whole grace window
(~168 attempts). The async route was worse: the webhook's failed handler stamped `past_due_since`
but never set `status`, so the row stayed `active` with a past `next_billing_date` and the
active-due pass retried forever.

- `chargeRetryEligibility(failedCount, lastFailedAt, now)` in `_shared/billing.ts` caps an episode
  at **`MAX_CHARGE_ATTEMPTS = 4`** attempts, spaced by **`CHARGE_RETRY_BACKOFF_MS = 24h`**, derived
  from the `created_at` of the most recent `failed` renewal transaction in the period window. No
  new column. Any error reading that history skips the subscription.
- A healthy renewal has `failedCount = 0` and is never affected.
- A subscription that exhausts its attempts is left alone and closed by the past-due expiry pass at
  the end of the grace window (Section 12.2) — it is never retried again.
- `moyasar-webhook` now sets `status = "past_due"` together with `past_due_since` on a failed
  renewal / post-trial charge, so the async decline path can no longer leave a row `active`.

### 12.4 The 409 that made a verified trial row un-payable

`moyasar-initiate-token-payment` returned 409 whenever `user_subscriptions.moyasar_payment_id` was
set — and the webhook stamps it on **every** paid event, including the 1.00 SAR verification. That
guard never protected an in-flight payment (this endpoint writes no payment id, and a captured
non-trial payment moves the row to `active`, which the status check already rejects); it only
locked verified trial customers out of ever paying. It is replaced by two guards that match the
real risk:

1. money already captured for a row still awaiting activation (`priorPaidCount > 0`, `past_due`
   exempt because captured transactions from earlier periods are normal there) — 409;
2. another attempt of the same kind of charge (verification vs. real invoice) for this subscription
   within the last 10 minutes — 409.

### 12.5 Cancel stays available while the first invoice is in flight

`Account.tsx` gates the cancel button on `canCancelSubscription`
(`isPaidActive || isTrialActive || isTrialConversionPending`) instead of active-access booleans,
and renders a short bilingual note while `trial_conversion_pending` is true. The "Subscribe now"
CTA is hidden in that state so the customer is not invited to pay twice.

### 12.6 Seat changes: who may make them, and when they are paid for

Added by the third adversarial round (R3-C1 / H9, 2026-08-23).

**The defect.** `public.update_subscription_seat_count` — a `SECURITY DEFINER` RPC granted to
`authenticated` (migration `20260430000002_enterprise_seat_enforcement.sql`, lines 377-451) — wrote
`user_subscriptions.seat_count` directly with **no upper bound** and **no status restriction**. It
therefore bypassed Section 12.1 entirely: the escalation that 12.1 forces through a captured payment
could simply be typed into the RPC. Seat **enforcement** reads the raw column, so seats leaked at
once; seat **billing** clamps at `MAX_BILLABLE_SEATS = 100` only in TypeScript
(`_shared/billing.ts`), so the stored value also armed the next unattended charge.

**The rule now.** `supabase/migrations/20260823000002_seat_rpc_hardening.sql` replaces the function
(`CREATE OR REPLACE`, so the existing `GRANT EXECUTE ... TO authenticated` is preserved) with:

| subscription status | seat INCREASE | seat DECREASE | why |
|---|---|---|---|
| `active` | allowed, capped at 100 | allowed, above `min_seats` and above the org's active member count | the next renewal prices the new seat count at the published per-seat price |
| `trialing` | refused | refused | a stored card is waiting for an unattended post-trial charge — this is the C1 escalation itself |
| `past_due` | refused | refused | a charge is already failing; the retry pass would re-price against the new count |
| `pending_activation` | refused | refused | plan and seats are decided by the payment in flight and promoted by `moyasar-webhook` on capture |
| `expired` / `cancelled` | refused | refused | nothing to adjust; the next checkout sets the seat count |

Any request above **100** seats is refused with `SEAT_CAP_EXCEEDED` regardless of status. The SQL
constant `c_max_billable_seats` **must equal** `MAX_BILLABLE_SEATS` in `_shared/billing.ts` and
`SEAT_CAP` in `moyasar-create-subscription`; the migration carries a comment to that effect. A
request on a non-`active` row is refused with `SEAT_CHANGE_REQUIRES_CHECKOUT`, which tells the
customer to change seats through checkout — the path that produces a captured payment. Both codes
are surfaced as bilingual copy by `src/hooks/useOrganization.ts`.

Decreases on non-`active` rows are refused too. That is deliberately blunt: one status gate is
easier to reason about than a direction-dependent one, and a decrease on a `trialing` row would put
the row out of step with the plan and seats the card was verified against. The cost is that a
trialing customer who wants fewer seats must go through checkout (already noted in Section 10,
item 8).

**Decision — a seat INCREASE on an `active` row does NOT require a payment before it takes effect.**

Reasoning:

1. There is no other path. `moyasar-create-subscription` and `moyasar-initiate-token-payment` reject
   an `active` row (Section 12.4), so blocking the RPC would leave **no** way to add a seat to a paid
   subscription — the enterprise product would have no growth path at all.
2. The consent profile is different from the C1 case. The C1 hole was an **abandoned checkout**
   mutating a row with no human decision behind it. This is an authenticated owner deliberately
   raising their own seat count, in their own dashboard, after being shown the seat usage.
3. The exposure is bounded and predictable: at most 100 seats, at the published per-seat price, on
   the normal renewal date — not an immediate unattended charge and not an arbitrary amount.

Residual risk, accepted and recorded:

- **Up to one unpaid period.** The extra seats are enforced (invitations succeed) the moment the RPC
  returns, but are only paid for at the next renewal. There is no pro-rating. Worst case is one
  billing period of unbilled seats per increase. Stated with explicit units, the absolute ceiling on
  that exposure is the cap on the most expensive per-seat plan: `enterprise_office` is
  `price_per_seat = 54900` halalas, i.e. **549.00 SAR per seat per period**, so 100 seats is
  **5,490,000 halalas = 54,900.00 SAR for one period** — that is the total, not the per-seat figure.
- **No fresh consent at charge time.** `process-subscription-renewal` prices a renewal from the row
  (`computeCharge` -> `planPriceFor` -> `effectiveSeats`) and applies **no**
  `trialChargeAuthorized`-style check on the renewal path — that guard covers only the post-trial
  conversion. So an owner who raises seats and forgets will see a larger renewal with no second
  prompt. Mitigation is a change-of-seats confirmation and a pre-renewal notice; **neither is
  implemented**, and both are open work items.
- **Downgrades are not pro-rated either.** Lowering seats takes effect at the next renewal, with no
  credit for the current period.

**H9 — `trialChargeAuthorized` fails closed.** The same round found that the guard returned
`{ authorized: true, reason: "no_verified_plan_metadata" }` whenever the verification payment
carried no `plan_id`, which authorized an unattended charge at whatever the row currently held. It
now **refuses**. There is no honest clamp for that state: the historical plan is not knowable from
the inputs, and clamping seats alone still leaves a plan escalation (`pro` at 245.00 SAR total, to
`enterprise_office` at its `min_seats` of 5 seats x 549.00 SAR per seat = **2,745.00 SAR total**).
A refused row is not charged, stays `trialing`
with a lapsed `trial_end`, and converts through the normal checkout — which Section 12.4 made
reachable again. The result now also carries `clampedPlanId` and `maxSeats` (the verified reference)
so the caller can price the charge from the VERIFIED payment instead of re-deriving it from the
mutable subscription row.

**Execute grants on the RPC.** Verified read-only against production on 2026-08-23:
`update_subscription_seat_count` held EXECUTE for `postgres`, `anon`, `authenticated` and
`service_role`. That is not a mistake in the 2026-04-30 migration — Supabase ships
`ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated,
service_role`, so every function created in `public` is born with an `anon` grant, and
`REVOKE ALL ... FROM PUBLIC` does not remove an explicit role grant. The hardening migration now
adds `REVOKE ALL ... FROM anon`. Practical exploitability today is nil: `auth.uid()` reads only the
JWT `sub` claim, an `anon` request carries none, and the function's first statement refuses a NULL
caller — this is defence in depth on a `SECURITY DEFINER` function that writes billing state, not a
live hole.

**No database-level seat ceiling was added, deliberately.** `user_subscriptions` carries exactly one
seat constraint, `user_subscriptions_seat_count_positive_chk CHECK (seat_count >= 1)`. A
`CHECK (seat_count <= 100)` was considered and rejected: 100 is a **commercial** limit, not a data
integrity invariant, and freezing it into the schema means the first deal above it needs a
hand-applied production migration under the known migration drift. Worse, the constraint would fire
on the webhook promotion path *after* money is captured, converting a pricing-policy mismatch into
the "paid but never activated" failure that Section 12.2 exists to prevent. Both write paths are now
bounded in code instead — the RPC (this migration) and `parsePaidPlanRef` for the webhook. If a
database backstop is ever wanted, it should be a wide corruption guard (e.g. `<= 10000`), not the
commercial cap.

**Production state when this was written (read-only SELECT, 2026-08-23).** 88 `user_subscriptions`
rows (58 `expired`, 23 `active`, 4 `trialing`, 3 `cancelled`); the highest `seat_count` anywhere is
**3**; **no row in any status holds a `moyasar_card_token`**; `payment_transactions` holds 2 rows,
both `status = 'initiated'`, `payment_type = 'checkout'` (legacy). No Moyasar payment has ever been
captured in production. So the seat escalation was never exploited, and the H9 fail-closed refusal
has an **empty** cohort today — no trialing row has a stored card, so none can be refused. Both
fixes are forward-looking hardening, not incident remediation.

---

## Section 12 (continued). Third adversarial round, lane A (2026-08-23)

Subsections 12.7 to 12.11 were written by the lane-A supervisor from the code as
merged, not from the implementing agents' reports. Every claim below was
re-verified against the working tree.

### 12.7 The renewal cron is single-flight, and no row can be stuck forever

**H5 - overlapping runs.** Two concurrent invocations (hourly pg_cron plus a
manual call, or a slow run overlapping the next tick) could both pass the
per-subscription idempotency checks in the window between the SELECT and the
INSERT, and charge one stored card twice. The run is now serialised by a **TTL
lease**, not a session advisory lock: PostgREST only exposes functions in
`public` (so `pg_try_advisory_lock` is unreachable) and it runs on a connection
pool (so a session-scoped lock is not reliably held across HTTP round trips and
can leak permanently). `supabase/migrations/20260823000004_job_locks.sql` adds
`public.job_locks` plus `try_acquire_job_lock` / `release_job_lock`. A crashed
run self-heals when the lease expires.

**The cron FAILS SOFT if that migration is not applied.** A missing RPC
(`PGRST202`) logs loudly and the run continues unlocked, because a bricked
renewal job means no trial ever converts and no subscription ever renews - a
worse failure than the race it guards. Any *other* RPC error is treated as "lock
not acquired" (fail closed on an unknown lock state).

**H7 - the refused-conversion zombie.** Since H9 made `trialChargeAuthorized`
fail closed, a lapsed `trialing` row with a stored card whose verification
payment carries no `plan_id` was refused on every hourly tick forever: never
converted, never expired, never surfaced. The two refusal kinds are now
separated. A **transient** refusal (the Moyasar lookup failed) is skipped quietly
and never counted. A **permanent** refusal (`trialChargeAuthorized` said no) is
counted in `webhook_dead_letters`, and after `MAX_TRIAL_CONVERSION_REFUSALS` the
row is moved to `expired` with `profiles.plan_type` synced to `free`.

> **Customer-money consequence, stated plainly:** expiring such a row forfeits
> the 1.00 SAR the customer already paid to verify their card, because their next
> checkout is an `immediate_charge` at the full plan price with no credit. The
> alternative was an invisible row that is never billed and never closed. The
> dead letter exists so a human can refund the 1.00 SAR.

**M9 / M11 - stale `initiated` transactions.** A `payment_transactions` row stuck
at `initiated` blocks BOTH idempotency guards, so that subscription is never
charged again. A pass now resolves rows older than `STALE_INITIATED_AFTER_MS`.
It is deliberately asymmetric, because getting this wrong double-charges:
`moyasar_payment_id IS NULL` means the charge never reached Moyasar and is marked
`failed`; a row WITH a payment id is re-fetched, and a Moyasar status of **`paid`
is never marked failed** - it is dead-lettered for a webhook replay. `created_at`
is never rewritten, because `chargeRetryEligibility` derives the 24h backoff from
it. The pass never changes `user_subscriptions.status`: the outcome of a lost
payment is not certain enough to cut access.

**M14 - `past_due` with a NULL `past_due_since`.** Such a row can leave `past_due`
through no pass, and because `user_subscriptions_one_live_row_per_user` counts
`past_due` as live, it also blocks any new subscription the customer buys. It is
now stamped with `now()` - never back-dated, which would place it past the grace
cutoff and cut the customer off inside the same run.

**Two properties that must not be "cleaned up" later.** The `optedOut` branch in
`expireUnbillableTrials()` was once called dead code; it is live now that
`cancel-subscription` writes only `cancel_at_period_end`, and it is the only
thing that closes a cancelled trial. The `.eq("cancel_at_period_end", false)`
filters on the trial-conversion, renewal and past-due queries are what stop a
cancelled subscription being charged.

### 12.8 The webhook cannot loop, and cannot silently swallow a capture

**The classification principle (M10).** Every return path is now classified by
one question: *did we obtain the authority's answer?* If yes and the answer is
"this is wrong", the condition is **permanent** - return 200 so Moyasar stops
redelivering, and always leave a dead letter so a human sees it. If we never got
the answer, it is **transient** - return non-2xx and let Moyasar redeliver. Three
paths changed direction, all in the money-safe direction: a missing payment id
(400, no letter) became 200 plus a letter; Moyasar 401 / 403 / 408 / 429 became
transient 500s, so a rotated key or a rate limit no longer acknowledges away
every capture it touches; an unparseable verification body became a 500.

A `payment_transactions` write failure on a `paid` event is now fatal
(dead letter plus non-2xx). It previously only logged, which meant money captured
with no transaction row - and `priorPaidCount`, both idempotency guards and
`has_captured_verification` all read that table, so the verification credit and
the retry cap were silently corrupted.

**H8 - duplicate dead letters.** Deduped on `(charge_id, reason)` before insert.
A lookup error falls through to inserting: a duplicate letter is far better than
a lost one. `insertDeadLetter` still cannot throw.

**M13 - `expected_amount` is now validated.** It was written into metadata
(Section 7) and never read back. It is now checked against the re-verified
payment, string-or-number tolerant. Presence of `metadata.flow` is the marker of
a payment created by current code; when `flow` is present `expected_amount` is
mandatory. This is IN ADDITION to `expectedAmountsFor`: one proves the amount is
what the server intended at creation time, the other proves it is what the plan
is worth now.

**M17 - retirement keys off the NAMED constraint.** `isUniqueViolationError`
matches any SQLSTATE 23505, and the handler then retires the user's other live
rows. A 23505 from any other constraint would have destroyed live subscriptions.
The predicate is now `isOneLiveRowPerUserViolation`. If the constraint name
cannot be recovered, the payment is stranded loudly rather than rows deleted.

**Currency is validated against the plan actually paid for**, not the plan stored
on the row - under Section 12.1 a payment may legitimately be for a different
plan.

**L18 - the `failed` branch no longer swallows its re-read error.** It used to
discard it, leaving the row un-marked, no dunning email sent, and a 200 returned:
a declined renewal that quietly kept full access to the end of the period.

**Cancel-during-trial followed by re-checkout (found by lane A, fixed here).**
`moyasar-create-subscription` reuses the live row and the renewal job filters on
`cancel_at_period_end = false`, so a customer who cancelled mid-trial and then
paid another 1.00 SAR verification stayed flagged and was closed as `cancelled`
at `trial_end`: **2.00 SAR paid, nothing delivered.** `decideTrialCancelClear`
now clears the flag on a captured verification, but only when the row is
`trialing` with a pending cancel AND the payment is fresh AND it was created
strictly after `cancelled_at`. Both unknown-timestamp cases fail closed. The flag
is never cleared by an abandoned checkout, which is what would have re-armed the
Section 12.1 escalation.

**REJECTED FOR LAUNCH - a unique index on `webhook_dead_letters`.** A
`CREATE UNIQUE INDEX ... ON (charge_id, reason)` was proposed to enforce the H8
dedupe in the database. **It must not be created.** Section 12.7's H7 mechanism
*counts* refusals as repeated rows sharing the same
`(charge_id = subscription_id, reason = 'trial_conversion_refused')` pair; a
unique index caps that count at one, the third-strike expiry never fires, and the
refused-conversion zombie returns. The webhook-side read-then-write dedupe is
sufficient. Deferred post-launch; any future version must exclude reasons that
carry counting semantics. Recorded here so this conflict is visibly caught, not
missed.

### 12.9 An enterprise seat member is entitled by the ORG's subscription (H6)

`fire-safety-chat` decided access from the caller's own `user_subscriptions` row
and `profiles.plan_type` only. An enterprise **seat member** has no subscription
row of their own - the org owner holds it - so a seat that was paid for received
the free-tier limit of 10 messages a day.

Access is now granted when all four hold: an `active` `org_members` row; a role in
`["owner","admin","head_of_department","engineer"]` (the same list
`check-subscription` uses - a stricter or looser list here would be a UI/server
disagreement); org status `active` or `trial`; **and the org's linked
`user_subscriptions` row is itself paying** (`active` in period, or `trialing` in
window WITH a card on file, or `past_due` inside the 7-day grace).

**The fourth clause is load-bearing, not defensive.** Nothing in the codebase ever
moves `organizations.status` away from `active` when the linked subscription
lapses - the only writers are the two creation sites. Org status alone is
permanently stale, so the org-side subscription lookup is the only thing that
stops a lapsed enterprise org handing unlimited AI to every seat forever.

`subscription_id IS NULL` with org status `trial` is **denied**:
`create_organization_with_owner` is granted to `authenticated`, so any user can
self-create an org in exactly that state, and granting would be free enterprise AI
to anyone who asks. Every DB error in this predicate fails closed.

**Follow-up defect found during lane-A verification and fixed.** The
`trial_card_required` 403 returned *before* the org check ran, so a member holding
a paid seat who also had an old card-less `trialing` row of their own was refused
with "add your card" - locked out of a product their organization had already paid
for. The refusal is now **deferred**, not weakened: it is applied after the org
check, and only for callers the org check did not entitle. The server-side card
gate is unchanged for everyone else, and the refusal still precedes every
quota-increment call, so no caller can be charged a unit and then refused.

**KNOWN AND ACCEPTED - UI/server divergence.** `check-subscription` grants org AI
access on role plus org status alone, with no paying check. A seat member of a
lapsed org therefore sees "enterprise" in the UI but receives free-tier service in
chat. The server favours protecting the money; the disagreement is real and is
recorded for the next review rather than fixed here.

### 12.10 The quota rollback that never ran (A7)

`geminiResilience.ts` rolls a quota increment back when the AI provider fails, so
a user is not charged a message that was never answered. The mode-scoped rollback
worked. The flat daily rollback called `decrement_daily_usage`, **a function that
existed in no migration and not in production**: PostgREST returned 404, the catch
swallowed it, and the counter was never restored. Advisory and Analytical gave the
unit back; Main (`primary`) and trialing users silently did not, losing one message
from their daily allowance on every transient upstream failure.

The call site was already correct, so the fix is a migration only -
`supabase/migrations/20260823000011_decrement_daily_usage.sql` - clamped with
`GREATEST(0, message_count - 1)` so a double rollback cannot hand out free quota,
and with no insert-if-absent so a rollback with nothing to decrement is a no-op
rather than fabricated usage history. It is `service_role` only: `anon` and
`authenticated` are revoked by name, because Supabase's default privileges give
every new function in `public` an `anon` grant, and a client able to call this
`SECURITY DEFINER` function could loop it to grant itself unlimited messages.
**The operator must run `NOTIFY pgrst, 'reload schema';` after applying it**, or
PostgREST keeps 404ing the new RPC - which looks exactly like the original bug.

The unit test could never have caught this: it asserts the RPC is *called* with
the right arguments against a mock, which was always true. What was false was that
the function existed. `src/__tests__/geminiResilience.test.ts` now also checks
every RPC name `rollbackQuotaIfNeeded` calls against the migrations that create
it. Verified to have teeth: with the migration removed the test fails with the
production symptom, and passes when it is restored.

### 12.11 Migrations the OWNER must apply for lane A

Apply by hand, in the Supabase SQL editor, never with `supabase db push`. All are
idempotent and safe to re-run.

| file | what it does | if it is NOT applied |
|---|---|---|
| `20260823000002_seat_rpc_hardening.sql` | caps the seat RPC at 100 and restricts it to `active` rows | the Section 12.1 escalation stays bypassable through the RPC |
| `20260823000004_job_locks.sql` | TTL lease for the renewal job (H5) | the cron logs loudly and runs UNLOCKED - correct, but the double-charge race stays open |
| `20260823000011_decrement_daily_usage.sql` | creates the missing rollback RPC (A7) | Main-mode users keep losing a quota unit on every provider failure |

`20260823000011` additionally requires `NOTIFY pgrst, 'reload schema';`.
