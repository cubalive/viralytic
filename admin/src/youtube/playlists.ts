import { getYtAccessToken } from './auth';

type Lang = 'es' | 'en' | 'it' | 'zh';

/** Plan de playlists por canal (agrupa los temas de generación). */
export const PLAYLISTS: { key: string; topics: string[]; title: Record<Lang, string>; desc: Record<Lang, string> }[] = [
  {
    key: 'animales',
    topics: ['los-animales-de-la-granja', 'los-animales-de-la-selva', 'los-animales-del-mar', 'los-sonidos-de-los-animales', 'las-mascotas', 'los-insectos'],
    title: { es: '🐾 Aprende los Animales', en: '🐾 Learn the Animals', it: '🐾 Impara gli Animali', zh: '🐾 认识动物' },
    desc: { es: 'Animales de la granja, la selva, el mar y más, con Sabi.', en: 'Farm, jungle and sea animals and more, with Sabi.', it: 'Animali della fattoria, della giungla, del mare e altro, con Sabi.', zh: '和知宝一起认识农场、丛林、海洋的动物等等。' },
  },
  {
    key: 'numeros-formas-colores',
    topics: ['los-n-meros-del-1-al-10', 'las-formas', 'los-colores', 'los-opuestos', 'el-abecedario'],
    title: { es: '🔢 Números, Formas y Colores', en: '🔢 Numbers, Shapes & Colors', it: '🔢 Numeri, Forme e Colori', zh: '🔢 数字、形状和颜色' },
    desc: { es: 'Aprende a contar, las formas, los colores y las letras con Sabi.', en: 'Learn counting, shapes, colors and letters with Sabi.', it: 'Impara a contare, le forme, i colori e le lettere con Sabi.', zh: '和知宝一起学数数、形状、颜色和字母。' },
  },
  {
    key: 'mi-mundo',
    topics: ['las-frutas', 'los-veh-culos', 'las-emociones', 'la-ropa', 'las-profesiones', 'el-cuerpo-humano', 'el-clima-y-las-estaciones', 'el-espacio-y-los-planetas', 'los-instrumentos-musicales'],
    title: { es: '🌍 Mi Mundo', en: '🌍 My World', it: '🌍 Il Mio Mondo', zh: '🌍 我的世界' },
    desc: { es: 'Frutas, vehículos, emociones, profesiones y todo mi mundo, con Sabi.', en: 'Fruits, vehicles, emotions, jobs and all my world, with Sabi.', it: 'Frutta, veicoli, emozioni, mestieri e tutto il mio mondo, con Sabi.', zh: '水果、交通工具、情绪、职业，和知宝一起认识我的世界。' },
  },
];

export async function createPlaylist(channel: string, title: string, description: string): Promise<string> {
  const token = await getYtAccessToken(channel);
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { title, description }, status: { privacyStatus: 'public' } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`playlists.insert ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}

export async function addToPlaylist(channel: string, playlistId: string, videoId: string) {
  const token = await getYtAccessToken(channel);
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
  });
  if (!r.ok) throw new Error(`playlistItems.insert ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Devuelve la playlist (key) a la que pertenece un tema. */
export function playlistForTopic(slug: string): string | undefined {
  return PLAYLISTS.find((p) => p.topics.includes(slug))?.key;
}
