// ConsultX GraphRAG — Standalone Sequential Orchestrator
// Calls sbc-graph-indexer in a tight sequential loop (no Claude quota consumed).

const fs = require('fs');
const https = require('https');
const path = require('path');

const SUPABASE_URL = 'https://hrnltxmwoaphgejckutk.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhybmx0eG13b2FwaGdlamNrdXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjI1MDYsImV4cCI6MjA4NTY5ODUwNn0.eeODoyolv0eXg42xJ-rAUzIs_CjcUWNu2sx5LABuIiE';
const INDEX_URL = `${SUPABASE_URL}/functions/v1/sbc-graph-indexer`;
const COUNT_RPC_URL = `${SUPABASE_URL}/rest/v1/rpc/get_indexed_chunk_count`;
const LOG_FILE = path.join(__dirname, 'indexing_status.txt');
const TOTAL_CHUNKS = 4630;
const COMMUNITIES_INTERVAL = 500;
const BREATHER_MS = 3000;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function postJSON(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns COUNT(DISTINCT chunk_id) via SECURITY DEFINER RPC (bypasses RLS).
function getIndexedChunkCount() {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(COUNT_RPC_URL);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        'Content-Length': 0,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const n = parseInt(data.trim(), 10);
        if (isNaN(n)) reject(new Error(`Unexpected DB response: ${data.slice(0, 100)}`));
        else resolve(n);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('DB count timed out')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Run communities in safe small batches (5 groups per Edge Function call) ──
// startOffset: resume mid-run without re-wiping already-built groups (default 0 = full rebuild).
// Retries automatically on 504 by halving the batch limit down to a floor of 1.
async function runCommunitiesBatched(startOffset = 0) {
  log(`COMMUNITIES starting batched run from offset=${startOffset} (5 groups/call)...`);
  let offset = startOffset;
  let limit  = 5;

  while (true) {
    log(`COMMUNITIES calling offset=${offset} limit=${limit}`);
    let resp;
    try {
      resp = await postJSON(INDEX_URL, { action: 'communities', offset, limit }, 300_000);
    } catch (err) {
      if (err.message && (err.message.includes('504') || err.message.includes('timed out'))) {
        const newLimit = Math.max(1, Math.floor(limit / 2));
        log(`WARN  communities 504 at offset=${offset} — halving limit ${limit}→${newLimit}, retrying in 15s (exponential backoff)`);
        limit = newLimit;
        await sleep(15_000);
        continue; // retry same offset with smaller limit
      }
      log(`ERROR communities: ${err.message}`);
      return; // non-504 error — abort communities, resume indexing
    }

    const b   = resp.body;
    const msg = typeof b === 'object' ? b.message || JSON.stringify(b) : String(b);
    log(`OK  communities | built=${b.communities_built ?? '?'}/${b.total_groups ?? '?'} groups | offset=${offset} | ${msg}`);

    if (!b || b.done) {
      log(`COMMUNITIES complete — all ${b.total_groups ?? '?'} groups processed ✅`);
      return;
    }

    offset = b.next_offset;
    // Recover limit if a smaller one succeeded (ramp back up slowly)
    if (limit < 5) limit = Math.min(5, limit + 1);
    await sleep(BREATHER_MS);
  }
}

async function main() {
  log('=== Orchestrator v17 started (stable: 300s LLM timeout, 3s extraction delay, 15s 504 backoff, accurate chunk RPC) ===');

  let lastCommunitiesAt = 0;

  while (true) {
    // ── Step 1: index 2 chunks ─────────────────────────────────────────────
    let indexResp;
    try {
      indexResp = await postJSON(INDEX_URL, { action: 'index' }, 120_000);
    } catch (err) {
      log(`ERROR index: ${err.message}`);
      await sleep(BREATHER_MS);
      continue;
    }

    const body = indexResp.body;
    const msg = typeof body === 'object' ? body.message || JSON.stringify(body) : String(body);

    // ── Step 2: query DB for real indexed chunk count ─────────────────────
    let indexedChunks = 0;
    try {
      indexedChunks = await getIndexedChunkCount();
    } catch (err) {
      log(`WARN  DB count failed: ${err.message} — skipping milestone check this round`);
    }

    const pct = ((indexedChunks / TOTAL_CHUNKS) * 100).toFixed(1);
    log(`OK  index | indexed=${indexedChunks}/${TOTAL_CHUNKS} (${pct}%) | msg="${msg}"`);

    // ── Step 3: milestone check (every 500 real indexed chunks) ───────────
    const milestone = Math.floor(indexedChunks / COMMUNITIES_INTERVAL) * COMMUNITIES_INTERVAL;
    if (milestone > 0 && milestone > lastCommunitiesAt) {
      log(`MILESTONE ${milestone} chunks — launching full batched communities rebuild`);
      await runCommunitiesBatched(); // always full rebuild from offset=0 at milestones
      lastCommunitiesAt = milestone;
    }

    // ── Step 4: completion check ──────────────────────────────────────────
    const allDone =
      (typeof body === 'object' && body.success === true &&
        (body.remaining === 0 ||
         (typeof body.message === 'string' && body.message.toLowerCase().includes('all files')))) ||
      indexedChunks >= TOTAL_CHUNKS;

    if (allDone) {
      log(`COMPLETE indexed=${indexedChunks}/${TOTAL_CHUNKS} — running final batched communities rebuild`);
      await runCommunitiesBatched(); // full final rebuild
      log('=== FULL INDEXING COMPLETE ===');
      process.exit(0);
    }

    // ── Step 5: breather before next batch ───────────────────────────────
    await sleep(BREATHER_MS);
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
