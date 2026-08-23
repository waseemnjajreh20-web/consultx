// ============================================================
// _shared/billing.ts
//
// Pure billing arithmetic shared by the Moyasar edge functions.
// No Deno / Supabase imports here on purpose: this module is
// imported unchanged by `supabase/functions/**` (Deno) and by
// `src/__tests__/billing.test.ts` (vitest / Node).
//
// Money is ALWAYS an integer number of halalas (1 SAR = 100).
//
// The selling entity (مؤسسة العباقرة الأوائل لتقنية نظم المعلومات, CR 7042173794)
// is NOT VAT-registered. A non-registered seller in KSA must not charge VAT,
// must not present a price as VAT-inclusive, and must not issue a tax invoice.
// Prices in `subscription_plans` are therefore the WHOLE consideration, with no
// tax component. See `VAT_REGISTERED` / `chargeSplit` below.
//
// Contract: docs/launch/billing-contract-20260823.md
// ============================================================

/** The card-verification charge, in halalas. 1.00 SAR. Never refunded — credited to the first invoice. */
export const CARD_VERIFICATION_AMOUNT = 100;

/**
 * KSA standard VAT rate. Kept for the day the seller registers.
 * It is NOT applied to any live charge while `VAT_REGISTERED` is false.
 */
export const VAT_RATE = 0.15;

/**
 * Whether the selling entity is registered for VAT with ZATCA.
 *
 * FALSE today. A seller below the mandatory registration threshold may not
 * charge or display VAT, so every live charge records the full amount as base
 * with a zero tax component. Flipping this to `true` (after registration) is
 * the single switch that turns `chargeSplit` back into `splitVat` — but the
 * customer-facing copy, receipts and ZATCA e-invoicing must be handled in the
 * same change. See docs/launch/billing-contract-20260823.md Section 1.
 */
export const VAT_REGISTERED: boolean = false;

/** FOUNDING10 first-month price, in halalas. */
export const FOUNDING10_AMOUNT = 1000;

/**
 * FOUNDING10 is a 10.00 SAR key. Without a plan restriction it applied to ANY
 * plan, including `enterprise_office` at 100 seats (5,490.00 SAR of value for
 * 10.00 SAR), and it was repeatable by cancel-and-resubscribe.
 *
 * The campaign is Pro-only by construction: src/lib/campaigns/founding10.ts
 * builds its subscribe URL as `?plan=pro&promo=FOUNDING10`, and the campaign
 * email (src/lib/emailTemplates/founding10.ts) sells "your first month of
 * ConsultX Pro for 10 SAR". Nothing else was ever offered at this price.
 */
export const FOUNDING10_PLAN_SLUG = "pro";

/**
 * Server-side redemption window. Outside it the code is inert.
 *
 * OWNER ACTION: confirm/adjust the end date before the campaign is sent. The
 * default is deliberately bounded rather than open-ended — an unbounded 10.00
 * SAR key to a paid plan is the higher risk. Outside the window the checkout
 * simply charges the full plan price.
 */
export const FOUNDING10_WINDOW_START_MS = Date.parse("2026-08-23T00:00:00.000Z");
export const FOUNDING10_WINDOW_END_MS = Date.parse("2026-09-23T00:00:00.000Z");

/** EID50 first-month price for the `pro` plan, in halalas (50% of 24500). */
export const EID50_PRO_AMOUNT = 12250;

/**
 * EID50 is Pro-only on the server, exactly like FOUNDING10. Named as a constant
 * so the restriction reads the same way in both branches of `promoAmountFor`
 * and cannot drift between the checkout price and the webhook validation.
 *
 * NOTE for the owner: src/lib/campaigns/eid50.ts `EID50_PRICING` also advertises
 * discounted per-seat prices for `enterprise_team` (199.50) and
 * `enterprise_office` (274.50). The server does NOT honour EID50 on those plans
 * and never did. That is a marketing-vs-server truthfulness gap, not a money
 * leak, and it is an owner decision to fix in one direction or the other.
 */
export const EID50_PLAN_SLUG = "pro";

