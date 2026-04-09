/**
 * Regression tests for admin authorization helpers (src/utils/adminAuth.ts).
 *
 * Guards against:
 *   - Client-side admin gate bypasses via email case variations
 *   - Typosquatting / similar-looking email attacks
 *   - Null/undefined email inputs causing crashes
 *
 * Note: isAdminEmail() is the CLIENT-SIDE check only.
 * The authoritative server-side gate lives in admin-manage-user edge function.
 */
import { describe, it, expect } from 'vitest';
import { isAdminEmail, ADMIN_EMAILS } from '../utils/adminAuth';

describe('isAdminEmail', () => {
  it('returns true for all known admin emails (exact match)', () => {
    for (const email of ADMIN_EMAILS) {
      expect(isAdminEmail(email)).toBe(true);
    }
  });

  it('is case-insensitive — uppercase variant is recognised', () => {
    expect(isAdminEmail('NJAJREHWASEEM@GMAIL.COM')).toBe(true);
    expect(isAdminEmail('WASEEMNJAJREH20@GMAIL.COM')).toBe(true);
  });

  it('is case-insensitive — mixed-case variant is recognised', () => {
    expect(isAdminEmail('Njajrehwaseem@Gmail.Com')).toBe(true);
  });

  it('returns false for non-admin email', () => {
    expect(isAdminEmail('user@example.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAdminEmail('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAdminEmail(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('does not grant access to subdomain-appended email', () => {
    expect(isAdminEmail('njajrehwaseem@gmail.com.evil.com')).toBe(false);
  });

  it('does not grant access to email with admin address as prefix', () => {
    expect(isAdminEmail('njajrehwaseem@gmail.com@attacker.com')).toBe(false);
  });

  it('does not grant access to email with extra characters appended', () => {
    expect(isAdminEmail('njajrehwaseem@gmail.comm')).toBe(false);
    expect(isAdminEmail('njajrehwaseem+admin@gmail.com')).toBe(false);
  });

  it('ADMIN_EMAILS list has exactly the expected entries', () => {
    expect(ADMIN_EMAILS).toContain('njajrehwaseem@gmail.com');
    expect(ADMIN_EMAILS).toContain('waseemnjajreh20@gmail.com');
    expect(ADMIN_EMAILS.length).toBe(2);
  });
});
