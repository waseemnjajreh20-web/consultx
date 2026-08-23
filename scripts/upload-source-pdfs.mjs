/**
 * ConsultX — one-time PDF ingest script
 * Uploads real SBC source PDFs to Supabase storage bucket: source-pdfs
 *
 * Usage: node scripts/upload-source-pdfs.mjs
 * Run from: D:\ConsultX_Clean
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) before running this script.');
  process.exit(1);
}
const BUCKET = 'source-pdfs';

const SBC201_LOCAL = 'C:/Users/TOSHIBA/Downloads/قاعدة بيانات الكود السعودي/قاعدة بيانات الكود السعودي PDF/SBC_201_CC_2024';
const SBC801_LOCAL = 'C:/Users/TOSHIBA/Downloads/قاعدة بيانات الكود السعودي/قاعدة بيانات الكود السعودي PDF/SBC_801_CC_2024';

const SOURCES = [
  { localDir: SBC201_LOCAL, storagePath: 'sbc/sbc-201' },
  { localDir: SBC801_LOCAL, storagePath: 'sbc/sbc-801' },
];

async function uploadFile(localPath, storagePath) {
  const data = readFileSync(localPath);
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: data,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed (${res.status}): ${err}`);
  }
  return res.status;
}

const results = [];
let totalUploaded = 0;

for (const { localDir, storagePath } of SOURCES) {
  const files = readdirSync(localDir).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`\n📁 ${storagePath} — ${files.length} PDFs found`);

  for (const file of files) {
    const localPath = join(localDir, file);
    const remotePath = `${storagePath}/${file}`;
    process.stdout.write(`  ⬆️  ${file} ... `);
    try {
      const status = await uploadFile(localPath, remotePath);
      console.log(`✓ (${status})`);
      results.push({ file, path: remotePath, ok: true });
      totalUploaded++;
    } catch (e) {
      console.log(`✗ ${e.message}`);
      results.push({ file, path: remotePath, ok: false, error: e.message });
    }
  }
}

console.log(`\n✅ Upload complete: ${totalUploaded} / ${results.length} files succeeded`);
const failures = results.filter(r => !r.ok);
if (failures.length > 0) {
  console.log('\n❌ Failed uploads:');
  failures.forEach(f => console.log(`  ${f.path}: ${f.error}`));
  process.exit(1);
}
