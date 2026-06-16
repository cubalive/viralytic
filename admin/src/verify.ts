import { getAccessToken } from './lib/auth';
import { geminiText } from './ai/gemini';
import { config } from './config';
import { run } from './lib/ffmpeg';
import { log } from './lib/log';

/** "Doctor": verifica que todo el entorno esté listo. */
export async function verify() {
  log.step('Verificación del sistema');
  let okCount = 0;
  const total = 3;

  // 1) ADC
  try {
    await getAccessToken();
    log.ok('Credenciales ADC: OK');
    okCount++;
  } catch (e) {
    log.err('ADC:', (e as Error).message);
  }

  // 2) ffmpeg
  try {
    await run(config.ffmpeg.ffmpeg, ['-version']);
    await run(config.ffmpeg.ffprobe, ['-version']);
    log.ok('ffmpeg + ffprobe: OK');
    okCount++;
  } catch {
    log.err('ffmpeg/ffprobe no encontrados en el PATH');
  }

  // 3) Gemini (texto)
  try {
    const r = await geminiText('Responde solo con la palabra: OK');
    log.ok(`Gemini (${config.models.gemini}): "${r.trim().slice(0, 20)}"`);
    okCount++;
  } catch (e) {
    log.err('Gemini:', (e as Error).message.slice(0, 220));
  }

  log.info('');
  log.info(`Proyecto GCP: ${config.gcp.projectId} · Región: ${config.gcp.location}`);
  log.info(`Modelos → Fotos: ${config.models.geminiImage} | Veo: ${config.models.veo}`);
  log.info(`Lip sync: ${config.lipsync.provider || 'noop (sin sincronizar)'}`);
  log.info('Imagen/Veo se prueban al primer uso real (consumen cuota y dinero).');
  log.info('');
  (okCount === total ? log.ok : log.warn)(`Checks: ${okCount}/${total} OK`);
}
