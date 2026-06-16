import { geminiJson } from '../ai/gemini';
import { EDU_FORMATS, MUSIC_FORMATS } from './library';
import type { EduResult, MusicResult } from './types';

const beatEdu = {
  type: 'object',
  properties: { t: { type: 'string' }, accion: { type: 'string' }, texto_en_pantalla: { type: 'string' } },
  required: ['t', 'accion', 'texto_en_pantalla'],
};
const EDU_SCHEMA = {
  type: 'object',
  properties: {
    tema: { type: 'string' },
    seleccion: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          por_que_encaja: { type: 'string' },
          brief: {
            type: 'object',
            properties: {
              hook_0_3s: { type: 'string' },
              guion_por_beat: { type: 'array', items: beatEdu },
              generadores: {
                type: 'object',
                properties: {
                  frase: { type: 'array', items: { type: 'string' } },
                  imagen: { type: 'array', items: { type: 'string' } },
                  voz: { type: 'string' },
                },
                required: ['frase', 'imagen', 'voz'],
              },
              analogia_central: { type: 'string' },
            },
            required: ['hook_0_3s', 'guion_por_beat', 'generadores', 'analogia_central'],
          },
        },
        required: ['slug', 'por_que_encaja', 'brief'],
      },
    },
    descartados: {
      type: 'array',
      items: { type: 'object', properties: { slug: { type: 'string' }, motivo: { type: 'string' } }, required: ['slug', 'motivo'] },
    },
  },
  required: ['tema', 'seleccion', 'descartados'],
};

const beatMusic = {
  type: 'object',
  properties: { t: { type: 'string' }, accion: { type: 'string' }, sync: { type: 'string' } },
  required: ['t', 'accion', 'sync'],
};
const MUSIC_SCHEMA = {
  type: 'object',
  properties: {
    cancion: { type: 'string' },
    seleccion: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          por_que_encaja: { type: 'string' },
          brief: {
            type: 'object',
            properties: {
              hook_0_5s: { type: 'string' },
              punto_drop_seg: { type: 'number' },
              guion_por_beat: { type: 'array', items: beatMusic },
              generadores: {
                type: 'object',
                properties: {
                  frase: { type: 'array', items: { type: 'string' } },
                  imagen: { type: 'array', items: { type: 'string' } },
                  video8s: { type: 'array', items: { type: 'string' } },
                },
                required: ['frase', 'imagen', 'video8s'],
              },
              loop: { type: 'boolean' },
            },
            required: ['hook_0_5s', 'punto_drop_seg', 'guion_por_beat', 'generadores', 'loop'],
          },
        },
        required: ['slug', 'por_que_encaja', 'brief'],
      },
    },
    descartados: {
      type: 'array',
      items: { type: 'object', properties: { slug: { type: 'string' }, motivo: { type: 'string' } }, required: ['slug', 'motivo'] },
    },
  },
  required: ['cancion', 'seleccion', 'descartados'],
};

export interface EduOpts { edad?: string; duracion?: string; host?: string }

/** Selecciona formatos y genera briefs para un TEMA del canal educativo (informática para niños). */
export function selectEduFormats(tema: string, opts: EduOpts = {}): Promise<EduResult> {
  const host = opts.host ?? 'Sabi, un robot anfitrión turquesa y amarillo con carita-pantalla';
  const system =
    'Eres estratega de formatos + experto en contenido educativo viral para niños. ' +
    `Canal de YouTube de educación BÁSICA para niños (edad ${opts.edad ?? '3-9'}): temas como ` +
    'animales, números, colores, formas, letras, frutas, vehículos, partes del cuerpo, emociones, sonidos. ' +
    `Salida: Shorts/Reels verticales de ${opts.duracion ?? '15-30s'}. Objetivo: enseñar UN concepto ` +
    'y que el niño se quede a verlo completo. Anfitrión: ' + host + '. ' +
    'REGLAS OBLIGATORIAS: lenguaje simple y positivo; UNA sola idea por video; analogías del mundo del ' +
    'niño (juguetes, juegos, comida, animales); hook claro en los primeros 3 segundos; nada que asuste, ' +
    'sin sarcasmo ni estereotipos; tono amable y curioso; sin texto que un niño no pueda leer rápido. ' +
    'TAREA: revisa la biblioteca y selecciona SOLO los formatos que se acoplan a un canal educativo infantil ' +
    '(descarta calle/entrevista/reacción adulta/vlog/podcast). Para cada formato "usar", genera un brief que ' +
    'siga su estructura segundo a segundo adaptado al TEMA, con el anfitrión. ' +
    'IMPORTANTE: el campo generadores.voz debe ser un guion de locución de 45 a 75 palabras ' +
    '(≈18-22 segundos) en el idioma del tema, que cubra el short completo de principio a fin. ' +
    'Devuelve SOLO el JSON del esquema.';
  const prompt =
    `BIBLIOTECA DE FORMATOS:\n${JSON.stringify(EDU_FORMATS)}\n\n` +
    `TEMA A ENSEÑAR: ${tema}\n\n` +
    'Genera la selección (usar) con briefs y la lista de descartados con motivo.';
  return geminiJson<EduResult>(prompt, EDU_SCHEMA, system);
}

export interface MusicOpts { duracion?: string; objetivo?: string; mood?: string; bpm?: number; artista?: string; hook_section?: string }

/** Selecciona formatos y genera briefs sincronizados al gancho para una CANCIÓN. */
export function selectMusicFormats(cancion: string, opts: MusicOpts = {}): Promise<MusicResult> {
  const system =
    'Eres director creativo de contenido musical viral para vertical. ' +
    `Reels/Shorts para promover música, duración ${opts.duracion ?? '15-30s'}, objetivo ${opts.objetivo ?? 'awareness/streams'}. ` +
    'TAREA: selecciona de la biblioteca los formatos que se acoplan a un corto musical (prioriza hiper ' +
    'cinemático, texto sobre B-roll, pantalla verde, hablando a cámara, cine horizontal, clon; descarta ' +
    'tablero blanco/entrevista salvo storytelling del artista). Para cada "usar" genera un brief SINCRONIZADO ' +
    'al gancho: marca en qué segundo entra el drop (punto_drop_seg) y qué pasa visualmente ahí. REGLAS: el ' +
    'fragmento más fuerte cae en los primeros 3-5s; loop perfecto cuando el formato lo permita (el final ' +
    'conecta con el inicio); indica corte al beat donde aplique; los prompts de video8s son para clips de 8s. ' +
    'Devuelve SOLO el JSON del esquema.';
  const prompt =
    `BIBLIOTECA DE FORMATOS:\n${JSON.stringify(MUSIC_FORMATS)}\n\n` +
    `PISTA / CANCIÓN:\n- Título: ${cancion}\n- Artista: ${opts.artista ?? '(mascota del canal)'}\n` +
    `- Mood: ${opts.mood ?? 'alegre'}  BPM: ${opts.bpm ?? 120}\n` +
    `- Fragmento gancho: ${opts.hook_section ?? '(el coro más fuerte)'}\n\n` +
    'Genera la selección (usar) con briefs sincronizados y la lista de descartados con motivo.';
  return geminiJson<MusicResult>(prompt, MUSIC_SCHEMA, system);
}