/**
 * Server-side redemption window for EID50. Outside it the code is inert and the
 * checkout charges the full plan price.
 *
 * R3-C4: EID50 previously had NO server-side window at all, so a campaign whose
 * own copy says "valid only from 26 to 30 May 2026"
 * (src/lib/campaigns/eid50.ts, EID50_CAMPAIGN.subheadline / dateRange) was a
 * permanent, repeatable 50% key to the Pro plan.
 *
 * TIMEZONE — deliberate divergence from FOUNDING10. The FOUNDING10 constants use
 * UTC midnights. EID50's advertised dates are calendar dates sold to customers
 * in Saudi Arabia, so they are anchored to Arabia Standard Time (UTC+3):
 *   start = 26 May 2026 00:00 AST = 2026-05-25T21:00:00Z  (inclusive)
 *   end   = 31 May 2026 00:00 AST = 2026-05-30T21:00:00Z  (EXCLUSIVE)
 * The end boundary is the START of 31 May, because "26 to 30 May" includes the
 * whole of the 30th. That is exactly 5 days, matching
 * EID50_CAMPAIGN.durationDays = 5.
 *
 * Had these been UTC midnights instead, the window would have opened and closed
 * three hours late for a Saudi customer: the offer would still be dead at 00:30
 * on 26 May local time, and would still be alive until 03:00 on 31 May local
 * time. The AST anchoring makes the server agree with the advertised dates.
 */
export const EID50_WINDOW_START_MS = Date.parse("2026-05-25T21:00:00.000Z");
export const EID50_WINDOW_END_MS = Date.parse("2026-05-30T21:00:00.000Z");

export type BillingFlow =
  | "trial_card_verification"
  | "immediate_charge"
  | "post_trial_first_charge"
  | "renewal";

export interface PlanLike {
  slug?: string | null;
  name_en?: string | null;
  currency?: string | null;
  price_amount?: number | null;
  price_per_seat?: number | null;
  min_seats?: number | null;
  duration_days?: number | null;
}

export interface SubLike {
  status?: string | null;
  trial_end?: string | null;
  seat_count?: number | null;
  /** Only exists after the Section 8 migration. Null/undefined before it. */
  card_verified_at?: string | null;
  moyasar_card_token?: string | null;
  /**
   * Migration-independent proof that the 1.00 SAR card verification was
   * actually captured for this subscription: set by the caller from
   *   payment_transactions where subscription_id = ? and status = 'captured'
   *                            and payment_type = 'verification'.
   * Used as the credit predicate while `card_verified_at` does not exist in
   * production. See `verificationCreditOwed`.
   */
  has_captured_verification?: boolean | null;
}

export interface VatSplit {
  /** Tax-exclusive base, halalas. Equals `total` while the seller is not VAT-registered. */
  base: number;
  /** Tax component, halalas. Always 0 while the seller is not VAT-registered. */
  vat: number;
  /** Total actually charged, halalas (echoes the input). */
  total: number;
}

export interface ChargeDecision {
  flow: BillingFlow;
  /** Amount to charge now, halalas. */
  amount: number;
  /** Full plan price for this subscription, halalas (before promo / credit). */
  planPrice: number;
  /** Seats actually billed. 1 for flat plans. */
  effectiveSeats: number;
  /** Halalas credited from the earlier card verification (0 or CARD_VERIFICATION_AMOUNT). */
  verificationCredit: number;
  /** Promo code that was actually applied, or null. */
  appliedPromo: string | null;
  /** Moyasar `description` for this charge. */
  description: string;
  /** Moyasar `metadata.purpose`. */
  purpose: string;
  /** Recorded split of `amount`. While the seller is not VAT-registered: base = amount, vat = 0. */
  base: number;
  vat: number;
}

// ── VAT ───────────────────────────────────────────────────────────────────────

/**
 * Split a VAT-INCLUSIVE total into base + VAT.
 *   base = round(total / 1.15)
 *   vat  = total - base
 * Guarantees base + vat === total exactly (no rounding leak).
 *
 * NOT APPLIED TO LIVE CHARGES. The seller is not VAT-registered, so no charge
 * carries a tax component today. This function is kept (and unit-tested) so the
 * arithmetic is ready and proven for the day registration happens; live code
 * must call `chargeSplit`, never this directly.
 */
export function splitVat(total: number): VatSplit {
  const safeTotal = Number.isFinite(total) ? Math.round(total) : 0;
  if (safeTotal <= 0) return { base: 0, vat: 0, total: Math.max(0, safeTotal) };
  const base = Math.round(safeTotal / (1 + VAT_RATE));
  return { base, vat: safeTotal - base, total: safeTotal };
}

