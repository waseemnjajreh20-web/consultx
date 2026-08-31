/**
 * Regression tests for sourceMetadata.ts
 *
 * Guards against:
 * - pdfPath / pdfUrl-marker construction errors (wrong bucket path, wrong file extension)
 * - Page range extraction failures
 * - Deduplication of _extracted vs _extracted_chunks variants pointing to same PDF
 * - Graceful handling of unrecognised filenames
 * - The 18-path allow-list rejecting anything not in the confirmed production set
 *   (2026-08-23 signed-URL refactor — the source-pdfs bucket is no longer public,
 *   so pdfUrl is a synchronous non-null marker equal to pdfPath, not a fetchable
 *   public URL; see src/utils/sourceMetadata.ts header comment for the contract)
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSourceMeta,
  resolveAllSources,
  resolveSectionOnlyMatch,
  formatSourceLabel,
} from '../utils/sourceMetadata';
import { isKnownSbcPdfPath, KNOWN_SBC_PDF_PATHS } from '../utils/sourcePdfUrl';

describe('resolveSourceMeta', () => {
  it('resolves SBC 201 _extracted_chunks.json to correct pdfPath, and pdfUrl marker equal to it', () => {
    const meta = resolveSourceMeta(
      'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json'
    );
    expect(meta.documentCode).toBe('SBC-201');
    expect(meta.editionYear).toBe(2024);
    expect(meta.authorityLevel).toBe('normative');
    expect(meta.pageStart).toBe(1);
    expect(meta.pageEnd).toBe(250);
    expect(meta.pdfPath).toBe(
      'sbc/sbc-201/SBC 201 - The Saudi General Building Code-1-250.pdf'
    );
    // pdfUrl is NOT a real, fetchable URL anymore (bucket is private) — it is
    // a synchronous non-null marker, currently equal to pdfPath, that every
    // truthiness/equality check in SourcePanel and ChatInterface relies on.
    expect(meta.pdfUrl).toBe(meta.pdfPath);
    expect(meta.pdfUrl).not.toBeNull();
    // Never regress back to producing a public storage URL.
    expect(meta.pdfUrl).not.toContain('object/public');
    expect(meta.pdfUrl).not.toContain('http');
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
    expect(meta.editionYear).toBe(2024);
    expect(meta.authorityLevel).toBe('normative');
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
      expect(isKnownSbcPdfPath(meta.pdfPath)).toBe(true);
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
      expect(isKnownSbcPdfPath(meta.pdfPath)).toBe(true);
    }
  });

  it('returns UNKNOWN documentCode, unknown authority, null editionYear and null pdfUrl for unrecognised filenames', () => {
    const meta = resolveSourceMeta('some-other-document-123-456_extracted_chunks.json');
    expect(meta.documentCode).toBe('UNKNOWN');
    expect(meta.authorityLevel).toBe('unknown');
    expect(meta.editionYear).toBeNull();
    expect(meta.pdfUrl).toBeNull();
    expect(meta.pdfPath).toBeNull();
  });

  it('returns null pdfUrl and unknown authority for empty string', () => {
    const meta = resolveSourceMeta('');
    expect(meta.documentCode).toBe('UNKNOWN');
    expect(meta.authorityLevel).toBe('unknown');
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

  it('P5-R6: a section-only DB match (resolveSectionOnlyMatch) still renders the existing plain page-range label — no "exact section" wording, no new UI', () => {
    const base = resolveSourceMeta(
      'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json'
    );
    const degraded = resolveSectionOnlyMatch(base, '903.2.7', 120, 122, 'exact_number');
    expect(degraded.precision).toBe('chunk_range_only');
    expect(degraded.sectionConfidence).toBe('medium');
    // Same label text as any other chunk_range_only / page_range source —
    // formatSourceLabel already treats both precisions identically (R19B),
    // so degrading precision changes no visible text, only removes the
    // "exact" claim carried by precision === 'page_range' elsewhere in the UI.
    expect(formatSourceLabel(degraded, 'ar')).toBe('📖 SBC 201 — صفحات 120–122');
    expect(formatSourceLabel(degraded, 'en')).toBe('📖 SBC 201 — Pages 120–122');
  });
});

describe('isKnownSbcPdfPath — frontend allow-list guard', () => {
  it('accepts all 25 valid SBC 201 / 801 / 501 / 401 pdfPath values', () => {
    expect(KNOWN_SBC_PDF_PATHS.size).toBe(25);
    for (const p of KNOWN_SBC_PDF_PATHS) {
      expect(isKnownSbcPdfPath(p)).toBe(true);
    }
  });

  it('accepts every pdfPath resolveSourceMeta actually produces for known filenames', () => {
    const files = [
      'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json',
      'SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted_chunks.json',
      // New source code: SBC 501 volume as emitted in X-SBC-Sources.
      'SBC501_CC2024_305-509_chunks.json',
    ];
    for (const f of files) {
      const meta = resolveSourceMeta(f);
      expect(isKnownSbcPdfPath(meta.pdfPath)).toBe(true);
    }
  });

  it('maps every SBC 501 retrieval volume to a known, distinct pdfPath', () => {
    const vols = [
      'SBC501_CC2024_17-304_chunks.json',
      'SBC501_CC2024_305-509_chunks.json',
      'SBC501_CC2024_510-695_chunks.json',
    ];
    const paths = new Set<string>();
    for (const f of vols) {
      const meta = resolveSourceMeta(f);
      expect(meta.documentCode).toBe('SBC-501');
      expect(isKnownSbcPdfPath(meta.pdfPath)).toBe(true);
      paths.add(meta.pdfPath!);
    }
    // Distinct chip paths (so volumes don't dedup into one chip).
    expect(paths.size).toBe(3);
  });

  it('rejects traversal into the private bucket\'s non-PDF prefixes', () => {
    expect(isKnownSbcPdfPath('index/manifest.json')).toBe(false);
    expect(isKnownSbcPdfPath('text_pages/SBC201/0001.txt')).toBe(false);
    expect(isKnownSbcPdfPath('../index/manifest.json')).toBe(false);
    expect(isKnownSbcPdfPath('sbc/sbc-201/../../index/manifest.json')).toBe(false);
  });

  it('rejects a path for a page range that does not exist in production', () => {
    expect(isKnownSbcPdfPath('sbc/sbc-201/SBC 201 - The Saudi General Building Code-9999-9999.pdf')).toBe(false);
  });

  it('rejects an already-private-style path (caller must not guess the private naming scheme)', () => {
    expect(isKnownSbcPdfPath('SBC201/pp_0001-0250.pdf')).toBe(false);
  });

  it('rejects null, undefined and empty string', () => {
    expect(isKnownSbcPdfPath(null)).toBe(false);
    expect(isKnownSbcPdfPath(undefined)).toBe(false);
    expect(isKnownSbcPdfPath('')).toBe(false);
  });
});
