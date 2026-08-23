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
| `past_due` | a charge failed; 7-day grace window from `past_due_since` | yes during grace, no after |
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
  "plan_id": "<uuid>",
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
| `supabase/functions/_shared/billing.ts` | `computeCharge`, `chargeSplit` (applied to live charges), `splitVat` (dormant, kept for future registration), `expectedAmountsFor`, `deriveFlow`, `isUndefinedColumnError` — pure, unit-tested |
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
3. **UNFIXED — renewal idempotency inverts into runaway charging.**
   `process-subscription-renewal/index.ts` (~line 238) uses `.maybeSingle()` for the
   renewal idempotency check and discards the error. PostgREST returns
   `{data: null, error: PGRST116}` when MORE than one row matches, so two matching
   `renewal` rows make `existingTx` null and the job charges — every hour, forever.
   Two rows is reachable: the trial-conversion pass writes `payment_type = "renewal"`
   and its 24h retry window deliberately creates a second `initiated` row.
   **Required fix:** `.limit(1)` with an array result, and treat ANY query error as
   "skip this subscription", never as "proceed to charge".
   **Why it is not applied:** `.claude/hooks/guard-migrations.js` blocks all
   Edit/Write to `supabase/functions/process-subscription-renewal/`. Owner must apply
   it or lift the guard for this file. The exact patch is in the fix report.

4. **No receipt document.** No receipt is issued and no receipt email is sent. A
   **non-VAT-registered** seller must issue a plain commercial receipt, **never** a tax invoice, and
   it must carry no VAT line and no VAT number. ZATCA e-invoicing (Fatoora) does **not** apply while
   the seller is not registered. Separate work item.

5. **NOT VERIFIED — registration threshold.** See Section 11. The 375,000 SAR figure recorded there
   is an ASSUMPTION for planning; it has not been confirmed with an accountant.

6. **OPEN — `process-subscription-renewal` still applies the 15% split.** That file is behind
   `.claude/hooks/guard-migrations.js` and could not be edited. It still calls `splitVat` instead of
   `chargeSplit`, so renewal and trial-conversion rows keep recording a VAT split that was never
   charged. The charged amount is unaffected. Two-line patch in Section 11.1.

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

### 11.1 Outstanding patch — `process-subscription-renewal`

Blocked by `.claude/hooks/guard-migrations.js`. Owner applies, or lifts the guard for this file.
Two lines, no change to any charged amount:

```diff
-  splitVat,
+  chargeSplit,
```

```diff
-    const vatSplit = splitVat(chargeAmount);
+    const vatSplit = chargeSplit(chargeAmount);
```
