/**
 * Tests for src/utils/audiencePref.ts
 *
 * Pure logic only — storage is injected via a small mock object so these
 * tests run under plain vitest with no jsdom / testing-library.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidAudiencePref,
  loadAudiencePref,
  saveAudiencePref,
  audienceBodyField,
  AUDIENCE_PREF_STORAGE_KEY,
  DEFAULT_AUDIENCE_PREF,
  type AudiencePref,
} from '../utils/audiencePref';

// Minimal injectable storage mock — implements only getItem/setItem.
function makeMockStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = value;
    },
  };
}

describe('DEFAULT_AUDIENCE_PREF', () => {
  it('defaults to engineer (byte-identical to pre-selector behavior)', () => {
    expect(DEFAULT_AUDIENCE_PREF).toBe('engineer');
  });
});

describe('isValidAudiencePref', () => {
  const valid: AudiencePref[] = ['engineer', 'decision_maker', 'project_owner', 'technician'];

  for (const v of valid) {
    it(`accepts "${v}"`, () => {
      expect(isValidAudiencePref(v)).toBe(true);
    });
  }

  it('rejects garbage strings', () => {
    expect(isValidAudiencePref('manager')).toBe(false);
    expect(isValidAudiencePref('')).toBe(false);
    expect(isValidAudiencePref('ENGINEER')).toBe(false); // case-sensitive
    expect(isValidAudiencePref('engineer ')).toBe(false); // no trimming
  });

  it('rejects non-string values', () => {
    expect(isValidAudiencePref(null)).toBe(false);
    expect(isValidAudiencePref(undefined)).toBe(false);
    expect(isValidAudiencePref(42)).toBe(false);
    expect(isValidAudiencePref({})).toBe(false);
    expect(isValidAudiencePref(['engineer'])).toBe(false);
  });
});

describe('loadAudiencePref', () => {
  it('defaults to engineer when storage is null (absent)', () => {
    expect(loadAudiencePref(null)).toBe('engineer');
  });

  it('defaults to engineer when storage is undefined (absent)', () => {
    expect(loadAudiencePref(undefined)).toBe('engineer');
  });

  it('defaults to engineer when the key is missing', () => {
    const storage = makeMockStorage();
    expect(loadAudiencePref(storage)).toBe('engineer');
  });

  it('defaults to engineer when the stored value is garbage', () => {
    const storage = makeMockStorage({ [AUDIENCE_PREF_STORAGE_KEY]: 'not-a-real-audience' });
    expect(loadAudiencePref(storage)).toBe('engineer');
  });

  it('defaults to engineer when the stored value is an empty string', () => {
    const storage = makeMockStorage({ [AUDIENCE_PREF_STORAGE_KEY]: '' });
    expect(loadAudiencePref(storage)).toBe('engineer');
  });

  it('returns the persisted value when valid', () => {
    const storage = makeMockStorage({ [AUDIENCE_PREF_STORAGE_KEY]: 'decision_maker' });
    expect(loadAudiencePref(storage)).toBe('decision_maker');
  });

  it('returns each valid persisted value unchanged', () => {
    for (const v of ['engineer', 'decision_maker', 'project_owner', 'technician'] as const) {
      const storage = makeMockStorage({ [AUDIENCE_PREF_STORAGE_KEY]: v });
      expect(loadAudiencePref(storage)).toBe(v);
    }
  });

  it('defaults to engineer when getItem throws', () => {
    const throwingStorage = {
      getItem(): string {
        throw new Error('storage disabled (private browsing)');
      },
    };
    expect(loadAudiencePref(throwingStorage)).toBe('engineer');
  });
});

describe('saveAudiencePref', () => {
  it('persists a valid value under the fixed storage key', () => {
    const storage = makeMockStorage();
    saveAudiencePref(storage, 'project_owner');
    expect(storage.store[AUDIENCE_PREF_STORAGE_KEY]).toBe('project_owner');
  });

  it('round-trips through loadAudiencePref', () => {
    const storage = makeMockStorage();
    saveAudiencePref(storage, 'technician');
    expect(loadAudiencePref(storage)).toBe('technician');
  });

  it('no-ops silently when storage is null', () => {
    expect(() => saveAudiencePref(null, 'engineer')).not.toThrow();
  });

  it('no-ops silently when storage is undefined', () => {
    expect(() => saveAudiencePref(undefined, 'engineer')).not.toThrow();
  });

  it('does not throw when setItem throws (e.g. quota exceeded)', () => {
    const throwingStorage = {
      setItem(): void {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveAudiencePref(throwingStorage, 'engineer')).not.toThrow();
  });
});

describe('audienceBodyField', () => {
  // The exact chat request body ChatInterface's streamChat() builds, minus the
  // audience fragment. Mirrors the key order at the fetch call site.
  const baseBody = {
    messages: [{ role: 'user', content: 'q' }],
    retry: false,
    mode: 'standard',
    language: 'ar',
    images: undefined,
    documentTexts: undefined,
    pageManifests: undefined,
    output_format: undefined,
    preferred_standards: undefined,
  };

  it('omits the field for the default audience (engineer)', () => {
    expect(audienceBodyField('engineer')).toEqual({});
    expect(audienceBodyField(DEFAULT_AUDIENCE_PREF)).toEqual({});
  });

  it('omits the field when the audience is absent', () => {
    expect(audienceBodyField(undefined)).toEqual({});
    expect(audienceBodyField(null)).toEqual({});
  });

  it('omits the field for an invalid audience (defensive)', () => {
    expect(audienceBodyField('manager' as AudiencePref)).toEqual({});
    expect(audienceBodyField('' as AudiencePref)).toEqual({});
  });

  it('emits the field for each non-default audience', () => {
    expect(audienceBodyField('decision_maker')).toEqual({ audience: 'decision_maker' });
    expect(audienceBodyField('project_owner')).toEqual({ audience: 'project_owner' });
    expect(audienceBodyField('technician')).toEqual({ audience: 'technician' });
  });

  it('never emits "engineer" as a value — the server contract expects its absence', () => {
    for (const v of ['engineer', undefined, null, 'garbage'] as unknown[]) {
      expect(audienceBodyField(v as AudiencePref).audience).toBeUndefined();
    }
  });

  // RELEASE-BLOCKING INVARIANT: with the default/absent audience the serialized
  // request body must be byte-identical to the body sent before the audience
  // selector existed.
  it('leaves the serialized body byte-identical for default/absent/invalid audience', () => {
    const baseline = JSON.stringify(baseBody);
    for (const v of [undefined, null, 'engineer', 'garbage'] as unknown[]) {
      const withField = JSON.stringify({ ...baseBody, ...audienceBodyField(v as AudiencePref) });
      expect(withField).toBe(baseline);
    }
  });

  it('appends audience as the LAST key for a non-default audience', () => {
    const serialized = JSON.stringify({ ...baseBody, ...audienceBodyField('technician') });
    const baseline = JSON.stringify(baseBody);
    // Same prefix as the baseline body, with exactly one key appended.
    expect(serialized.startsWith(baseline.slice(0, -1))).toBe(true);
    expect(serialized.endsWith(',"audience":"technician"}')).toBe(true);
    expect(Object.keys({ ...baseBody, ...audienceBodyField('technician') }).pop()).toBe('audience');
  });

  it('non-default values match the server AudienceRole union exactly', () => {
    // supabase/functions/fire-safety-chat/promptContract.ts:
    //   export type AudienceRole = "decision_maker" | "project_owner" | "technician";
    const serverAudienceRoles = ['decision_maker', 'project_owner', 'technician'];
    const clientNonDefault = (['engineer', 'decision_maker', 'project_owner', 'technician'] as AudiencePref[])
      .map((v) => audienceBodyField(v).audience)
      .filter((v): v is AudiencePref => v !== undefined);
    expect([...clientNonDefault].sort()).toEqual([...serverAudienceRoles].sort());
  });
});
