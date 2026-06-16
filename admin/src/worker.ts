import http from 'node:http';
import { selectEduFormats } from './formats/selector';
import { produceEduReel } from './edu/produce-edu';
import { log } from './lib/log';

const PORT = Number(process.env.PORT ?? 8080);

async function readBody(req: http.IncomingMessage): Promise<any> {
  let body = '';
  for await (const c of req) body += c;
  return body ? JSON.parse(body) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // POST /produce-edu  { tema, lang?, format?, mood? }
    if (req.method === 'POST' && req.url === '/produce-edu') {
      const { tema, lang = 'es', format = 'con_objetos', mood } = await readBody(req);
      if (!tema) { res.writeHead(400); res.end('falta "tema"'); return; }
      log.info(`/produce-edu: ${tema} (${lang}, ${format})`);
      const res2 = await selectEduFormats(tema);
      const sel = res2.seleccion.find((s) => s.slug === format) ?? res2.seleccion[0];
      const reel = await produceEduReel(sel, { topic: tema, lang, mood });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reel, formato: sel.slug }));
      return;
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    log.err((e as Error).message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
});

server.listen(PORT, () => log.ok(`Worker Kids Studio escuchando en :${PORT}`));
