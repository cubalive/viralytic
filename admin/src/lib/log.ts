/* eslint-disable no-console */
export const log = {
  info: (...a: unknown[]) => console.log('\x1b[36m[i]\x1b[0m', ...a),
  ok: (...a: unknown[]) => console.log('\x1b[32m[✓]\x1b[0m', ...a),
  warn: (...a: unknown[]) => console.warn('\x1b[33m[!]\x1b[0m', ...a),
  err: (...a: unknown[]) => console.error('\x1b[31m[x]\x1b[0m', ...a),
  step: (s: string) => console.log(`\n\x1b[1m\x1b[35m▶ ${s}\x1b[0m`),
};
