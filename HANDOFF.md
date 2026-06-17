# 🤝 HANDOFF — Coordinación entre los dos agentes

Dos agentes trabajan en este repo. Para **no chocar**, cada uno tiene su zona y sus canales.

---

## 🟦 Agente ADMIN — carpeta `admin/` (NO TOCAR desde el app)

| | |
|---|---|
| **Zona de código** | SOLO `admin/` |
| **OAuth app** | client `862676311505-…` — **EN PRODUCCIÓN** (tokens permanentes) |
| **Tokens** | `admin/data/youtube/tokens/` (local, gitignored) |
| **Canales** | World Wealth Mindset (EN) · Katharsis (ES/EN) · SabiKids (ES/EN/IT/ZH) |
| **Sistema** | `admin/scripts/admin.ts` (un botón: genera+publica+organiza banco) |
| **Supabase** | proyecto `ebkwgrvqavutbfxkwore` (assets kids-studio) |

➡️ El agente admin **NO** publica ni toca Zuri ni Caroline.

---

## 🟩 Agente VIRALYTIC — `apps/` y `packages/` (su dominio)

| | |
|---|---|
| **OAuth app** | client `174240363188-…` — **pasar de testing a producción** (tarea suya) |
| **Canales** | Zuri (ES/EN/ZH) · Caroline |
| **Videos** | en **Supabase storage** (no locales) |
| **Migraciones** | 011 mv_metadata + 012 mv_reels (ya aplicadas) |

---

## 📋 TAREA PARA EL AGENTE VIRALYTIC: meter Zuri/Caroline en el BANCO GENERAL

El usuario quiere **TODOS** los videos en `E:\0005. Passkal\Canales de Youtube\BANCO DE VIDEOS GENERAL`
con la MISMA estructura: **`<Canal>/<IDIOMA>/<Publicados|Generados>/<nombre>.mp4`**.

Ya hay un helper compartido listo en **`admin/scripts/bank.ts`** y la guía en **`admin/BANK.md`**. Pasos:

1. Por cada video FINAL de Zuri/Caroline en Supabase storage → descárgalo (a Buffer).
2. Mapea: `Canal` = `"Zuri"` o `"Caroline"`; `IDIOMA` = `ES`/`EN`/`ZH`; `status` = `"Publicados"` si ya está en YouTube (según tu estado de publicación), si no `"Generados"`.
3. Llama:
   ```ts
   import { writeToBank } from '../../admin/scripts/bank';
   const { data } = await supabase.storage.from('<bucket>').download('<path>.mp4');
   writeToBank('Zuri', lang, status, slug, Buffer.from(await data.arrayBuffer()));
   ```
4. Hazlo idempotente (no recopia si ya existe) — el helper ya lo maneja.

> Importante: usa los **nombres de canal** `Zuri` y `Caroline` (distintos a los del admin) para que no colisionen archivos en el banco.

---

## 🚦 Reglas para NO chocar

- **Git:** el agente admin commitea **solo en `admin/`**; el de viralytic en `apps/`/`packages/`. `git pull` antes de `git push`. Así no hay conflictos de merge.
- **YouTube:** apps OAuth distintas (`862…` vs `174…`) y canales distintos → cuotas y tokens independientes.
- **Supabase:** proyectos distintos → sin cruce.
- **Banco E::** nombres de canal distintos → sin colisión.

---

## ✅ Estado actual del lado ADMIN

- Banco: **595 videos** de los canales admin ya organizados (canal→idioma→Publicados/Generados).
- Publicación: World Wealth Mindset 10/22 (resto al resetear la cuota diaria de subidas); Katharsis y SabiKids con drip programado.
- Pendiente del **usuario** (no del agente viralytic): registrar la tarea diaria (`admin/scripts/daily-all.cmd` vía schtasks) y hacer `git push` de los commits del admin.
