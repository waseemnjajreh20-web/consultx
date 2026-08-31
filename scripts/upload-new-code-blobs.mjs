/**
 * Upload the SBC 401/501 2024 chunk volumes to storage bucket 'ssss'.
 *
 * Key comes from env SB_SERVICE_KEY (fetched via the owner's Supabase CLI
 * session at call time) — never hard-coded, never printed.
 * upsert:false — an existing blob is NEVER silently overwritten; rerun after
 * a partial failure only uploads what is missing.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const URL = 'https://hrnltxmwoaphgejckutk.supabase.co';
const KEY = process.env.SB_SERVICE_KEY;
const DIR = process.env.BLOBS_DIR || 'D:\\SBC_2024_intake\\blobs';
if (!KEY) { console.error('SB_SERVICE_KEY missing'); process.exit(1); }

const supabase = createClient(URL, KEY);
const files = fs.readdirSync(DIR).filter(f => f.endsWith('_chunks.json'));
console.log(`${files.length} local volume files`);

const { data: existing, error: listErr } = await supabase.storage.from('ssss').list('', { limit: 200 });
if (listErr) { console.error('list failed:', listErr.message); process.exit(1); }
const present = new Set((existing || []).map(f => f.name));

let up = 0, skip = 0, fail = 0;
for (const f of files) {
  if (present.has(f)) { console.log(`= exists, skipped: ${f}`); skip++; continue; }
  const body = fs.readFileSync(path.join(DIR, f));
  const { error } = await supabase.storage.from('ssss')
    .upload(f, body, { contentType: 'application/json', upsert: false });
  if (error) { console.error(`x ${f}: ${error.message}`); fail++; }
  else { console.log(`+ uploaded: ${f} (${(body.length / 1048576).toFixed(2)} MB)`); up++; }
}
console.log(`done: ${up} uploaded, ${skip} skipped, ${fail} failed`);

// verify: bucket must now contain all 7, and legacy files must be untouched
const { data: after } = await supabase.storage.from('ssss').list('', { limit: 200 });
const names = (after || []).map(f => f.name);
const missing = files.filter(f => !names.includes(f));
console.log(`bucket now holds ${names.length} objects; missing new-code files: ${missing.length ? missing.join(', ') : 'none'}`);
process.exit(fail > 0 || missing.length > 0 ? 1 : 0);
