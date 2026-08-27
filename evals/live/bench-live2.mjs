// LIVE BENCH WRAPPER — the producing side of the harness's CONSULTX_TOKEN_FILE
// contract (evals/run_advisory_benchmark.ts re-reads the Bearer token from
// that file before every call; THIS script is what mints and refreshes it).
//
// What it does:
//   1. Rotates the dedicated smoke user's password to a random value via the
//      admin API (service key read from the Windows user registry, never
//      printed) and mints a real user session — fire-safety-chat auths via
//      auth.getUser(), so a service key alone is rejected.
//   2. Writes the session JWT to ./.local/bench-token.txt and refreshes it
//      every 25 minutes so a paced multi-hour run never goes stale.
//   3. Spawns the Deno benchmark with live-mode env (12s pacing default;
//      set CONSULTX_EVAL_SUBSET before launching for a reduced sample).
//
// Secrets: CONSULTX_SERVICE_KEY is read from HKCU\Environment (set once by
// the owner via `setx`). Nothing secret is printed; JWTs are redacted from
// the streamed log. ./.local/ is gitignored — the token file must never be
// committed.
//
// Windows-only (registry read). Run from anywhere:
//   node evals/live/bench-live2.mjs
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const LOCAL_DIR = path.join(SCRIPT_DIR, '.local');
fs.mkdirSync(LOCAL_DIR, { recursive: true });

const require = createRequire(path.join(REPO_ROOT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

function readUserEnv(name) {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8' });
    const line = out.split(/\r?\n/).find((l) => l.trim().startsWith(name));
    const m = line && line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/);
    return m ? m[1] : null;
  } catch { return null; }
}
const serviceKey = readUserEnv('CONSULTX_SERVICE_KEY');
if (!serviceKey) { console.error('CONSULTX_SERVICE_KEY missing (setx CONSULTX_SERVICE_KEY "..." first)'); process.exit(2); }

const URL_ = 'https://hrnltxmwoaphgejckutk.supabase.co';
const SMOKE_ID = '86625537-e786-40bb-b923-ab55da5232bb';
const SMOKE_EMAIL = 'smoke_retrieval_test_042026@mailnull.com';

const admin = createClient(URL_, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const newPassword = crypto.randomBytes(24).toString('base64url');
const upd = await admin.auth.admin.updateUserById(SMOKE_ID, { password: newPassword, email_confirm: true });
if (upd.error) { console.error('password rotate failed:', upd.error.message); process.exit(1); }
console.log('smoke user password rotated (random, not stored)');

const signin = await admin.auth.signInWithPassword({ email: SMOKE_EMAIL, password: newPassword });
if (signin.error) { console.error('sign-in failed:', signin.error.message); process.exit(1); }
console.log('smoke user session minted, expires_in:', signin.data.session.expires_in, 's');

const tokenFile = path.join(LOCAL_DIR, 'bench-token.txt');
fs.writeFileSync(tokenFile, signin.data.session.access_token);
const refresher = setInterval(async () => {
  try {
    const again = await admin.auth.signInWithPassword({ email: SMOKE_EMAIL, password: newPassword });
    if (!again.error) {
      fs.writeFileSync(tokenFile, again.data.session.access_token);
      console.log('token refreshed at', new Date().toISOString());
    } else {
      console.log('token refresh failed:', again.error.message);
    }
  } catch (e) { console.log('token refresh threw:', String(e).slice(0, 120)); }
}, 25 * 60 * 1000);

const env = {
  ...process.env,
  CONSULTX_EVAL_LIVE: '1',
  CONSULTX_EDGE_URL: `${URL_}/functions/v1/fire-safety-chat`,
  CONSULTX_SERVICE_KEY: signin.data.session.access_token, // fallback; live token comes from the file
  CONSULTX_TOKEN_FILE: tokenFile,
  CONSULTX_EVAL_DELAY_MS: process.env.CONSULTX_EVAL_DELAY_MS ?? '12000',
  SMOKE_USER_ID: SMOKE_ID,
};

const logPath = path.join(LOCAL_DIR, 'bench-live-out.txt');
const log = fs.createWriteStream(logPath, { flags: 'a' });
log.write(`\n===== bench v2 started ${new Date().toISOString()} =====\n`);
const child = spawn('npx', ['deno', 'run', '--allow-read', '--allow-write', '--allow-env', '--allow-net',
  'evals/run_advisory_benchmark.ts'],
  { cwd: REPO_ROOT, env, shell: true });
const redact = (s) => String(s).replace(/eyJ[A-Za-z0-9._-]+/g, '[jwt-redacted]');
child.stdout.on('data', (d) => { const t = redact(d); process.stdout.write(t); log.write(t); });
child.stderr.on('data', (d) => { const t = redact(d); process.stderr.write(t); log.write(t); });
child.on('exit', (code) => { clearInterval(refresher); log.write(`\n===== exited ${code} =====\n`); process.exit(code ?? 1); });
