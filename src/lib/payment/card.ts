/**
 * Pure card validation utilities for the Moyasar payment flow.
 *
 * Keep this module free of React/browser assumptions so it can be exercised
 * in unit tests with real and test PANs. Never log or persist raw card data.
 */

export interface CardForm {
  name: string;
  number: string;
  month: string;
  year: string;
  cvc: string;
}

export type CardFieldErrors = Partial<Record<keyof CardForm, true>>;

export const EMPTY_CARD: CardForm = { name: "", number: "", month: "", year: "", cvc: "" };

/** Luhn check on digits only. Also enforces a minimum length of 12 digits. */
export const luhnOk = (digits: string): boolean => {
  if (digits.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

/** Format a raw card number into spaced groups of 4, capped at 19 digits. */
export const formatCardNumber = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
};

interface ValidateCardResult {
  ok: boolean;
  errors: CardFieldErrors;
}

/** Validate the full card form. Returns field-level errors if invalid. */
export const validateCard = (card: CardForm): ValidateCardResult => {
  const errors: CardFieldErrors = {};
  const numberDigits = card.number.replace(/\D/g, "");

  if (card.name.trim().length < 2) errors.name = true;
  if (!luhnOk(numberDigits)) errors.number = true;

  const monthN = parseInt(card.month, 10);
  if (!Number.isFinite(monthN) || monthN < 1 || monthN > 12) errors.month = true;

  const yearN = parseInt(card.year, 10);
  const fullYear = card.year.length === 2 ? 2000 + yearN : yearN;
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  if (!Number.isFinite(yearN) || fullYear < thisYear || fullYear > thisYear + 20) {
    errors.year = true;
  } else if (fullYear === thisYear && monthN <= thisMonth) {
    errors.year = true;
  }

  if (!/^\d{3,4}$/.test(card.cvc)) errors.cvc = true;

  return { ok: Object.keys(errors).length === 0, errors };
};

/** Build the payload sent to Moyasar's token endpoint. */
export const buildMoyasarTokenPayload = (
  card: CardForm,
  publishableApiKey: string
): Record<string, string | boolean> => {
  const numberDigits = card.number.replace(/\D/g, "");
  const month = card.month.padStart(2, "0");
  const year = card.year.length === 2 ? `20${card.year}` : card.year;
  return {
    publishable_api_key: publishableApiKey,
    save_only: true,
    name: card.name.trim(),
    number: numberDigits,
    month,
    year,
    cvc: card.cvc,
  };
};
