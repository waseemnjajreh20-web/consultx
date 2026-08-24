/**
 * Contract tests for the shared billing arithmetic used by the Moyasar
 * edge functions.
 *
 * Source of truth: docs/launch/billing-contract-20260823.md
 *
 * Owner decisions encoded here:
 *   1. A card is required to start the free trial (1.00 SAR verification).
 *   2. No active trial  -> full plan price charged immediately.
 *   3. The seller is NOT VAT-REGISTERED. No charge carries a tax component,
 *      so every live charge records amount_base = amount and amount_vat = 0.
 *      `splitVat` is retained and tested as ready-for-registration arithmetic
 *      only — `chargeSplit` is what live code applies.
 *   4. The 1.00 SAR verification is DEDUCTED from the first real invoice.
 *      There is no refund.
 */
import { describe, it, expect } from "vitest";
import {
  CARD_VERIFICATION_AMOUNT,
  computeCharge,
  deriveFlow,
  effectiveSeats,
  EID50_PRO_AMOUNT,
  EID50_PLAN_SLUG,
  EID50_WINDOW_START_MS,
  EID50_WINDOW_END_MS,
  expectedAmountsFor,
  FOUNDING10_AMOUNT,
  chargeSplit,
  isUndefinedColumnError,
  isInTrial,
  parseFlow,
  planPriceFor,
  promoAmountFor,
  splitVat,
  verificationCreditOwed,
  withoutKeys,
  FOUNDING10_PLAN_SLUG,
  FOUNDING10_WINDOW_START_MS,
  FOUNDING10_WINDOW_END_MS,
  MAX_BILLABLE_SEATS,
  chargeRetryEligibility,
  CHARGE_RETRY_BACKOFF_MS,
  MAX_CHARGE_ATTEMPTS,
  parsePaidPlanRef,
  trialChargeAuthorized,
  isUniqueViolationError,
  type PlanLike,
  type SubLike,
} from "../../supabase/functions/_shared/billing.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-08-23T12:00:00.000Z");
const FUTURE = new Date(NOW + 3 * 86_400_000).toISOString();
const PAST = new Date(NOW - 3 * 86_400_000).toISOString();

const PRO: PlanLike = {
  slug: "pro",
  name_en: "Pro",
  currency: "SAR",
  price_amount: 24500, // 245.00 SAR — the whole price, no tax component
  price_per_seat: null,
  min_seats: 1,
  duration_days: 30,
};

const ENGINEER: PlanLike = {
  slug: "engineer",
  name_en: "Engineer",
  currency: "SAR",
  price_amount: 9900,
  price_per_seat: null,
  min_seats: 1,
  duration_days: 30,
};

const OFFICE: PlanLike = {
  slug: "enterprise_office",
  name_en: "Office",
  currency: "SAR",
  price_amount: 54900,
  price_per_seat: 54900, // 549.00 SAR per seat
  min_seats: 5,
  duration_days: 30,
};

const trialingSub = (over: Partial<SubLike> = {}): SubLike => ({
  status: "trialing",
  trial_end: FUTURE,
  seat_count: 1,
  card_verified_at: null,
  moyasar_card_token: null,
  ...over,
});

const lapsedTrialSub = (over: Partial<SubLike> = {}): SubLike => ({
  status: "trialing",
  trial_end: PAST,
  seat_count: 1,
  card_verified_at: new Date(NOW - 7 * 86_400_000).toISOString(),
  moyasar_card_token: "tok_live_xxx",
  ...over,
});

const returningSub = (over: Partial<SubLike> = {}): SubLike => ({
  status: "pending_activation",
  trial_end: null,
  seat_count: 1,
  card_verified_at: null,
  moyasar_card_token: null,
  ...over,
});

// ── splitVat (NOT APPLIED TO LIVE CHARGES) ───────────────────────────────────

describe("splitVat — dormant arithmetic, not applied while the seller is not VAT-registered", () => {
  it("splits the Pro plan price into base 21304 / vat 3196", () => {
    expect(splitVat(24500)).toEqual({ base: 21304, vat: 3196, total: 24500 });
  });

  it("splits the 1.00 SAR card verification", () => {
    // 100 / 1.15 = 86.95... -> 87 base, 13 VAT
    expect(splitVat(100)).toEqual({ base: 87, vat: 13, total: 100 });
  });

  it("always reconstructs the total exactly (no rounding leak)", () => {
    for (const total of [1, 99, 100, 999, 9900, 12250, 24500, 54900, 274500]) {
      const { base, vat } = splitVat(total);
      expect(base + vat).toBe(total);
      expect(Number.isInteger(base)).toBe(true);
      expect(Number.isInteger(vat)).toBe(true);
    }
  });

  it("treats zero and negative totals as zero", () => {
    expect(splitVat(0)).toEqual({ base: 0, vat: 0, total: 0 });
    expect(splitVat(-500)).toEqual({ base: 0, vat: 0, total: 0 });
  });
});

// ── chargeSplit (what live charges actually record) ──────────────────────────

describe("chargeSplit — the split recorded against a real charge", () => {
  it("records no tax component: the whole amount is the base", () => {
    expect(chargeSplit(24500)).toEqual({ base: 24500, vat: 0, total: 24500 });
    expect(chargeSplit(100)).toEqual({ base: 100, vat: 0, total: 100 });
  });

  it("never equals the dormant splitVat result for a non-zero amount", () => {
    for (const total of [100, 9900, 12250, 24500, 54900, 274500]) {
      expect(chargeSplit(total).vat).toBe(0);
      expect(splitVat(total).vat).toBeGreaterThan(0);
    }
  });

  it("still reconstructs the total exactly", () => {
    for (const total of [1, 99, 100, 9900, 24500, 439200]) {
      const { base, vat } = chargeSplit(total);
      expect(base + vat).toBe(total);
    }
  });

  it("treats zero and negative totals as zero", () => {
    expect(chargeSplit(0)).toEqual({ base: 0, vat: 0, total: 0 });
    expect(chargeSplit(-500)).toEqual({ base: 0, vat: 0, total: 0 });
  });
});

// ── Plan pricing ─────────────────────────────────────────────────────────────

describe("planPriceFor / effectiveSeats", () => {
  it("uses price_amount for flat plans", () => {
    expect(planPriceFor(PRO, trialingSub())).toBe(24500);
    expect(planPriceFor(ENGINEER, trialingSub())).toBe(9900);
  });

  it("ignores seat_count on flat plans", () => {
    expect(planPriceFor(PRO, trialingSub({ seat_count: 9 }))).toBe(24500);
  });

  it("multiplies price_per_seat by the seat count for per-seat plans", () => {
    expect(planPriceFor(OFFICE, trialingSub({ seat_count: 5 }))).toBe(274500);
    expect(planPriceFor(OFFICE, trialingSub({ seat_count: 8 }))).toBe(439200);
  });

  it("floors seats at plan.min_seats", () => {
    expect(effectiveSeats(OFFICE, trialingSub({ seat_count: 2 }))).toBe(5);
    expect(planPriceFor(OFFICE, trialingSub({ seat_count: 2 }))).toBe(274500);
  });

  it("floors seats at 1 when nothing is configured", () => {
    expect(effectiveSeats(null, null)).toBe(1);
  });
});

// ── Flow derivation ──────────────────────────────────────────────────────────

describe("deriveFlow / isInTrial", () => {
  it("is a card verification inside a live trial window", () => {
    expect(isInTrial(trialingSub(), NOW)).toBe(true);
    expect(deriveFlow(trialingSub(), NOW)).toBe("trial_card_verification");
  });

  it("is a post-trial first charge once trial_end has passed", () => {
    expect(isInTrial(lapsedTrialSub(), NOW)).toBe(false);
    expect(deriveFlow(lapsedTrialSub(), NOW)).toBe("post_trial_first_charge");
  });

  it("is an immediate charge for returning / expired / plan-change users", () => {
    expect(deriveFlow(returningSub(), NOW)).toBe("immediate_charge");
    expect(deriveFlow({ status: "expired", trial_end: PAST }, NOW)).toBe("immediate_charge");
    expect(deriveFlow({ status: "cancelled" }, NOW)).toBe("immediate_charge");
    expect(deriveFlow(null, NOW)).toBe("immediate_charge");
  });

  it("does not treat a trialing row with no trial_end as in-trial", () => {
    expect(isInTrial({ status: "trialing", trial_end: null }, NOW)).toBe(false);
  });

  it("parseFlow rejects anything outside the known set", () => {
    expect(parseFlow("renewal")).toBe("renewal");
    expect(parseFlow("trial_card_verification")).toBe("trial_card_verification");
    expect(parseFlow("free_money")).toBeNull();
    expect(parseFlow(undefined)).toBeNull();
    expect(parseFlow(100)).toBeNull();
  });
});

// ── computeCharge: trial card verification ───────────────────────────────────

describe("computeCharge — trial card verification", () => {
  it("charges exactly 1.00 SAR inside the trial window", () => {
    const d = computeCharge(PRO, trialingSub(), null, 0, NOW);
    expect(d.flow).toBe("trial_card_verification");
    expect(d.amount).toBe(100);
    expect(d.amount).toBe(CARD_VERIFICATION_AMOUNT);
  });

  it("uses the honest 'deducted from first invoice' description", () => {
    const d = computeCharge(PRO, trialingSub(), null, 0, NOW);
    expect(d.description).toBe("ConsultX card verification (deducted from first invoice)");
    expect(d.description.toLowerCase()).not.toContain("refund");
  });

  it("still charges only 1.00 SAR for a per-seat plan", () => {
    const d = computeCharge(OFFICE, trialingSub({ seat_count: 8 }), null, 0, NOW);
    expect(d.amount).toBe(100);
    expect(d.planPrice).toBe(439200); // full price still reported for display
  });

  it("records NO tax on the verification charge", () => {
    const d = computeCharge(PRO, trialingSub(), null, 0, NOW);
    expect(d.amount).toBe(100);
    expect(d.base).toBe(100);
    expect(d.vat).toBe(0);
  });
});

// ── computeCharge: immediate charge ──────────────────────────────────────────

describe("computeCharge — immediate charge", () => {
  it("charges the full plan price when there is no active trial", () => {
    const d = computeCharge(PRO, returningSub(), null, 0, NOW);
    expect(d.flow).toBe("immediate_charge");
    expect(d.amount).toBe(24500);
    expect(d.verificationCredit).toBe(0);
  });

  it("charges the full Engineer price", () => {
    expect(computeCharge(ENGINEER, returningSub(), null, 0, NOW).amount).toBe(9900);
  });

  it("multiplies enterprise seats", () => {
    const d = computeCharge(OFFICE, returningSub({ seat_count: 5 }), null, 0, NOW);
    expect(d.amount).toBe(274500);
    expect(d.effectiveSeats).toBe(5);

    const d8 = computeCharge(OFFICE, returningSub({ seat_count: 8 }), null, 0, NOW);
    expect(d8.amount).toBe(439200);
    expect(d8.effectiveSeats).toBe(8);
  });

  it("records NO tax on the full price", () => {
    const d = computeCharge(PRO, returningSub(), null, 0, NOW);
    expect(d.amount).toBe(24500);
    expect(d.base).toBe(24500);
    expect(d.vat).toBe(0);
  });
});

// ── computeCharge: post-trial first charge ───────────────────────────────────

describe("computeCharge — post-trial first charge", () => {
  it("deducts the 1.00 SAR verification from the first invoice", () => {
    const d = computeCharge(PRO, lapsedTrialSub(), null, 0, NOW);
    expect(d.flow).toBe("post_trial_first_charge");
    expect(d.amount).toBe(24400); // 24500 - 100
    expect(d.verificationCredit).toBe(100);
    expect(d.description).toContain("less 1.00 SAR card verification");
  });

  it("charges the full price on every later charge", () => {
    const d = computeCharge(PRO, lapsedTrialSub(), null, 1, NOW);
    expect(d.amount).toBe(24500);
    expect(d.verificationCredit).toBe(0);
    expect(d.description).not.toContain("less 1.00 SAR");
  });

  it("does not credit anything when there is NO evidence of a verification", () => {
    // No card_verified_at stamp, no counted verification transaction, and no
    // stored card token: nothing was ever charged, so nothing is owed back.
    const d = computeCharge(
      PRO,
      lapsedTrialSub({ card_verified_at: null, moyasar_card_token: null }),
      null,
      0,
      NOW,
    );
    expect(d.amount).toBe(24500);
    expect(d.verificationCredit).toBe(0);
  });

  it("DOES credit a pre-migration row, where the token is the only evidence", () => {
    // card_verified_at does not exist in production yet. Gating on it alone
    // charged every converting customer the full price while the trial banner
    // promised them "plan price minus 1.00 SAR". See verificationCreditOwed.
    const d = computeCharge(PRO, lapsedTrialSub({ card_verified_at: null }), null, 0, NOW);
    expect(d.verificationCredit).toBe(CARD_VERIFICATION_AMOUNT);
    expect(d.amount).toBe(24400);
  });

  it("deducts once from a per-seat first invoice", () => {
    const d = computeCharge(OFFICE, lapsedTrialSub({ seat_count: 5 }), null, 0, NOW);
    expect(d.amount).toBe(274400); // 274500 - 100
  });

  it("records the discounted first invoice as base, with no tax component", () => {
    const d = computeCharge(PRO, lapsedTrialSub(), null, 0, NOW);
    expect(d.amount).toBe(24400);
    expect(d.base).toBe(24400);
    expect(d.vat).toBe(0);
  });
});

