import { geminiText } from '../ai/gemini';

const NAMES: Record<string, string> = { en: 'English', it: 'Italian', zh: 'Simplified Chinese (简体中文)' };

/** Traduce el guion de locución al idioma destino (es = sin cambios). */
export async function translateVoz(text: string, lang: string): Promise<string> {
  if (lang === 'es' || !NAMES[lang]) return text;
  const out = await geminiText(
    `Traduce este guion de locución para niños a ${NAMES[lang]}, manteniendo el tono alegre, ` +
      `simple y natural para un niño pequeño. Devuelve SOLO la traducción, sin comillas ni notas:\n\n${text}`,
  );
  return out.trim().replace(/^["“]|["”]$/g, '');
}
