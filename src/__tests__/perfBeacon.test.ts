/**
 * Tests for the RUM beacon's pure logic, on both sides of the wire:
 *   - src/lib/perfBeacon.ts (client): clampTimings, buildBeaconPayload
 *   - supabase/functions/perf-beacon/validate.ts (server): validateBeaconPayload,
 *     hashUserId, uaFamily, checkRateLimit
 *
 * Both modules are pure (no DOM, no Deno APIs beyond the Web Crypto API —
 * a genuine global under this repo's vitest/Node runtime, proven already by
 * retrievalCache.test.ts) and are imported and executed directly here — the
 * same cross-directory pattern src/__tests__/syntheticProbe.test.ts uses for
 * supabase/functions/synthetic-probe/logic.ts. This proves each module's own
 * logic; it does NOT prove anything about the live network transport
 * (sendBeacon/fetch) or the live insert into perf_events.
 */
import { describe, it, expect } from 'vitest';
import { buildBeaconPayload, clampTimings, type BeaconInput } from '../lib/perfBeacon';
import {
  validateBeaconPayload,
  hashUserId,
  uaFamily,
  checkRateLimit,
  MAX_STRING_LEN,
  MAX_EXTRA_BYTES,
  MAX_TIMING_MS,
} from '../../supabase/functions/perf-beacon/validate.ts';

// ============================================================
// Client: clampTimings
// ============================================================

describe('clampTimings', () => {
  it('rounds finite non-negative numbers', () => {
    const out = clampTimings({ headersMs: 120.6, firstStatusMs: 0, firstTextMs: 999.4, doneMs: 5000 });
    expect(out).toEqual({ headersMs: 121, firstStatusMs: 0, firstTextMs: 999, doneMs: 5000 });
  });

  it('nulls out missing fields', () => {
    expect(clampTimings({})).toEqual({ headersMs: null, firstStatusMs: null, firstTextMs: null, doneMs: null });
  });

  it('nulls out negative values', () => {
    expect(clampTimings({ doneMs: -1 }).doneMs).toBeNull();
  });

  it('nulls out non-finite values (NaN, Infinity)', () => {
    expect(clampTimings({ doneMs: NaN }).doneMs).toBeNull();
    expect(clampTimings({ doneMs: Infinity }).doneMs).toBeNull();
  });

  it('nulls out non-number types', () => {
    expect(clampTimings({ doneMs: '5000' as unknown as number }).doneMs).toBeNull();
    expect(clampTimings({ doneMs: null }).doneMs).toBeNull();
  });

  it('accepts a value exactly at the ceiling and rejects one past it', () => {
    const atCeiling = clampTimings({ doneMs: 10 * 60 * 1000 }).doneMs;
    const pastCeiling = clampTimings({ doneMs: 10 * 60 * 1000 + 1 }).doneMs;
    expect(atCeiling).toBe(10 * 60 * 1000);
    expect(pastCeiling).toBeNull();
  });
});

// ============================================================
// Client: buildBeaconPayload
// ============================================================

function chatInput(overrides: Partial<BeaconInput> = {}): BeaconInput {
  return { mode: 'primary', ok: true, ...overrides };
}

describe('buildBeaconPayload', () => {
  it('maps a full chat input to the exact wire field names', () => {
    const payload = buildBeaconPayload(
      chatInput({
        mode: 'standard',
        headersMs: 100,
        firstStatusMs: 300,
        firstTextMs: 800,
        doneMs: 4000,
        chars: 1200,
        sourcesCount: 3,
        engine: 'vector',
        fallbackReason: null,
        errorCode: null,
        ok: true,
      }),
    );
    expect(payload).toEqual({
      mode: 'standard',
      headers_ms: 100,
      first_status_ms: 300,
      first_text_ms: 800,
      done_ms: 4000,
      chars: 1200,
      sources_count: 3,
      engine: 'vector',
      fallback_reason: null,
      error_code: null,
      ok: true,
    });
  });

  it('falls back to "primary" for an invalid mode rather than passing it through', () => {
    const payload = buildBeaconPayload(chatInput({ mode: 'bogus' as unknown as BeaconInput['mode'] }));
    expect(payload.mode).toBe('primary');
  });

  it('accepts "page" as a valid mode', () => {
    expect(buildBeaconPayload(chatInput({ mode: 'page' })).mode).toBe('page');
  });

  it('coerces a non-true ok to false', () => {
    expect(buildBeaconPayload(chatInput({ ok: 'yes' as unknown as boolean })).ok).toBe(false);
  });

  it('truncates an over-length string field to 64 chars', () => {
    const long = 'x'.repeat(200);
    const payload = buildBeaconPayload(chatInput({ engine: long }));
    expect(payload.engine).toHaveLength(64);
    expect(payload.engine).toBe('x'.repeat(64));
  });

  it('nulls out an empty/whitespace-only string field', () => {
    expect(buildBeaconPayload(chatInput({ errorCode: '   ' })).error_code).toBeNull();
  });

  it('nulls out a negative chars/sourcesCount', () => {
    const payload = buildBeaconPayload(chatInput({ chars: -5, sourcesCount: -1 }));
    expect(payload.chars).toBeNull();
    expect(payload.sources_count).toBeNull();
  });
});

// ============================================================
// Server: validateBeaconPayload
// ============================================================

