// ConsultX GraphRAG — Standalone Sequential Orchestrator
// Calls sbc-graph-indexer in a tight sequential loop (no Claude quota consumed).

const fs = require('fs');
const https = require('https');
const path = require('path');

const SUPABASE_URL = 'https://hrnltxmwoaphgejckutk.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhybmx0eG13b2FwaGdlamNrdXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjI1MDYsImV4cCI6MjA4NTY5ODUwNn0.eeODoyolv0eXg42xJ-rAUzIs_CjcUWNu2sx5LABuIiE';
const INDEX_URL = `${SUPABASE_URL}/functions/v1/sbc-graph-indexer`;
const LOG_FILE = path.join(__dirname, 'indexing_status.txt');
const TOTAL_CHUNKS = 4630;
const COMMUNITIES_INTERVAL = 500;
const BREATHER_MS = 3000;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
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

async function main() {
  log('=== Orchestrator started ===');
  let indexedChunks = 0;
  let lastCommunitiesAt = 0;

  while (true) {
    // ── Step 1: index 2 chunks ─────────────────────────────────────────────
    let indexResp;
    try {
      indexResp = await postJSON(INDEX_URL, { action: 'index' }, 120_000);
    } catch (err) {
      log(`ERROR index: ${err.message}`);
      await sleep(BREATHER_MS);
      continue; // retry immediately on transient error
    }

    const body = indexResp.body;
    const msg = (typeof body === 'object' ? body.message || JSON.stringify(body) : String(body));
    const processed = (typeof body === 'object' && typeof body.processed === 'number')
      ? body.processed
      : 0;
    indexedChunks += processed;
    log(`OK  index | processed=${processed} | total_indexed≈${indexedChunks} | msg="${msg}"`);

    // ── Step 2: milestone check ───────────────────────────────────────────
    const milestone = Math.floor(indexedChunks / COMMUNITIES_INTERVAL) * COMMUNITIES_INTERVAL;
    if (milestone > 0 && milestone > lastCommunitiesAt) {
      log(`MILESTONE ${milestone} reached — calling action=communities`);
      try {
        const cResp = await postJSON(INDEX_URL, { action: 'communities' }, 300_000);
        const cMsg = typeof cResp.body === 'object'
          ? cResp.body.message || JSON.stringify(cResp.body)
          : String(cResp.body);
        log(`OK  communities | ${cMsg}`);
        lastCommunitiesAt = milestone;
      } catch (err) {
        log(`ERROR communities: ${err.message}`);
      }
    }

    // ── Step 3: completion check ──────────────────────────────────────────
    const allDone =
      (typeof body === 'object' && typeof body.message === 'string' &&
        body.message.toLowerCase().includes('all chunks indexed')) ||
      indexedChunks >= TOTAL_CHUNKS;

    if (allDone) {
      log('All chunks indexed — running final communities call');
      try {
        const fResp = await postJSON(INDEX_URL, { action: 'communities' }, 300_000);
        const fMsg = typeof fResp.body === 'object'
          ? fResp.body.message || JSON.stringify(fResp.body)
          : String(fResp.body);
        log(`OK  final-communities | ${fMsg}`);
      } catch (err) {
        log(`ERROR final-communities: ${err.message}`);
      }
      log('=== FULL INDEXING COMPLETE ===');
      process.exit(0);
    }

    // ── Step 4: breather before next batch ───────────────────────────────
    await sleep(BREATHER_MS);
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