// ── Promotions ───────────────────────────────────────────────────────────────

describe("promotions apply to immediate charges only", () => {
  it("FOUNDING10 sets the immediate first month to 10.00 SAR", () => {
    const d = computeCharge(PRO, returningSub(), "FOUNDING10", 0, NOW);
    expect(d.amount).toBe(FOUNDING10_AMOUNT);
    expect(d.amount).toBe(1000);
    expect(d.appliedPromo).toBe("FOUNDING10");
  });

  it("EID50 halves the immediate Pro first month", () => {
    // R3-C4: EID50 now has a server-side window, so this must be evaluated
    // INSIDE it. NOW (2026-08-23) is three months after the campaign closed.
    const d = computeCharge(PRO, returningSub(), "EID50", 0, EID50_WINDOW_START_MS + 1000);
    expect(d.amount).toBe(EID50_PRO_AMOUNT);
    expect(d.amount).toBe(12250);
  });

  it("EID50 does not apply to non-Pro plans", () => {
    expect(computeCharge(ENGINEER, returningSub(), "EID50", 0, NOW).amount).toBe(9900);
    expect(promoAmountFor(OFFICE, "EID50")).toBeNull();
  });

  it("is IGNORED during a trial card verification", () => {
    for (const promo of ["FOUNDING10", "EID50"]) {
      const d = computeCharge(PRO, trialingSub(), promo, 0, NOW);
      expect(d.amount).toBe(100);
      expect(d.appliedPromo).toBeNull();
    }
  });

  it("is IGNORED on the post-trial first charge", () => {
    for (const promo of ["FOUNDING10", "EID50"]) {
      const d = computeCharge(PRO, lapsedTrialSub(), promo, 0, NOW);
      expect(d.amount).toBe(24400);
      expect(d.appliedPromo).toBeNull();
    }
  });

  it("ignores unknown promo codes", () => {
    const d = computeCharge(PRO, returningSub(), "NOT_A_CODE", 0, NOW);
    expect(d.amount).toBe(24500);
    expect(d.appliedPromo).toBeNull();
  });
});

// ── Webhook amount validation ────────────────────────────────────────────────

describe("expectedAmountsFor — what the webhook will accept", () => {
  it("accepts only 100 for a trial card verification", () => {
    expect(expectedAmountsFor(PRO, trialingSub(), "trial_card_verification", null)).toEqual([100]);
  });

  it("accepts only the full plan price for a renewal", () => {
    expect(expectedAmountsFor(PRO, returningSub(), "renewal", null)).toEqual([24500]);
    expect(expectedAmountsFor(PRO, returningSub(), "renewal", "FOUNDING10")).toEqual([24500]);
  });

  it("accepts the price with or without the verification credit post-trial", () => {
    const allowed = expectedAmountsFor(PRO, lapsedTrialSub(), "post_trial_first_charge", null);
    expect(allowed).toContain(24500);
    expect(allowed).toContain(24400);
  });

  it("accepts the promo price or the list price on an immediate charge", () => {
    const allowed = expectedAmountsFor(PRO, returningSub(), "immediate_charge", "EID50");
    expect(allowed).toContain(12250);
    expect(allowed).toContain(24500);
    expect(allowed).not.toContain(100);
  });

  it("never silently accepts 1 SAR for a real invoice", () => {
    for (const flow of ["immediate_charge", "renewal", "post_trial_first_charge"] as const) {
      expect(expectedAmountsFor(PRO, returningSub(), flow, null)).not.toContain(100);
    }
  });
});

// ── Schema tolerance ─────────────────────────────────────────────────────────

describe("isUndefinedColumnError / withoutKeys", () => {
  it("recognises the PostgREST unknown-column code", () => {
    expect(isUndefinedColumnError({ code: "PGRST204", message: "..." })).toBe(true);
  });

  it("recognises the Postgres undefined-column SQLSTATE", () => {
    expect(isUndefinedColumnError({ code: "42703" })).toBe(true);
  });

  it("recognises the PostgREST message text", () => {
    expect(
      isUndefinedColumnError({
        message: "Could not find the 'card_verified_at' column of 'user_subscriptions' in the schema cache",
      }),
    ).toBe(true);
  });

  it("does not swallow unrelated errors", () => {
    expect(isUndefinedColumnError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isUndefinedColumnError(null)).toBe(false);
    expect(isUndefinedColumnError("boom")).toBe(false);
  });

  it("strips only the requested keys", () => {
    const payload = { amount: 100, amount_base: 100, amount_vat: 0, currency: "SAR" };
    expect(withoutKeys(payload, ["amount_base", "amount_vat"])).toEqual({ amount: 100, currency: "SAR" });
  });
});

// ── Regression guards for the confirmed defects ──────────────────────────────

