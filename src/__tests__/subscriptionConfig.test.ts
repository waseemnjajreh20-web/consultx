/**
 * Tests for subscription status helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTION_CONFIG,
  isActiveStatus,
  isTerminalStatus,
  hasActiveAccess,
  type SubscriptionStatus,
} from '../config/subscription';

describe('isActiveStatus', () => {
  it('returns true for active', () => {
    expect(isActiveStatus('active')).toBe(true);
  });

  it('returns true for trialing', () => {
    expect(isActiveStatus('trialing')).toBe(true);
  });

  it('returns false for expired', () => {
    expect(isActiveStatus('expired')).toBe(false);
  });

  it('returns false for cancelled', () => {
    expect(isActiveStatus('cancelled')).toBe(false);
  });

  it('returns false for none', () => {
    expect(isActiveStatus('none')).toBe(false);
  });
});

describe('isTerminalStatus', () => {
  it('returns true for expired', () => {
    expect(isTerminalStatus('expired')).toBe(true);
  });

  it('returns true for cancelled', () => {
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  it('returns false for active', () => {
    expect(isTerminalStatus('active')).toBe(false);
  });
});

describe('hasActiveAccess', () => {
  it('returns true for paid_active', () => {
    expect(hasActiveAccess('paid_active')).toBe(true);
  });

  it('returns true for trial_active', () => {
    expect(hasActiveAccess('trial_active')).toBe(true);
  });

  it('returns true for enterprise', () => {
    expect(hasActiveAccess('enterprise')).toBe(true);
  });

  it('returns false for ineligible', () => {
    expect(hasActiveAccess('ineligible')).toBe(false);
  });

  it('returns false for expired trial', () => {
    expect(hasActiveAccess('trial_expired')).toBe(false);
  });
});

describe('SUBSCRIPTION_CONFIG shape', () => {
  it('covers every status used in SubscriptionStatus union', () => {
    const statuses: SubscriptionStatus[] = ['none', 'trialing', 'active', 'expired', 'cancelled', 'past_due'];
    for (const s of statuses) {
      expect(Object.values(SUBSCRIPTION_CONFIG.statuses)).toContain(s);
    }
  });

  it('dailyLimits has all required tiers', () => {
    expect(SUBSCRIPTION_CONFIG.dailyLimits.free.advisory).toBeGreaterThan(0);
    expect(SUBSCRIPTION_CONFIG.dailyLimits.trial.advisory).toBeGreaterThan(0);
    expect(SUBSCRIPTION_CONFIG.dailyLimits.paid.advisory).toBeGreaterThan(0);
  });
});
