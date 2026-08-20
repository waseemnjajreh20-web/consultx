/**
 * Regression tests for the centralized plan configuration.
 *
 * Covers: src/config/plans.ts
 *
 * BACKGROUND — the bug these guard against:
 * Every lookup table in PLAN_CONFIG (names/prices/tiers/limits/colors/upgradePaths)
 * was keyed in camelCase ("enterpriseTeam"), but every accessor takes a PlanSlug,
 * whose value is the snake_case database slug ("enterprise_team"). Each accessor
 * ends in `?? <free-plan fallback>`, so the failed lookups never threw — they
 * silently returned free-plan data for paying enterprise customers:
 *
 *   getPlanTier("enterprise_team")         -> 0     (should be 3)
 *   getDailyLimits("enterprise_team")      -> free limits (should be unlimited)
 *   getPlanMonthlyPrice("enterprise_team") -> 0     (should be 29900)
 *   planHasFeature("enterprise_team", ...) -> false (should be true)
 *
 * `enterprise_team` is actively sold via the EID50 campaign, so the structural
 * invariant below matters more than any single assertion: it fails for ANY slug
 * that is missing from ANY lookup table, rather than falling back to free.
 */
import { describe, it, expect } from 'vitest';
import {
  PLAN_CONFIG,
  getPlanName,
  getPlanTier,
  getDailyLimits,
  getSeatConfig,
  planHasFeature,
  getUpgradePaths,
  getPlanMonthlyPrice,
  getPlanYearlyPrice,
  getPlanColor,
  isHigherTier,
  isEnterprisePlan,
  isPaidPlan,
  getAllPlanSlugs,
  type PlanSlug,
} from '../config/plans';

const ALL_SLUGS = Object.values(PLAN_CONFIG.slugs) as PlanSlug[];

// ─── Structural invariant: every table is keyed by slug, not by config alias ──

describe('PLAN_CONFIG key integrity', () => {
  it.each(ALL_SLUGS)('slug "%s" is present in every lookup table', (slug) => {
    expect(PLAN_CONFIG.names.ar, 'names.ar').toHaveProperty(slug);
    expect(PLAN_CONFIG.names.en, 'names.en').toHaveProperty(slug);
    expect(PLAN_CONFIG.prices, 'prices').toHaveProperty(slug);
    expect(PLAN_CONFIG.tiers, 'tiers').toHaveProperty(slug);
    expect(PLAN_CONFIG.limits.dailyMessages, 'limits.dailyMessages').toHaveProperty(slug);
    expect(PLAN_CONFIG.limits.seats, 'limits.seats').toHaveProperty(slug);
    expect(PLAN_CONFIG.limits.features, 'limits.features').toHaveProperty(slug);
    expect(PLAN_CONFIG.upgradePaths, 'upgradePaths').toHaveProperty(slug);
    expect(PLAN_CONFIG.colors, 'colors').toHaveProperty(slug);
  });

  it('no lookup table contains a camelCase alias key', () => {
    const aliases = Object.keys(PLAN_CONFIG.slugs).filter(
      (k) => k !== PLAN_CONFIG.slugs[k as keyof typeof PLAN_CONFIG.slugs]
    );
    // Sanity: the aliases we are guarding against actually exist in the config.
    expect(aliases).toEqual(['enterpriseTeam', 'enterpriseOffice']);

    const tables = {
      'names.ar': PLAN_CONFIG.names.ar,
      'names.en': PLAN_CONFIG.names.en,
      prices: PLAN_CONFIG.prices,
      tiers: PLAN_CONFIG.tiers,
      'limits.dailyMessages': PLAN_CONFIG.limits.dailyMessages,
      'limits.seats': PLAN_CONFIG.limits.seats,
      'limits.features': PLAN_CONFIG.limits.features,
      upgradePaths: PLAN_CONFIG.upgradePaths,
      colors: PLAN_CONFIG.colors,
    };

    for (const [name, table] of Object.entries(tables)) {
      for (const alias of aliases) {
        expect(Object.keys(table), `${name} must not be keyed by "${alias}"`).not.toContain(alias);
      }
    }
  });

  it('upgradePaths values are real slugs, not aliases', () => {
    for (const [from, targets] of Object.entries(PLAN_CONFIG.upgradePaths)) {
      for (const target of targets as readonly string[]) {
        expect(ALL_SLUGS, `upgradePaths.${from} -> "${target}"`).toContain(target);
      }
    }
  });

  it('getAllPlanSlugs returns database slugs ordered by tier', () => {
    expect(getAllPlanSlugs()).toEqual([
      'free',
      'engineer',
      'pro',
      'enterprise',
      'enterprise_team',
      'enterprise_office',
      'owner',
    ]);
  });
});

