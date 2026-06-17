// Aplica metadata de canal (descripción + keywords + país + idioma) a los canales
// VIRALYTIC conectados en Supabase (Caroline, Zuri ES/EN/ZH, Vallenato). Usa el
// token cifrado de mv_youtube_connections. Idempotente. Salta los no conectados.
// Uso: pnpm --filter @viralytic/workers tsx src/scripts/brand-viralytic.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { youtube } from '@viralytic/integrations';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Meta = { name: string; description: string; keywords: string[]; country: string; lang: string };
const CHANNELS: Record<string, Meta> = {
  // Caroline Music Show
  UCykEocOmaY4RCDHUAuVVn0g: {
    name: 'Caroline Music Show',
    description:
      'Caroline Music Show 🎙️ — sesiones íntimas de R&B y dembow con alma. Voz con brillo, micrófono dorado y luz tenue: canciones para sentir, sanar y despertar.\n\nNuevos temas con regularidad. Suscríbete para no perderte cada sesión.\n🎵 TikTok: @carolinemusicshow',
    keywords: ['caroline', 'r&b', 'dembow', 'rnb en español', 'soul latino', 'música sensual', 'sesiones íntimas', 'baladas', 'música para el alma'],
    country: 'US', lang: 'es',
  },
  // Zuri Rockstar (ES)
  UChtY1geYlt2DEIDpUqA0f8A: {
    name: 'Zuri Rockstar (ES)',
    description:
      'Zuri Rockstar 🎸 — la suricata estrella de rock para niños. Canciones originales de pop/rock sobre amistad, emociones y creer en ti. Para peques de 4 a 12 años.\n\nNueva música cada semana. ¡Suscríbete y a cantar!',
    keywords: ['zuri', 'zuri rockstar', 'música para niños', 'canciones infantiles', 'pop rock infantil', 'rock para niños', 'emociones niños', 'amistad'],
    country: 'US', lang: 'es',
  },
  // Zuri RockStar (English)
  UCnKDohCtkGtpYfFubwL79MQ: {
    name: 'Zuri RockStar (English)',
    description:
      'Zuri RockStar 🎸 — the meerkat rock star for kids. Original pop/rock songs about friendship, feelings and believing in yourself. For kids ages 4–12.\n\nNew music every week. Subscribe and sing along!',
    keywords: ['zuri', 'zuri rockstar', 'kids music', 'songs for kids', 'kids pop rock', 'rock for kids', 'feelings songs', 'friendship'],
    country: 'US', lang: 'en',
  },
  // 祖瑞摇滚秀 (ZH simplified)
  UC8mUcxVX_wrAU4oVDvz907A: {
    name: '祖瑞摇滚秀',
    description: '祖瑞摇滚秀 🎸 — 为孩子打造的猫鼬摇滚明星。关于友谊、情感和自信的原创流行摇滚歌曲，适合 4-12 岁的孩子。\n\n每周更新新歌，订阅一起唱吧！',
    keywords: ['祖瑞', '儿童音乐', '儿歌', '儿童流行摇滚', '情感', '友谊', 'kids music', 'zuri'],
    country: 'TW', lang: 'zh',
  },
  // Vallenatos para Curar el Alma
  UC12Mp8PiLu4KIPtO78fSToQ: {
    name: 'Vallenatos para Curar el Alma',
    description:
      'Vallenatos para Curar el Alma 🪗❤️ — los vallenatos más bonitos para sentir, sanar y recordar. Acordeón, caja y guacharaca con letras que llegan al corazón.\n\nSuscríbete y activa la campana 🔔.\n🎵 TikTok: @vallenatoinc',
    keywords: ['vallenato', 'vallenatos', 'vallenato romantico', 'musica vallenata', 'vallenatos viejos', 'acordeon', 'musica colombiana', 'vallenatos para el desamor'],
    country: 'CO', lang: 'es',
  },
};

for (const [chId, m] of Object.entries(CHANNELS)) {
  const { data: conns } = await db
    .from('mv_youtube_connections').select('*')
    .eq('youtube_channel_id', chId).eq('connection_status', 'connected').limit(1);
  const conn = conns?.[0];
  if (!conn) { console.log(`— ${m.name}: no conectado/expired, salto`); continue; }
  try {
    const keywords = m.keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' ');
    await youtube.updateChannelBranding(db as any, conn as any, { description: m.description, keywords, country: m.country, defaultLanguage: m.lang });
    console.log(`✓ ${m.name} — país ${m.country}, idioma ${m.lang}`);
  } catch (e) { console.log(`✗ ${m.name}: ${(e as Error).message.slice(0, 90)}`); }
}
console.log('\n✅ brand-viralytic terminado.');
