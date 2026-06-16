import { config } from '../config';
import { publisherModelUrl, vertexPost } from '../lib/vertex';
import { saveBase64, toBase64 } from '../lib/files';

export interface ImagenOptions {
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  count?: number;
  negativePrompt?: string;
}

/** Texto → imagen (sin referencia de personaje). */
export async function generateImage(prompt: string, outPath: string, opts: ImagenOptions = {}) {
  const url = publisherModelUrl(config.models.imagen, 'predict');
  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: opts.count ?? 1,
      aspectRatio: opts.aspectRatio ?? '16:9',
      ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      // Contenido infantil: revisar políticas del modelo (ver HANDOFF.md).
      safetySetting: 'block_medium_and_above',
    },
  };
  const res = await vertexPost(url, body);
  const b64 = res?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen no devolvió imagen: ' + JSON.stringify(res).slice(0, 500));
  await saveBase64(outPath, b64);
  return outPath;
}

/**
 * Imagen + referencia de sujeto: mantiene el personaje consistente a partir de las
 * imágenes del canon. Esta es la pieza clave del "canon de personajes".
 *
 * NOTA: el payload exacto de customización de Imagen debe validarse contra la API
 * vigente (ver HANDOFF.md → "Pendientes de validar"). La forma de abajo sigue el
 * patrón REFERENCE_TYPE_SUBJECT de Vertex Imagen.
 */
export async function generateWithSubject(
  prompt: string,
  refImagePaths: string[],
  outPath: string,
  opts: ImagenOptions = {},
) {
  const url = publisherModelUrl(config.models.imagenCustom, 'predict');
  const referenceImages = await Promise.all(
    refImagePaths.slice(0, 4).map(async (p, i) => ({
      referenceType: 'REFERENCE_TYPE_SUBJECT',
      referenceId: i + 1,
      referenceImage: { bytesBase64Encoded: await toBase64(p) },
      subjectImageConfig: {
        subjectDescription: 'main animated character',
        subjectType: 'SUBJECT_TYPE_PERSON',
      },
    })),
  );
  const body = {
    instances: [{ prompt, referenceImages }],
    parameters: {
      sampleCount: opts.count ?? 1,
      aspectRatio: opts.aspectRatio ?? '16:9',
    },
  };
  const res = await vertexPost(url, body);
  const b64 = res?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen (subject) no devolvió imagen: ' + JSON.stringify(res).slice(0, 500));
  await saveBase64(outPath, b64);
  return outPath;
}
