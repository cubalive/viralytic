/**
 * worker — runs ALL render pollers 24/7 in one process (for Railway / any host).
 *
 * Spawns each poller as a child process and restarts it on crash (with backoff),
 * so every channel's pipeline runs autonomously: claim 'generating' → render →
 * upload → (Caroline) metadata 'ready'. No refactor of the pollers needed.
 *
 *   pnpm --filter @viralytic/mv-render worker
 *
 * Required env (same as the individual pollers): SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, GOOGLE_VERTEX_SA, VERTEX_PROJECT,
 * VERTEX_LOCATION, VEO_MODEL, FAL_KEY, SYNC_API_KEY (Zuri lip-sync), MV_BUCKET.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Each channel family has its own poller (claims its own kind/artist).
const POLLERS = ['index.ts', 'caroline-poll.ts', 'faceless-render.ts', 'reels-poll.ts'];

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: 'worker', msg, ...extra }));

const children = new Map<string, ChildProcess>();
let shuttingDown = false;

function start(file: string, recentCrashes = 0): void {
  if (shuttingDown) return;
  const startedAt = Date.now();
  // Use the FULL tsx loader (`--import tsx`), not `tsx/esm`: the ESM-only loader
  // transpiles dependencies' package.json and breaks their CJS require() on Node 24.
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(dir, file)], {
    stdio: 'inherit',
    env: process.env,
  });
  children.set(file, child);
  log('poller.started', { file, pid: child.pid });

  child.on('exit', (code, signal) => {
    children.delete(file);
    if (shuttingDown) return;
    // Backoff: if it crashed quickly, slow restarts down (cap 60s) to avoid a tight loop.
    const livedMs = Date.now() - startedAt;
    const crashes = livedMs < 15_000 ? recentCrashes + 1 : 0;
    const delay = Math.min(5_000 * Math.max(1, crashes), 60_000);
    log('poller.exit', { file, code, signal, livedMs, crashes, restartInMs: delay });
    setTimeout(() => start(file, crashes), delay);
  });
  child.on('error', (e) => log('poller.spawn_error', { file, error: e.message }));
}

function shutdown(sig: string): void {
  shuttingDown = true;
  log('worker.shutdown', { sig });
  for (const [file, child] of children) {
    log('poller.kill', { file });
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 3_000);
}

log('worker.start', { pollers: POLLERS });
for (const f of POLLERS) start(f);

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