describe("regression — the defects this change fixes", () => {
  it("a returning user is never charged 1.00 SAR for a full period", () => {
    const d = computeCharge(PRO, returningSub(), null, 0, NOW);
    expect(d.amount).not.toBe(100);
    expect(d.amount).toBe(24500);
  });

  it("a lapsed trial always produces a real, billable charge", () => {
    const d = computeCharge(PRO, lapsedTrialSub(), null, 0, NOW);
    expect(d.amount).toBeGreaterThan(CARD_VERIFICATION_AMOUNT);
  });

  it("no code path promises a refund", () => {
    const descriptions = [
      computeCharge(PRO, trialingSub(), null, 0, NOW).description,
      computeCharge(PRO, lapsedTrialSub(), null, 0, NOW).description,
      computeCharge(PRO, returningSub(), null, 0, NOW).description,
      computeCharge(PRO, returningSub(), "EID50", 0, NOW).description,
    ];
    for (const d of descriptions) {
      expect(d.toLowerCase()).not.toContain("refund");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cases the adversarial review named as missing. Every one of these is a real
// production input shape, not a synthetic edge case.
// ─────────────────────────────────────────────────────────────────────────────

const TEAM: PlanLike = {
  slug: "enterprise_team",
  name_en: "Team",
  currency: "SAR",
  price_amount: 119600,
  price_per_seat: 39900,
  min_seats: 3,
  duration_days: 30,
};

// ── deriveFlow: degenerate trial_end values ──────────────────────────────────

describe("deriveFlow — degenerate trial_end", () => {
  it("a trialing row with trial_end null is NOT in trial and NOT a 1 SAR charge", () => {
    const sub: SubLike = { status: "trialing", trial_end: null };
    expect(isInTrial(sub, NOW)).toBe(false);
    // Still `trialing`, so the cron owns it: post_trial_first_charge, never
    // trial_card_verification. A null trial_end must never buy free access.
    expect(deriveFlow(sub, NOW)).toBe("post_trial_first_charge");
    expect(computeCharge(PRO, sub, null, 0, NOW).amount).not.toBe(CARD_VERIFICATION_AMOUNT);
  });

  it("a malformed trial_end is treated as not-in-trial, not as an open trial", () => {
    for (const bad of ["", "not-a-date", "2026-13-45T99:99:99Z", "0000-00-00T00:00:61Z"]) {
      const sub: SubLike = { status: "trialing", trial_end: bad };
      expect(isInTrial(sub, NOW)).toBe(false);
      expect(deriveFlow(sub, NOW)).toBe("post_trial_first_charge");
    }
  });

  it("a trialing row whose trial_end is exactly now is over (strict >)", () => {
    const sub: SubLike = { status: "trialing", trial_end: new Date(NOW).toISOString() };
    expect(isInTrial(sub, NOW)).toBe(false);
  });
});

// ── computeCharge: degenerate plan prices ────────────────────────────────────

describe("computeCharge — degenerate plan prices", () => {
  it("does not go negative when planPrice < the 1.00 SAR credit", () => {
    const d = computeCharge({ ...PRO, price_amount: 50 }, lapsedTrialSub(), null, 0, NOW);
    expect(d.amount).toBe(0);
    expect(d.amount).toBeGreaterThanOrEqual(0);
    expect(d.base + d.vat).toBe(0);
  });

  it("planPrice exactly 100 nets to zero, never to a negative charge", () => {
    expect(computeCharge({ ...PRO, price_amount: 100 }, lapsedTrialSub(), null, 0, NOW).amount).toBe(0);
  });

  it("a null price_amount produces 0, not NaN", () => {
    const d = computeCharge({ ...PRO, price_amount: null }, returningSub(), null, 0, NOW);
    expect(d.amount).toBe(0);
    expect(Number.isNaN(d.amount)).toBe(false);
    expect(Number.isNaN(d.base)).toBe(false);
    expect(Number.isNaN(d.vat)).toBe(false);
  });

  it("a zero price_amount produces 0, not NaN", () => {
    const d = computeCharge({ ...PRO, price_amount: 0 }, returningSub(), null, 0, NOW);
    expect(d.amount).toBe(0);
    expect(d.base + d.vat).toBe(0);
  });

  it("a per-seat plan with price_per_seat 0 produces 0, not NaN", () => {
    const d = computeCharge({ ...OFFICE, price_per_seat: 0 }, returningSub({ seat_count: 9 }), null, 0, NOW);
    expect(d.amount).toBe(0);
    expect(Number.isNaN(d.amount)).toBe(false);
    // price_per_seat = 0 is NOT null, so it must NOT fall back to price_amount.
    expect(d.amount).not.toBe(54900);
  });
});

// ── effectiveSeats: hostile seat counts ──────────────────────────────────────

describe("effectiveSeats — hostile seat counts", () => {
  it("floors zero and negative seat counts at the plan minimum", () => {
    expect(effectiveSeats(OFFICE, { seat_count: 0 })).toBe(5);
    expect(effectiveSeats(OFFICE, { seat_count: -10 })).toBe(5);
    expect(effectiveSeats(PRO, { seat_count: 0 })).toBe(1);
    expect(effectiveSeats(PRO, { seat_count: -3 })).toBe(1);
  });

  it("treats NaN / non-numeric / non-finite seat counts as the plan minimum", () => {
    for (const bad of [NaN, "abc" as unknown as number, Infinity, -Infinity]) {
      expect(effectiveSeats(PRO, { seat_count: bad })).toBe(1);
      expect(effectiveSeats(OFFICE, { seat_count: bad })).toBe(5);
    }
    expect(effectiveSeats(PRO, { seat_count: null })).toBe(1);
    expect(effectiveSeats(PRO, { seat_count: undefined })).toBe(1);
  });

  it("never produces a fractional charge from a fractional seat count", () => {
    expect(Number.isInteger(effectiveSeats(OFFICE, { seat_count: 2.5 }))).toBe(true);
    // Fractional seats floor DOWN (corruption may only ever under-bill).
    expect(effectiveSeats(OFFICE, { seat_count: 7.9 })).toBe(7);
    expect(Number.isInteger(computeCharge(OFFICE, returningSub({ seat_count: 2.5 }), null, 0, NOW).amount)).toBe(true);
  });

  it("caps seats at MAX_BILLABLE_SEATS, matching create-subscription's SEAT_CAP", () => {
    // create-subscription rejects seat_count > 100 at the door, but the cron
    // re-prices from the STORED row, which had no such guard.
    expect(MAX_BILLABLE_SEATS).toBe(100);
    expect(effectiveSeats(OFFICE, { seat_count: 1_000_000 })).toBe(MAX_BILLABLE_SEATS);
    expect(effectiveSeats(OFFICE, { seat_count: Number.MAX_SAFE_INTEGER })).toBe(MAX_BILLABLE_SEATS);
    const d = computeCharge(OFFICE, returningSub({ seat_count: 1_000_000 }), null, 0, NOW);
    expect(d.amount).toBe(54900 * MAX_BILLABLE_SEATS);
    expect(Number.isSafeInteger(d.amount)).toBe(true);
  });

  it("every hostile seat count still yields a finite, bounded, integer charge", () => {
    for (const seats of [0, -1, NaN, 2.5, Infinity, 1e12, Number.MAX_SAFE_INTEGER]) {
      const n = effectiveSeats(OFFICE, { seat_count: seats });
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(MAX_BILLABLE_SEATS);
    }
  });

  it("a legal seat count inside the cap is untouched", () => {
    expect(effectiveSeats(OFFICE, { seat_count: 100 })).toBe(100);
    expect(effectiveSeats(OFFICE, { seat_count: 7 })).toBe(7);
  });
});

// ── promoAmountFor: normalisation, plan restriction, window ──────────────────

describe("promoAmountFor — normalisation and restrictions", () => {
  const IN_WINDOW = FOUNDING10_WINDOW_START_MS + 1000;

  it("normalises surrounding whitespace and case", () => {
    expect(promoAmountFor(PRO, " founding10 ", IN_WINDOW)).toBe(FOUNDING10_AMOUNT);
    expect(promoAmountFor(PRO, "FoUnDiNg10", IN_WINDOW)).toBe(FOUNDING10_AMOUNT);
    expect(promoAmountFor(PRO, "\tFOUNDING10\n", IN_WINDOW)).toBe(FOUNDING10_AMOUNT);
    // EID50 has its own window (R3-C4), so it is normalised against that one.
    expect(promoAmountFor(PRO, "  eid50  ", EID50_WINDOW_START_MS + 1000)).toBe(EID50_PRO_AMOUNT);
  });

  it("returns null for null / undefined / non-string promo input", () => {
    expect(promoAmountFor(PRO, null, IN_WINDOW)).toBeNull();
    expect(promoAmountFor(PRO, undefined, IN_WINDOW)).toBeNull();
    expect(promoAmountFor(PRO, 1000 as unknown as string, IN_WINDOW)).toBeNull();
  });

  it("FOUNDING10 is restricted to the pro plan", () => {
    expect(FOUNDING10_PLAN_SLUG).toBe("pro");
    expect(promoAmountFor(PRO, "FOUNDING10", IN_WINDOW)).toBe(FOUNDING10_AMOUNT);
    expect(promoAmountFor(ENGINEER, "FOUNDING10", IN_WINDOW)).toBeNull();
    expect(promoAmountFor(TEAM, "FOUNDING10", IN_WINDOW)).toBeNull();
    expect(promoAmountFor(OFFICE, "FOUNDING10", IN_WINDOW)).toBeNull();
    expect(promoAmountFor(null, "FOUNDING10", IN_WINDOW)).toBeNull();
  });

  it("FOUNDING10 never discounts an enterprise plan at any seat count", () => {
    // Pre-fix behaviour: 100 seats of enterprise_office for 10.00 SAR.
    const d = computeCharge(OFFICE, returningSub({ seat_count: 100 }), "FOUNDING10", 0, IN_WINDOW);
    expect(d.amount).toBe(54900 * 100);
    expect(d.appliedPromo).toBeNull();
  });

  it("FOUNDING10 is inert outside its server-side window", () => {
    expect(promoAmountFor(PRO, "FOUNDING10", FOUNDING10_WINDOW_START_MS - 1)).toBeNull();
    expect(promoAmountFor(PRO, "FOUNDING10", FOUNDING10_WINDOW_END_MS)).toBeNull();
    expect(promoAmountFor(PRO, "FOUNDING10", FOUNDING10_WINDOW_END_MS + 86_400_000)).toBeNull();
    // Boundaries: start inclusive, end exclusive.
    expect(promoAmountFor(PRO, "FOUNDING10", FOUNDING10_WINDOW_START_MS)).toBe(FOUNDING10_AMOUNT);
    expect(promoAmountFor(PRO, "FOUNDING10", FOUNDING10_WINDOW_END_MS - 1)).toBe(FOUNDING10_AMOUNT);
  });

  it("computeCharge outside the window bills the full Pro price", () => {
    const d = computeCharge(PRO, returningSub(), "FOUNDING10", 0, FOUNDING10_WINDOW_END_MS + 1);
    expect(d.amount).toBe(24500);
    expect(d.appliedPromo).toBeNull();
  });

  it("webhook validation keeps the plan restriction but ignores the window", () => {
    // A payment created seconds before the window closed must not be stranded
    // when its webhook lands seconds after.
    expect(expectedAmountsFor(PRO, returningSub(), "immediate_charge", "FOUNDING10")).toContain(FOUNDING10_AMOUNT);
    // ...but the plan restriction is never relaxed.
    expect(expectedAmountsFor(OFFICE, returningSub(), "immediate_charge", "FOUNDING10")).not.toContain(
      FOUNDING10_AMOUNT,
    );
  });
});

// ── expectedAmountsFor: null plan ────────────────────────────────────────────

describe("expectedAmountsFor — missing plan row", () => {
  it("never returns NaN for a null plan", () => {
    for (const flow of ["trial_card_verification", "immediate_charge", "renewal", "post_trial_first_charge"] as const) {
      const allowed = expectedAmountsFor(null, returningSub(), flow, null);
      expect(allowed.every((a) => Number.isFinite(a))).toBe(true);
    }
  });

  it("a null plan never widens what the webhook will accept", () => {
    expect(expectedAmountsFor(null, returningSub(), "renewal", null)).toEqual([0]);
    expect(expectedAmountsFor(null, returningSub(), "immediate_charge", null)).toEqual([0]);
    // A null plan must not make FOUNDING10 acceptable — the plan restriction
    // cannot be satisfied by an absent plan.
    expect(expectedAmountsFor(null, returningSub(), "immediate_charge", "FOUNDING10")).toEqual([0]);
    // Only the verification flow has a plan-independent fixed amount.
    expect(expectedAmountsFor(null, trialingSub(), "trial_card_verification", null)).toEqual([100]);
  });

  it("a null subscription still yields finite amounts", () => {
    expect(expectedAmountsFor(PRO, null, "immediate_charge", null)).toEqual([24500]);
  });
});

// ── Verification-credit predicate (pre-migration) ────────────────────────────

describe("verificationCreditOwed — works before the card_verified_at migration", () => {
  it("honours card_verified_at when the column exists", () => {
    expect(verificationCreditOwed({ card_verified_at: new Date(NOW).toISOString() })).toBe(true);
  });

  it("honours a counted captured verification transaction", () => {
    expect(verificationCreditOwed({ card_verified_at: null, has_captured_verification: true })).toBe(true);
  });

  it("infers the credit from a card token on a still-trialing row", () => {
    // Pre-migration production shape: the column does not exist at all, so the
    // only evidence is the stored token, which during a trial can only have
    // been written by the captured 1.00 SAR verification webhook.
    expect(
      verificationCreditOwed({ status: "trialing", moyasar_card_token: "tok_live_x", card_verified_at: null }),
    ).toBe(true);
  });

  it("does not invent a credit with no evidence at all", () => {
    expect(verificationCreditOwed(null)).toBe(false);
    expect(verificationCreditOwed({})).toBe(false);
    expect(verificationCreditOwed({ status: "trialing", moyasar_card_token: null })).toBe(false);
    // A token on an already-active row is not proof of a trial verification.
    expect(verificationCreditOwed({ status: "active", moyasar_card_token: "tok_live_x" })).toBe(false);
  });

  it("a pre-migration lapsed trial is charged price minus 1.00 SAR, not full price", () => {
    const preMigration = lapsedTrialSub({ card_verified_at: null }); // token still set
    const d = computeCharge(PRO, preMigration, null, 0, NOW);
    expect(d.verificationCredit).toBe(CARD_VERIFICATION_AMOUNT);
    expect(d.amount).toBe(24400);
  });

  it("the credit is still consumed exactly once", () => {
    const preMigration = lapsedTrialSub({ card_verified_at: null });
    const d = computeCharge(PRO, preMigration, null, 1, NOW);
    expect(d.verificationCredit).toBe(0);
    expect(d.amount).toBe(24500);
  });
});

// ── The single highest-value invariant ───────────────────────────────────────

describe("INVARIANT — a trial_card_verification payment can never buy a paid period", () => {
  const ALL_PLANS = [PRO, ENGINEER, TEAM, OFFICE, null];
  const ALL_SEATS = [1, 5, 100, 0, -1, NaN];
  const ALL_PROMOS = [null, "FOUNDING10", "EID50", "  founding10  ", "NOPE"];

  it("every trial_card_verification decision charges exactly 100 and opens no period", () => {
    for (const plan of ALL_PLANS) {
      for (const seats of ALL_SEATS) {
        for (const promo of ALL_PROMOS) {
          const d = computeCharge(plan, trialingSub({ seat_count: seats }), promo, 0, NOW);
          expect(d.flow).toBe("trial_card_verification");
          // 1. The amount is always exactly the verification amount.
          expect(d.amount).toBe(CARD_VERIFICATION_AMOUNT);
          // 2. No promo can ever be applied to it.
          expect(d.appliedPromo).toBeNull();
          // 3. purpose marks it a verification, so the webhook records
          //    payment_type "verification" and takes the trial branch, which
          //    never sets current_period_start / current_period_end.
          expect(d.purpose).toBe("card_verification");
          // 4. It never carries a credit it has not yet earned.
          expect(d.verificationCredit).toBe(0);
        }
      }
    }
  });

  it("100 halalas is never an acceptable amount for any period-opening flow", () => {
    for (const plan of ALL_PLANS) {
      for (const flow of ["immediate_charge", "renewal", "post_trial_first_charge"] as const) {
        for (const promo of ALL_PROMOS) {
          expect(expectedAmountsFor(plan, lapsedTrialSub(), flow, promo)).not.toContain(CARD_VERIFICATION_AMOUNT);
        }
      }
    }
  });

  it("the verification flow accepts nothing except 100", () => {
    for (const plan of ALL_PLANS) {
      expect(expectedAmountsFor(plan, trialingSub(), "trial_card_verification", "FOUNDING10")).toEqual([
        CARD_VERIFICATION_AMOUNT,
      ]);
    }
  });

  it("a live trial can never derive any flow other than the verification flow", () => {
    for (const seats of ALL_SEATS) {
      expect(deriveFlow(trialingSub({ seat_count: seats }), NOW)).toBe("trial_card_verification");
    }
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Second adversarial round — C1 / C2 / C3
// ─────────────────────────────────────────────────────────────────────────────

describe("chargeRetryEligibility — C3: uncapped hourly re-charging of a declining card", () => {
  const HOUR = 3_600_000;

  it("allows the first attempt of a healthy renewal (no failures)", () => {
    const d = chargeRetryEligibility(0, null, NOW);
    expect(d.eligible).toBe(true);
    expect(d.reason).toBe("ok");
    expect(d.attemptNumber).toBe(1);
  });

  it("treats a missing / hostile failure count as zero failures", () => {
    for (const bad of [null, undefined, NaN, -3, Number.POSITIVE_INFINITY]) {
      const d = chargeRetryEligibility(bad as any, null, NOW);
      expect(d.eligible).toBe(true);
      expect(d.attemptNumber).toBe(1);
    }
  });

  it("refuses a retry inside the backoff window and reports when it may run", () => {
    const lastFailed = new Date(NOW - HOUR).toISOString();
    const d = chargeRetryEligibility(1, lastFailed, NOW);
    expect(d.eligible).toBe(false);
    expect(d.reason).toBe("backoff");
    expect(d.nextAttemptAtMs).toBe(Date.parse(lastFailed) + CHARGE_RETRY_BACKOFF_MS);
  });

  it("allows the retry once the backoff window has elapsed", () => {
    const lastFailed = new Date(NOW - (CHARGE_RETRY_BACKOFF_MS + HOUR)).toISOString();
    const d = chargeRetryEligibility(1, lastFailed, NOW);
    expect(d.eligible).toBe(true);
    expect(d.attemptNumber).toBe(2);
  });

  it("stops entirely once the attempt cap is reached, however old the last failure", () => {
    const ancient = new Date(NOW - 30 * 24 * HOUR).toISOString();
    const d = chargeRetryEligibility(MAX_CHARGE_ATTEMPTS, ancient, NOW);
    expect(d.eligible).toBe(false);
    expect(d.reason).toBe("attempts_exhausted");
    expect(d.nextAttemptAtMs).toBeNull();
  });

  it("allows exactly MAX_CHARGE_ATTEMPTS attempts and no more", () => {
    const ancient = new Date(NOW - 30 * 24 * HOUR).toISOString();
    for (let failures = 0; failures < MAX_CHARGE_ATTEMPTS; failures++) {
      expect(chargeRetryEligibility(failures, ancient, NOW).eligible).toBe(true);
    }
    expect(chargeRetryEligibility(MAX_CHARGE_ATTEMPTS, ancient, NOW).eligible).toBe(false);
    expect(chargeRetryEligibility(MAX_CHARGE_ATTEMPTS + 50, ancient, NOW).eligible).toBe(false);
  });

  it("fails closed when the last failure timestamp is unreadable", () => {
    for (const bad of [null, undefined, "", "not-a-date"]) {
      const d = chargeRetryEligibility(2, bad as any, NOW);
      expect(d.eligible).toBe(false);
      expect(d.reason).toBe("unknown_last_failure");
    }
  });

  it("REGRESSION: 168 hourly ticks over the grace window produce at most MAX_CHARGE_ATTEMPTS charges", () => {
    // The bug: the idempotency guard only matched `initiated` / `captured`, so a
    // `failed` transaction blocked nothing and the cron re-charged the same
    // declining card on every tick for the whole 7-day grace window.
    let failures = 0;
    let lastFailedAt: string | null = null;
    let charges = 0;

    for (let hour = 0; hour < 24 * 7; hour++) {
      const now = NOW + hour * HOUR;
      const d = chargeRetryEligibility(failures, lastFailedAt, now);
      if (!d.eligible) continue;
      // Every attempt declines.
      charges++;
      failures++;
      lastFailedAt = new Date(now).toISOString();
    }

    expect(charges).toBe(MAX_CHARGE_ATTEMPTS);
  });

  it("the whole attempt schedule fits inside the 7-day grace window", () => {
    // GRACE_DAYS = 7 in check-subscription / moyasar-webhook /
    // process-subscription-renewal. The last allowed attempt must land before
    // the past-due expiry pass closes the subscription.
    const spanMs = (MAX_CHARGE_ATTEMPTS - 1) * CHARGE_RETRY_BACKOFF_MS;
    expect(spanMs).toBeLessThan(7 * 24 * 3_600_000);
  });
});

describe("parsePaidPlanRef — C1: the plan a payment was actually created for", () => {
  it("returns nulls for anything that is not usable metadata", () => {
    for (const bad of [null, undefined, "", 0, [], "plan"]) {
      expect(parsePaidPlanRef(bad as any)).toEqual({ plan_id: null, seat_count: null });
    }
  });

  it("reads plan_id and seat_count", () => {
    expect(parsePaidPlanRef({ plan_id: "plan-uuid", seat_count: 12 })).toEqual({
      plan_id: "plan-uuid",
      seat_count: 12,
    });
  });

  it("tolerates a numeric string seat_count (metadata round-trips as text)", () => {
    expect(parsePaidPlanRef({ plan_id: "p", seat_count: "12" }).seat_count).toBe(12);
  });

  it("trims plan_id and rejects blank / non-string ids", () => {
    expect(parsePaidPlanRef({ plan_id: "  p  " }).plan_id).toBe("p");
    for (const bad of ["", "   ", 5, null, {}]) {
      expect(parsePaidPlanRef({ plan_id: bad }).plan_id).toBeNull();
    }
  });

  it("rejects seat counts outside 1..MAX_BILLABLE_SEATS and non-integers", () => {
    for (const bad of [0, -1, 2.5, MAX_BILLABLE_SEATS + 1, "abc", null, {}, NaN]) {
      expect(parsePaidPlanRef({ plan_id: "p", seat_count: bad }).seat_count).toBeNull();
    }
    expect(parsePaidPlanRef({ plan_id: "p", seat_count: 1 }).seat_count).toBe(1);
    expect(parsePaidPlanRef({ plan_id: "p", seat_count: MAX_BILLABLE_SEATS }).seat_count).toBe(
      MAX_BILLABLE_SEATS,
    );
  });
});

describe("trialChargeAuthorized — C1: the cron may only bill the plan the card was verified for", () => {
  it("refuses when there is no subscription", () => {
    expect(trialChargeAuthorized(null, { plan_id: "p", seat_count: 1 }).authorized).toBe(false);
  });

  // H9 (2026-08-23): this assertion was inverted with the fix. It used to
  // require `authorized === true` for a payment with no plan metadata, which is
  // the fail-OPEN hole: with nothing to compare against, the cron charged the
  // stored card for whatever the row currently held. See the fail-closed
  // describe block at the end of this file.
  it("REFUSES a payment that carries no plan metadata (fails closed)", () => {
    for (const ref of [null, undefined, { plan_id: null, seat_count: null }]) {
      const d = trialChargeAuthorized({ plan_id: "p", seat_count: 1 }, ref as any);
      expect(d.authorized).toBe(false);
      expect(d.reason).toBe("no_verified_plan_metadata");
    }
  });

  it("allows the exact plan + seats the card was verified for", () => {
    const d = trialChargeAuthorized({ plan_id: "p", seat_count: 5 }, { plan_id: "p", seat_count: 5 });
    expect(d.authorized).toBe(true);
    expect(d.reason).toBe("match");
  });

  it("REGRESSION: refuses a plan that was escalated without a captured payment", () => {
    // The exploit: a trialing row was mutated to enterprise_office at checkout
    // time, the checkout was abandoned, and the cron then charged the escalated
    // plan on the card that had only ever been verified for `pro`.
    const d = trialChargeAuthorized(
      { plan_id: "enterprise-office-uuid", seat_count: 100 },
      { plan_id: "pro-uuid", seat_count: 1 },
    );
    expect(d.authorized).toBe(false);
    expect(d.reason).toBe("plan_mismatch");
  });

  it("REGRESSION: refuses a seat escalation on the same plan", () => {
    const d = trialChargeAuthorized(
      { plan_id: "p", seat_count: 100 },
      { plan_id: "p", seat_count: 5 },
    );
    expect(d.authorized).toBe(false);
    expect(d.reason).toBe("seat_escalation");
  });

  it("allows billing FEWER seats than were verified (can only undercharge)", () => {
    expect(
      trialChargeAuthorized({ plan_id: "p", seat_count: 3 }, { plan_id: "p", seat_count: 5 }).authorized,
    ).toBe(true);
  });

  it("treats a missing seat_count on the row as one seat", () => {
    expect(
      trialChargeAuthorized({ plan_id: "p", seat_count: null }, { plan_id: "p", seat_count: 5 }).authorized,
    ).toBe(true);
  });

  it("ignores the seat check when the verified payment carries no seat count", () => {
    expect(
      trialChargeAuthorized({ plan_id: "p", seat_count: 100 }, { plan_id: "p", seat_count: null }).authorized,
    ).toBe(true);
  });
});

describe("isUniqueViolationError — C2: paid but never activated", () => {
  it("matches SQLSTATE 23505", () => {
    expect(isUniqueViolationError({ code: "23505" })).toBe(true);
  });

  it("matches the PostgREST message wording", () => {
    expect(
      isUniqueViolationError({
        message: 'duplicate key value violates unique constraint "user_subscriptions_one_live_row_per_user"',
      }),
    ).toBe(true);
    expect(
      isUniqueViolationError({ details: "Key (user_id)=(x) violates unique constraint" }),
    ).toBe(true);
  });

  it("does not match anything else", () => {
    for (const bad of [null, undefined, "23505", 23505, {}, { code: "PGRST204" }, { code: "42703" }]) {
      expect(isUniqueViolationError(bad as any)).toBe(false);
    }
  });

  it("REGRESSION: the undefined-column helper never matched 23505, which is why activation failures were swallowed", () => {
    // moyasar-webhook only had isUndefinedColumnError() to classify the error,
    // so a unique-violation on the activation UPDATE fell through to a bare
    // console.error and the handler still returned 200: money captured, no
    // subscription, no dead letter, no retry.
    expect(isUndefinedColumnError({ code: "23505" })).toBe(false);
    expect(isUniqueViolationError({ code: "23505" })).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R3-C2 — no activation after cancellation
//
// The race:
//   09:00  process-subscription-renewal creates the post-trial charge
//   09:02  the customer cancels
//   09:05  Moyasar delivers the `paid` webhook for the 09:00 charge
// The webhook used to set status = "active" unconditionally, reviving a
// cancelled subscription and keeping the money.
//
// The decision is a pure function so it can be tested without Deno. It lives in
// supabase/functions/_shared/webhookDecisions.ts and NOT inside
// moyasar-webhook/index.ts, because index.ts imports remote "https://deno.land/..." URLs and
// calls serve() at module scope — importing it from Vitest fails with
// "Only URLs with a scheme in: file and data are supported by the default ESM
// loader". Same split as fire-safety-chat/geminiResilience.ts.
// ═════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import {
  CLOCK_SKEW_TOLERANCE_MS,
  decideActivation,
  parseTimestampMs,
  RESUBSCRIBE_WINDOW_MS,
  type ActivationInput,
} from "../../supabase/functions/_shared/webhookDecisions.ts";

describe("R3-C2 activation guard — parseTimestampMs", () => {
  it("parses ISO 8601", () => {
    expect(parseTimestampMs("2026-08-23T09:00:00.000Z")).toBe(
      Date.parse("2026-08-23T09:00:00.000Z"),
    );
  });
  it("passes through finite epoch-ms numbers", () => {
    expect(parseTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });
  it("returns null for anything unusable", () => {
    expect(parseTimestampMs(null)).toBeNull();
    expect(parseTimestampMs(undefined)).toBeNull();
    expect(parseTimestampMs("")).toBeNull();
    expect(parseTimestampMs("not-a-date")).toBeNull();
    expect(parseTimestampMs(Number.NaN)).toBeNull();
    expect(parseTimestampMs({})).toBeNull();
  });
});

describe("R3-C2 activation guard — decideActivation", () => {
  const T0900 = Date.parse("2026-08-23T09:00:00.000Z");
  const T0902 = Date.parse("2026-08-23T09:02:00.000Z");
  const T0905 = Date.parse("2026-08-23T09:05:00.000Z");

  const base: ActivationInput = {
    subStatus: "active",
    cancelAtPeriodEnd: false,
    cancelledAtMs: null,
    flow: "renewal",
    paymentCreatedAtMs: T0900,
    nowMs: T0905,
  };
  const at = (o: Partial<ActivationInput>): ActivationInput => ({ ...base, ...o });

  // ── The reported race ──────────────────────────────────────────────────────

  it("REFUSES the 09:00 / 09:02 / 09:05 race on a trialing row (post-Fix-2 shape)", () => {
    // cancel-subscription now leaves a trialing cancellation as
    // status = "trialing" + cancel_at_period_end = true.
    const d = decideActivation(at({
      subStatus: "trialing",
      cancelAtPeriodEnd: true,
      cancelledAtMs: T0902,
      flow: "post_trial_first_charge",
      paymentCreatedAtMs: T0900,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
    expect(d.reason).toBe("paid_after_cancel");
  });

  it("REFUSES the same race in the pre-Fix-2 shape (status already 'cancelled')", () => {
    // Rows cancelled by the OLD cancel-subscription already exist in production.
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelAtPeriodEnd: false,
      cancelledAtMs: T0902,
      flow: "post_trial_first_charge",
      paymentCreatedAtMs: T0900,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
    expect(d.reason).toBe("paid_after_cancel");
  });

  it("REFUSES a renewal landing on an active row already cancelled at period end", () => {
    const d = decideActivation(at({
      subStatus: "active",
      cancelAtPeriodEnd: true,
      cancelledAtMs: T0902,
      flow: "renewal",
      paymentCreatedAtMs: T0900,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
    expect(d.reason).toBe("paid_after_cancel");
  });

  // ── Resubscribe must NOT be broken ─────────────────────────────────────────

  it("ACTIVATES a genuine resubscribe: cancelled row + fresh immediate_charge", () => {
    const cancelledYesterday = T0905 - 26 * 60 * 60 * 1000;
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelAtPeriodEnd: false,
      cancelledAtMs: cancelledYesterday,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0905 - 3 * 60 * 1000, // paid 3 minutes ago
      nowMs: T0905,
    }));
    expect(d.activate).toBe(true);
  });

  it("ACTIVATES a resubscribe on an expired row (no cancelled_at recorded)", () => {
    const d = decideActivation(at({
      subStatus: "expired",
      cancelAtPeriodEnd: false,
      cancelledAtMs: null,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0905 - 60_000,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(true);
  });

  // R4-CRITICAL-1. The previous version of this test hardcoded
  // `flow: "immediate_charge"` alongside `subStatus: "trialing"` — a pair
  // `deriveFlow` can NEVER produce. It therefore "proved" a path that does not
  // exist while the real one (post_trial_first_charge) was refused, charging the
  // customer and dead-lettering them. The flow is now DERIVED from a realistic
  // row, so the test cannot drift away from production again.
  it("derives post_trial_first_charge for a lapsed trialing row (guards the test itself)", () => {
    expect(deriveFlow(lapsedTrialSub(), NOW)).toBe("post_trial_first_charge");
  });

  it("ACTIVATES the resubscribe of a mid-trial canceller whose trial then lapsed", () => {
    // The real journey: cancel during the trial, let it lapse, come back through
    // /subscribe. moyasar-create-subscription reuses the same trialing row, so
    // the server derives the flow from THAT row — not from an invented one.
    const row = lapsedTrialSub();
    const derivedFlow = deriveFlow(row, NOW);
    expect(derivedFlow).toBe("post_trial_first_charge"); // not immediate_charge

    const d = decideActivation(at({
      subStatus: row.status,
      cancelAtPeriodEnd: true,
      cancelledAtMs: T0902,
      flow: derivedFlow,
      paymentCreatedAtMs: T0905 - 30_000, // the customer's own checkout, AFTER the cancel
      nowMs: T0905,
    }));
    expect(d.activate).toBe(true);
  });

  it("REFUSES that same derived flow when the payment PREDATES the cancellation", () => {
    // The cron created the conversion charge at 09:00, the customer cancelled at
    // 09:02. Admitting post_trial_first_charge must not reopen the R3-C2 race.
    const d = decideActivation(at({
      subStatus: "trialing",
      cancelAtPeriodEnd: true,
      cancelledAtMs: T0902,
      flow: deriveFlow(lapsedTrialSub(), NOW),
      paymentCreatedAtMs: T0900,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
    expect(d.reason).toBe("paid_after_cancel");
  });

  // ── A2 guard pin: the OTHER flows must stay refused after a cancellation ──
  // If a later change widens the admitted set again, these fail.
  it("REFUSES renewal and trial_card_verification after a cancellation, whatever the timestamps", () => {
    for (const flow of ["renewal", "trial_card_verification"] as const) {
      const d = decideActivation(at({
        subStatus: "trialing",
        cancelAtPeriodEnd: true,
        cancelledAtMs: T0902,
        flow,
        paymentCreatedAtMs: T0905 - 30_000, // fresh AND after the cancel — still refused
        nowMs: T0905,
      }));
      expect(d.activate, `flow ${flow} must not activate a cancelled subscription`).toBe(false);
      expect(d.reason).toBe("paid_after_cancel");
    }
  });

  // ── The freshness bound ────────────────────────────────────────────────────

  it("REFUSES an immediate_charge created BEFORE the cancellation", () => {
    // This is the discriminator: in the race the payment predates the cancel.
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: T0902,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0900,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
    expect(d.reason).toBe("paid_after_cancel");
  });

  it("REFUSES an immediate_charge created exactly AT cancelled_at (boundary)", () => {
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: T0902,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0902,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
  });

  it("REFUSES a stale immediate_charge older than the 24h resubscribe window", () => {
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: null,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0905 - RESUBSCRIBE_WINDOW_MS - 1,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
  });

  it("ACTIVATES just inside the 24h resubscribe window (boundary)", () => {
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: null,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0905 - RESUBSCRIBE_WINDOW_MS + 1,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(true);
  });

  it("REFUSES when the payment timestamp is missing or unparseable (fail closed)", () => {
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: null,
      flow: "immediate_charge",
      paymentCreatedAtMs: null,
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
    expect(d.reason).toBe("paid_after_cancel");
  });

  it("tolerates small upstream clock skew but not large skew", () => {
    const within = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: null,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0905 + CLOCK_SKEW_TOLERANCE_MS - 1000,
      nowMs: T0905,
    }));
    expect(within.activate).toBe(true);

    const beyond = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: null,
      flow: "immediate_charge",
      paymentCreatedAtMs: T0905 + CLOCK_SKEW_TOLERANCE_MS + 1000,
      nowMs: T0905,
    }));
    expect(beyond.activate).toBe(false);
  });

  // ── The guard must not fire on healthy subscriptions ───────────────────────

  it("ACTIVATES every healthy (non-cancelled) combination", () => {
    const healthyStatuses = ["active", "trialing", "past_due", "pending_activation"];
    const flows = ["immediate_charge", "post_trial_first_charge", "renewal"] as const;
    for (const subStatus of healthyStatuses) {
      for (const flow of flows) {
        const d = decideActivation(at({
          subStatus,
          cancelAtPeriodEnd: false,
          cancelledAtMs: null,
          flow,
          // Deliberately unusable: a healthy row must never depend on it.
          paymentCreatedAtMs: null,
        }));
        expect(subStatus + "/" + flow + "=" + d.activate).toBe(subStatus + "/" + flow + "=true");
      }
    }
  });

  it("ACTIVATES when cancel_at_period_end is null/undefined (column absent)", () => {
    expect(decideActivation(at({ cancelAtPeriodEnd: null })).activate).toBe(true);
    expect(decideActivation(at({ cancelAtPeriodEnd: undefined })).activate).toBe(true);
  });

  it("REFUSES renewal on a cancelled row even when it is fresh", () => {
    // `renewal` is cron-only — no checkout derives it — and the renewal pass
    // filters `cancel_at_period_end = false`, so a renewal created after a
    // cancellation cannot legitimately exist. Refusing it is defence in depth.
    const d = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: T0902,
      flow: "renewal",
      paymentCreatedAtMs: T0905 - 1000, // fresh AND after the cancel — still refused
      nowMs: T0905,
    }));
    expect(d.activate).toBe(false);
  });

  it("post_trial_first_charge on a closed row is decided by the timestamp, not the flow", () => {
    // R4-CRITICAL-1. This case previously asserted a blanket refusal, which is
    // what charged a returning mid-trial canceller and then dead-lettered them.
    // The flow is admitted; the discriminator does the work. Both directions are
    // pinned here so neither can regress into the other.
    const predatesCancel = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: T0902,
      flow: "post_trial_first_charge",
      paymentCreatedAtMs: T0900, // the cron's charge, before the cancel
      nowMs: T0905,
    }));
    expect(predatesCancel.activate).toBe(false);
    expect(predatesCancel.reason).toBe("paid_after_cancel");

    const followsCancel = decideActivation(at({
      subStatus: "cancelled",
      cancelledAtMs: T0902,
      flow: "post_trial_first_charge",
      paymentCreatedAtMs: T0905 - 1000, // the customer's own checkout, after the cancel
      nowMs: T0905,
    }));
    expect(followsCancel.activate).toBe(true);
  });
});

describe("R3-C2 cancel-subscription — trialing cancellation is scheduled, not immediate", () => {
  // The handler body lives inside Deno's serve() with remote URL imports, so it
  // cannot be imported here (see the note above). These are SOURCE-CONTRACT
  // assertions: they cannot prove runtime behaviour, but they do fail loudly if
  // the immediate-cancel regression is reintroduced.
  const SRC = readFileSync(
    new URL("../../supabase/functions/cancel-subscription/index.ts", import.meta.url),
    "utf8",
  );

  it("never writes status = 'cancelled'", () => {
    expect(SRC).not.toMatch(/status:\s*["']cancelled["']/);
  });

  it("writes cancel_at_period_end = true and cancelled_at on the cancel path", () => {
    expect(SRC).toMatch(/cancel_at_period_end:\s*true/);
    expect(SRC).toMatch(/cancelled_at:\s*now/);
  });

  it("selects trial_end so access_until can report the trial horizon", () => {
    expect(SRC).toMatch(/\.select\(\s*["'][^"']*trial_end[^"']*["']\s*\)/);
  });

  it("reports access_until from trial_end for a trialing row", () => {
    expect(SRC).toMatch(/status\s*===\s*["']trialing["']/);
    expect(SRC).toMatch(/access_until:\s*accessUntil/);
  });

  it("keeps the response keys the frontend reads (Account.tsx)", () => {
    expect(SRC).toMatch(/cancelled_immediately/);
    expect(SRC).toMatch(/already_scheduled/);
    expect(SRC).toMatch(/access_until/);
  });

  it("no longer downgrades profiles.plan_type on cancel (access continues)", () => {
    expect(SRC).not.toMatch(/plan_type:\s*["']free["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R3-C1 — the seat RPC bypass, and H9 — trialChargeAuthorized fails closed.
// Appended 2026-08-23 (sub-agent A1). Do not reorder the blocks above.
// ─────────────────────────────────────────────────────────────────────────────

describe("R3-C1 — seat counts above MAX_BILLABLE_SEATS are rejected, not clamped-and-granted", () => {
  // The SQL side of this defect lives in
  // supabase/migrations/20260823000002_seat_rpc_hardening.sql, which cannot be
  // executed from this test runner. These assertions pin the TypeScript half of
  // the coupling: the SQL constant `c_max_billable_seats` MUST equal
  // MAX_BILLABLE_SEATS, so a change here is a change there.
  const OVER_CAP = 5000;

  it("MAX_BILLABLE_SEATS is 100 — the value the SQL cap must mirror", () => {
    expect(MAX_BILLABLE_SEATS).toBe(100);
    expect(OVER_CAP).toBeGreaterThan(MAX_BILLABLE_SEATS);
  });

  it("a payment claiming 5000 seats is refused outright by parsePaidPlanRef", () => {
    // Refused (null), never silently clamped to 100: a clamp would let the
    // webhook promote a seat count nobody paid for.
    expect(parsePaidPlanRef({ plan_id: "p", seat_count: OVER_CAP }).seat_count).toBeNull();
  });

  it("REGRESSION: a stored seat_count of 5000 can never price above the cap", () => {
    // Before the migration, update_subscription_seat_count would happily store
    // 5000. effectiveSeats is the only thing that stopped 5000 x 549.00 SAR
    // from being charged — and it does not stop seat ENFORCEMENT from granting
    // 5000 seats, which is why the cap had to move into SQL as well.
    expect(effectiveSeats(OFFICE, { seat_count: OVER_CAP })).toBe(MAX_BILLABLE_SEATS);
    expect(planPriceFor(OFFICE, { seat_count: OVER_CAP })).toBe(54900 * MAX_BILLABLE_SEATS);
  });
});

describe("H9 — trialChargeAuthorized fails CLOSED when the verification metadata is missing", () => {
  const ESCALATED_ROW = { plan_id: "enterprise-office-uuid", seat_count: 100 };

  it("REGRESSION: an escalated row with NO verification metadata is not authorized", () => {
    // The exploit this closes: the row was escalated to enterprise_office at
    // 100 seats, the verification payment carries no plan metadata, and the old
    // code returned authorized:true — arming an unattended charge of
    // 100 x 549.00 SAR on a card that was only ever verified for 1.00 SAR.
    for (const ref of [null, undefined, {}, { plan_id: null, seat_count: null }, { plan_id: "   ", seat_count: 100 }]) {
      const d = trialChargeAuthorized(ESCALATED_ROW, parsePaidPlanRef(ref));
      expect(d.authorized).toBe(false);
      expect(d.reason).toBe("no_verified_plan_metadata");
      // No clamp can be offered either: the historical plan is unknowable here.
      expect(d.clampedPlanId).toBeNull();
      expect(d.maxSeats).toBeNull();
    }
  });

  it("REGRESSION: the escalated amount is never the authorized amount", () => {
    const escalatedAmount = planPriceFor(OFFICE, ESCALATED_ROW); // 5,490,000 halalas
    expect(escalatedAmount).toBe(54900 * 100);

    const d = trialChargeAuthorized(ESCALATED_ROW, { plan_id: null, seat_count: null });
    // The caller (process-subscription-renewal) skips on !authorized, so the
    // amount actually charged is 0, not escalatedAmount.
    const charged = d.authorized ? escalatedAmount : 0;
    expect(charged).toBe(0);
    expect(charged).not.toBe(escalatedAmount);
  });

  it("still authorizes an exact plan + seat match, and now returns the clamp", () => {
    const d = trialChargeAuthorized(
      { plan_id: "office-uuid", seat_count: 5 },
      { plan_id: "office-uuid", seat_count: 5 },
    );
    expect(d.authorized).toBe(true);
    expect(d.reason).toBe("match");
    expect(d.clampedPlanId).toBe("office-uuid");
    expect(d.maxSeats).toBe(5);
  });

  it("still allows billing FEWER seats than verified, clamped to the verified count", () => {
    const d = trialChargeAuthorized(
      { plan_id: "office-uuid", seat_count: 3 },
      { plan_id: "office-uuid", seat_count: 5 },
    );
    expect(d.authorized).toBe(true);
    expect(d.maxSeats).toBe(5);
    // The caller prices with min(row seats, maxSeats) -> 3 seats, an undercharge.
    expect(Math.min(3, d.maxSeats!)).toBe(3);
  });

  it("still refuses a plan mismatch and a seat escalation, and names the verified reference", () => {
    const mismatch = trialChargeAuthorized(ESCALATED_ROW, { plan_id: "pro-uuid", seat_count: 1 });
    expect(mismatch.authorized).toBe(false);
    expect(mismatch.reason).toBe("plan_mismatch");
    expect(mismatch.clampedPlanId).toBe("pro-uuid");
    expect(mismatch.maxSeats).toBe(1);

    const escalation = trialChargeAuthorized(
      { plan_id: "office-uuid", seat_count: 100 },
      { plan_id: "office-uuid", seat_count: 5 },
    );
    expect(escalation.authorized).toBe(false);
    expect(escalation.reason).toBe("seat_escalation");
    expect(escalation.maxSeats).toBe(5);
  });

  it("refuses when there is no subscription row at all", () => {
    const d = trialChargeAuthorized(null, { plan_id: "p", seat_count: 1 });
    expect(d.authorized).toBe(false);
    expect(d.reason).toBe("no_subscription");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R3-C4 — EID50 had NO server-side window, so a campaign advertised as
// "valid only from 26 to 30 May 2026" was a permanent, repeatable 50% key to
// the Pro plan. `promoAmountFor` now enforces a window mirroring FOUNDING10;
// `promoAmountForValidation` (reached through `expectedAmountsFor`) stays
// window-free so a payment created just before the close is not stranded when
// its webhook lands just after.
// ─────────────────────────────────────────────────────────────────────────────

describe("R3-C4 — EID50 server-side window", () => {
  const IN_EID_WINDOW = EID50_WINDOW_START_MS + 1000;

  it("the window is the advertised 26-30 May 2026, anchored to Arabia Standard Time", () => {
    // Start inclusive: 26 May 2026 00:00 AST === 2026-05-25T21:00:00Z.
    expect(new Date(EID50_WINDOW_START_MS).toISOString()).toBe("2026-05-25T21:00:00.000Z");
    // End EXCLUSIVE: "to 30 May" includes the whole of the 30th, so the boundary
    // is the START of 31 May — 31 May 2026 00:00 AST === 2026-05-30T21:00:00Z.
    expect(new Date(EID50_WINDOW_END_MS).toISOString()).toBe("2026-05-30T21:00:00.000Z");
    // Exactly the 5 days the campaign copy promises.
    expect(EID50_WINDOW_END_MS - EID50_WINDOW_START_MS).toBe(5 * 86_400_000);
  });

  it("returns the discounted Pro price INSIDE the window", () => {
    expect(promoAmountFor(PRO, "EID50", IN_EID_WINDOW)).toBe(EID50_PRO_AMOUNT);
    expect(promoAmountFor(PRO, "EID50", IN_EID_WINDOW)).toBe(12250);
  });

  it("returns null OUTSIDE the window, on both sides", () => {
    expect(promoAmountFor(PRO, "EID50", EID50_WINDOW_START_MS - 1)).toBeNull();
    expect(promoAmountFor(PRO, "EID50", EID50_WINDOW_START_MS - 86_400_000)).toBeNull();
    expect(promoAmountFor(PRO, "EID50", EID50_WINDOW_END_MS)).toBeNull();
    expect(promoAmountFor(PRO, "EID50", EID50_WINDOW_END_MS + 86_400_000)).toBeNull();
  });

  it("boundaries: start inclusive, end exclusive — the same shape as FOUNDING10", () => {
    expect(promoAmountFor(PRO, "EID50", EID50_WINDOW_START_MS)).toBe(EID50_PRO_AMOUNT);
    expect(promoAmountFor(PRO, "EID50", EID50_WINDOW_END_MS - 1)).toBe(EID50_PRO_AMOUNT);
    expect(promoAmountFor(PRO, "EID50", EID50_WINDOW_END_MS)).toBeNull();
  });

  it("is refused on every non-pro plan even INSIDE the window", () => {
    expect(EID50_PLAN_SLUG).toBe("pro");
    expect(promoAmountFor(ENGINEER, "EID50", IN_EID_WINDOW)).toBeNull();
    expect(promoAmountFor(TEAM, "EID50", IN_EID_WINDOW)).toBeNull();
    expect(promoAmountFor(OFFICE, "EID50", IN_EID_WINDOW)).toBeNull();
    expect(promoAmountFor(null, "EID50", IN_EID_WINDOW)).toBeNull();
  });

  it("never discounts an enterprise plan at any seat count, inside or outside the window", () => {
    const inside = computeCharge(OFFICE, returningSub({ seat_count: 100 }), "EID50", 0, IN_EID_WINDOW);
    expect(inside.amount).toBe(54900 * 100);
    expect(inside.appliedPromo).toBeNull();

    const outside = computeCharge(OFFICE, returningSub({ seat_count: 100 }), "EID50", 0, NOW);
    expect(outside.amount).toBe(54900 * 100);
    expect(outside.appliedPromo).toBeNull();
  });

  it("computeCharge bills the full Pro price outside the window", () => {
    const d = computeCharge(PRO, returningSub(), "EID50", 0, EID50_WINDOW_END_MS + 1);
    expect(d.amount).toBe(24500);
    expect(d.appliedPromo).toBeNull();
    expect(d.purpose).toBe("immediate_charge");
  });

  it("computeCharge applies the promo purpose and description inside the window", () => {
    const d = computeCharge(PRO, returningSub(), "EID50", 0, IN_EID_WINDOW);
    expect(d.amount).toBe(EID50_PRO_AMOUNT);
    expect(d.appliedPromo).toBe("EID50");
    expect(d.purpose).toBe("eid50_first_month");
    expect(d.description.toLowerCase()).not.toContain("refund");
  });

  it("PINNED TO THE REAL CLOCK — EID50 is inert right now", () => {
    // No injected clock: this is the live production behaviour today. Before
    // R3-C4 this returned 12250 forever.
    expect(promoAmountFor(PRO, "EID50")).toBeNull();
    expect(computeCharge(PRO, returningSub(), "EID50").amount).toBe(24500);
    expect(computeCharge(PRO, returningSub(), "EID50").appliedPromo).toBeNull();
    // Sanity: the campaign really is in the past relative to the real clock.
    expect(Date.now()).toBeGreaterThan(EID50_WINDOW_END_MS);
  });

  it("webhook validation keeps the plan restriction but ignores the window", () => {
    // A payment created seconds before the window closed must still validate
    // when its webhook lands seconds after.
    const allowedPro = expectedAmountsFor(PRO, returningSub(), "immediate_charge", "EID50");
    expect(allowedPro).toContain(EID50_PRO_AMOUNT);
    expect(allowedPro).toContain(24500);
    // ...but the plan restriction is never relaxed, window or no window.
    expect(
      expectedAmountsFor(OFFICE, returningSub(), "immediate_charge", "EID50"),
    ).not.toContain(EID50_PRO_AMOUNT);
    expect(
      expectedAmountsFor(TEAM, returningSub(), "immediate_charge", "EID50"),
    ).not.toContain(EID50_PRO_AMOUNT);
  });

  it("promos are still ignored entirely outside an immediate charge", () => {
    // The shared fixtures are dated relative to NOW (August), so the trial_end
    // has to be re-anchored to the May window for these two flows to be real.
    const lapsedInWindow = lapsedTrialSub({
      trial_end: new Date(IN_EID_WINDOW - 86_400_000).toISOString(),
    });
    expect(computeCharge(PRO, trialingSub(), "EID50", 0, IN_EID_WINDOW).amount).toBe(100);
    expect(computeCharge(PRO, trialingSub(), "EID50", 0, IN_EID_WINDOW).appliedPromo).toBeNull();
    expect(computeCharge(PRO, lapsedInWindow, "EID50", 0, IN_EID_WINDOW).amount).toBe(24400);
    expect(computeCharge(PRO, lapsedInWindow, "EID50", 0, IN_EID_WINDOW).appliedPromo).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// moyasar-webhook hardening — H8 / M10 / M13 / M17 / L18 and the currency of
// the plan actually paid for. Appended 2026-08-23 (sub-agent A5).
// Do not reorder the blocks above.
//
// The pure decisions live in supabase/functions/_shared/webhookDecisions.ts for
// the reason stated at the top of that file: moyasar-webhook/index.ts imports
// remote "https://deno.land/..." URLs and calls serve() at module scope, so it
// cannot be imported by Vitest. What can only be pinned by reading the source
// text is marked SOURCE-CONTRACT below: those assertions cannot prove runtime
// behaviour, only that the shape has not regressed.
// ─────────────────────────────────────────────────────────────────────────────

import {
  decideExpectedAmount,
  decideTrialCancelClear,
  isDuplicateTransactionInsert,
  isOneLiveRowPerUserViolation,
  ONE_LIVE_ROW_CONSTRAINT,
  parseExpectedAmount,
  TRANSACTION_PAYMENT_ID_CONSTRAINT,
  type TrialCancelClearInput,
} from "../../supabase/functions/_shared/webhookDecisions.ts";

const WEBHOOK_SRC = readFileSync(
  new URL("../../supabase/functions/moyasar-webhook/index.ts", import.meta.url),
  "utf8",
);

describe("M17 — retirement of other live rows keys off the NAMED constraint", () => {
  const OTHER_CONSTRAINT_MESSAGE =
    'duplicate key value violates unique constraint "payment_transactions_moyasar_payment_id_key"';
  const THIS_CONSTRAINT_MESSAGE =
    `duplicate key value violates unique constraint "${ONE_LIVE_ROW_CONSTRAINT}"`;

  it("matches a 23505 whose message names user_subscriptions_one_live_row_per_user", () => {
    expect(isOneLiveRowPerUserViolation({ code: "23505", message: THIS_CONSTRAINT_MESSAGE })).toBe(true);
  });

  it("matches a 23505 whose `constraint` field names it", () => {
    expect(
      isOneLiveRowPerUserViolation({ code: "23505", constraint: ONE_LIVE_ROW_CONSTRAINT }),
    ).toBe(true);
  });

  it("matches when the name arrives in `details` instead of `message`", () => {
    expect(
      isOneLiveRowPerUserViolation({
        code: "23505",
        message: "duplicate key value",
        details: `Key (user_id)=(u1) already exists in ${ONE_LIVE_ROW_CONSTRAINT}.`,
      }),
    ).toBe(true);
  });

  it("REFUSES a 23505 raised by a DIFFERENT unique constraint", () => {
    // This is the whole point of M17: the retirement below EXPIRES the user's
    // other trialing / past_due rows. Running it for an unrelated collision
    // destroys live subscriptions for a reason that has nothing to do with them.
    expect(isOneLiveRowPerUserViolation({ code: "23505", message: OTHER_CONSTRAINT_MESSAGE })).toBe(false);
    expect(
      isOneLiveRowPerUserViolation({
        code: "23505",
        constraint: "payment_transactions_moyasar_payment_id_key",
      }),
    ).toBe(false);
  });

  it("REFUSES anything that is not SQLSTATE 23505", () => {
    for (const bad of [
      null,
      undefined,
      "23505",
      23505,
      {},
      { code: "PGRST204" },
      { code: "42703" },
      { code: "23503", message: "insert violates foreign key constraint" },
      new Error("boom"),
    ]) {
      expect(isOneLiveRowPerUserViolation(bad as any)).toBe(false);
    }
  });

  it("REFUSES a 23505 with no recoverable constraint name — the safe default is 'do not retire'", () => {
    // Fail-closed choice, stated explicitly: an unknown 23505 falls through to
    // the subscription_update_failed_on_paid path (dead letter + non-2xx), so
    // the payment is stranded LOUDLY instead of live rows being deleted
    // silently. Stranding is recoverable from the dead letter; deletion is not.
    expect(isOneLiveRowPerUserViolation({ code: "23505" })).toBe(false);
    expect(isOneLiveRowPerUserViolation({ code: "23505", message: "duplicate key value" })).toBe(false);
  });

  it("REGRESSION: the generic helper it replaced matched all of those", () => {
    // isUniqueViolationError stays in _shared/billing.ts and is still correct
    // for its own purpose — it is simply too broad to gate a destructive write.
    expect(isUniqueViolationError({ code: "23505", message: OTHER_CONSTRAINT_MESSAGE })).toBe(true);
    expect(isOneLiveRowPerUserViolation({ code: "23505", message: OTHER_CONSTRAINT_MESSAGE })).toBe(false);
  });

  it("SOURCE-CONTRACT: the webhook gates the retirement on the narrow predicate", () => {
    expect(WEBHOOK_SRC).toMatch(/isOneLiveRowPerUserViolation\(subUpdateError\)/);
    // The broad predicate must no longer be reachable in this function at all.
    expect(WEBHOOK_SRC).not.toMatch(/isUniqueViolationError\(/);
  });

  it("the two named-constraint predicates never answer for each other", () => {
    const thisOne = { code: "23505", constraint: ONE_LIVE_ROW_CONSTRAINT };
    const thatOne = { code: "23505", constraint: TRANSACTION_PAYMENT_ID_CONSTRAINT };
    expect(isOneLiveRowPerUserViolation(thisOne)).toBe(true);
    expect(isDuplicateTransactionInsert(thisOne)).toBe(false);
    expect(isDuplicateTransactionInsert(thatOne)).toBe(true);
    expect(isOneLiveRowPerUserViolation(thatOne)).toBe(false);
  });
});

describe("a concurrent delivery that already wrote the transaction row is not a write failure", () => {
  it("recognises the unique index on payment_transactions(moyasar_payment_id)", () => {
    // Confirmed present in docs/audits/schema-baseline-20260501/indexes.json:
    // CREATE UNIQUE INDEX payment_transactions_moyasar_payment_id_key ...
    expect(TRANSACTION_PAYMENT_ID_CONSTRAINT).toBe("payment_transactions_moyasar_payment_id_key");
    expect(
      isDuplicateTransactionInsert({
        code: "23505",
        message: `duplicate key value violates unique constraint "${TRANSACTION_PAYMENT_ID_CONSTRAINT}"`,
      }),
    ).toBe(true);
  });

  it("an unnamed or unrelated 23505 is still treated as a real write failure", () => {
    // Fail-closed and self-healing: it is dead-lettered with a non-2xx, and the
    // redelivery finds the row through `existingTx` and takes the update path.
    expect(isDuplicateTransactionInsert({ code: "23505" })).toBe(false);
    expect(isDuplicateTransactionInsert({ code: "23505", constraint: ONE_LIVE_ROW_CONSTRAINT })).toBe(false);
    expect(isDuplicateTransactionInsert({ code: "23503" })).toBe(false);
    expect(isDuplicateTransactionInsert(null)).toBe(false);
  });

  it("SOURCE-CONTRACT: it acks with 200 and files no dead letter", () => {
    const i = WEBHOOK_SRC.indexOf("isDuplicateTransactionInsert(txWriteError)");
    const j = WEBHOOK_SRC.indexOf('reason: "transaction_write_failed"');
    expect(i).toBeGreaterThan(-1);
    // The duplicate check runs BEFORE the fatal branch...
    expect(i).toBeLessThan(j);
    // ...and its own block ends where the fatal branch begins.
    const blockEnd = WEBHOOK_SRC.indexOf("if (txWriteError) {", i);
    expect(blockEnd).toBeGreaterThan(i);
    expect(blockEnd).toBeLessThan(j);
    const block = WEBHOOK_SRC.slice(i, blockEnd);
    expect(block).toMatch(/status: 200/);
    // ...and files nothing.
    expect(block).not.toMatch(/insertDeadLetter/);
  });
});

describe("M13 — metadata.expected_amount is validated against the RE-VERIFIED payment", () => {
  it("parseExpectedAmount is string-or-number tolerant (contract Section 7)", () => {
    expect(parseExpectedAmount(100)).toBe(100);
    expect(parseExpectedAmount("100")).toBe(100);
    expect(parseExpectedAmount("  24500  ")).toBe(24500);
    expect(parseExpectedAmount("100.0")).toBe(100);
    expect(parseExpectedAmount(0)).toBe(0);
  });

  it("parseExpectedAmount rejects everything that is not a whole non-negative amount", () => {
    for (const bad of [null, undefined, "", "   ", "abc", "1e", true, false, [], {}, 1.5, "1.5", -1, "-1", Number.NaN, Infinity]) {
      expect(parseExpectedAmount(bad as any)).toBeNull();
    }
    // Number([]) is 0 and Number(true) is 1 — a bare Number() coercion would
    // have invented an expectation out of those two.
    expect(parseExpectedAmount([] as any)).toBeNull();
    expect(parseExpectedAmount(true as any)).toBeNull();
  });

  it("skips LEGACY payments that carry no metadata.flow", () => {
    // Same fallback the flow derivation makes: a payment created before this
    // scheme has neither `flow` nor `expected_amount` and must not be stranded.
    const d = decideExpectedAmount({ rawFlow: undefined, rawExpectedAmount: undefined, verifiedAmount: 24500 });
    expect(d.ok).toBe(true);
    expect(d.reason).toBe("legacy_payment_no_flow_metadata");
  });

  it("accepts a payment whose expected_amount equals the re-verified amount", () => {
    expect(
      decideExpectedAmount({ rawFlow: "renewal", rawExpectedAmount: 24500, verifiedAmount: 24500 }),
    ).toEqual({ ok: true, reason: "match", expected: 24500 });
    // Moyasar may echo metadata values back as strings.
    expect(
      decideExpectedAmount({ rawFlow: "renewal", rawExpectedAmount: "24500", verifiedAmount: 24500 }),
    ).toEqual({ ok: true, reason: "match", expected: 24500 });
  });

  it("REFUSES a captured amount that is not the amount the server created the payment for", () => {
    const d = decideExpectedAmount({
      rawFlow: "immediate_charge",
      rawExpectedAmount: 24500,
      verifiedAmount: 1000,
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("expected_amount_mismatch");
  });

  it("REFUSES a present-flow payment with a missing or unusable expected_amount", () => {
    expect(
      decideExpectedAmount({ rawFlow: "renewal", rawExpectedAmount: undefined, verifiedAmount: 24500 }).reason,
    ).toBe("expected_amount_missing");
    expect(
      decideExpectedAmount({ rawFlow: "renewal", rawExpectedAmount: null, verifiedAmount: 24500 }).reason,
    ).toBe("expected_amount_missing");
    expect(
      decideExpectedAmount({ rawFlow: "renewal", rawExpectedAmount: "not-a-number", verifiedAmount: 24500 }).reason,
    ).toBe("expected_amount_unparseable");
  });

  it("REFUSES a non-numeric verified amount even when expected_amount parses", () => {
    expect(
      decideExpectedAmount({ rawFlow: "renewal", rawExpectedAmount: 24500, verifiedAmount: "24500" }).ok,
    ).toBe(false);
  });

  it("an empty or whitespace flow is treated as LEGACY, not as a present marker", () => {
    expect(decideExpectedAmount({ rawFlow: "", rawExpectedAmount: undefined, verifiedAmount: 1 }).ok).toBe(true);
    expect(decideExpectedAmount({ rawFlow: "   ", rawExpectedAmount: undefined, verifiedAmount: 1 }).ok).toBe(true);
  });

  it("is ADDITIVE to expectedAmountsFor, not a replacement", () => {
    // A payment created for 1000 and captured at 1000 passes the expected_amount
    // check, and is still refused by the plan-price check: the Pro plan was
    // never worth 1000 (FOUNDING10 aside, which is a separate allowed amount).
    expect(
      decideExpectedAmount({ rawFlow: "renewal", rawExpectedAmount: 1000, verifiedAmount: 1000 }).ok,
    ).toBe(true);
    expect(expectedAmountsFor(PRO, returningSub(), "renewal", null)).not.toContain(1000);
  });

  it("SOURCE-CONTRACT: the webhook reads expected_amount from the RE-VERIFIED payment only", () => {
    expect(WEBHOOK_SRC).toMatch(/rawExpectedAmount:\s*verifiedPayment\?\.metadata\?\.expected_amount/);
    expect(WEBHOOK_SRC).toMatch(/verifiedAmount:\s*verifiedPayment\?\.amount/);
    // Never from the webhook body.
    expect(WEBHOOK_SRC).not.toMatch(/payload\.metadata\?\.expected_amount/);
  });
});

describe("currency is validated against the plan actually PAID FOR", () => {
  it("SOURCE-CONTRACT: the currency check sits after the paid-plan resolution and before the amount check", () => {
    const idxPaidPlan = WEBHOOK_SRC.indexOf("const paidPlanRef = parsePaidPlanRef(");
    const idxSwitchedPlan = WEBHOOK_SRC.indexOf("paidPlanRow = switchedPlan;");
    const idxCurrency = WEBHOOK_SRC.indexOf("const expectedCurrency =");
    const idxAmount = WEBHOOK_SRC.indexOf("const allowedAmounts = expectedAmountsFor(");

    expect(idxPaidPlan).toBeGreaterThan(-1);
    expect(idxSwitchedPlan).toBeGreaterThan(-1);
    expect(idxCurrency).toBeGreaterThan(-1);
    expect(idxAmount).toBeGreaterThan(-1);

    // After the plan this payment actually bought is known...
    expect(idxCurrency).toBeGreaterThan(idxSwitchedPlan);
    // ...and before any comparison of integer halalas, which only means
    // something once the currency is known to match.
    expect(idxCurrency).toBeLessThan(idxAmount);
  });

  it("SOURCE-CONTRACT: it reads paidPlanRow first, then the stored plan, then SAR", () => {
    expect(WEBHOOK_SRC).toMatch(
      /const expectedCurrency =\s*\n?\s*paidPlanRow\?\.currency \|\| \(sub as any\)\?\.subscription_plans\?\.currency \|\| "SAR";/,
    );
    // The old shape read the stored plan and nothing else.
    expect(WEBHOOK_SRC).not.toMatch(/const planCurrency = \(sub as any\)\?\.subscription_plans\?\.currency/);
  });

  it("SOURCE-CONTRACT: the plan-switch select still carries the currency column", () => {
    // If `currency` were dropped from this select, paidPlanRow.currency would be
    // undefined and the check would silently fall back to the stored plan.
    expect(WEBHOOK_SRC).toMatch(/\.select\("id, slug, name_en, currency,[^"]*"\)/);
  });

  it("a currency mismatch is fail-closed: dead letter plus 200", () => {
    const idx = WEBHOOK_SRC.indexOf('reason: "verification_currency_mismatch"');
    expect(idx).toBeGreaterThan(-1);
    expect(WEBHOOK_SRC.slice(idx, idx + 400)).toMatch(/status: 200/);
  });
});

describe("H8 — dead letters are deduped on (charge_id, reason)", () => {
  const HELPER = WEBHOOK_SRC.slice(WEBHOOK_SRC.indexOf("async function insertDeadLetter("));

  it("SOURCE-CONTRACT: looks for an existing row on BOTH charge_id and reason before inserting", () => {
    const idxLookup = HELPER.indexOf('.from("webhook_dead_letters")');
    const idxInsert = HELPER.indexOf(".insert({");
    expect(idxLookup).toBeGreaterThan(-1);
    expect(idxInsert).toBeGreaterThan(idxLookup);
    expect(HELPER).toMatch(/\.eq\("charge_id", params\.paymentId\)/);
    expect(HELPER).toMatch(/\.eq\("reason", params\.reason\)/);
    // A hit returns before the insert — no second row for a redelivery.
    expect(HELPER.slice(0, idxInsert)).toMatch(/return;/);
  });

  it("SOURCE-CONTRACT: a lookup error falls through to the insert (a duplicate beats a lost letter)", () => {
    expect(HELPER).toMatch(/Dead-letter dedupe lookup failed — inserting anyway/);
  });

  it("SOURCE-CONTRACT: the whole helper — lookup included — stays inside one try/catch and never throws", () => {
    const idxTry = HELPER.indexOf("try {");
    const idxLookup = HELPER.indexOf('.select("id")');
    const idxCatch = HELPER.indexOf("} catch (err)");
    expect(idxTry).toBeGreaterThan(-1);
    expect(idxLookup).toBeGreaterThan(idxTry);
    expect(idxCatch).toBeGreaterThan(idxLookup);
    expect(HELPER).toMatch(/Promise<void>/);
  });

  it("SOURCE-CONTRACT: the dedupe is unbounded in time — no created_at window", () => {
    // A window would let a redelivery arriving after it write a second letter,
    // which is exactly the failure H8 exists to prevent. (charge_id, reason)
    // identifies a fact, not an occurrence.
    const upToInsert = HELPER.slice(0, HELPER.indexOf(".insert({"));
    expect(upToInsert).not.toMatch(/created_at/);
  });
});

describe("M10 — every return path is classified transient or permanent", () => {
  /** The text following a dead-letter reason, where its HTTP status is decided. */
  const after = (marker: string, span = 700): string => {
    const i = WEBHOOK_SRC.indexOf(marker);
    expect(i, `marker not found: ${marker}`).toBeGreaterThan(-1);
    return WEBHOOK_SRC.slice(i, i + span);
  };

  it("TRANSIENT: a payment_transactions write failure on any event is fatal (dead letter + non-2xx)", () => {
    // The hole this closes: the insert/update error was console.error'd and the
    // run continued into activation — money captured with no transaction row,
    // while priorPaidCount, the renewal idempotency guards,
    // has_captured_verification and the C3 retry cap all read that table.
    expect(after('reason: "transaction_write_failed"')).toMatch(/status: 500/);
    expect(WEBHOOK_SRC).toMatch(/if \(txWriteError\) \{/);
    // The retry that drops the optional Section 8 columns no longer discards
    // its own error.
    expect(WEBHOOK_SRC).toMatch(/txWriteError = retryTx\.error \?\? null;/);
  });

  it("TRANSIENT: the failed-event subscription re-read no longer swallows its error (L18)", () => {
    expect(WEBHOOK_SRC).toMatch(/const \{ data: subForFailure, error: subForFailureError \}/);
    expect(after('reason: "failure_lookup_error"')).toMatch(/status: 500/);
  });

  it("TRANSIENT: 401 / 403 / 408 / 429 from the Moyasar verification API are redelivered, not acked", () => {
    expect(WEBHOOK_SRC).toMatch(/verifyResponse\.status === 401/);
    expect(WEBHOOK_SRC).toMatch(/verifyResponse\.status === 429/);
    expect(after('reason: transientVerify', 900)).toMatch(/status: 500/);
  });

  it("TRANSIENT: an unparseable verification response is redelivered", () => {
    expect(after('reason: "verification_invalid_json"')).toMatch(/status: 500/);
  });

  it("PERMANENT: a decided refusal is acked with 200 and always leaves a dead letter", () => {
    for (const reason of [
      'reason: "verification_id_mismatch"',
      'reason: "verification_status_mismatch"',
      'reason: "verification_subscription_mismatch"',
      'reason: "verification_currency_mismatch"',
      'reason: "verification_amount_mismatch"',
      'reason: "verification_given_id_mismatch"',
      'reason: "subscription_not_found"',
      'reason: "missing_subscription_id"',
      'reason: "missing_payment_id"',
    ]) {
      expect(after(reason), reason).toMatch(/status: 200/);
    }
  });

  it("PERMANENT: expected_amount refusals are acked with 200", () => {
    const i = WEBHOOK_SRC.indexOf("reason: expectedAmountDecision.reason");
    expect(i).toBeGreaterThan(-1);
    expect(WEBHOOK_SRC.slice(i, i + 700)).toMatch(/status: 200/);
  });

  it("the verification 4xx split: transient first with 500, permanent ack with 200", () => {
    const i = WEBHOOK_SRC.indexOf(': "verification_api_error_4xx"');
    expect(i).toBeGreaterThan(-1);
    const tail = WEBHOOK_SRC.slice(i, i + 900);
    const idx500 = tail.indexOf("status: 500");
    const idx200 = tail.indexOf("status: 200");
    expect(idx500).toBeGreaterThan(-1);
    // The 200 is the fall-through for everything that is NOT 401/403/408/429.
    expect(idx200).toBeGreaterThan(idx500);
    expect(tail).toMatch(/if \(transientVerify\) \{/);
  });

  it("PERMANENT: an authenticated event with no payment id is acked and recorded, not retried", () => {
    // It used to return 400: Moyasar redelivered an event that can never be
    // processed, and ops had nothing to look at.
    const i = WEBHOOK_SRC.indexOf('reason: "missing_payment_id"');
    expect(i).toBeGreaterThan(-1);
    expect(WEBHOOK_SRC.slice(i - 900, i)).toMatch(/if \(!paymentId\)/);
    expect(WEBHOOK_SRC.slice(i, i + 400)).toMatch(/status: 200/);
  });

  it("UNCHANGED: paid_after_cancel stays 200 + dead letter, and its guard is untouched", () => {
    expect(after('reason: "paid_after_cancel"', 1400)).toMatch(/status: 200/);
    expect(WEBHOOK_SRC).toMatch(/const activation = decideActivation\(\{/);
    expect(WEBHOOK_SRC).toMatch(/if \(!activation\.activate\) \{/);
    expect(WEBHOOK_SRC).toMatch(/cancelAtPeriodEnd: \(sub as any\)\.cancel_at_period_end \?\? null,/);
  });

  it("UNCHANGED: a failed activation on a paid event stays dead letter + non-2xx", () => {
    expect(after('reason: "subscription_update_failed_on_paid"')).toMatch(/status: 500/);
  });

  it("the signature gate still answers 401 before any database call", () => {
    const idxSig = WEBHOOK_SRC.indexOf("computedSignature !== receivedSignature");
    const idxFirstDb = WEBHOOK_SRC.indexOf("adminClient");
    expect(idxSig).toBeGreaterThan(-1);
    expect(idxSig).toBeLessThan(idxFirstDb);
    expect(WEBHOOK_SRC.slice(idxSig, idxSig + 300)).toMatch(/status: 401/);
  });
});

describe("loop safety — a redelivered event repeats no side effect", () => {
  it("the transaction write is decided BEFORE any subscription mutation", () => {
    // So a redelivery after a write failure cannot find a half-applied state.
    const idxTxGuard = WEBHOOK_SRC.indexOf('reason: "transaction_write_failed"');
    const idxPaidBranch = WEBHOOK_SRC.indexOf('if (status === "paid") {');
    expect(idxTxGuard).toBeGreaterThan(-1);
    expect(idxTxGuard).toBeLessThan(idxPaidBranch);
  });

  it("the dunning email stays behind its atomic claim, so redelivery cannot re-send it", () => {
    const i = WEBHOOK_SRC.indexOf("dunning_notified_at: new Date().toISOString()");
    expect(i).toBeGreaterThan(-1);
    expect(WEBHOOK_SRC.slice(i, i + 300)).toMatch(/\.is\("dunning_notified_at", null\)/);
  });

  it("re-applying a captured payment stays bounded to Moyasar's 24h redelivery window", () => {
    expect(WEBHOOK_SRC).toMatch(/const REPROCESS_WINDOW_MS = 24 \* 60 \* 60 \* 1000;/);
    expect(RESUBSCRIBE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("resubscribing inside the trial withdraws the scheduled cancellation", () => {
  const T0900 = Date.parse("2026-08-23T09:00:00.000Z");
  const T0902 = Date.parse("2026-08-23T09:02:00.000Z");
  const T0905 = Date.parse("2026-08-23T09:05:00.000Z");

  const base: TrialCancelClearInput = {
    subStatus: "trialing",
    cancelAtPeriodEnd: true,
    cancelledAtMs: T0900,
    paymentCreatedAtMs: T0902,
    nowMs: T0905,
  };
  const at = (o: Partial<TrialCancelClearInput>): TrialCancelClearInput => ({ ...base, ...o });

  it("CLEARS for a fresh verification created AFTER the cancellation", () => {
    // The customer cancelled at 09:00 and checked out again at 09:02, paying a
    // second 1.00 SAR. Without the clear the conversion passes in
    // process-subscription-renewal (which filter cancel_at_period_end = false)
    // skip the row and the subscription still closes at trial_end.
    expect(decideTrialCancelClear(base)).toEqual({
      clear: true,
      reason: "resubscribed_after_cancel",
    });
  });

  it("REFUSES the 09:00 payment / 09:02 cancel / 09:05 webhook race", () => {
    const d = decideTrialCancelClear(at({ cancelledAtMs: T0902, paymentCreatedAtMs: T0900 }));
    expect(d.clear).toBe(false);
    expect(d.reason).toBe("payment_predates_cancel");
  });

  it("REFUSES a payment created exactly AT cancelled_at (boundary)", () => {
    expect(decideTrialCancelClear(at({ paymentCreatedAtMs: T0900 })).clear).toBe(false);
  });

  it("does nothing when there is no cancellation pending", () => {
    expect(decideTrialCancelClear(at({ cancelAtPeriodEnd: false }))).toEqual({
      clear: false,
      reason: "nothing_to_clear",
    });
    expect(decideTrialCancelClear(at({ cancelAtPeriodEnd: null })).reason).toBe("nothing_to_clear");
  });

  it("REFUSES on any row that is not trialing", () => {
    for (const s of ["active", "past_due", "cancelled", "expired", "pending_activation", null]) {
      expect(decideTrialCancelClear(at({ subStatus: s })).reason).toBe("not_trialing");
    }
  });

  it("fails CLOSED on unknown timestamps", () => {
    expect(decideTrialCancelClear(at({ paymentCreatedAtMs: null })).reason).toBe("unknown_payment_time");
    expect(decideTrialCancelClear(at({ cancelledAtMs: null })).reason).toBe("unknown_cancel_time");
  });

  it("REFUSES a stale payment older than the resubscribe window", () => {
    const d = decideTrialCancelClear(at({
      paymentCreatedAtMs: T0905 - RESUBSCRIBE_WINDOW_MS,
      cancelledAtMs: T0905 - RESUBSCRIBE_WINDOW_MS - 1000,
    }));
    expect(d.reason).toBe("stale_payment");
  });

  it("REFUSES an implausible future payment beyond the clock-skew tolerance", () => {
    const d = decideTrialCancelClear(at({
      paymentCreatedAtMs: T0905 + CLOCK_SKEW_TOLERANCE_MS + 1000,
    }));
    // R4-LOW-9: distinct from "stale_payment". A future-dated payment is a clock
    // or data fault, not an old one, and ops must not be sent hunting the wrong
    // cause. Pinned so the two reasons cannot be collapsed back together.
    expect(d.reason).toBe("future_dated_payment");
  });

  it("tolerates ordinary clock skew on an otherwise valid resubscribe", () => {
    const d = decideTrialCancelClear(at({
      paymentCreatedAtMs: T0905 + 60_000,
      cancelledAtMs: T0900,
    }));
    expect(d.clear).toBe(true);
  });

  it("SOURCE-CONTRACT: the clear happens ONLY in the trial_card_verification branch", () => {
    const idxTrialBranch = WEBHOOK_SRC.indexOf('if (flow === "trial_card_verification") {');
    const idxElse = WEBHOOK_SRC.indexOf("// immediate_charge / post_trial_first_charge / renewal — a real");
    const clears = [...WEBHOOK_SRC.matchAll(/updateData\.cancel_at_period_end = false;/g)].map((m) => m.index!);

    // Exactly two, and neither is unconditional:
    //   1. inside the trial branch, behind decideTrialCancelClear
    //   2. inside the activation branch, behind the R3-C2 decideActivation guard
    expect(clears).toHaveLength(2);
    expect(clears[0]).toBeGreaterThan(idxTrialBranch);
    expect(clears[0]).toBeLessThan(idxElse);
    expect(clears[1]).toBeGreaterThan(idxElse);

    expect(WEBHOOK_SRC.slice(idxTrialBranch, clears[0])).toMatch(/const trialCancelClear = decideTrialCancelClear\(\{/);
    expect(WEBHOOK_SRC.slice(idxTrialBranch, clears[0])).toMatch(/if \(trialCancelClear\.clear\) \{/);
  });

  it("SOURCE-CONTRACT: a refused clear leaves a deduped dead letter and still acks", () => {
    const i = WEBHOOK_SRC.indexOf('reason: "verification_paid_on_cancelled_trial"');
    expect(i).toBeGreaterThan(-1);
    // No early return: the card is still recorded and the event is acked by the
    // handler's normal 200 at the end.
    expect(WEBHOOK_SRC.slice(i, i + 900)).not.toMatch(/return new Response/);
    expect(WEBHOOK_SRC).toMatch(/trialCancelClear\.reason !== "nothing_to_clear"/);
  });
});
