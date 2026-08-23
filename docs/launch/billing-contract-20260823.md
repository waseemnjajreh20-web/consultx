# ConsultX — Billing Contract (Backend ↔ Frontend)

**Date:** 2026-08-23
**Branch:** `recovery/stabilization-2026-08-23`
**Owner decisions applied:** card required to start trial · full price charged at trial end · prices are VAT-inclusive (15% KSA VAT) · 1 SAR card verification kept and deducted from the first invoice (no refund)
**Status:** backend implemented, migration pending owner application (see "Migration (owner applies)")

This file is the single source of truth for the payment/subscription contract. The frontend
must read field names from here — they are fixed and will not change without a note in this file.

---

## Section 1. Money model

All amounts are integers in **halalas** (1 SAR = 100 halalas). Currency is always `SAR`.

Prices stored in `subscription_plans.price_amount` / `price_per_seat` are **VAT-inclusive**.
Every charge records the split:

```
base = Math.round(total / 1.15)
vat  = total - base
```

Example: Pro at `price_amount = 24500` (245.00 SAR incl. VAT)
→ `base = 21304` (213.04 SAR) · `vat = 3196` (31.96 SAR) · `total = 24500`.

Per-seat plans (`enterprise_team`, `enterprise_office`) have `price_per_seat != null`:

```
effective_seats = max(subscription.seat_count, plan.min_seats, 1)
plan_price      = price_per_seat * effective_seats
```

Flat plans (`engineer`, `pro`, legacy `enterprise`) have `price_per_seat = null` and use `price_amount`.

**Card verification amount:** `100` halalas (1.00 SAR). It is a real charge, never refunded, and is
**credited against the first real invoice**.

---

## Section 2. Billing flows

The server decides the flow — the client never sends an amount. The chosen flow is written into
the Moyasar payment `metadata.flow` and re-read from the Moyasar API by the webhook.

| flow | when | amount charged | resulting status |
|---|---|---|---|
| `trial_card_verification` | `status = "trialing"` AND `trial_end > now` | `100` (1.00 SAR) | stays `trialing`, card stored, `next_billing_date = trial_end` |
| `immediate_charge` | no active trial (expired trial, returning user, `pending_activation`, plan change) | full `plan_price` (or promo price) | `active`, new 30-day period |
| `post_trial_first_charge` | cron converts a trialing sub whose `trial_end` has passed and that has a saved card token | `plan_price - 100` on the first paid invoice (when `card_verified_at` is set and no prior non-verification captured transaction exists), otherwise full `plan_price` | `active` on success, `past_due` on failure |
| `renewal` | `status = "active"` and `next_billing_date` reached, or `past_due` retry inside the grace window | full `plan_price` | `active` on success, `past_due` on failure |

**Promotions** (`FOUNDING10`, `EID50`) apply to **`immediate_charge` only**. They are ignored for
`trial_card_verification`, `post_trial_first_charge`, and `renewal` (renewals always bill the full plan price).

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
  "card_verified_at": null              // ISO 8601 string | null. When the 1 SAR verification succeeded.
}
```

Notes:
- `trial_requires_card` is always `true`. It exists so the frontend gating can be flipped from the
  backend later without a frontend release.
- `card_on_file` is `true` for any subscription row that has a stored Moyasar card token — trial or paid.
- `card_verified_at` is `null` until the migration in Section 8 is applied; treat `null` as
  "unknown, fall back to `card_on_file`". Never gate on `card_verified_at` alone.
- Admin-override responses also carry these three fields (`card_on_file: true`,
  `card_verified_at: null`) so the frontend never has to special-case admins.

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

> **AR:** تجربتك المجانية فعّالة. عند انتهائها في {expires_at} سنحصّل **{plan_price − 1.00} ريال** (سعر الخطة {plan_price} ريال ناقص 1.00 ريال التحقق المخصوم من أول فاتورة). الأسعار شاملة ضريبة القيمة المضافة 15%.
> **EN:** Your free trial is active. When it ends on {expires_at} we will charge **SAR {plan_price − 1.00}** (plan price SAR {plan_price} minus the SAR 1.00 verification, deducted from your first invoice). Prices include 15% VAT.

### 5.3 `active`
`status === "active"`. Normal paid state. Show `expires_at` as the next billing date and the
VAT-inclusive plan price. Always render "شامل ضريبة القيمة المضافة 15%" / "Includes 15% VAT".

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
| Checkout with no active trial | full plan price incl. VAT | `ConsultX subscription — {plan.name_en}` |
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
  "amount_base": 87,               // halalas, VAT-exclusive base
  "amount_vat": 13,                // halalas, 15% VAT component
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
-- ConsultX billing 2026-08-23 — VAT split + card verification stamp
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
  'VAT-exclusive base in halalas. base = round(amount / 1.15).';
COMMENT ON COLUMN public.payment_transactions.amount_vat IS
  '15% KSA VAT component in halalas. vat = amount - amount_base.';
```

**Until this is applied:** the backend writes these columns *optimistically* and silently retries
without them when PostgREST reports an undefined column (`PGRST204` / SQLSTATE `42703`). Nothing
breaks; the VAT split and `card_verified_at` are simply not persisted. `check-subscription` returns
`card_verified_at: null` in that state, which is why gating must use `card_on_file`.

After applying, no backfill is required for correctness. Optional backfill of historical rows:

```sql
UPDATE public.payment_transactions
   SET amount_base = round(amount / 1.15),
       amount_vat  = amount - round(amount / 1.15)
 WHERE amount_base IS NULL;
```

---

## Section 9. Backend files that implement this contract

| File | Role |
|---|---|
| `supabase/functions/_shared/billing.ts` | `computeCharge`, `splitVat`, `expectedAmountsFor`, `deriveFlow`, `isUndefinedColumnError` — pure, unit-tested |
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
3. **No invoice / ZATCA e-invoicing.** The VAT split is recorded, but no invoice document is issued
   and no receipt email is sent. Separate work item.