/**
 * The split ACTUALLY recorded against a live charge.
 *
 * The seller is not VAT-registered, so there is no tax component: the whole
 * amount is the base and `vat` is 0. `amount_base` / `amount_vat` stay
 * populated (rather than null) so the columns keep an unambiguous meaning —
 * "0.00 tax was charged" — instead of "not recorded". When `VAT_REGISTERED`
 * becomes true this returns `splitVat(total)` and nothing else has to move.
 */
export function chargeSplit(total: number): VatSplit {
  if (VAT_REGISTERED) return splitVat(total);
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  return { base: safeTotal, vat: 0, total: safeTotal };
}

// ── Plan pricing ──────────────────────────────────────────────────────────────

/**
 * Hard ceiling on billable seats. Mirrors SEAT_CAP in
 * moyasar-create-subscription, which rejects seat_count > 100 at checkout.
 * effectiveSeats had NO upper bound, so the cron re-priced from the stored row
 * with nothing stopping a corrupted seat_count from billing an unbounded
 * amount. Raising the limit means raising BOTH constants.
 */
export const MAX_BILLABLE_SEATS = 100;

/** Seats actually billed: clamp(max(seat_count, plan.min_seats, 1), .., MAX_BILLABLE_SEATS). */
export function effectiveSeats(plan: PlanLike | null | undefined, sub: SubLike | null | undefined): number {
  const rawSeats = Number(sub?.seat_count ?? 1);
  const rawMin = Number(plan?.min_seats ?? 1);
  // Non-finite (NaN / Infinity / non-numeric) values are data corruption, never
  // a real order: fall back to 1 and let plan.min_seats do the real flooring.
  // Fractional seats are floored so corruption can only ever UNDER-bill.
  const seatCount = Number.isFinite(rawSeats) ? Math.floor(rawSeats) : 1;
  const minSeats = Number.isFinite(rawMin) ? Math.floor(rawMin) : 1;
  return Math.min(Math.max(seatCount, minSeats, 1), MAX_BILLABLE_SEATS);
}

/**
 * Full price for one billing period.
 * Per-seat plans (price_per_seat != null) multiply by effective seats;
 * flat plans use price_amount unchanged.
 */
export function planPriceFor(plan: PlanLike | null | undefined, sub: SubLike | null | undefined): number {
  if (!plan) return 0;
  if (plan.price_per_seat != null) {
    return Math.round(Number(plan.price_per_seat) * effectiveSeats(plan, sub));
  }
  return Math.round(Number(plan.price_amount ?? 0));
}

// ── Flow derivation ───────────────────────────────────────────────────────────

/**
 * True when the subscription is inside a live trial window.
 * A trialing row whose trial_end has passed is NOT in trial.
 */
export function isInTrial(sub: SubLike | null | undefined, nowMs: number = Date.now()): boolean {
  if (!sub || sub.status !== "trialing") return false;
  if (!sub.trial_end) return false;
  const end = Date.parse(sub.trial_end);
  return Number.isFinite(end) && end > nowMs;
}

/**
 * True when the 100-halala card-verification credit is owed against the FIRST
 * real invoice for this subscription.
 *
 * Three predicates, in order of authority:
 *   1. `card_verified_at` is set — the exact stamp. Only exists after the
 *      Section 8 migration.
 *   2. `has_captured_verification` — the caller counted a captured
 *      `verification` transaction for this subscription. Needs no new column.
 *   3. A stored `moyasar_card_token` on a `trialing` row. During a trial the
 *      ONLY code path that stores a token is the captured 1.00 SAR
 *      verification webhook, so a trialing row holding a token has, by
 *      construction, already paid the 1.00 SAR.
 *
 * Before the Section 8 migration lands, predicate 1 is always false in
 * production. Without 2 and 3 every converting customer is charged the full
 * plan price while TrialCardBanner promised them "plan price minus 1.00 SAR".
 * Erring toward granting the credit undercharges by at most 1.00 SAR once;
 * erring the other way overcharges every single converting customer.
 */
export function verificationCreditOwed(sub: SubLike | null | undefined): boolean {
  if (!sub) return false;
  if (sub.card_verified_at) return true;
  if (sub.has_captured_verification === true) return true;
  return sub.status === "trialing" && !!sub.moyasar_card_token;
}

/**
 * Server-side flow decision for a user-initiated checkout.
 * NEVER derived from client input.
 */
export function deriveFlow(sub: SubLike | null | undefined, nowMs: number = Date.now()): BillingFlow {
  if (isInTrial(sub, nowMs)) return "trial_card_verification";
  if (sub?.status === "trialing") return "post_trial_first_charge";
  return "immediate_charge";
}

