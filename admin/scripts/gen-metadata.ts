// Metadata YouTube (canal + por video) para ES/EN/IT/ZH, con SEO + hashtags en minúsculas.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { writeJson, ensureDir } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';

type Lang = 'es' | 'en' | 'it' | 'zh';

const TOPICS: { slug: string; emoji: string; name: Record<Lang, string>; kw: string[] }[] = [
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

const BASE_TAGS: Record<Lang, string[]> = {
  es: ['Sabi', 'Sabi Kids', 'aprender para niños', 'videos educativos', 'educación infantil', 'preescolar', 'aprende jugando', 'videos para niños', 'dibujos animados'],
  en: ['Sabi', 'Sabi Kids', 'learning for kids', 'educational videos', 'preschool', 'toddler learning', 'learn and play', 'kids videos', 'cartoons for kids'],
  it: ['Sabi', 'Sabi Kids', 'imparare per bambini', 'video educativi', 'scuola materna', 'bambini', 'impara giocando', 'cartoni per bambini'],
  zh: ['知宝', 'ZhiBao', '儿童学习', '幼儿教育', '启蒙', '宝宝', '玩中学', '儿歌', '早教'],
};

const BASE_HASH: Record<Lang, string[]> = {
  es: ['#sabikids', '#aprendeconsabi', '#videoseducativos', '#paraniños', '#educacióninfantil', '#preescolar', '#aprenderjugando', '#videosparaniños', '#niños', '#shorts'],
  en: ['#sabikids', '#learnwithsabi', '#educationalvideos', '#forkids', '#preschool', '#toddlers', '#learning', '#kidsvideos', '#kids', '#shorts'],
  it: ['#sabikids', '#imparaconsabi', '#videoeducativi', '#perbambini', '#scuolamaterna', '#bambini', '#imparagiocando', '#videoperbambini', '#shorts'],
  zh: ['#知宝', '#儿童学习', '#幼儿教育', '#启蒙', '#宝宝', '#玩中学', '#儿歌', '#早教', '#shorts'],
};

const CHANNELS: Record<Lang, { handle: string; title: string; description: string }> = {
  es: { handle: '@SabiKids', title: 'Sabi Kids 🤖 Aprende Jugando',
    description: `¡Bienvenidos a Sabi Kids! 🤖✨ Soy Sabi, tu amiguito robot, y este es tu canal de videos educativos para niños y bebés. Aquí los más pequeños, de 2 a 8 años, aprenden jugando: los animales de la granja, de la selva y del mar y sus sonidos, los colores, los números del 1 al 10, las formas, las frutas, los vehículos, las emociones, el abecedario, las profesiones, el cuerpo humano, los opuestos y mucho más. 🐄🎨🔢🚗\n\nNuestros videos son cortos, alegres, coloridos y 100% seguros para niños pequeños, perfectos para preescolar y para aprender en casa. Cada video enseña una sola idea de forma simple y divertida, con sonidos reales y la voz amigable de Sabi. 👶🎉\n\nSuscríbete y activa la campanita 🔔 para no perderte ningún video educativo nuevo cada semana. ¡Aprende jugando con Sabi Kids! 🚀\n\n#SabiKids #VideosParaNiños #EducaciónInfantil #Preescolar` },
  en: { handle: '@SabiKidsEN', title: 'Sabi Kids 🤖 Learn & Play',
    description: `Welcome to Sabi Kids! 🤖✨ I'm Sabi, your little robot friend, and this is your channel of educational videos for kids and toddlers. Here little ones aged 2 to 8 learn while playing: farm, jungle and sea animals and their sounds, colors, numbers 1 to 10, shapes, fruits, vehicles, emotions, the alphabet, jobs, the human body, opposites and so much more. 🐄🎨🔢🚗\n\nOur videos are short, cheerful, colorful and 100% safe for little kids, perfect for preschool and learning at home. Each video teaches one simple idea in a fun way, with real sounds and Sabi's friendly voice. 👶🎉\n\nSubscribe and ring the bell 🔔 so you never miss a new educational video every week. Learn and play with Sabi Kids! 🚀\n\n#SabiKids #VideosForKids #PreschoolLearning #Toddlers` },
  it: { handle: '@SabiKidsIT', title: 'Sabi Kids 🤖 Impara Giocando',
    description: `Benvenuti su Sabi Kids! 🤖✨ Sono Sabi, il tuo amico robottino, e questo è il tuo canale di video educativi per bambini e neonati. Qui i più piccoli, dai 2 agli 8 anni, imparano giocando: gli animali della fattoria, della giungla e del mare e i loro versi, i colori, i numeri da 1 a 10, le forme, la frutta, i veicoli, le emozioni, l'alfabeto, i mestieri, il corpo umano, i contrari e tanto altro. 🐄🎨🔢🚗\n\nI nostri video sono brevi, allegri, colorati e 100% sicuri per i bambini piccoli, perfetti per la scuola materna e per imparare a casa. Ogni video insegna una sola idea in modo semplice e divertente, con suoni reali e la voce amichevole di Sabi. 👶🎉\n\nIscriviti e attiva la campanella 🔔 per non perdere nessun nuovo video ogni settimana. Impara giocando con Sabi Kids! 🚀\n\n#SabiKids #VideoPerBambini #ScuolaMaterna` },
  zh: { handle: '@ZhiBao', title: '知宝 🤖 玩中学',
    description: `欢迎来到知宝！🤖✨ 我是知宝，你的机器人小伙伴，这是你的儿童早教视频频道。在这里，2到8岁的宝宝们一起玩中学：农场、丛林和海洋的动物以及它们的叫声、颜色、1到10的数字、形状、水果、交通工具、情绪、字母、职业、人体、反义词等等。🐄🎨🔢🚗\n\n我们的视频短小、欢乐、色彩丰富，100%安全，适合幼儿，非常适合幼儿园和在家学习。每个视频用简单有趣的方式只教一个知识点，配有真实的声音和知宝亲切的声音。👶🎉\n\n订阅并打开小铃铛 🔔，不错过每周更新的早教视频。和知宝一起玩中学吧！🚀\n\n#知宝 #儿童学习 #幼儿教育 #启蒙` },
};

// Keywords del canal (hasta ~500 caracteres) — densas para búsqueda.
const CH_KEYWORDS: Record<Lang, string[]> = {
  es: ['videos para niños', 'videos educativos', 'videos para bebés', 'educación infantil', 'preescolar', 'aprende jugando', 'dibujos animados educativos', 'animales para niños', 'colores para niños', 'números para niños', 'canciones infantiles', 'videos para niños pequeños', 'Sabi Kids', 'sonidos de animales', 'educación preescolar', 'estimulación temprana', 'videos para niños de 2 años', 'aprender para niños'],
  en: ['videos for kids', 'educational videos', 'videos for babies', 'preschool', 'learn and play', 'educational cartoons', 'animals for kids', 'colors for kids', 'numbers for kids', 'nursery videos', 'videos for toddlers', 'Sabi Kids', 'animal sounds', 'preschool learning', 'early learning', 'kids learning videos', 'toddler videos', 'learning for kids'],
  it: ['video per bambini', 'video educativi', 'video per neonati', 'scuola materna', 'impara giocando', 'cartoni educativi', 'animali per bambini', 'colori per bambini', 'numeri per bambini', 'canzoni per bambini', 'Sabi Kids', 'versi degli animali', 'educazione prescolare', 'apprendimento precoce', 'video per bambini piccoli', 'imparare per bambini'],
  zh: ['儿童视频', '儿童学习', '幼儿教育', '启蒙', '玩中学', '早教动画', '动物儿歌', '颜色', '数字', '宝宝视频', '知宝', '动物叫声', '幼儿园', '早教视频', '宝宝启蒙', '亲子', '益智视频', '学龄前教育'],
};

const TITLE_TMPL: Record<Lang, (e: string, n: string) => string> = {
  es: (e, n) => `${e} ${n} para Niños y Bebés 👶 Aprende Jugando con Sabi Kids`,
  en: (e, n) => `${e} ${n} for Kids & Toddlers 👶 Learn & Play with Sabi Kids`,
  it: (e, n) => `${e} ${n} per Bambini e Neonati 👶 Impara Giocando con Sabi Kids`,
  zh: (e, n) => `${e} ${n} 儿童早教启蒙 👶 和知宝一起玩中学`,
};
// Descripción con keywords AL INICIO (lo que más pesa para el algoritmo).
const INTRO: Record<Lang, (n: string) => string> = {
  es: (n) => `${n} para niños y bebés 👶 ¡Aprende ${n.toLowerCase()} con Sabi! Video educativo cortito, divertido y 100% seguro para niños pequeños de 2 a 8 años (preescolar). 🤖✨\n\n¡Dale me gusta 👍 y suscríbete para más videos educativos para niños cada semana! 🎉`,
  en: (n) => `${n} for kids and toddlers 👶 Learn ${n.toLowerCase()} with Sabi! A short, fun and 100% safe educational video for little kids ages 2-8 (preschool). 🤖✨\n\nLike 👍 and subscribe for more learning videos for kids every week! 🎉`,
  it: (n) => `${n} per bambini e neonati 👶 Impara ${n.toLowerCase()} con Sabi! Un video educativo breve e 100% sicuro per bambini piccoli dai 2 agli 8 anni (scuola materna). 🤖✨\n\nMetti mi piace 👍 e iscriviti per più video educativi ogni settimana! 🎉`,
  zh: (n) => `${n} 儿童早教 👶 和知宝一起学${n}！短小、安全、有趣的启蒙教育视频，适合2-8岁的宝宝。🤖✨\n\n点赞 👍 并订阅，每周更多儿童学习视频！🎉`,
};
// Tags long-tail (lo que buscan los padres).
const LONG: Record<Lang, (n: string) => string[]> = {
  es: (n) => [`${n.toLowerCase()} para niños`, `${n.toLowerCase()} para bebés`, `aprender ${n.toLowerCase()}`, 'videos educativos para niños', 'videos para bebés', 'educación preescolar', 'videos para niños pequeños'],
  en: (n) => [`${n.toLowerCase()} for kids`, `${n.toLowerCase()} for toddlers`, `learn ${n.toLowerCase()}`, 'educational videos for kids', 'videos for babies', 'preschool learning', 'learning videos for toddlers'],
  it: (n) => [`${n.toLowerCase()} per bambini`, `imparare ${n.toLowerCase()}`, 'video educativi per bambini', 'video per neonati', 'scuola materna', 'video per bambini piccoli'],
  zh: (n) => [`${n}儿童`, `学${n}`, '儿童早教视频', '宝宝启蒙', '幼儿教育视频', '早教动画'],
};

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9áéíóúñü一-鿿]+/g, '');

