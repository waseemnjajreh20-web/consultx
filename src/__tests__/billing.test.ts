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
    const d = computeCharge(PRO, returningSub(), "EID50", 0, NOW);
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
    expect(promoAmountFor(PRO, "  eid50  ", IN_WINDOW)).toBe(EID50_PRO_AMOUNT);
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

  it("allows a legacy payment that carries no plan metadata", () => {
    for (const ref of [null, undefined, { plan_id: null, seat_count: null }]) {
      const d = trialChargeAuthorized({ plan_id: "p", seat_count: 1 }, ref as any);
      expect(d.authorized).toBe(true);
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
