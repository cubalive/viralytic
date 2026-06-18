// Fuente ÚNICA de verdad para el SEO de SabiKids (ES/EN/IT/ZH):
//   • catálogo de temas con nombre localizado + emoji + keywords
//   • marca limpia por idioma (sin emojis, para la estructura del título)
//   • resolución slug → tema localizado (los published_*.json usan slugs ES)
//   • system prompt de SEO 2026 afinado para un canal infantil (made-for-kids)
// La usan gen-metadata.ts (plantilla base), sabikids-daily.ts (remixes) y
// reupdate-metadata.ts (re-sync de videos ya publicados vía YouTube API).

export type SabiLang = 'es' | 'en' | 'it' | 'zh';
export const SABI_LANGS: SabiLang[] = ['es', 'en', 'it', 'zh'];

// Marca limpia para la estructura "keyword | beneficio | MARCA" (sin emoji/eslogan).
export const SABI_BRAND: Record<SabiLang, string> = {
  es: 'Sabi Kids',
  en: 'Sabi Kids',
  it: 'Sabi Kids',
  zh: '知宝',
};

const LANG_FULL: Record<SabiLang, string> = {
  es: 'Spanish',
  en: 'English',
  it: 'Italian',
  zh: 'Simplified Chinese',
};

export interface SabiTopic {
  slug: string;
  emoji: string;
  name: Record<SabiLang, string>;
  kw: string[];
}

// Los 20 temas base del canal. El slug es ES (es como están en published_*.json).
export const SABI_TOPICS: SabiTopic[] = [
  { slug: 'los-animales-de-la-granja', emoji: '🐄', name: { es: 'Los Animales de la Granja', en: 'Farm Animals', it: 'Gli Animali della Fattoria', zh: '农场动物' }, kw: ['animales', 'granja', 'farm animals', 'animali', '动物'] },
  { slug: 'los-colores', emoji: '🎨', name: { es: 'Los Colores', en: 'Colors', it: 'I Colori', zh: '颜色' }, kw: ['colores', 'colors', 'colori', '颜色'] },
  { slug: 'los-n-meros-del-1-al-10', emoji: '🔢', name: { es: 'Los Números del 1 al 10', en: 'Numbers 1 to 10', it: 'I Numeri da 1 a 10', zh: '1到10的数字' }, kw: ['numeros', 'numbers', 'contar', 'numeri', '数字'] },
  { slug: 'los-animales-de-la-selva', emoji: '🦁', name: { es: 'Los Animales de la Selva', en: 'Jungle Animals', it: 'Gli Animali della Giungla', zh: '丛林动物' }, kw: ['animales', 'selva', 'jungle', 'leon', '动物'] },
  { slug: 'las-frutas', emoji: '🍓', name: { es: 'Las Frutas', en: 'Fruits', it: 'La Frutta', zh: '水果' }, kw: ['frutas', 'fruits', 'frutta', '水果'] },
  { slug: 'las-formas', emoji: '🔺', name: { es: 'Las Formas', en: 'Shapes', it: 'Le Forme', zh: '形状' }, kw: ['formas', 'shapes', 'forme', '形状'] },
  { slug: 'los-veh-culos', emoji: '🚗', name: { es: 'Los Vehículos', en: 'Vehicles', it: 'I Veicoli', zh: '交通工具' }, kw: ['vehiculos', 'vehicles', 'carros', 'veicoli', '车'] },
  { slug: 'los-animales-del-mar', emoji: '🐠', name: { es: 'Los Animales del Mar', en: 'Sea Animals', it: 'Gli Animali del Mare', zh: '海洋动物' }, kw: ['animales', 'mar', 'sea animals', 'oceano', '海洋'] },
  { slug: 'las-emociones', emoji: '😊', name: { es: 'Las Emociones', en: 'Emotions', it: 'Le Emozioni', zh: '情绪' }, kw: ['emociones', 'emotions', 'emozioni', '情绪'] },
  { slug: 'los-sonidos-de-los-animales', emoji: '🔊', name: { es: 'Los Sonidos de los Animales', en: 'Animal Sounds', it: 'I Versi degli Animali', zh: '动物的叫声' }, kw: ['sonidos', 'animal sounds', 'animales', '动物叫声'] },
  { slug: 'el-abecedario', emoji: '🔤', name: { es: 'El Abecedario', en: 'The Alphabet', it: "L'Alfabeto", zh: '字母' }, kw: ['abecedario', 'alphabet', 'letras', 'abc', '字母'] },
  { slug: 'las-mascotas', emoji: '🐶', name: { es: 'Las Mascotas', en: 'Pets', it: 'Gli Animali Domestici', zh: '宠物' }, kw: ['mascotas', 'pets', 'perro', 'gato', '宠物'] },
  { slug: 'el-cuerpo-humano', emoji: '🧍', name: { es: 'El Cuerpo Humano', en: 'The Human Body', it: 'Il Corpo Umano', zh: '人体' }, kw: ['cuerpo', 'body', 'corpo', '人体'] },
  { slug: 'la-ropa', emoji: '👕', name: { es: 'La Ropa', en: 'Clothes', it: 'I Vestiti', zh: '衣服' }, kw: ['ropa', 'clothes', 'vestiti', '衣服'] },
  { slug: 'las-profesiones', emoji: '👩‍🚒', name: { es: 'Las Profesiones', en: 'Jobs', it: 'I Mestieri', zh: '职业' }, kw: ['profesiones', 'jobs', 'oficios', 'mestieri', '职业'] },
  { slug: 'el-clima-y-las-estaciones', emoji: '☀️', name: { es: 'El Clima y las Estaciones', en: 'Weather and Seasons', it: 'Il Tempo e le Stagioni', zh: '天气和季节' }, kw: ['clima', 'weather', 'estaciones', 'tempo', '天气'] },
  { slug: 'los-insectos', emoji: '🐛', name: { es: 'Los Insectos', en: 'Insects', it: 'Gli Insetti', zh: '昆虫' }, kw: ['insectos', 'insects', 'bichos', 'insetti', '昆虫'] },
  { slug: 'el-espacio-y-los-planetas', emoji: '🪐', name: { es: 'El Espacio y los Planetas', en: 'Space and Planets', it: 'Lo Spazio e i Pianeti', zh: '太空和行星' }, kw: ['espacio', 'space', 'planetas', 'spazio', '太空'] },
  { slug: 'los-instrumentos-musicales', emoji: '🎸', name: { es: 'Los Instrumentos Musicales', en: 'Musical Instruments', it: 'Gli Strumenti Musicali', zh: '乐器' }, kw: ['instrumentos', 'instruments', 'musica', 'strumenti', '乐器'] },
  { slug: 'los-opuestos', emoji: '🔄', name: { es: 'Los Opuestos', en: 'Opposites', it: 'I Contrari', zh: '反义词' }, kw: ['opuestos', 'opposites', 'contrari', '反义词'] },
];

