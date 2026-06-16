import { geminiVision } from '../ai/gemini';

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['pass', 'reason'],
};

function parse(out: string): { pass: boolean; reason: string } {
  try {
    return JSON.parse(out);
  } catch {
    return { pass: false, reason: 'QA: respuesta no parseable' };
  }
}

/** QA de consistencia: la imagen generada debe ser el MISMO personaje del canon. */
export async function qaCanonImage(
  image: string,
  refs: string[],
  description: string,
): Promise<{ pass: boolean; reason: string }> {
  const prompt =
    'La PRIMERA imagen es generada; las demás son referencia del personaje. ' +
    `Debe ser el MISMO personaje (cara, pelo, ropa, estilo). Canon: ${description}. ` +
    'Además debe ser 100% apto para niños (YouTube Kids). ' +
    'Devuelve JSON {pass, reason}; pass=true SOLO si es consistente Y apto.';
  return parse(await geminiVision(prompt, [image, ...refs], { json: true, schema: VERDICT_SCHEMA }));
}

/** QA de contenido: apto para YouTube Kids (6-14). */
export async function qaContent(image: string): Promise<{ pass: boolean; reason: string }> {
  const prompt =
    '¿Esta imagen es 100% apropiada para YouTube Kids (niños 6-14)? ' +
    'Sin violencia, miedo, contenido sugerente ni nada inapropiado. JSON {pass, reason}.';
  return parse(await geminiVision(prompt, [image], { json: true, schema: VERDICT_SCHEMA }));
}