// ─── No accessor may silently degrade a paid plan to free-plan data ───────────

describe('accessors never fall back to free-plan data for a paid plan', () => {
  const paidSlugs = ALL_SLUGS.filter((s) => s !== 'free' && s !== 'owner');

  it.each(paidSlugs)('"%s" resolves to real plan data', (slug) => {
    expect(getPlanTier(slug), 'tier must be above free').toBeGreaterThan(0);
    expect(getPlanMonthlyPrice(slug), 'monthly price must be non-zero').toBeGreaterThan(0);
    expect(getPlanYearlyPrice(slug), 'yearly price must be non-zero').toBeGreaterThan(0);
    expect(getPlanName(slug, 'ar'), 'ar name must not be the raw slug').not.toBe(slug);
    expect(getPlanName(slug, 'en'), 'en name must not be the raw slug').not.toBe(slug);
    expect(planHasFeature(slug, 'analysisMode'), 'paid plans include analysis mode').toBe(true);
    expect(isPaidPlan(slug)).toBe(true);
    expect(isHigherTier(slug, 'free'), 'must outrank free').toBe(true);
  });
});

// ─── Enterprise per-seat plans — the plans that were actually broken ──────────

describe('enterprise per-seat plans', () => {
  const perSeat: PlanSlug[] = ['enterprise_team', 'enterprise_office'];

  it.each(perSeat)('"%s" is recognised as an enterprise plan', (slug) => {
    expect(isEnterprisePlan(slug)).toBe(true);
  });

  it.each(perSeat)('"%s" has unlimited daily messages', (slug) => {
    expect(getDailyLimits(slug)).toEqual({ advisory: null, analysis: null });
  });

  it.each(perSeat)('"%s" exposes a real per-seat price', (slug) => {
    const seats = getSeatConfig(slug);
    expect(seats.pricePerSeat).not.toBeNull();
    expect(seats.pricePerSeat!).toBeGreaterThan(0);
    expect(seats.max).toBeGreaterThan(seats.min);
  });

  it.each(perSeat)('"%s" unlocks every enterprise feature', (slug) => {
    for (const feature of ['sso', 'auditLogs', 'customBranding', 'apiAccess'] as const) {
      expect(planHasFeature(slug, feature), feature).toBe(true);
    }
  });

  it.each(perSeat)('"%s" has a distinct plan colour, not the free fallback', (slug) => {
    expect(getPlanColor(slug)).not.toBe(PLAN_CONFIG.colors.free);
  });

  it('enterprise_team offers enterprise_office as an upgrade', () => {
    expect(getUpgradePaths('enterprise_team')).toContain('enterprise_office');
  });

  it('enterprise_office is the top paid plan — no further upgrades', () => {
    expect(getUpgradePaths('enterprise_office')).toEqual([]);
  });

  it('per-seat plans outrank pro', () => {
    expect(isHigherTier('enterprise_team', 'pro')).toBe(true);
    expect(isHigherTier('enterprise_office', 'pro')).toBe(true);
  });
});

// ─── Baseline behaviour that must stay intact ─────────────────────────────────

describe('free and owner plans', () => {
  it('free plan is not paid and not enterprise', () => {
    expect(isPaidPlan('free')).toBe(false);
    expect(isEnterprisePlan('free')).toBe(false);
    expect(getPlanTier('free')).toBe(0);
    expect(getPlanMonthlyPrice('free')).toBe(0);
  });

  it('owner outranks every other plan', () => {
    for (const slug of ALL_SLUGS.filter((s) => s !== 'owner')) {
      expect(isHigherTier('owner', slug), `owner vs ${slug}`).toBe(true);
    }
  });

  it('free plan has finite daily limits', () => {
    const limits = getDailyLimits('free');
    expect(limits.advisory).toBeGreaterThan(0);
    expect(limits.analysis).toBeGreaterThan(0);
  });
});
