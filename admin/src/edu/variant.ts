import { geminiJson } from '../ai/gemini';
import type { SeleccionEdu } from '../formats/types';

const SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: { type: 'object', properties: { titulo: { type: 'string' }, voz: { type: 'string' } }, required: ['titulo', 'voz'] },
    },
  },
  required: ['variants'],
};

/** Genera K guiones DIFERENTES (ganchos distintos) para el mismo tema, en español. */
export async function generateVariants(topic: string, sel: SeleccionEdu, k: number, avoid: string[] = []): Promise<{ titulo: string; voz: string }[]> {
  const system =
    'Eres el #1 MUNDIAL en contenido infantil VIRAL para YouTube (Shorts/Kids), un maestro del algoritmo. ' +
    'Sabes que lo que manda es la RETENCIÓN (que vean hasta el final y RE-VEAN) y la INTERACCIÓN (likes y COMENTARIOS). ' +
    'Cada guion que escribes es una OBRA MAESTRA para niños de 2 a 8 años. NUNCA escribes algo mediocre. ' +
    'REGLAS OBLIGATORIAS de cada guion (locución de Sabi):\n' +
    '1) HOOK demoledor en los primeros 1-2 segundos: una pregunta, sorpresa o reto que enganche al instante. SIN intro lenta, empieza con el gancho.\n' +
    '2) RITMO rápido con una sorpresa o novedad cada pocos segundos (los niños se aburren en 2s).\n' +
    '3) INTERACCIÓN: pide al niño participar — adivinar, repetir en voz alta, contar, señalar, hacer el sonido.\n' +
    '4) CURIOSIDAD / OPEN LOOP: guarda lo mejor para el final ("¡el último te va a encantar!") para que vean completo.\n' +
    '5) CTA DE COMENTARIOS al final: una pregunta concreta y fácil que el niño o el papá respondan ("¿Cuál es tu favorito? ¡Escríbelo aquí abajo! 👇"). Esto DISPARA comentarios.\n' +
    '6) Pide LIKE de forma natural y divertida ("dale al corazón 💚").\n' +
    '7) Final que conecte con el inicio (LOOPEABLE) para más re-vistas.\n' +
    'Cada variante usa un MECANISMO viral DISTINTO: adivinanza, "cuenta conmigo", reto, "el último te sorprende", dato WOW, "¿quién gana?". ' +
    'Lenguaje simple, alegre, positivo, 100% apto y seguro para niños. 45-70 palabras. ' +
    'El TÍTULO debe ser irresistible y clickeable, con la keyword del tema al inicio y un gancho de curiosidad. Devuelve SOLO JSON.';
  const avoidTxt = avoid.length ? `\n\nNO repitas estos guiones ni mecanismos ya usados (haz OTROS distintos):\n- ${avoid.map((a) => a.slice(0, 90)).join('\n- ')}` : '';
  const prompt =
    `Tema: ${topic}\nGuion base (referencia, NO lo copies): ${sel.brief.generadores.voz}${avoidTxt}\n\n` +
    `Genera ${k} variantes, cada una una OBRA MAESTRA de retención con un mecanismo viral distinto, hook potente, interacción y CTA de comentarios. {variants:[{titulo, voz}]}.`;
  const out = await geminiJson<{ variants: { titulo: string; voz: string }[] }>(prompt, SCHEMA, system);
  return (out.variants || []).slice(0, k);
}