/** Narrow an untrusted string (from verified Moyasar metadata) to a known flow. */
export function parseFlow(raw: unknown): BillingFlow | null {
  if (raw === "trial_card_verification") return "trial_card_verification";
  if (raw === "immediate_charge") return "immediate_charge";
  if (raw === "post_trial_first_charge") return "post_trial_first_charge";
  if (raw === "renewal") return "renewal";
  return null;
}

// ── Promotions ────────────────────────────────────────────────────────────────

/**
 * Promo price for an immediate charge, or null when the promo does not apply.
 * Promotions apply to `immediate_charge` ONLY.
 */
export function promoAmountFor(
  plan: PlanLike | null | undefined,
  promo: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const code = typeof promo === "string" ? promo.trim().toUpperCase() : "";
  if (code === "FOUNDING10") {
    // Pro only, and only inside the campaign window. Both checks are
    // server-side: the code arrives as client-supplied text.
    if (plan?.slug !== FOUNDING10_PLAN_SLUG) return null;
    if (!(nowMs >= FOUNDING10_WINDOW_START_MS && nowMs < FOUNDING10_WINDOW_END_MS)) return null;
    return FOUNDING10_AMOUNT;
  }
  if (code === "EID50") {
    // Same two server-side checks as FOUNDING10: plan restriction, then window.
    // R3-C4 — without the window this was a permanent 50% key to Pro.
    if (plan?.slug !== EID50_PLAN_SLUG) return null;
    if (!(nowMs >= EID50_WINDOW_START_MS && nowMs < EID50_WINDOW_END_MS)) return null;
    return EID50_PRO_AMOUNT;
  }
  return null;
}

/**
 * The promo price ignoring the campaign window, for webhook amount validation
 * ONLY. A payment created seconds before the window closed is still a
 * legitimate payment when its webhook lands seconds after; rejecting it would
 * strand a real charge. The plan restriction is NOT relaxed here.
 */
function promoAmountForValidation(
  plan: PlanLike | null | undefined,
  promo: string | null | undefined,
): number | null {
  const code = typeof promo === "string" ? promo.trim().toUpperCase() : "";
  if (code === "FOUNDING10") {
    return plan?.slug === FOUNDING10_PLAN_SLUG ? FOUNDING10_AMOUNT : null;
  }
  if (code === "EID50") {
    // Window-FREE on purpose (same as FOUNDING10 above): a payment created just
    // before the window closed must not be stranded when its webhook lands just
    // after. The plan restriction is NOT relaxed.
    return plan?.slug === EID50_PLAN_SLUG ? EID50_PRO_AMOUNT : null;
  }
  return null;
}

// ── Main decision ─────────────────────────────────────────────────────────────

/**
 * Decide what to charge right now.
 *
 * @param plan            row from `subscription_plans`
 * @param sub             row from `user_subscriptions`
 * @param promo           promo code supplied at checkout (immediate_charge only)
 * @param priorPaidCount  number of captured, NON-verification transactions already
 *                        recorded for this subscription. > 0 means the 1 SAR
 *                        verification credit has already been consumed.
 * @param nowMs           injectable clock for tests
 */
