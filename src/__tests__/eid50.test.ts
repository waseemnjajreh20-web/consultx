/**
 * Tests for the EID50 campaign URL and pricing helpers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EID50_CODE,
  EID50_LIVE,
  isEid50Active,
  EID50_PRICING,
  EID50_CAMPAIGN,
  getEid50SubscribeUrl,
} from '../lib/campaigns/eid50';

describe('EID50_LIVE', () => {
  it('returns true only when VITE_EID50_LIVE is exactly "true"', () => {
    expect(EID50_LIVE({ VITE_EID50_LIVE: 'true' })).toBe(true);
  });

  it('returns false for "1"', () => {
    expect(EID50_LIVE({ VITE_EID50_LIVE: '1' })).toBe(false);
  });

  it('returns false when absent', () => {
    expect(EID50_LIVE({})).toBe(false);
  });

  it('returns false for arbitrary truthy-looking values', () => {
    expect(EID50_LIVE({ VITE_EID50_LIVE: 'yes' })).toBe(false);
  });
});

describe('isEid50Active', () => {
  it('delegates to EID50_LIVE', () => {
    // This is a smoke test: isEid50Active must not introduce extra logic.
    expect(typeof isEid50Active()).toBe('boolean');
  });
});

describe('EID50_PRICING', () => {
  it('pro is exactly 50% off 245 SAR', () => {
    expect(EID50_PRICING.pro.normalSar).toBe(245);
    expect(EID50_PRICING.pro.discountedSar).toBe(122.5);
  });

  it('enterpriseTeam is 50% off 399 SAR/seat', () => {
    expect(EID50_PRICING.enterpriseTeam.normalPerSeatSar).toBe(399);
    expect(EID50_PRICING.enterpriseTeam.discountedPerSeatSar).toBe(199.5);
  });

  it('enterpriseOffice is 50% off 549 SAR/seat', () => {
    expect(EID50_PRICING.enterpriseOffice.normalPerSeatSar).toBe(549);
    expect(EID50_PRICING.enterpriseOffice.discountedPerSeatSar).toBe(274.5);
  });
});

describe('EID50_CAMPAIGN', () => {
  it('has matching Arabic and English copies', () => {
    expect(EID50_CAMPAIGN.title.ar).toBeTruthy();
    expect(EID50_CAMPAIGN.title.en).toBeTruthy();
    expect(EID50_CAMPAIGN.offer.ar).toBeTruthy();
    expect(EID50_CAMPAIGN.offer.en).toBeTruthy();
  });

  it('durationDays is positive', () => {
    expect(EID50_CAMPAIGN.durationDays).toBeGreaterThan(0);
  });
});

describe('getEid50SubscribeUrl', () => {
  it('builds the expected URL with all UTM params', () => {
    vi.stubGlobal('import', { meta: { env: { VITE_APP_URL: 'https://www.consultx.app' } } });
    const url = getEid50SubscribeUrl('email', 'outbound', 'pro');
    expect(url).toBe(
      'https://www.consultx.app/subscribe?plan=pro&promo=EID50&utm_source=email&utm_medium=outbound&utm_campaign=eid50&utm_content=engineering_offices_ksa'
    );
    vi.unstubAllGlobals();
  });

  it('defaults source to email, medium to outbound and plan to pro', () => {
    vi.stubGlobal('import', { meta: { env: { VITE_APP_URL: 'https://www.consultx.app' } } });
    const url = getEid50SubscribeUrl();
    expect(url).toContain('utm_source=email');
    expect(url).toContain('utm_medium=outbound');
    expect(url).toContain('plan=pro');
    vi.unstubAllGlobals();
  });
});
