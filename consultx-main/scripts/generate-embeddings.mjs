import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// === Config ===
const SUPABASE_URL = 'https://hrnltxmwoaphgejckutk.supabase.co';
const SUPABASE_SERVICE_KEY = process.argv[2];
const GEMINI_API_KEY = process.argv[3];
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

// === Main ===
async function main() {
  if (!SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
    console.error('Usage: node generate-embeddings.mjs <SUPABASE_SERVICE_KEY> <GEMINI_API_KEY>');
    process.exit(1);
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
