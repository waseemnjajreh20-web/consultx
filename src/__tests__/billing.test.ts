/**
 * Contract tests for the shared billing arithmetic used by the Moyasar
 * edge functions.
 *
 * Source of truth: docs/launch/billing-contract-20260823.md
 *
 * Owner decisions encoded here:
 *   1. A card is required to start the free trial (1.00 SAR verification).
 *   2. No active trial  -> full plan price charged immediately.
 *   3. subscription_plans prices are VAT-INCLUSIVE (15% KSA VAT).
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
  isUndefinedColumnError,
  isInTrial,
  parseFlow,
  planPriceFor,
  promoAmountFor,
  splitVat,
  withoutKeys,
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
  price_amount: 24500, // 245.00 SAR incl. VAT
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

// ── splitVat ─────────────────────────────────────────────────────────────────

describe("splitVat", () => {
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

  it("records the VAT split of the verification charge", () => {
    const d = computeCharge(PRO, trialingSub(), null, 0, NOW);
    expect(d.base).toBe(87);
    expect(d.vat).toBe(13);
    expect(d.base + d.vat).toBe(d.amount);
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

  it("records the VAT split of the full price", () => {
    const d = computeCharge(PRO, returningSub(), null, 0, NOW);
    expect(d.base).toBe(21304);
    expect(d.vat).toBe(3196);
    expect(d.base + d.vat).toBe(24500);
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

  it("does not credit anything when no verification was ever stamped", () => {
    const d = computeCharge(PRO, lapsedTrialSub({ card_verified_at: null }), null, 0, NOW);
    expect(d.amount).toBe(24500);
    expect(d.verificationCredit).toBe(0);
  });

  it("deducts once from a per-seat first invoice", () => {
    const d = computeCharge(OFFICE, lapsedTrialSub({ seat_count: 5 }), null, 0, NOW);
    expect(d.amount).toBe(274400); // 274500 - 100
  });

  it("VAT-splits the discounted first invoice, not the list price", () => {
    const d = computeCharge(PRO, lapsedTrialSub(), null, 0, NOW);
    expect(d.base + d.vat).toBe(24400);
    expect(d.base).toBe(splitVat(24400).base);
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
    const payload = { amount: 100, amount_base: 87, amount_vat: 13, currency: "SAR" };
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