function hashtags(topic: typeof TOPICS[number], lang: Lang): string[] {
  const topical = ['#' + norm(topic.name[lang]), ...topic.kw.map((k) => '#' + norm(k))];
  const all = [...topical, ...BASE_HASH[lang]];
  return [...new Set(all)].filter((h) => h.length > 1).slice(0, 14); // YouTube ignora si >15
}

const DIR = path.join(OUTPUT_DIR, '..', 'youtube');
let md = '# Metadata YouTube — Sabi Kids (SEO + hashtags)\n';

for (const lang of ['es', 'en', 'it', 'zh'] as Lang[]) {
  await writeJson(path.join(DIR, `channel_${lang}.json`), { ...CHANNELS[lang], keywords: CH_KEYWORDS[lang] });
  md += `\n## ${CHANNELS[lang].handle} (${lang})\n`;
  for (const t of TOPICS) {
    const tags = hashtags(t, lang);
    const meta = {
      title: TITLE_TMPL[lang](t.emoji, t.name[lang]),
      description: `${INTRO[lang](t.name[lang])}\n\n${tags.join(' ')}`,
      tags: [...new Set([...t.kw, ...LONG[lang](t.name[lang]), ...BASE_TAGS[lang]])].slice(0, 18),
      categoryId: '27',
      madeForKids: true,
      file: `data/output/SABI_REELS/${lang}/${t.slug}.mp4`,
    };
    await writeJson(path.join(DIR, lang, `${t.slug}.json`), meta);
    md += `- ${meta.title}\n  ${tags.join(' ')}\n`;
  }
}
await ensureDir(DIR);
await fsp.writeFile(path.join(DIR, 'METADATA.md'), md, 'utf8');
console.log(`Metadata + hashtags generada: ${TOPICS.length} temas × 4 idiomas.`);
