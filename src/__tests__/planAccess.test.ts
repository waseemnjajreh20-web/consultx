/**
 * Regression tests for plan/mode access logic.
 *
 * Covers:
 *   - getUserActivePlan  (src/utils/planAccess.ts)
 *   - canAccessMode      (src/utils/planAccess.ts)
 *   - computeIsFreePlan  (src/utils/entitlementLogic.ts)
 *
 * These guard against regressions in the trial-mode conflict fix (93cd85c)
 * where hasPaidAccess took precedence over isTrialActive and resolvedTrialEnd
 * tracking was added to prevent stale closures.
 */
import { describe, it, expect } from 'vitest';
import { getUserActivePlan, canAccessMode } from '../utils/planAccess';
import { computeIsFreePlan } from '../utils/entitlementLogic';

// ─── getUserActivePlan ───────────────────────────────────────────────────────

describe('getUserActivePlan', () => {
  it('returns "free" for null profile', () => {
    expect(getUserActivePlan(null)).toBe('free');
  });

  it('returns "free" for undefined profile', () => {
    expect(getUserActivePlan(undefined)).toBe('free');
  });

  it('returns paid plan_type when subscription is active', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(getUserActivePlan({ subscription_end: future, plan_type: 'engineer' })).toBe('engineer');
  });

  it('returns plan_type even when subscription_end is in the past (no built-in expiry fallback)', () => {
    // getUserActivePlan returns the nominal plan_type when no active window exists.
    // Access enforcement (expired → free tier) is the job of check-subscription edge fn + useEntitlement.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(getUserActivePlan({ subscription_end: past, plan_type: 'engineer' })).toBe('engineer');
  });

  it('returns "engineer" for active launch_engineer trial', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(getUserActivePlan({
      trial_end: future,
      trial_type: 'launch_engineer',
      plan_type: 'engineer',
    })).toBe('engineer');
  });

  it('returns plan_type even when trial_end is in the past (no built-in expiry fallback)', () => {
    // Same as subscription expiry — nominal plan_type is returned; expiry gating is server-side.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(getUserActivePlan({
      trial_end: past,
      trial_type: 'launch_engineer',
      plan_type: 'engineer',
    })).toBe('engineer');
  });

  it('paid subscription takes precedence over expired trial', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(getUserActivePlan({
      subscription_end: future,
      plan_type: 'engineer',
      trial_end: past,
    })).toBe('engineer');
  });
});

// ─── canAccessMode ───────────────────────────────────────────────────────────

describe('canAccessMode', () => {
  it('primary mode is always accessible on free plan', () => {
    expect(canAccessMode('free', 'primary')).toBe(true);
  });

  it('main and رئيسي are treated as primary (always accessible)', () => {
    expect(canAccessMode('free', 'main')).toBe(true);
    expect(canAccessMode('free', 'رئيسي')).toBe(true);
  });

  it('standard mode is locked for free plan without trial', () => {
    expect(canAccessMode('free', 'standard')).toBe(false);
  });

  it('analysis mode is locked for free plan without trial', () => {
    expect(canAccessMode('free', 'analysis')).toBe(false);
  });

  it('engineer plan unlocks standard mode', () => {
    expect(canAccessMode('engineer', 'standard')).toBe(true);
  });

  it('engineer plan unlocks analysis mode', () => {
    expect(canAccessMode('engineer', 'analysis')).toBe(true);
  });

  it('enterprise plan unlocks all modes', () => {
    expect(canAccessMode('enterprise', 'standard')).toBe(true);
    expect(canAccessMode('enterprise', 'analysis')).toBe(true);
  });

  it('launch trial (launchTrialActive=true) unlocks standard mode', () => {
    expect(canAccessMode('free', 'standard', true)).toBe(true);
  });

  it('launch trial (launchTrialActive=true) unlocks analysis mode', () => {
    expect(canAccessMode('free', 'analysis', true)).toBe(true);
  });

  it('launchTrialActive=false does not unlock standard on free plan', () => {
    expect(canAccessMode('free', 'standard', false)).toBe(false);
  });
});

// ─── computeIsFreePlan ───────────────────────────────────────────────────────

describe('computeIsFreePlan', () => {
  it('returns true for authenticated user with no paid/trial access', () => {
    expect(computeIsFreePlan({
      isLoading: false,
      hasUser: true,
      isAdmin: false,
      isPaidActive: false,
      isTrialActive: false,
    })).toBe(true);
  });

  it('returns false while still loading', () => {
    expect(computeIsFreePlan({
      isLoading: true,
      hasUser: true,
      isAdmin: false,
      isPaidActive: false,
      isTrialActive: false,
    })).toBe(false);
  });

  it('returns false for unauthenticated user (no user)', () => {
    expect(computeIsFreePlan({
      isLoading: false,
      hasUser: false,
      isAdmin: false,
      isPaidActive: false,
      isTrialActive: false,
    })).toBe(false);
  });

  it('returns false for admin user — admins bypass free-plan logic', () => {
    expect(computeIsFreePlan({
      isLoading: false,
      hasUser: true,
      isAdmin: true,
      isPaidActive: false,
      isTrialActive: false,
    })).toBe(false);
  });

  it('returns false when user has an active paid subscription', () => {
    expect(computeIsFreePlan({
      isLoading: false,
      hasUser: true,
      isAdmin: false,
      isPaidActive: true,
      isTrialActive: false,
    })).toBe(false);
  });

  it('returns false when user has an active trial — trial is not free-plan', () => {
    expect(computeIsFreePlan({
      isLoading: false,
      hasUser: true,
      isAdmin: false,
      isPaidActive: false,
      isTrialActive: true,
    })).toBe(false);
  });

  it('returns false when both paid and trial are active (paid takes precedence)', () => {
    expect(computeIsFreePlan({
      isLoading: false,
      hasUser: true,
      isAdmin: false,
      isPaidActive: true,
      isTrialActive: true,
    })).toBe(false);
  });
});
