/**
 * Regression tests for parseSwitchMarker (src/utils/chatRouting.ts).
 *
 * This mirrors the hasSwitchMarker() logic in ChatInterface.tsx.
 * These tests guard against the mode-switching regression where
 * [SWITCH:...] tokens leaked to rendered content or triggered retry bubbles.
 *
 * Related fix: faacaec (prevent retry bubble on intentional mode switch)
 */
import { describe, it, expect } from 'vitest';
import { parseSwitchMarker } from '../utils/chatRouting';

describe('parseSwitchMarker', () => {
  it('returns found=false for plain content with no switch token', () => {
    const result = parseSwitchMarker('Here is the compliance requirement for your system.');
    expect(result.found).toBe(false);
    expect(result.targetMode).toBeNull();
    expect(result.cleanContent).toBe('Here is the compliance requirement for your system.');
  });

  it('returns found=false for empty string', () => {
    const result = parseSwitchMarker('');
    expect(result.found).toBe(false);
    expect(result.targetMode).toBeNull();
    expect(result.cleanContent).toBe('');
  });

  it('detects [SWITCH:استشاري] and maps to standard mode', () => {
    const result = parseSwitchMarker('Forwarding to Advisory mode. [SWITCH:استشاري]');
    expect(result.found).toBe(true);
    expect(result.targetMode).toBe('standard');
  });

  it('detects [SWITCH:تحليلي] and maps to analysis mode', () => {
    const result = parseSwitchMarker('Forwarding to Analysis mode. [SWITCH:تحليلي]');
    expect(result.found).toBe(true);
    expect(result.targetMode).toBe('analysis');
  });

  it('strips the switch token — cleanContent must not contain [SWITCH:', () => {
    const result = parseSwitchMarker('Some answer. [SWITCH:استشاري]');
    expect(result.cleanContent).not.toContain('[SWITCH:');
    expect(result.cleanContent).not.toContain('استشاري]');
  });

  it('strips the token from mid-string position', () => {
    const result = parseSwitchMarker('Before [SWITCH:تحليلي] after');
    expect(result.cleanContent).not.toContain('[SWITCH:');
    expect(result.cleanContent.trim().length).toBeGreaterThan(0);
  });

  it('is idempotent — two calls with same input return identical results', () => {
    const input = 'Transfer this query. [SWITCH:تحليلي]';
    const r1 = parseSwitchMarker(input);
    const r2 = parseSwitchMarker(input);
    expect(r1).toEqual(r2);
  });

  it('does not mutate the input string', () => {
    const input = 'Test [SWITCH:استشاري]';
    parseSwitchMarker(input);
    expect(input).toBe('Test [SWITCH:استشاري]');
  });

  it('does not match partial or malformed tokens', () => {
    const result = parseSwitchMarker('[SWITCH:invalid]');
    expect(result.found).toBe(false);
  });

  it('content without switch token returns cleanContent equal to input', () => {
    const input = 'Normal compliance answer with no routing.';
    const result = parseSwitchMarker(input);
    expect(result.cleanContent).toBe(input);
  });
});
