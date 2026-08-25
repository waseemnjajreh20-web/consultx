/**
 * Audience preference — pure logic (validate / load / persist / default).
 *
 * Deliberately has no browser dependency: storage access is injected via the
 * AudienceStorageReader / AudienceStorageWriter interfaces so this module can
 * be unit tested without jsdom or a real localStorage. Callers in the app
 * pass window.localStorage (or null when unavailable); tests pass a small
 * mock object or null/undefined to simulate storage being absent.
 */

export type AudiencePref = "engineer" | "decision_maker" | "project_owner" | "technician";

export const AUDIENCE_PREF_STORAGE_KEY = "cx_audience_pref";

/** Default audience — matches today's (pre-selector) behavior byte-for-byte. */
export const DEFAULT_AUDIENCE_PREF: AudiencePref = "engineer";

const VALID_AUDIENCE_PREFS: readonly AudiencePref[] = [
  "engineer",
  "decision_maker",
  "project_owner",
  "technician",
];

export function isValidAudiencePref(value: unknown): value is AudiencePref {
  return typeof value === "string" && (VALID_AUDIENCE_PREFS as readonly string[]).includes(value);
}

export interface AudienceStorageReader {
  getItem(key: string): string | null;
}

export interface AudienceStorageWriter {
  setItem(key: string, value: string): void;
}

/**
 * Reads and validates the persisted audience preference.
 * Falls back to the default (engineer) when storage is unavailable/absent,
 * empty, or holds an unrecognized ("garbage") value. Never throws.
 */
export function loadAudiencePref(storage: AudienceStorageReader | null | undefined): AudiencePref {
  if (!storage) return DEFAULT_AUDIENCE_PREF;
  try {
    const raw = storage.getItem(AUDIENCE_PREF_STORAGE_KEY);
    return isValidAudiencePref(raw) ? raw : DEFAULT_AUDIENCE_PREF;
  } catch {
    return DEFAULT_AUDIENCE_PREF;
  }
}

/**
 * Persists the audience preference. Silently no-ops when storage is
 * unavailable/absent or throws (e.g. private-browsing quota errors).
 */
export function saveAudiencePref(storage: AudienceStorageWriter | null | undefined, value: AudiencePref): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIENCE_PREF_STORAGE_KEY, value);
  } catch {
    // storage unavailable — preference simply won't persist this session
  }
}

/**
 * Chat-request-body fragment carrying the audience preference.
 *
 * Returns an EMPTY object for the default ("engineer") and for any
 * absent/invalid value, so spreading it as the last entry of the chat request
 * body leaves the serialized body byte-identical to the pre-selector body —
 * same keys, same order, no `audience` key at all. Only a valid non-default
 * audience contributes an `audience` key, and it is appended last.
 *
 * The non-default value set is exactly the server's AudienceRole union in
 * supabase/functions/fire-safety-chat/promptContract.ts; "engineer" is
 * expressed as the absence of the field, which is what that server contract
 * expects.
 */
export function audienceBodyField(
  audience: AudiencePref | null | undefined,
): { audience?: AudiencePref } {
  if (!isValidAudiencePref(audience) || audience === DEFAULT_AUDIENCE_PREF) return {};
  return { audience };
}
