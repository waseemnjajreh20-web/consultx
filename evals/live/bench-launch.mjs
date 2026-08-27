// Detached launcher for bench-live2.mjs: starts the live benchmark as an
// independent process that survives this launcher's exit (a paced full run
// takes 45+ minutes — longer than most terminal/session timeouts). All
// output streams to ./.local/bench-detached-stdout.txt; prints the PID and
// exits immediately. Monitor the log file for progress and the final
// "===== exited" line.
//   node evals/live/bench-launch.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = path.join(SCRIPT_DIR, '.local');
fs.mkdirSync(LOCAL_DIR, { recursive: true });

const logFile = path.join(LOCAL_DIR, 'bench-detached-stdout.txt');
const out = fs.openSync(logFile, 'a');
const err = fs.openSync(logFile, 'a');
const child = spawn(process.execPath, [path.join(SCRIPT_DIR, 'bench-live2.mjs')], {
  cwd: SCRIPT_DIR,
  detached: true,
  stdio: ['ignore', out, err],
});
child.unref();
console.log('launched detached, pid:', child.pid, '— log:', logFile);
