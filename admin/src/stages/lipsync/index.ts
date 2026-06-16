import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config';
import { ensureDir } from '../../lib/files';
import { log } from '../../lib/log';

export interface LipSyncProvider {
  name: string;
  /** Sincroniza la boca del personaje (video) con la voz (audio). Devuelve outPath. */
  sync(videoPath: string, audioPath: string, outPath: string): Promise<string>;
}

/** Sin proveedor: copia el clip sin sincronizar para que el pipeline corra completo. */
class NoopProvider implements LipSyncProvider {
  name = 'noop';
  async sync(videoPath: string, _audioPath: string, outPath: string) {
    log.warn('Lip sync no configurado (modo noop): copiando clip SIN sincronizar.');
    await ensureDir(path.dirname(outPath));
    await fsp.copyFile(videoPath, outPath);
    return outPath;
  }
}

/**
 * Proveedor genérico por API (submit → poll → download).
 * Deja el contrato listo; conecta el vendor elegido aquí (Sync, Hedra, etc.).
 * Ver HANDOFF.md → "Lip sync".
 */
class ApiProvider implements LipSyncProvider {
  name = 'api';
  async sync(_videoPath: string, _audioPath: string, _outPath: string): Promise<string> {
    if (!config.lipsync.apiUrl || !config.lipsync.apiKey) {
      throw new Error('LIPSYNC_API_URL / LIPSYNC_API_KEY no configurados en .env');
    }
    throw new Error(
      'Proveedor de lip sync por API: falta implementar el contrato del vendor elegido. ' +
        'Ver src/stages/lipsync/index.ts (clase ApiProvider) y HANDOFF.md.',
    );
  }
}

export function getLipSync(): LipSyncProvider {
  switch (config.lipsync.provider) {
    case 'api':
      return new ApiProvider();
    default:
      return new NoopProvider();
  }
}
