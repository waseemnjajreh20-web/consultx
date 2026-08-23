/**
 * ConsultX — build source-map.json
 * Creates the manifest mapping chunk/extracted JSON filenames (used by retrieval)
 * to their canonical PDF files in the source-pdfs bucket.
 *
 * Outputs: scripts/source-map.json (local) — then uploads to source-pdfs/manifest/source-map.json
 */

import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) before running this script.');
  process.exit(1);
}
const PDF_BUCKET = 'source-pdfs';

// All JSON source files in the "ssss" bucket (retrieval corpus)
// These are the exact names returned by the storage list in ssss bucket.
// Mapping is deterministic: strip _extracted_chunks.json or _extracted.json suffix → .pdf
const SSSS_FILES = [
  // SBC 201
  'SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-1-250_extracted.json',
  'SBC 201 - The Saudi General Building Code-251-500_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-251-500_extracted.json',
  'SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-501-1000_extracted.json',
  'SBC 201 - The Saudi General Building Code-1001-1250_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-1001-1250_extracted.json',
  'SBC 201 - The Saudi General Building Code-1251-1500_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-1251-1500_extracted.json',
  'SBC 201 - The Saudi General Building Code-1501-1750_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-1501-1750_extracted.json',
  'SBC 201 - The Saudi General Building Code-1751-2000_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-1751-2000_extracted.json',
  'SBC 201 - The Saudi General Building Code-2001-2200_extracted_chunks.json',
  'SBC 201 - The Saudi General Building Code-2001-2200_extracted.json',
  // SBC 801
  'SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1001-1200_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1001-1200_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1201-1400_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1201-1400_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1401-1600_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1401-1600_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1601-1800_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1601-1800_extracted.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted_chunks.json',
  'SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted.json',
];

function buildEntry(sourceFile) {
  const is801 = sourceFile.includes('801');
  const documentCode = is801 ? 'SBC-801' : 'SBC-201';

  // Normalize: strip _extracted_chunks.json or _extracted.json → base name
  const baseName = sourceFile
    .replace(/_extracted_chunks\.json$/i, '')
    .replace(/_extracted\.json$/i, '');

  const pdfFileName = `${baseName}.pdf`;
  const pdfPath = is801
    ? `sbc/sbc-801/${pdfFileName}`
    : `sbc/sbc-201/${pdfFileName}`;

  // Extract page range from filename pattern: ...-START-END.pdf
  const rangeMatch = baseName.match(/-(\d+)-(\d+)$/);
  const pageStart = rangeMatch ? parseInt(rangeMatch[1], 10) : null;
  const pageEnd   = rangeMatch ? parseInt(rangeMatch[2], 10) : null;

  // Human-readable title
  const title = is801
    ? `SBC 801 — The Saudi Fire Protection Code (Pages ${pageStart}–${pageEnd})`
    : `SBC 201 — The Saudi General Building Code (Pages ${pageStart}–${pageEnd})`;

  return {
    source_file: sourceFile,
    pdf_bucket: PDF_BUCKET,
    pdf_path: pdfPath,
    pdf_public_url: `${SUPABASE_URL}/storage/v1/object/public/${PDF_BUCKET}/${pdfPath}`,
    title,
    document_code: documentCode,
    page_start: pageStart,
    page_end: pageEnd,
  };
}

const manifest = {
  _meta: {
    generated_at: new Date().toISOString(),
    pdf_bucket: PDF_BUCKET,
    total_entries: SSSS_FILES.length,
    description: 'Maps retrieval chunk/JSON source filenames to their canonical PDF files in source-pdfs bucket.',
  },
  entries: SSSS_FILES.map(buildEntry),
};

const json = JSON.stringify(manifest, null, 2);
writeFileSync('scripts/source-map.json', json);
console.log(`✅ Built manifest: ${manifest.entries.length} entries`);

// Upload to source-pdfs/manifest/source-map.json
console.log('⬆️  Uploading to source-pdfs/manifest/source-map.json ...');
const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${PDF_BUCKET}/manifest/source-map.json`;

// Need anon INSERT for manifest — temporarily enabled in policy. Use upsert.
const res = await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ANON_KEY}`,
    'apikey': ANON_KEY,
    'Content-Type': 'application/json',
    'x-upsert': 'true',
  },
  body: json,
});

if (!res.ok) {
  const err = await res.text();
  console.error(`❌ Upload failed (${res.status}): ${err}`);
  console.log('ℹ️  Manifest saved locally at scripts/source-map.json — upload manually if needed.');
  process.exit(1);
} else {
  console.log('✅ Manifest uploaded to source-pdfs/manifest/source-map.json');
}

// Print all entries for verification
console.log('\n📋 Manifest entries:');
for (const e of manifest.entries) {
  console.log(`  ${e.source_file.padEnd(75)} → ${e.pdf_path}`);
}