describe('validateBeaconPayload', () => {
  it('accepts a minimal valid payload', () => {
    const result = validateBeaconPayload({ mode: 'primary', ok: true });
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('primary');
    expect(result?.ok).toBe(true);
    expect(result?.headers_ms).toBeNull();
  });

  it('rejects a missing mode', () => {
    expect(validateBeaconPayload({ ok: true })).toBeNull();
  });

  it('rejects an unrecognised mode', () => {
    expect(validateBeaconPayload({ mode: 'admin', ok: true })).toBeNull();
  });

  it('rejects a non-object payload (null, array, string, number)', () => {
    expect(validateBeaconPayload(null)).toBeNull();
    expect(validateBeaconPayload([1, 2, 3])).toBeNull();
    expect(validateBeaconPayload('mode=primary')).toBeNull();
    expect(validateBeaconPayload(42)).toBeNull();
  });

  it('clamps numeric fields the same way the client does (independent server-side enforcement)', () => {
    const result = validateBeaconPayload({ mode: 'primary', ok: true, done_ms: -1, first_text_ms: MAX_TIMING_MS + 1, chars: 500 });
    expect(result?.done_ms).toBeNull();
    expect(result?.first_text_ms).toBeNull();
    expect(result?.chars).toBe(500);
  });

  it('truncates an over-length string field at MAX_STRING_LEN', () => {
    const result = validateBeaconPayload({ mode: 'primary', ok: true, engine: 'y'.repeat(500) });
    expect(result?.engine).toHaveLength(MAX_STRING_LEN);
  });

  it('ignores unknown top-level keys (e.g. access_token) without leaking them into the result', () => {
    const result = validateBeaconPayload({ mode: 'primary', ok: true, access_token: 'super-secret-jwt' });
    expect(result).not.toHaveProperty('access_token');
    expect(JSON.stringify(result)).not.toContain('super-secret-jwt');
  });

  it('passes through a small extra object as-is', () => {
    const result = validateBeaconPayload({ mode: 'page', ok: true, extra: { viewport: '1920x1080' } });
    expect(result?.extra).toEqual({ viewport: '1920x1080' });
  });

  it('drops an oversized extra object to {} rather than truncating it', () => {
    const huge = { blob: 'z'.repeat(MAX_EXTRA_BYTES + 100) };
    const result = validateBeaconPayload({ mode: 'page', ok: true, extra: huge });
    expect(result?.extra).toEqual({});
  });

  it('drops a non-object extra (array, string) to {}', () => {
    expect(validateBeaconPayload({ mode: 'page', ok: true, extra: [1, 2] })?.extra).toEqual({});
    expect(validateBeaconPayload({ mode: 'page', ok: true, extra: 'nope' })?.extra).toEqual({});
  });

  it('coerces ok to a strict boolean', () => {
    expect(validateBeaconPayload({ mode: 'primary', ok: 1 })?.ok).toBe(false);
    expect(validateBeaconPayload({ mode: 'primary', ok: 'true' })?.ok).toBe(false);
  });
});

// ============================================================
// Server: hashUserId
// ============================================================

describe('hashUserId', () => {
  it('returns exactly 12 lowercase hex characters', async () => {
    const hash = await hashUserId('11111111-1111-4111-8111-111111111111');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic for the same input', async () => {
    const a = await hashUserId('same-user-id');
    const b = await hashUserId('same-user-id');
    expect(a).toBe(b);
  });

  it('differs for different inputs', async () => {
    const a = await hashUserId('user-a');
    const b = await hashUserId('user-b');
    expect(a).not.toBe(b);
  });

  it('never simply echoes or embeds the raw id', async () => {
    const rawId = 'njajrehwaseem-user-id-1234';
    const hash = await hashUserId(rawId);
    expect(hash).not.toContain(rawId);
    expect(hash).not.toBe(rawId);
  });
});

// ============================================================
// Server: uaFamily
// ============================================================

describe('uaFamily', () => {
  it('classifies a real Chrome UA as Chrome (not Safari, despite containing "Safari/")', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    expect(uaFamily(ua)).toBe('Chrome');
  });

  it('classifies a real Safari UA as Safari (not Chrome)', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
    expect(uaFamily(ua)).toBe('Safari');
  });

  it('classifies Edge as Edge, not Chrome, despite containing "Chrome/"', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0';
    expect(uaFamily(ua)).toBe('Edge');
  });

  it('classifies Firefox as Firefox', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0';
    expect(uaFamily(ua)).toBe('Firefox');
  });

  it('returns "unknown" for a missing/empty UA', () => {
    expect(uaFamily(null)).toBe('unknown');
    expect(uaFamily(undefined)).toBe('unknown');
    expect(uaFamily('')).toBe('unknown');
  });

  it('returns "Other" for an unrecognised-but-present UA', () => {
    expect(uaFamily('SomeExoticBot/1.0')).toBe('Other');
  });
});

// ============================================================
// Server: checkRateLimit
// ============================================================

describe('checkRateLimit', () => {
  it('allows the first call and starts a new window', () => {
    const { allowed, next } = checkRateLimit(undefined, 1000);
    expect(allowed).toBe(true);
    expect(next).toEqual({ count: 1, windowStart: 1000 });
  });

  it('allows calls up to the max within the window', () => {
    let state = checkRateLimit(undefined, 0).next;
    for (let i = 2; i <= 30; i++) {
      const { allowed, next } = checkRateLimit(state, 100);
      expect(allowed).toBe(true);
      state = next;
    }
    expect(state.count).toBe(30);
  });

  it('blocks the call that exceeds the max within the window', () => {
    let state = checkRateLimit(undefined, 0).next;
    for (let i = 2; i <= 30; i++) state = checkRateLimit(state, 100).next;
    const { allowed } = checkRateLimit(state, 200);
    expect(allowed).toBe(false);
  });

  it('resets and allows again once the window has expired', () => {
    const state = { count: 30, windowStart: 0 };
    const { allowed, next } = checkRateLimit(state, 70_000); // > RATE_LIMIT_WINDOW_MS (60_000) later
    expect(allowed).toBe(true);
    expect(next).toEqual({ count: 1, windowStart: 70_000 });
  });
});
