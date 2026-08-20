/**
 * Payment-card utility tests.
 *
 * These cover the most sensitive user-entered data path in the app: PAN entry,
 * validation, and formatting. They use known test and synthetic card numbers
 * and must never call the real Moyasar token endpoint.
 */
import { describe, it, expect } from 'vitest';
import {
  luhnOk,
  formatCardNumber,
  validateCard,
  buildMoyasarTokenPayload,
  EMPTY_CARD,
  type CardForm,
} from '../lib/payment/card';

// ─── formatCardNumber ─────────────────────────────────────────────────────────

describe('formatCardNumber', () => {
  it('adds a space every four digits', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
  });

  it('strips non-digit characters and caps at 19 digits', () => {
    expect(formatCardNumber('4111-1111-1111-1111-1111-extra')).toBe('4111 1111 1111 1111 111');
  });

  it('returns an empty string for empty input', () => {
    expect(formatCardNumber('')).toBe('');
  });

  it('does not add a trailing space', () => {
    expect(formatCardNumber('4111')).toBe('4111');
    expect(formatCardNumber('41111')).toBe('4111 1');
  });
});

// ─── luhnOk ───────────────────────────────────────────────────────────────────

describe('luhnOk', () => {
  it('accepts the classic Visa test PAN 4111111111111111', () => {
    expect(luhnOk('4111111111111111')).toBe(true);
  });

  it('accepts a known-valid Mastercard test PAN 5555555555554444', () => {
    expect(luhnOk('5555555555554444')).toBe(true);
  });

  it('rejects a single-digit change to a valid PAN', () => {
    expect(luhnOk('4111111111111112')).toBe(false);
  });

  it('rejects strings shorter than 12 digits', () => {
    expect(luhnOk('41111111111')).toBe(false); // 11 digits, valid prefix length
  });

  it('rejects empty input', () => {
    expect(luhnOk('')).toBe(false);
  });

  it('rejects input with non-digit characters', () => {
    expect(luhnOk('4111a11111111111')).toBe(false);
  });
});

// ─── validateCard ─────────────────────────────────────────────────────────────

describe('validateCard', () => {
  const validCard: CardForm = {
    name: 'Test User',
    number: '4111 1111 1111 1111',
    month: '12',
    year: String(new Date().getFullYear() + 1),
    cvc: '123',
  };

  it('accepts a complete valid card', () => {
    expect(validateCard(validCard)).toEqual({ ok: true, errors: {} });
  });

  it('rejects a too-short cardholder name', () => {
    expect(validateCard({ ...validCard, name: 'A' })).toEqual({
      ok: false,
      errors: { name: true },
    });
  });

  it('rejects a whitespace-only name', () => {
    expect(validateCard({ ...validCard, name: '   ' })).toEqual({
      ok: false,
      errors: { name: true },
    });
  });

  it('rejects an invalid Luhn number', () => {
    const result = validateCard({ ...validCard, number: '4111 1111 1111 1112' });
    expect(result.ok).toBe(false);
    expect(result.errors.number).toBe(true);
  });

  it('rejects an expired card', () => {
    const lastYear = String(new Date().getFullYear() - 1);
    const result = validateCard({ ...validCard, year: lastYear });
    expect(result.ok).toBe(false);
    expect(result.errors.year).toBe(true);
  });

  it('rejects a card expiring this month', () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    const result = validateCard({ ...validCard, month, year });
    expect(result.ok).toBe(false);
    expect(result.errors.year).toBe(true);
  });

  it('accepts a two-digit year and expands it to 20YY', () => {
    // Validation logic internally converts two-digit years; we verify the card
    // passes when given a clearly-future two-digit year.
    const futureShort = String((new Date().getFullYear() + 5) % 100).padStart(2, '0');
    expect(validateCard({ ...validCard, year: futureShort }).ok).toBe(true);
  });

  it('rejects an out-of-range month', () => {
    const result = validateCard({ ...validCard, month: '13' });
    expect(result.ok).toBe(false);
    expect(result.errors.month).toBe(true);
  });

  it('rejects a two-digit CVC', () => {
    const result = validateCard({ ...validCard, cvc: '12' });
    expect(result.ok).toBe(false);
    expect(result.errors.cvc).toBe(true);
  });

  it('accepts a four-digit CVC (Amex)', () => {
    expect(validateCard({ ...validCard, cvc: '1234' }).ok).toBe(true);
  });

  it('rejects a five-digit CVC', () => {
    const result = validateCard({ ...validCard, cvc: '12345' });
    expect(result.ok).toBe(false);
    expect(result.errors.cvc).toBe(true);
  });

  it('reports multiple field errors at once', () => {
    const result = validateCard({
      ...EMPTY_CARD,
      name: '',
      number: 'abc',
      month: '99',
      year: '2020',
      cvc: '1',
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['cvc', 'month', 'name', 'number', 'year']);
  });
});

// ─── buildMoyasarTokenPayload ─────────────────────────────────────────────────

describe('buildMoyasarTokenPayload', () => {
  it('normalises card data into the shape Moyasar expects', () => {
    const payload = buildMoyasarTokenPayload(
      {
        name: '  Test User  ',
        number: '4111 1111 1111 1111',
        month: '3',
        year: '28',
        cvc: '123',
      },
      'pk_test_XXX'
    );

    expect(payload).toEqual({
      publishable_api_key: 'pk_test_XXX',
      save_only: true,
      name: 'Test User',
      number: '4111111111111111',
      month: '03',
      year: '2028',
      cvc: '123',
    });
  });

  it('passes through a four-digit year unchanged', () => {
    const payload = buildMoyasarTokenPayload(
      { ...EMPTY_CARD, year: '2027', month: '12', number: '4111111111111111', cvc: '123', name: 'X' },
      'pk_test_XXX'
    );
    expect(payload.year).toBe('2027');
  });
});