export function computeCharge(
  plan: PlanLike | null | undefined,
  sub: SubLike | null | undefined,
  promo: string | null | undefined,
  priorPaidCount: number = 0,
  nowMs: number = Date.now(),
): ChargeDecision {
  const seats = effectiveSeats(plan, sub);
  const planPrice = planPriceFor(plan, sub);
  const planName = plan?.name_en ?? "ConsultX";
  const flow = deriveFlow(sub, nowMs);

  // 1. Inside the trial window → 1 SAR card verification. Promos never apply.
  if (flow === "trial_card_verification") {
    const split = chargeSplit(CARD_VERIFICATION_AMOUNT);
    return {
      flow,
      amount: CARD_VERIFICATION_AMOUNT,
      planPrice,
      effectiveSeats: seats,
      verificationCredit: 0,
      appliedPromo: null,
      description: "ConsultX card verification (deducted from first invoice)",
      purpose: "card_verification",
      base: split.base,
      vat: split.vat,
    };
  }

  // 2. Trial has lapsed but the row is still `trialing` → first real invoice,
  //    less the already-charged card verification (once, and only once).
  if (flow === "post_trial_first_charge") {
    const credit = verificationCreditOwed(sub) && priorPaidCount === 0 ? CARD_VERIFICATION_AMOUNT : 0;
    const amount = Math.max(0, planPrice - credit);
    const split = chargeSplit(amount);
    return {
      flow,
      amount,
      planPrice,
      effectiveSeats: seats,
      verificationCredit: credit,
      appliedPromo: null,
      description: credit > 0
        ? `ConsultX subscription — ${planName} (first invoice, less 1.00 SAR card verification)`
        : `ConsultX subscription — ${planName}`,
      purpose: "post_trial_first_charge",
      base: split.base,
      vat: split.vat,
    };
  }

  // 3. No active trial → charge the full plan price immediately. Promos apply here only.
  const promoPrice = promoAmountFor(plan, promo, nowMs);
  const appliedPromo = promoPrice != null ? String(promo).trim().toUpperCase() : null;
  const amount = promoPrice ?? planPrice;
  const split = chargeSplit(amount);

  let description = `ConsultX subscription — ${planName}`;
  let purpose = "immediate_charge";
  if (appliedPromo === "FOUNDING10") {
    description = "ConsultX Founding Engineers Offer — First Month";
    purpose = "founding10_first_month";
  } else if (appliedPromo === "EID50") {
    description = "ConsultX Eid Offer — First Month at 50% Off";
    purpose = "eid50_first_month";
  }

  return {
    flow: "immediate_charge",
    amount,
    planPrice,
    effectiveSeats: seats,
    verificationCredit: 0,
    appliedPromo,
    description,
    purpose,
    base: split.base,
    vat: split.vat,
  };
}

// ── Webhook amount validation ─────────────────────────────────────────────────

/**
 * The set of amounts the webhook will accept for a given flow.
 * Used to re-derive the truth from the database instead of trusting a single
 * number that came back over the wire.
 */
export function expectedAmountsFor(
  plan: PlanLike | null | undefined,
  sub: SubLike | null | undefined,
  flow: BillingFlow,
  promo: string | null | undefined,
): number[] {
  const planPrice = planPriceFor(plan, sub);
  switch (flow) {
    case "trial_card_verification":
      return [CARD_VERIFICATION_AMOUNT];
    case "renewal":
      return [planPrice];
    case "post_trial_first_charge":
      // With or without the verification credit — the cron decides, and a
      // retry after a partial failure may legitimately send either.
      return unique([planPrice, Math.max(0, planPrice - CARD_VERIFICATION_AMOUNT)]);
    case "immediate_charge":
    default: {
      const promoPrice = promoAmountForValidation(plan, promo);
      return unique(promoPrice != null ? [promoPrice, planPrice] : [planPrice]);
    }
  }
}

function unique(xs: number[]): number[] {
  return xs.filter((x, i) => xs.indexOf(x) === i);
}

// ── Schema-tolerance helper ───────────────────────────────────────────────────

/**
 * True when a PostgREST/Postgres error means "that column does not exist".
 * Lets the functions write `card_verified_at` / `amount_base` / `amount_vat`
 * optimistically and retry without them until the migration is applied.
 *
 * PostgREST returns PGRST204 for an unknown column in the payload;
 * Postgres returns SQLSTATE 42703 for an undefined column.
 */
export function isUndefinedColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (code === "PGRST204" || code === "42703") return true;
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    message.includes("could not find") && message.includes("column")
  ) || message.includes("does not exist") && message.includes("column");
}

/** Return a shallow copy of `payload` with the given keys removed. */
export function withoutKeys<T extends Record<string, unknown>>(payload: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(payload)) {
    if (!keys.includes(k)) out[k] = payload[k];
  }
  return out;
}

/** Keys that only exist after the Section 8 migration is applied. */
export const OPTIONAL_SUBSCRIPTION_COLUMNS = ["card_verified_at"];
export const OPTIONAL_TRANSACTION_COLUMNS = ["amount_base", "amount_vat"];

// ── Charge retry caps (defect C3) ─────────────────────────────────────────────

/**
 * Maximum number of charge attempts for ONE billing episode (the initial
 * attempt plus retries), counted from the `failed` renewal transactions inside
 * the current period window.
 *
 * Without a cap the hourly cron retried a declining card on EVERY tick for the
 * whole 7-day grace window (~168 attempts on one card). Four attempts spaced by
 * `CHARGE_RETRY_BACKOFF_MS` covers ~3 days and still fits inside the 7-day
 * grace window, after which the past-due expiry pass closes the subscription.
 *
 * A healthy renewal has `failedCount === 0` and is never affected by this cap.
 */
