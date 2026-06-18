// Metadata YouTube (canal + por video) para ES/EN/IT/ZH — estándar SEO 2026:
// títulos keyword-first, descripciones ricas (intro → cuerpo → autoridad → CTA),
// tags ~500 caracteres y hashtags curados. Los temas vienen del catálogo único
// en src/seo/sabikids.ts (misma fuente que el re-sync y el orquestador diario).
import path from 'node:path';
import fsp from 'node:fs/promises';
import { writeJson, ensureDir } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { SABI_TOPICS, type SabiLang } from '../src/seo/sabikids';

type Lang = SabiLang;

const BASE_TAGS: Record<Lang, string[]> = {
  es: ['Sabi', 'Sabi Kids', 'aprender para niños', 'videos educativos', 'educación infantil', 'preescolar', 'aprende jugando', 'videos para niños', 'dibujos animados', 'estimulación temprana'],
  en: ['Sabi', 'Sabi Kids', 'learning for kids', 'educational videos', 'preschool', 'toddler learning', 'learn and play', 'kids videos', 'cartoons for kids', 'early learning'],
  it: ['Sabi', 'Sabi Kids', 'imparare per bambini', 'video educativi', 'scuola materna', 'bambini', 'impara giocando', 'cartoni per bambini', 'apprendimento precoce'],
  zh: ['知宝', 'ZhiBao', '儿童学习', '幼儿教育', '启蒙', '宝宝', '玩中学', '儿歌', '早教', '亲子'],
};

// Hashtags curados (3-5 fuertes, sin spam). Sin #shorts (los edu ya no son Shorts).
const HASH_CORE: Record<Lang, string[]> = {
  es: ['#sabikids', '#videoseducativos', '#paraniños'],
  en: ['#sabikids', '#educationalvideos', '#forkids'],
  it: ['#sabikids', '#videoeducativi', '#perbambini'],
  zh: ['#知宝', '#儿童学习', '#幼儿教育'],
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

// Keywords del canal (densas para búsqueda).
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

// Descripción rica 2026: intro (keywords) → qué aprende → para padres → autoridad → CTA → hashtags.
const DESC: Record<Lang, (n: string, hashtags: string) => string> = {
  es: (n, h) => {
    const nl = n.toLowerCase();
    return `${n} para niños y bebés 👶 Aprende ${nl} con Sabi Kids, el canal de videos educativos para los más pequeños. En este video corto, alegre y 100% seguro, los niños de 2 a 8 años descubren ${nl} de forma simple y divertida, con colores vivos, sonidos reales y la voz amigable de Sabi. 🤖✨\n\n✨ ¿Qué aprende tu peque?\nTu niño aprende ${nl} paso a paso: vocabulario nuevo, reconocimiento visual y asociación de ideas. Perfecto para la estimulación temprana en casa o en preescolar, para la hora de aprender, para calmar antes de dormir o para disfrutar en familia.\n\n👨‍👩‍👧 Para papás y educadores\nMuchos padres buscan ${nl} para niños, ${nl} para bebés y videos educativos cortos y seguros. Sabi Kids está pensado para eso: una sola idea por video, sin sustos ni ruido molesto, apto para YouTube Kids.\n\n🤖 Sobre Sabi Kids\nSabi Kids es el canal donde los niños aprenden jugando: los animales, los colores, los números, las formas, las frutas, las emociones, el abecedario, las profesiones y mucho más. Subimos nuevos videos educativos cada semana.\n\n🔔 Suscríbete y activa la campanita para no perderte ningún video. ¡Dale me gusta 👍, comparte con otros papás y mira la playlist completa para seguir aprendiendo con Sabi! 🎉\n\n${h}`;
  },
  en: (n, h) => {
    const nl = n.toLowerCase();
    return `${n} for kids and toddlers 👶 Learn ${nl} with Sabi Kids, the educational channel for little ones. In this short, cheerful and 100% safe video, children ages 2 to 8 discover ${nl} in a simple and fun way, with bright colors, real sounds and Sabi's friendly voice. 🤖✨\n\n✨ What will your little one learn?\nYour child learns ${nl} step by step: new vocabulary, visual recognition and idea association. Perfect for early learning at home or in preschool — for learning time, to calm down before bed, or to enjoy together as a family.\n\n👨‍👩‍👧 For parents and teachers\nMany parents search for ${nl} for kids, ${nl} for toddlers and short, safe educational videos. That's exactly what Sabi Kids is made for: one simple idea per video, no scares and no harsh noise, safe for YouTube Kids.\n\n🤖 About Sabi Kids\nSabi Kids is the channel where children learn while playing: animals, colors, numbers, shapes, fruits, emotions, the alphabet, jobs and much more. We upload new educational videos every week.\n\n🔔 Subscribe and ring the bell so you never miss a video. Give it a like 👍, share it with other parents and watch the full playlist to keep learning with Sabi! 🎉\n\n${h}`;
  },
  it: (n, h) => {
    const nl = n.toLowerCase();
    return `${n} per bambini e neonati 👶 Impara ${nl} con Sabi Kids, il canale di video educativi per i più piccoli. In questo video breve, allegro e 100% sicuro, i bambini dai 2 agli 8 anni scoprono ${nl} in modo semplice e divertente, con colori vivaci, suoni reali e la voce amichevole di Sabi. 🤖✨\n\n✨ Cosa imparerà il tuo bambino?\nIl tuo bambino impara ${nl} passo dopo passo: nuovo vocabolario, riconoscimento visivo e associazione di idee. Perfetto per l'apprendimento precoce a casa o alla scuola materna — per il momento di imparare, per calmarsi prima di dormire o da gustare in famiglia.\n\n👨‍👩‍👧 Per genitori ed educatori\nMolti genitori cercano ${nl} per bambini, ${nl} per neonati e video educativi brevi e sicuri. Sabi Kids è pensato proprio per questo: una sola idea per video, senza spaventi né rumori fastidiosi, adatto a YouTube Kids.\n\n🤖 Su Sabi Kids\nSabi Kids è il canale dove i bambini imparano giocando: animali, colori, numeri, forme, frutta, emozioni, alfabeto, mestieri e tanto altro. Pubblichiamo nuovi video educativi ogni settimana.\n\n🔔 Iscriviti e attiva la campanella per non perdere nessun video. Metti mi piace 👍, condividi con altri genitori e guarda la playlist completa per continuare a imparare con Sabi! 🎉\n\n${h}`;
  },
  zh: (n, h) =>
    `${n} 儿童早教启蒙 👶 和知宝一起学${n}！知宝是专为低龄宝宝打造的儿童教育视频频道。在这个短小、欢乐、100%安全的视频里，2到8岁的小朋友用简单有趣的方式认识${n}，配有鲜艳的色彩、真实的声音和知宝亲切的声音。🤖✨\n\n✨ 宝宝能学到什么？\n宝宝会一步一步地学习${n}：新词汇、视觉认知和联想能力，非常适合在家或幼儿园进行早教启蒙，可以用于学习时间、睡前安抚，也适合亲子共看。\n\n👨‍👩‍👧 给爸爸妈妈和老师\n很多家长在找适合宝宝的${n}启蒙视频、安全又简短的儿童教育视频。知宝正是为此而生：每个视频只讲一个知识点，没有惊吓、没有刺耳的噪音，适合 YouTube Kids。\n\n🤖 关于知宝\n知宝是宝宝玩中学的频道：动物、颜色、数字、形状、水果、情绪、字母、职业等等。我们每周更新全新的早教视频。\n\n🔔 订阅并打开小铃铛，不错过每一个视频。点赞 👍、分享给其他家长，并观看完整播放列表，和知宝一起继续学习吧！🎉\n\n${h}`,
};

// Tags long-tail (lo que buscan los padres).
const LONG: Record<Lang, (n: string) => string[]> = {
  es: (n) => [`${n.toLowerCase()} para niños`, `${n.toLowerCase()} para bebés`, `aprender ${n.toLowerCase()}`, 'videos educativos para niños', 'videos para bebés', 'educación preescolar', 'videos para niños pequeños', 'videos para niños de 2 años'],
  en: (n) => [`${n.toLowerCase()} for kids`, `${n.toLowerCase()} for toddlers`, `learn ${n.toLowerCase()}`, 'educational videos for kids', 'videos for babies', 'preschool learning', 'learning videos for toddlers', 'nursery videos'],
  it: (n) => [`${n.toLowerCase()} per bambini`, `imparare ${n.toLowerCase()}`, 'video educativi per bambini', 'video per neonati', 'scuola materna', 'video per bambini piccoli', 'apprendimento precoce'],
  zh: (n) => [`${n}儿童`, `学${n}`, `${n}启蒙`, '儿童早教视频', '宝宝启蒙', '幼儿教育视频', '早教动画', '幼儿园学习'],
};

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9áéíóúñü一-鿿]+/g, '');