// Quita el sufijo de variante (_v1, _v2…) y el prefijo remix- para mapear al tema canónico.
const canonicalSlug = (slug: string) => slug.replace(/_v\d+$/i, '').replace(/^remix-/, '');

/** Resuelve un slug (siempre en ES) al tema localizado del idioma pedido. */
export function resolveTopic(slug: string, lang: SabiLang): { name: string; emoji: string; kw: string[] } {
  const base = canonicalSlug(slug);
  const t = SABI_TOPICS.find((x) => x.slug === base);
  if (t) return { name: t.name[lang], emoji: t.emoji, kw: t.kw };
  return { name: base.replace(/-/g, ' ').trim(), emoji: '🤖', kw: [] };
}

/**
 * System prompt de SEO 2026 afinado para SabiKids (made-for-kids).
 * Lo comparten el re-sync de videos publicados y el orquestador diario.
 */
export function kidsSeoSystem(
  lang: SabiLang,
  opts: { brand: string; channelDesc?: string; keywords?: string[]; kind?: 'short' | 'compilation' },
): string {
  const { brand, channelDesc = '', keywords = [], kind = 'short' } = opts;
  const langName = LANG_FULL[lang] || 'English';
  const core = keywords.slice(0, 15).join(', ');
  const niche = channelDesc ? `Channel: ${channelDesc.split('\n')[0].slice(0, 220)}.` : '';
  return [
    `You are the world's #1 YouTube SEO strategist (2026 best practices) for "${brand}", a faceless EDUCATIONAL channel for young children.`,
    `This content is MADE FOR KIDS (COPPA): wholesome, calm and safe — no clickbait, no scary or violent ideas, no external sign-up links, no adult themes.`,
    `Audience = parents/caregivers searching a short safe video for a toddler or preschooler, AND the kids watching. Optimize for that search intent (e.g. "<topic> for kids", "<topic> for toddlers", "learn <topic> preschool", "nursery", "para niños", "para bebés").`,
    `Write ALL output STRICTLY in ${langName}. Warm, simple, human — NEVER keyword-stuff, NEVER use AI clichés. Use the LOCALIZED primary keyword for the topic; do not keep a foreign-language keyword in the title.`,
    kind === 'compilation'
      ? 'This is a LONG learning compilation — optimize for watch-time and binge sessions (mention it covers several topics back to back).'
      : 'This is a SHORT educational video teaching one simple idea.',
    `Return ONLY JSON with:`,
    `- titulo: <=100 characters. Structure "localized primary keyword | clear benefit for kids/parents | ${brand}". Primary keyword FIRST, natural, 1-2 friendly emojis ok, no clickbait.`,
    `- descripcion: a RICH SEO description (aim 1500-3000 characters). (1) INTRO — warm hook + exactly what the child will learn + the age range (2-8) + primary & secondary keywords. (2) BODY — what the video covers, related early-learning concepts and entities, answer common PARENT questions, weave long-tail phrases and synonyms naturally (for toddlers, for babies, preschool, nursery, learn at home, bedtime, screen-time-safe). (3) AUTHORITY — one or two lines on what "${brand}" is and why to follow (new safe educational videos every week, one idea per video). (4) END — warm CTA (subscribe + ring the bell, watch another video, the matching playlist), a friendly invitation for parents to comment, then a FINAL line with 3-5 highly relevant hashtags only (topic + niche + brand — no hashtag spam).`,
    `- tags: 18-26 specific tags (~500 characters total): the localized primary keyword, parent long-tail searches ("<topic> for kids/toddlers/babies", "preschool", "nursery"), the brand, related early-learning entities, and 2-3 cross-language variants for diaspora reach. No duplicates, no other brand name.`,
    `CHANNEL ECOSYSTEM — every video is ONE node in "${brand}"'s semantic ecosystem: reinforce topical authority on early-childhood learning and link semantically to sibling videos (animals, colors, numbers, shapes, emotions, alphabet, body, jobs...). ${niche} Weave these CORE channel keywords consistently for long-term recommendation growth (not one-off ranking): ${core}.`,
  ].join('\n');
}