export const MAX_CHARGE_ATTEMPTS = 4;

/** Minimum spacing between two charge attempts after a failure. 24 hours. */
export const CHARGE_RETRY_BACKOFF_MS = 24 * 60 * 60 * 1000;

export type RetryBlockReason = "ok" | "attempts_exhausted" | "backoff" | "unknown_last_failure";

export interface RetryEligibility {
  /** True when the cron may attempt a charge now. */
  eligible: boolean;
  reason: RetryBlockReason;
  /** 1-based attempt number this charge would be. */
  attemptNumber: number;
  /** Earliest time a retry is allowed, or null when unknown / not applicable. */
  nextAttemptAtMs: number | null;
}

/**
 * Decide whether a failed-charge episode may be retried right now.
 *
 * @param failedCount  number of `failed` renewal transactions inside the window
 * @param lastFailedAt created_at of the MOST RECENT failed transaction (ISO)
 * @param nowMs        injectable clock
 *
 * Fail-closed by construction: an unreadable `lastFailedAt` after a known
 * failure blocks the retry rather than allowing an immediate re-charge. The
 * subscription is then closed by the past-due expiry pass at the end of the
 * grace window, so nothing is stuck forever.
 */
export function chargeRetryEligibility(
  failedCount: number | null | undefined,
  lastFailedAt: string | null | undefined,
  nowMs: number = Date.now(),
): RetryEligibility {
  const raw = Number(failedCount ?? 0);
  const failures = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const attemptNumber = failures + 1;

  if (failures >= MAX_CHARGE_ATTEMPTS) {
    return { eligible: false, reason: "attempts_exhausted", attemptNumber, nextAttemptAtMs: null };
  }
  if (failures === 0) {
    return { eligible: true, reason: "ok", attemptNumber, nextAttemptAtMs: null };
  }

  const lastMs = lastFailedAt ? Date.parse(lastFailedAt) : NaN;
  if (!Number.isFinite(lastMs)) {
    return { eligible: false, reason: "unknown_last_failure", attemptNumber, nextAttemptAtMs: null };
  }

  const nextAttemptAtMs = lastMs + CHARGE_RETRY_BACKOFF_MS;
  if (nowMs < nextAttemptAtMs) {
    return { eligible: false, reason: "backoff", attemptNumber, nextAttemptAtMs };
  }
  return { eligible: true, reason: "ok", attemptNumber, nextAttemptAtMs };
}

// ── Plan / seat change carried through payment metadata (defect C1) ───────────

/**
 * The plan + seat count a specific Moyasar payment was created FOR, read back
 * from that payment's verified metadata.
 *
 * `moyasar-create-subscription` must never write a requested plan/seat change
 * onto a live `trialing` / `past_due` row: those rows are armed for an
 * unattended token charge, so an abandoned checkout would leave the row
 * escalated and the cron would bill the escalated price without the customer
 * ever having paid for it. The request travels in the payment metadata instead
 * and is promoted onto the row by `moyasar-webhook` only when the payment is
 * actually captured.
 */
export interface PaidPlanRef {
  plan_id: string | null;
  seat_count: number | null;
}

/** Read `{plan_id, seat_count}` out of verified Moyasar payment metadata. */
export function parsePaidPlanRef(metadata: unknown): PaidPlanRef {
  const empty: PaidPlanRef = { plan_id: null, seat_count: null };
  if (!metadata || typeof metadata !== "object") return empty;
  const m = metadata as Record<string, unknown>;

  const rawPlan = m.plan_id;
  const planId = typeof rawPlan === "string" && rawPlan.trim().length > 0 ? rawPlan.trim() : null;

  const rawSeats = m.seat_count;
  const seatsNum =
    typeof rawSeats === "number" ? rawSeats
    : typeof rawSeats === "string" && rawSeats.trim() !== "" ? Number(rawSeats)
    : NaN;
  const seatCount =
    Number.isInteger(seatsNum) && seatsNum >= 1 && seatsNum <= MAX_BILLABLE_SEATS ? seatsNum : null;

  return { plan_id: planId, seat_count: seatCount };
}

