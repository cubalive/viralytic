import { spawn } from 'node:child_process';
import { config } from '../config';

/**
 * Analiza una pista y detecta los GOLPES DE BAJO (timestamps en segundos).
 * Aísla las frecuencias graves, calcula la energía y detecta los picos.
 */
export async function detectBeats(audioPath: string, opts: { minGap?: number; sensitivity?: number } = {}): Promise<number[]> {
  const sr = 22050;
  const hop = 0.02; // ventana de 20 ms

  const pcm: Buffer = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const p = spawn(config.ffmpeg.ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-i', audioPath,
      '-af', 'lowpass=f=160', // aísla el bajo/kick
      '-ac', '1', '-ar', String(sr), '-f', 's16le', '-',
    ]);
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('error', reject);
    p.on('close', () => resolve(Buffer.concat(chunks)));
  });

  const total = Math.floor(pcm.length / 2);
  const win = Math.floor(sr * hop);
  const energies: number[] = [];
  for (let i = 0; i + win <= total; i += win) {
    let e = 0;
    for (let j = 0; j < win; j++) { const s = pcm.readInt16LE((i + j) * 2) / 32768; e += s * s; }
    energies.push(e / win);
  }

  const minGap = opts.minGap ?? 0.4;
  const k = opts.sensitivity ?? 1.4;
  const minGapWin = Math.ceil(minGap / hop);
  const local = 25; // ~0.5 s para la media móvil
  const beats: number[] = [];
  let last = -minGapWin * 2;
  for (let i = 1; i < energies.length - 1; i++) {
    const a = Math.max(0, i - local), b = Math.min(energies.length, i + local);
    let mean = 0; for (let j = a; j < b; j++) mean += energies[j]; mean /= (b - a) || 1;
    const isPeak = energies[i] >= energies[i - 1] && energies[i] >= energies[i + 1];
    if (isPeak && energies[i] > mean * k && (i - last) >= minGapWin) {
      beats.push(+(i * hop).toFixed(3));
      last = i;
    }
  }
  return beats;
}