// Hashtags 2026: 3-5 fuertes, sin spam ni #shorts.
function hashtags(topic: typeof SABI_TOPICS[number], lang: Lang): string[] {
  const all = ['#' + norm(topic.name[lang]), ...HASH_CORE[lang]];
  return [...new Set(all)].filter((h) => h.length > 1).slice(0, 5);
}

// Tags: 18-26, deduplicados, hasta ~500 caracteres.
function buildTags(list: string[]): string[] {
  const out: string[] = []; let total = 0;
  for (const raw of list) {
    const t = raw.trim();
    if (!t || out.includes(t)) continue;
    const add = t.length + (out.length ? 1 : 0);
    if (total + add > 480 || out.length >= 26) break;
    out.push(t); total += add;
  }
  return out;
}

const DIR = path.join(OUTPUT_DIR, '..', 'youtube');
let md = '# Metadata YouTube — Sabi Kids (SEO 2026)\n';

for (const lang of ['es', 'en', 'it', 'zh'] as Lang[]) {
  await ensureDir(path.join(DIR, lang));
  await writeJson(path.join(DIR, `channel_${lang}.json`), { ...CHANNELS[lang], keywords: CH_KEYWORDS[lang] });
  md += `\n## ${CHANNELS[lang].handle} (${lang})\n`;
  for (const t of SABI_TOPICS) {
    const hash = hashtags(t, lang);
    const meta = {
      title: TITLE_TMPL[lang](t.emoji, t.name[lang]).slice(0, 100),
      description: DESC[lang](t.name[lang], hash.join(' ')),
      tags: buildTags([t.name[lang], ...t.kw, ...LONG[lang](t.name[lang]), ...BASE_TAGS[lang]]),
      categoryId: '27',
      madeForKids: true,
      file: `data/output/SABI_REELS/${lang}/${t.slug}.mp4`,
    };
    await writeJson(path.join(DIR, lang, `${t.slug}.json`), meta);
    md += `- ${meta.title}\n  ${hash.join(' ')}\n`;
  }
}
await fsp.writeFile(path.join(DIR, 'METADATA.md'), md, 'utf8');
console.log(`Metadata SEO 2026 generada: ${SABI_TOPICS.length} temas × 4 idiomas.`);