export interface TrialChargeAuthorization {
  authorized: boolean;
  reason:
    | "match"
    | "no_verified_plan_metadata"
    | "plan_mismatch"
    | "seat_escalation"
    | "no_subscription";
  /**
   * ADDITIVE (H9). The plan the stored card was actually verified against, or
   * null when that is unknown. When non-null the caller MUST price the charge
   * from THIS plan id, never from whatever the row currently holds.
   */
  clampedPlanId?: string | null;
  /**
   * ADDITIVE (H9). The highest seat count this authorization covers, or null
   * when the verified payment carried no seat count. When non-null the caller
   * MUST price with `Math.min(row.seat_count, maxSeats)`.
   *
   * `authorized === true` on its own is a comparison result, not a price. These
   * two fields let the caller derive the amount from the VERIFIED reference
   * instead of re-deriving it from the (mutable) subscription row.
   */
  maxSeats?: number | null;
}

/**
 * Guard for the unattended post-trial first charge: the cron may only bill the
 * plan/seats the stored card was actually VERIFIED against.
 *
 * `verified` comes from the metadata of the payment referenced by
 * `user_subscriptions.moyasar_payment_id` — the 1.00 SAR card verification.
 * If the row's plan no longer matches, something escalated the row outside a
 * captured payment and the charge must NOT be attempted.
 *
 * Billing fewer seats than were verified is allowed (it can only undercharge).
 *
 * H9 (2026-08-23) — THIS GUARD NOW FAILS CLOSED.
 * It used to return `{ authorized: true, reason: "no_verified_plan_metadata" }`
 * whenever the verification payment carried no `plan_id`, so that pre-C1 trials
 * were not stranded. That fails OPEN: with nothing to compare against, the cron
 * charged the stored card for whatever plan and seat count the row currently
 * held — the exact escalation C1 exists to close. There is no honest clamp
 * available in that state either: the historical plan is simply not knowable
 * from the inputs, and clamping seats alone still leaves a plan escalation
 * (e.g. `pro` 245.00 SAR -> `enterprise_office` at min_seats 5 = 2745.00 SAR).
 *
 * So an unknown authorization is now a refusal. Nothing is charged; the row
 * stays `trialing` with a lapsed `trial_end` and the customer converts through
 * the normal checkout, which produces a captured payment carrying full
 * metadata (Section 12.4 removed the 409 that used to block exactly that). No
 * money moves on an amount nobody consented to.
 */
export function trialChargeAuthorized(
  sub: { plan_id?: string | null; seat_count?: number | null } | null | undefined,
  verified: PaidPlanRef | null | undefined,
): TrialChargeAuthorization {
  if (!sub) {
    return { authorized: false, reason: "no_subscription", clampedPlanId: null, maxSeats: null };
  }
  if (!verified || !verified.plan_id) {
    return {
      authorized: false,
      reason: "no_verified_plan_metadata",
      clampedPlanId: null,
      maxSeats: null,
    };
  }
  if (verified.plan_id !== sub.plan_id) {
    return {
      authorized: false,
      reason: "plan_mismatch",
      clampedPlanId: verified.plan_id,
      maxSeats: verified.seat_count ?? null,
    };
  }
  const rawSeats = Number(sub.seat_count ?? 1);
  const billedSeats = Number.isFinite(rawSeats) ? Math.floor(rawSeats) : 1;
  if (verified.seat_count != null && billedSeats > verified.seat_count) {
    return {
      authorized: false,
      reason: "seat_escalation",
      clampedPlanId: verified.plan_id,
      maxSeats: verified.seat_count,
    };
  }
  return {
    authorized: true,
    reason: "match",
    clampedPlanId: verified.plan_id,
    maxSeats: verified.seat_count ?? null,
  };
}

// ── Unique-violation helper (defect C2) ──────────────────────────────────────

/**
 * True when a Postgres/PostgREST error is a unique-constraint violation
 * (SQLSTATE 23505).
 *
 * `user_subscriptions_one_live_row_per_user` is a partial unique index over
 * ('active','trialing','past_due'). A lapsed customer who resubscribes gets a
 * new `pending_activation` row (allowed by the partial index) whose activation
 * UPDATE then collides with their still-live `past_due` row. That collision was
 * only console.error'd, so the webhook acked 200: money captured, no
 * subscription, no dead letter, no retry.
 */
export function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  if (typeof e.code === "string" && e.code === "23505") return true;
  const text = [e.message, e.details]
    .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
    .join(" ");
  return text.includes("duplicate key value") || text.includes("violates unique constraint");
}
