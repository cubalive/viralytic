import { spawn } from 'node:child_process';
import { config } from '../config';

export function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${bin} salió con código ${code}\n${err.slice(-1500)}`)),
    );
  });
}

// ffmpeg con flags base (sobrescribe salida, sin banner, solo errores)
export const ff = (args: string[]) =>
  run(config.ffmpeg.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

export function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(config.ffmpeg.ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      file,
    ]);
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('error', reject);
    p.on('close', () => resolve(parseFloat(out.trim()) || 0));
  });
}
