# Admin — Fábrica de canales faceless

Motor autónomo que genera y publica Shorts (9:16) en varios canales de YouTube, con un **admin de un botón**.

> Carpeta de nivel raíz **fuera** del workspace pnpm (`apps/*`, `packages/*`) → no afecta el build de `apps/web` ni el deploy de Vercel. Corre standalone con `tsx`.

## 🎛️ Admin de un botón

```bash
cd admin
npx tsx scripts/admin.ts <canal> [cantidad=5]
```

| Comando | Qué hace |
|---|---|
| `admin.ts wealth` | Genera 5 videos frescos + publica — **World Wealth Mindset** (EN, finanzas) |
| `admin.ts kat-es` | **Katharsis Oficial** (ES, despertar) |
| `admin.ts kat-en` | **Katharsis Code** (EN, despertar) |
| `admin.ts sabikids` | **SabiKids** ES/EN/IT/ZH (infantil) — publica del backlog |
| `admin.ts all` | Los 7 canales de un golpe |

Cada botón: **temas frescos** (IA, nunca repite) → **genera** con retención máxima (hook 0.5s, fragmentos 1-3 palabras, texto pop-in, zoom alternado, payoff + loop) → **publica/programa** con metadata SEO fuerte + playlist de pilar + drip diario.

## 🧱 Arquitectura

- `scripts/admin.ts` — orquestador (un botón por canal).
- `scripts/gen-wealth-batch.ts`, `gen-awakening-batch.ts` — motores faceless (mezcla foto-zoom + clips del banco, frase al beat).
- `scripts/gen-*-bank.ts` — pobla el **banco de video Veo clasificado** (reutilizable; el costo de Veo es una sola vez).
- `scripts/yt-kat-publish.ts`, `yt-publish-all.ts` — publicadores (metadata SEO + pilar→playlist + drip).
- `src/bank/videobank.ts` — banco clasificado y reutilizable.
- `src/faceless/topics.ts` — generador de temas frescos infinitos.
- `src/beat/detect.ts` — detección de golpes de bajo para sincronizar cortes.

## 🔐 Local (no en git)

`.env` (claves), `data/youtube/tokens/` (7 canales), `data/output/` (videos), `data/bank/**/clips/` (clips Veo). Ver `.env.example`.

## 📅 Diario automático

`scripts/daily-all.cmd` corre `admin all 5`. Para programarlo (Windows):
```
schtasks /Create /TN "Viralytic Admin" /TR "C:\Users\alain\Desktop\viralytic\admin\scripts\daily-all.cmd" /SC DAILY /ST 09:00 /F
```

## 📺 Canales (7)

| Token | Canal | Idioma | Nicho |
|---|---|---|---|
| `wealth` | World Wealth Mindset | EN | Finanzas / mentalidad de riqueza (CPM alto) |
| `kat-es` / `kat-en` | Katharsis Oficial / Code | ES / EN | Despertar / motivación |
| `es`/`en`/`it`/`zh` | SabiKids (×4) | ES/EN/IT/ZH | Infantil educativo |
