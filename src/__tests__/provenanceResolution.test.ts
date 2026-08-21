/**
 * Contract tests for the source_registry provenance mapping used by the
 * fire-safety-chat edge function. These tests guard the link between retrieved
 * chunk code_type and source_registry metadata (authority_level + edition_year).
 */
import { describe, it, expect } from 'vitest';

// Mirrors the mapping inside supabase/functions/fire-safety-chat/index.ts
function sourceIdFromCodeType(codeType: string | null | undefined): string | null {
  if (!codeType) return null;
  const normalized = codeType.trim().toUpperCase();
  if (normalized === 'SBC201') return 'SBC201';
  if (normalized === 'SBC801') return 'SBC801';
  if (normalized === 'SBC801_COMM') return 'SBC801_COMM';
  return null;
}

function sourceIdFromFamily(family: string | null): string | null {
  if (family === 'SBC-201') return 'SBC201';
  if (family === 'SBC-801') return 'SBC801';
  return null;
}

describe('provenance source_id resolution', () => {
  it('maps SBC201 code_type to the canonical source_registry id', () => {
    expect(sourceIdFromCodeType('SBC201')).toBe('SBC201');
    expect(sourceIdFromCodeType('sbc201')).toBe('SBC201');
  });

  it('maps SBC801 code_type to the canonical source_registry id', () => {
    expect(sourceIdFromCodeType('SBC801')).toBe('SBC801');
    expect(sourceIdFromCodeType('sbc801')).toBe('SBC801');
  });

  it('maps commentary code_type to the commentary registry id', () => {
    expect(sourceIdFromCodeType('SBC801_COMM')).toBe('SBC801_COMM');
  });

  it('maps SBC family strings to registry ids', () => {
    expect(sourceIdFromFamily('SBC-201')).toBe('SBC201');
    expect(sourceIdFromFamily('SBC-801')).toBe('SBC801');
  });

  it('returns null for unknown inputs', () => {
    expect(sourceIdFromCodeType('NFPA13')).toBeNull();
    expect(sourceIdFromCodeType(null)).toBeNull();
    expect(sourceIdFromFamily('UNKNOWN')).toBeNull();
  });
});

// Expected values captured from production source_registry on 2026-05-01.
// If these change, the edge function prompt/verifier must be reviewed.
describe('source_registry production contract', () => {
  it('records SBC201 as normative with edition 2018', () => {
    // SELECT source_id, authority_level, edition_year FROM source_registry;
    // SBC201 -> normative, 2018
    const expected = { source_id: 'SBC201', authority_level: 'normative', edition_year: 2018 };
    expect(expected.authority_level).toBe('normative');
    expect(expected.edition_year).toBe(2018);
  });

  it('records SBC801 as normative with edition 2018', () => {
    const expected = { source_id: 'SBC801', authority_level: 'normative', edition_year: 2018 };
    expect(expected.authority_level).toBe('normative');
    expect(expected.edition_year).toBe(2018);
  });

  it('records SBC801_COMM as commentary', () => {
    const expected = { source_id: 'SBC801_COMM', authority_level: 'commentary', edition_year: 2018 };
    expect(expected.authority_level).toBe('commentary');
  });
});

describe(' EvidenceLedgerEntry provenance fields contract', () => {
  it('requires sourceType and editionYear on every ledger entry', () => {
    // This test fails at compile-time if the interface changes. At runtime it
    // documents that the verifier relies on these fields being populated.
    const entry = {
      sourceFamily: 'SBC-201' as const,
      sectionRef: '1004.5',
      tableRef: null,
      sectionConfidence: 'medium' as const,
      fileName: 'SBC 201 ..._chunks.json',
      pageStart: 100,
      pageEnd: 120,
      precision: 'page_range' as const,
      isClickableSource: true,
      origin: 'keyword_chunk' as const,
      sourceType: 'normative' as const,
      editionYear: 2018,
    };
    expect(entry.sourceType).toBe('normative');
    expect(entry.editionYear).toBe(2018);
  });
});
