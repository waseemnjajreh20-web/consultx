/**
 * Regression tests for sourceMetadata.ts
 *
 * Guards against:
 * - PDF URL construction errors (wrong bucket path, wrong file extension)
 * - Page range extraction failures
 * - Deduplication of _extracted vs _extracted_chunks variants pointing to same PDF
 * - Graceful handling of unrecognised filenames
 */
import { describe, it, expect } from 'vitest';
import { resolveSourceMeta, resolveAllSources, formatSourceLabel } from '../utils/sourceMetadata';

const SUPABASE_URL = 'https://hrnltxmwoaphgejckutk.supabase.co';
const PDF_BUCKET   = 'source-pdfs';

describe('resolveSourceMeta', () => {
  it('resolves SBC 201 _extracted_chunks.json to correct PDF URL and path', () => {
    const meta = resolveSourceMeta(
      'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json'
    );
    expect(meta.documentCode).toBe('SBC-201');
    expect(meta.pageStart).toBe(1);
    expect(meta.pageEnd).toBe(250);
    expect(meta.pdfPath).toBe(
      'sbc/sbc-201/SBC 201 - The Saudi General Building Code-1-250.pdf'
    );
    // pdfUrl has each path segment percent-encoded
    expect(meta.pdfUrl).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/${PDF_BUCKET}/sbc/sbc-201/SBC%20201%20-%20The%20Saudi%20General%20Building%20Code-1-250.pdf`
    );
  });

  it('resolves SBC 201 _extracted.json (non-chunk variant) to same PDF', () => {
    const meta = resolveSourceMeta(
      'SBC 201 - The Saudi General Building Code-1-250_extracted.json'
    );
    expect(meta.pdfPath).toBe(
      'sbc/sbc-201/SBC 201 - The Saudi General Building Code-1-250.pdf'
    );
  });

  it('resolves SBC 801 to sbc-801 subfolder', () => {
    const meta = resolveSourceMeta(
      'SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted_chunks.json'
    );
    expect(meta.documentCode).toBe('SBC-801');
    expect(meta.pageStart).toBe(201);
    expect(meta.pageEnd).toBe(400);
    expect(meta.pdfPath).toBe(
      'sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-201-400.pdf'
    );
  });

  it('resolves large SBC 801 range (1801-2061)', () => {
    const meta = resolveSourceMeta(
      'SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted_chunks.json'
    );
    expect(meta.pageStart).toBe(1801);
    expect(meta.pageEnd).toBe(2061);
    expect(meta.pdfPath).toContain('1801-2061.pdf');
  });

  it('resolves SBC 201 large range (501-1000)', () => {
    const meta = resolveSourceMeta(
      'SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json'
    );
    expect(meta.pageStart).toBe(501);
    expect(meta.pageEnd).toBe(1000);
  });

  it('returns non-null pdfUrl for all known SBC 201 chunk files', () => {
    const files = [
      'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-251-500_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-1001-1250_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-1251-1500_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-1501-1750_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-1751-2000_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-2001-2200_extracted_chunks.json',
    ];
    for (const f of files) {
      const meta = resolveSourceMeta(f);
      expect(meta.pdfUrl).not.toBeNull();
      expect(meta.pdfUrl).toContain('sbc/sbc-201/');
      expect(meta.pdfUrl).toContain('.pdf');
    }
  });

  it('returns non-null pdfUrl for all known SBC 801 chunk files', () => {
    const files = [
      'SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-1001-1200_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-1201-1400_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-1401-1600_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-1601-1800_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted_chunks.json',
    ];
    for (const f of files) {
      const meta = resolveSourceMeta(f);
      expect(meta.pdfUrl).not.toBeNull();
      expect(meta.pdfUrl).toContain('sbc/sbc-801/');
      expect(meta.pdfUrl).toContain('.pdf');
    }
  });

  it('returns UNKNOWN documentCode and null pdfUrl for unrecognised filenames', () => {
    const meta = resolveSourceMeta('some-other-document-123-456_extracted_chunks.json');
    expect(meta.documentCode).toBe('UNKNOWN');
    expect(meta.pdfUrl).toBeNull();
    expect(meta.pdfPath).toBeNull();
  });

  it('returns null pdfUrl for empty string', () => {
    const meta = resolveSourceMeta('');
    expect(meta.documentCode).toBe('UNKNOWN');
    expect(meta.pdfUrl).toBeNull();
  });
});

describe('resolveAllSources — deduplication', () => {
  it('deduplicates _extracted_chunks and _extracted variants for same PDF', () => {
    const sources = [
      'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json',
      'SBC 201 - The Saudi General Building Code-1-250_extracted.json',
    ];
    const result = resolveAllSources(sources);
    expect(result).toHaveLength(1);
    expect(result[0].pdfPath).toBe(
      'sbc/sbc-201/SBC 201 - The Saudi General Building Code-1-250.pdf'
    );
  });

  it('returns multiple entries for distinct page ranges', () => {
    const sources = [
      'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted_chunks.json',
    ];
    const result = resolveAllSources(sources);
    expect(result).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(resolveAllSources([])).toEqual([]);
  });
});

describe('formatSourceLabel', () => {
  it('produces Arabic label with page range', () => {
    const meta = resolveSourceMeta(
      'SBC 201 - The Saudi General Building Code-251-500_extracted_chunks.json'
    );
    const label = formatSourceLabel(meta, 'ar');
    expect(label).toBe('📖 SBC 201 — صفحات 251–500');
  });

  it('produces English label with page range', () => {
    const meta = resolveSourceMeta(
      'SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted_chunks.json'
    );
    const label = formatSourceLabel(meta, 'en');
    expect(label).toBe('📖 SBC 801 — Pages 201–400');
  });
});
