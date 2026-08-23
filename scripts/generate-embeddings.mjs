/**
 * SBC chunk embedding tool.
 *
 * Two modes:
 *
 *   INGEST (default, unchanged) — read *_extracted_chunks.json from CHUNKS_DIR,
 *   embed every chunk that is not already in sbc_documents, and INSERT it.
 *
 *   BACKFILL (--backfill, added 2026-08-23) — touch NO files at all. Select the
 *   rows that already exist in sbc_documents but have `embedding IS NULL`,
 *   embed their stored `content`, and UPDATE those rows in place.
 *
 * Why backfill exists: measured on production 2026-08-23, sbc_documents holds
 * 4,630 rows of which 36 have a NULL embedding — all 36 are code_type='SBC201';
 * SBC801 is complete at 1,855/1,855. `match_sbc_documents` orders by
 * `embedding <=> query_embedding`, and a NULL distance sorts last, so those 36
 * rows are invisible to vector retrieval. Several of them are egress-critical
 * (Section 1006.2.1 single exit, 1010.2.9 doors, 1020.3 corridors, 903.3.1
 * sprinkler design). The INGEST mode above cannot repair them: it resumes by
 * chunk_index and treats an existing row as done regardless of its embedding.
 *
 * IDEMPOTENCE. Backfill selects on `embedding IS NULL`, so:
 *   - a completed run leaves 0 rows selected and a re-run is a no-op;
 *   - a run interrupted or partially failed leaves only the unfixed rows
 *     selected, and a re-run resumes exactly there;
 *   - it never inserts, never deletes, and never touches a row that already
 *     has an embedding. Every write is `UPDATE ... SET embedding WHERE id = $1`
 *     on a single row, keyed by primary key.
 * Only the `embedding` column is written. content, metadata, code_type,
 * section_number, chapter_number, page_start, page_end, file_name and
 * chunk_index are left exactly as they are.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// === Config ===
const SUPABASE_URL = 'https://hrnltxmwoaphgejckutk.supabase.co';
const SUPABASE_SERVICE_KEY = process.argv[2];
const GEMINI_API_KEY = process.argv[3];
const FLAGS = process.argv.slice(4);
const BACKFILL = FLAGS.includes('--backfill');
const DRY_RUN = FLAGS.includes('--dry-run');
const CHUNKS_DIR = 'C:\\Users\\TOSHIBA\\Downloads\\قاعدة بيانات الكود السعودي\\قاعدة بيانات الكود السعودي PDF\\output_processed';
const MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 20;
const DELAY_MS = 1000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// === Embed a batch of texts in one API call ===
async function embedBatch(texts) {
  const requests = texts.map(t => ({
    model: `models/${MODEL}`,
    content: { parts: [{ text: t.substring(0, 8000) }] },
    outputDimensionality: 768,
  }));

  for (let attempt = 0; attempt < 7; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      }
    );

    if (res.status === 429) {
      const wait = Math.min(30 * Math.pow(2, attempt), 480);
      console.log(`  ⏳ 429 rate limit — waiting ${wait}s (attempt ${attempt + 1}/7)`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.embeddings.map(e => e.values);
  }
  throw new Error('Rate limit exceeded after 7 attempts');
}

// === Helpers ===
function extractSection(text) {
  return text.match(/\b(\d{3,4}\.\d{1,3}(?:\.\d{1,2})?)\b/)?.[1] || null;
}
function extractChapter(text) {
  return text.match(/(?:Chapter|الفصل)\s*(\d+)/i)?.[1] || null;
}

// === Backfill: fill `embedding` for rows that already exist but have NULL ===
//
// Selection predicate, and the ONLY one used:  embedding IS NULL
// Nothing else narrows it — not file_name, not code_type, not a hard-coded id
// list. That is deliberate: a hard-coded list would go stale the moment the
// corpus changes, and the set of rows that need an embedding is exactly the set
// of rows that do not have one.
async function selectRowsNeedingEmbedding() {
  const rows = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('sbc_documents')
      // `embedding` itself is deliberately NOT selected — 768 floats per row.
      .select('id, code_type, file_name, chunk_index, section_number, content')
      .is('embedding', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`select failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function runBackfill() {
  console.log(`Mode: BACKFILL${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);
  console.log('Predicate: sbc_documents.embedding IS NULL\n');

  const rows = await selectRowsNeedingEmbedding();

  // --- Proof of selection, printed in both dry-run and real runs ---
  const byCode = {};
  const byFile = {};
  let tooShort = 0;
  for (const r of rows) {
    byCode[r.code_type] = (byCode[r.code_type] || 0) + 1;
    byFile[r.file_name] = (byFile[r.file_name] || 0) + 1;
    if (!r.content || r.content.length < 20) tooShort++;
  }
  console.log(`Rows selected: ${rows.length}`);
  console.log('  by code_type:');
  for (const [k, v] of Object.entries(byCode).sort()) console.log(`    ${k}: ${v}`);
  console.log('  by file_name:');
  for (const [k, v] of Object.entries(byFile).sort()) console.log(`    ${v.toString().padStart(4)}  ${k}`);
  console.log(`  ids: ${rows.map(r => r.id).join(', ')}`);
  if (tooShort > 0) {
    // Reported, never silently skipped: a row with no usable content cannot be
    // embedded and needs a human decision, not a dropped record.
    console.warn(`  WARNING: ${tooShort} selected row(s) have content shorter than 20 chars and will NOT be embedded.`);
  }

  // Cross-check against the independently measured total, so a selection that
  // silently widens is visible instead of quietly re-embedding the corpus.
  const { count: totalRows, error: cErr } = await supabase
    .from('sbc_documents')
    .select('id', { count: 'exact', head: true });
  if (!cErr) console.log(`  (table holds ${totalRows} rows in total; ${rows.length} of them have no embedding)`);

  if (rows.length === 0) {
    console.log('\nNothing to do — every row already has an embedding. (Idempotent no-op.)');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN: no embedding requests were made and no rows were written.');
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  const embeddable = rows.filter(r => r.content && r.content.length >= 20);
  let updated = 0, errors = 0;
  const startTime = Date.now();

  for (let b = 0; b < embeddable.length; b += BATCH_SIZE) {
    const batch = embeddable.slice(b, b + BATCH_SIZE);
    try {
      const vectors = await embedBatch(batch.map(r => r.content));
      for (let j = 0; j < batch.length; j++) {
        // One row, keyed by primary key, one column. Nothing else is touched.
        const { error } = await supabase
          .from('sbc_documents')
          .update({ embedding: vectors[j] })
          .eq('id', batch[j].id);
        if (error) {
          console.error(`  DB error on id=${batch[j].id}: ${error.message}`);
          errors++;
        } else {
          updated++;
        }
      }
      console.log(`  +${batch.length} embedded -> ${updated} updated (${((Date.now() - startTime) / 1000).toFixed(0)}s)`);
    } catch (err) {
      console.error(`  batch failed: ${err.message}`);
      errors += batch.length;
    }
    if (b + BATCH_SIZE < embeddable.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // --- Verify, from the database, that the predicate is now empty ---
  const remaining = await selectRowsNeedingEmbedding();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Backfill done. Updated: ${updated} | Errors: ${errors}`);
  console.log(`Rows still matching "embedding IS NULL": ${remaining.length}`);
  if (remaining.length > 0) {
    console.log(`  ids: ${remaining.map(r => r.id).join(', ')}`);
    console.log('  Re-run the same command to resume — it will select exactly these.');
  }
  console.log(`${'='.repeat(50)}`);
}

// === Main ===
async function main() {
  if (!SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
    console.error('Usage: node generate-embeddings.mjs <SUPABASE_SERVICE_KEY> <GEMINI_API_KEY> [--backfill] [--dry-run]');
    console.error('  (no flags)            ingest new chunks from CHUNKS_DIR and INSERT them');
    console.error('  --backfill --dry-run  list the rows with embedding IS NULL, write nothing');
    console.error('  --backfill            embed those rows and UPDATE them in place');
    process.exit(1);
  }

  if (BACKFILL) {
    await runBackfill();
    return;
  }

  const files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('_extracted_chunks.json'));
  console.log(`Found ${files.length} chunk files\n`);

  let total = 0, uploaded = 0, skipped = 0, errors = 0;
  const startTime = Date.now();

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(CHUNKS_DIR, file), 'utf-8'));
    const chunks = raw.chunks || [];
    const codeType = file.includes('201') ? 'SBC201' : 'SBC801';
    total += chunks.length;

    // Resume: get already-uploaded chunk indexes
    const { data: existing } = await supabase
      .from('sbc_documents')
      .select('chunk_index')
      .eq('file_name', file);
    const done = new Set((existing || []).map(e => e.chunk_index));

    // Collect pending chunks
    const pending = [];
    for (let i = 0; i < chunks.length; i++) {
      if (done.has(i)) { skipped++; continue; }
      const content = chunks[i].content || '';
      if (content.length < 20) { skipped++; continue; }
      pending.push({ i, chunk: chunks[i], content });
    }

    if (pending.length === 0) {
      console.log(`${file} — all ${chunks.length} chunks already uploaded`);
      continue;
    }
    console.log(`${file} — ${pending.length} to embed (${done.size} skipped)`);

    // Process in batches
    for (let b = 0; b < pending.length; b += BATCH_SIZE) {
      const batch = pending.slice(b, b + BATCH_SIZE);

      try {
        const vectors = await embedBatch(batch.map(p => p.content));

        const rows = batch.map((p, j) => ({
          content: p.content,
          metadata: {
            code_id: p.chunk.code_id || raw.code_id,
            chunk_id: p.chunk.chunk_id,
            content_type: p.chunk.content_type,
            has_table: p.chunk.has_table,
            has_commentary: p.chunk.has_commentary,
            references: p.chunk.references,
            token_count: p.chunk.token_count,
          },
          embedding: vectors[j],
          code_type: codeType,
          section_number: extractSection(p.content),
          chapter_number: extractChapter(p.content) || p.chunk.chapter_id,
          page_start: p.chunk.page_start,
          page_end: p.chunk.page_end,
          file_name: file,
          chunk_index: p.i,
        }));

        const { error } = await supabase.from('sbc_documents').insert(rows);
        if (error) {
          console.error(`  ❌ DB error: ${error.message}`);
          errors += rows.length;
        } else {
          uploaded += rows.length;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.log(`  ✅ +${rows.length} chunks → ${uploaded} total (${elapsed}s elapsed)`);
        }
      } catch (err) {
        console.error(`  ❌ ${err.message}`);
        errors += batch.length;
      }

      if (b + BATCH_SIZE < pending.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done in ${elapsed}s`);
  console.log(`  Total: ${total} | Uploaded: ${uploaded} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log(`${'='.repeat(50)}`);
}

main().catch(console.error);
