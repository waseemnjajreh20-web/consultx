import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// === Config ===
const SUPABASE_URL = 'https://hrnltxmwoaphgejckutk.supabase.co';
const SUPABASE_SERVICE_KEY = process.argv[2]; // passed as argument
const GEMINI_API_KEY = process.argv[3]; // passed as argument
const CHUNKS_DIR = 'C:\\Users\\TOSHIBA\\Downloads\\قاعدة بيانات الكود السعودي\\قاعدة بيانات الكود السعودي PDF\\output_processed';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 5;
const DELAY_MS = 12000;
const PER_REQUEST_DELAY = 2000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// === Helper: Generate embedding ===
async function getEmbedding(text, retries = 5) {
  const truncated = text.substring(0, 8000);
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { role: "user", parts: [{ text: truncated }] },
            outputDimensionality: 768,
          }),
        }
      );
      if (response.status === 429) {
        const waitSec = (i + 1) * 15;
        console.log(`  ⏳ Rate limit (429), waiting ${waitSec}s... (retry ${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`API error: ${response.status} - ${errBody.slice(0, 200)}`);
      }
      const data = await response.json();
      return data.embedding.values;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// === Helper: Extract section number ===
function extractSectionNumber(text) {
  const match = text.match(/\b(\d{3,4}\.\d{1,3}(?:\.\d{1,2})?)\b/);
  return match ? match[1] : null;
}

// === Helper: Extract chapter number ===
function extractChapterNumber(text) {
  const match = text.match(/(?:Chapter|الفصل)\s*(\d+)/i);
  return match ? match[1] : null;
}

// === Main ===
async function main() {
  if (!SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
    console.error('Usage: node generate-embeddings.mjs <SUPABASE_SERVICE_KEY> <GEMINI_API_KEY>');
    process.exit(1);
  }

  // Read chunk files
  const files = fs.readdirSync(CHUNKS_DIR)
    .filter(f => f.endsWith('_extracted_chunks.json'));
  console.log(`📁 Found ${files.length} chunk files`);

  let totalChunks = 0;
  let totalUploaded = 0;
  let totalErrors = 0;

  for (const file of files) {
    const filePath = path.join(CHUNKS_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const chunks = data.chunks || [];
    const codeType = file.includes('201') ? 'SBC201' : 'SBC801';

    console.log(`\n📄 ${file} (${chunks.length} chunks, ${codeType})`);
    totalChunks += chunks.length;

    // Resume: check which chunks are already uploaded
    const { data: existing } = await supabase
      .from('sbc_documents')
      .select('chunk_index')
      .eq('file_name', file);
    const uploadedSet = new Set((existing || []).map(e => e.chunk_index));
    if (uploadedSet.size > 0) {
      console.log(`  ⏩ Skipping ${uploadedSet.size} already-uploaded chunks`);
    }

    // Process in batches
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const rows = [];

      for (const [idx, chunk] of batch.entries()) {
        const globalIdx = i + idx;
        if (uploadedSet.has(globalIdx)) continue; // skip already uploaded

        const content = chunk.content || '';
        if (content.length < 20) continue;

        try {
          // Per-request delay to avoid rate limits
          if (idx > 0) await new Promise(r => setTimeout(r, PER_REQUEST_DELAY));
          const embedding = await getEmbedding(content);
          rows.push({
            content: content,
            metadata: {
              code_id: chunk.code_id || data.code_id,
              chunk_id: chunk.chunk_id,
              content_type: chunk.content_type,
              has_table: chunk.has_table,
              has_commentary: chunk.has_commentary,
              references: chunk.references,
              token_count: chunk.token_count,
            },
            embedding: embedding,
            code_type: codeType,
            section_number: extractSectionNumber(content),
            chapter_number: extractChapterNumber(content) || chunk.chapter_id,
            page_start: chunk.page_start,
            page_end: chunk.page_end,
            file_name: file,
            chunk_index: i + idx,
          });
        } catch (err) {
          console.error(`  ❌ Chunk ${i + idx}: ${err.message}`);
          totalErrors++;
        }
      }

      // Upload batch
      if (rows.length > 0) {
        const { error } = await supabase.from('sbc_documents').insert(rows);
        if (error) {
          console.error(`  ❌ Batch upload error: ${error.message}`);
          totalErrors += rows.length;
        } else {
          totalUploaded += rows.length;
          console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${rows.length} chunks uploaded (total: ${totalUploaded})`);
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Final Report:`);
  console.log(`   Total chunks: ${totalChunks}`);
  console.log(`   Uploaded: ${totalUploaded}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
