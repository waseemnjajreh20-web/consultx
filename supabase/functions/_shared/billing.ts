// ============================================================
// _shared/billing.ts
//
// Pure billing arithmetic shared by the Moyasar edge functions.
// No Deno / Supabase imports here on purpose: this module is
// imported unchanged by `supabase/functions/**` (Deno) and by
// `src/__tests__/billing.test.ts` (vitest / Node).
//
// Money is ALWAYS an integer number of halalas (1 SAR = 100).
// Prices in `subscription_plans` are VAT-INCLUSIVE (15% KSA VAT).
//
// Contract: docs/launch/billing-contract-20260823.md
// ============================================================

/** The card-verification charge, in halalas. 1.00 SAR. Never refunded — credited to the first invoice. */
export const CARD_VERIFICATION_AMOUNT = 100;

/** KSA VAT rate. Plan prices already include it. */
export const VAT_RATE = 0.15;

/** FOUNDING10 first-month price, in halalas. */
export const FOUNDING10_AMOUNT = 1000;

/** EID50 first-month price for the `pro` plan, in halalas (50% of 24500). */
export const EID50_PRO_AMOUNT = 12250;

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
  card_verified_at?: string | null;
  moyasar_card_token?: string | null;
}

export interface VatSplit {
  /** VAT-exclusive base, halalas. */
  base: number;
  /** VAT component, halalas. */
  vat: number;
  /** VAT-inclusive total, halalas (echoes the input). */
  total: number;
}

export interface ChargeDecision {
  flow: BillingFlow;
  /** Amount to charge now, halalas. */
  amount: number;
  /** Full VAT-inclusive plan price for this subscription, halalas (before promo / credit). */
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
  /** VAT split of `amount`. */
  base: number;
  vat: number;
}

// ── VAT ───────────────────────────────────────────────────────────────────────

/**
 * Split a VAT-INCLUSIVE total into base + VAT.
 *   base = round(total / 1.15)
 *   vat  = total - base
 * Guarantees base + vat === total exactly (no rounding leak).
 */
export function splitVat(total: number): VatSplit {
  const safeTotal = Number.isFinite(total) ? Math.round(total) : 0;
  if (safeTotal <= 0) return { base: 0, vat: 0, total: Math.max(0, safeTotal) };
  const base = Math.round(safeTotal / (1 + VAT_RATE));
  return { base, vat: safeTotal - base, total: safeTotal };
}

// ── Plan pricing ──────────────────────────────────────────────────────────────

/** Seats actually billed: max(seat_count, plan.min_seats, 1). */
export function effectiveSeats(plan: PlanLike | null | undefined, sub: SubLike | null | undefined): number {
  const seatCount = Number(sub?.seat_count ?? 1);
  const minSeats = Number(plan?.min_seats ?? 1);
  return Math.max(
    Number.isFinite(seatCount) ? seatCount : 1,
    Number.isFinite(minSeats) ? minSeats : 1,
    1,
  );
}

/**
 * Full VAT-inclusive price for one billing period.
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
export function promoAmountFor(plan: PlanLike | null | undefined, promo: string | null | undefined): number | null {
  const code = typeof promo === "string" ? promo.trim().toUpperCase() : "";
  if (code === "FOUNDING10") return FOUNDING10_AMOUNT;
  if (code === "EID50" && plan?.slug === "pro") return EID50_PRO_AMOUNT;
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
    const split = splitVat(CARD_VERIFICATION_AMOUNT);
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
    const credit = sub?.card_verified_at && priorPaidCount === 0 ? CARD_VERIFICATION_AMOUNT : 0;
    const amount = Math.max(0, planPrice - credit);
    const split = splitVat(amount);
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
  const promoPrice = promoAmountFor(plan, promo);
  const appliedPromo = promoPrice != null ? String(promo).trim().toUpperCase() : null;
  const amount = promoPrice ?? planPrice;
  const split = splitVat(amount);

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
      const promoPrice = promoAmountFor(plan, promo);
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
