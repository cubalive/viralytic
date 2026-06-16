// Login OAuth de un canal de YouTube. Uso: tsx scripts/yt-auth.ts <es|en>
import { runAuthFlow } from '../src/youtube/auth';

const channel = process.argv[2];
if (!channel) throw new Error('Uso: npm run yt-auth -- <es|en>  (autoriza el canal correcto en el navegador)');

const tok = await runAuthFlow(channel);
console.log(`\n✅ Canal "${channel}" autorizado. refresh_token: ${tok.refresh_token ? 'guardado' : 'FALTA'}`);
