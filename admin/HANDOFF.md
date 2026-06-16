# HANDOFF — Kids Music Studio

Para el próximo agente que retome este proyecto. Léelo completo antes de tocar nada.

## 1. Qué es

Pipeline **solo-admin** (no es una webapp, es un motor por lotes en TypeScript/Node) que
genera **videos musicales infantiles (6–14 años)** en **ES / PT / IT / EN** para
**YouTube Kids + Reels**, con un **banco de assets reutilizable**.

Es un proyecto **separado** de `rumba-town` (la app de nightlife del usuario). No mezclar.

Ubicación: `C:\Users\alain\kids-music-studio`

## 2. El pipeline (9 etapas) y dónde vive cada una

| # | Etapa | Archivo | Estado |
|---|-------|---------|--------|
| 1 | Canon de personaje (3 fotos → set consistente) | `src/stages/canon.ts` + `src/ai/gemini-image.ts` (`geminiImage` con refs) | ✅ código listo, ⏳ faltan fotos |
| 2 | QA de consistencia + apto-niños | `src/stages/qa.ts` (Gemini visión) | ✅ |
| 3 | Letra → escenas de ~8s | `src/stages/script.ts` (Gemini JSON) | ✅ |
| 4 | Keyframes inicial+final por escena | `src/stages/keyframes.ts` + `src/ai/gemini-image.ts` | ✅ |
| 5 | Video 8s (Veo, frame inicial+final) | `src/stages/video.ts` + `src/ai/veo.ts` | ✅ código, ⏳ validar modelo |
| 6 | Lip sync | `src/stages/lipsync/index.ts` | ⚠️ adaptador listo, sin vendor (noop por defecto) |
| 7 | Render master 16:9 + música + captions | `src/stages/render.ts` (ffmpeg) | ✅ |
| 8 | Reframe 9:16 con blur | `src/stages/reframe.ts` (ffmpeg) | ✅ |
| 9 | Banco reutilizable | `manifest.json` vía `src/lib/files.ts` | ✅ |

Orquestador: `src/pipeline.ts` (`runSong`) — corre las 6 fases de ejecución y guarda
`song.state.json` tras cada paso (resumible a mano si algo falla).

CLI: `src/cli.ts` → `verify` | `canon <id>` | `run <song-id>`.

## 3. Credenciales / infra

- **Google Vertex AI** vía **ADC** (Application Default Credentials).
  - Configurado el 2026-06-13 con `gcloud auth application-default login`.
  - Proyecto GCP: **`passkal`**. API `aiplatform.googleapis.com` ya habilitada.
  - Creds en `C:\Users\alain\AppData\Roaming\gcloud\application_default_credentials.json`.
  - El código las toma solo con `google-auth-library` (`src/lib/auth.ts`) — NO hay key en .env.
- **ffmpeg 8.1** y **ffprobe** ya instalados y en el PATH.
- **Node 24**, **npm 11**.
- Gemini se llama en la región **`global`** (verificado funcionando: `gemini-2.5-flash`).
  Imagen/Veo se llaman en `GCP_LOCATION` (default `us-central1`).

## 4. Cómo correrlo

```bash
cd C:\Users\alain\kids-music-studio
npm install
npm run verify          # ADC + ffmpeg + Gemini
npm run canon -- principal     # tras poner 3 fotos en data/characters/principal/refs/
npm run run -- demo            # tras poner audio + letra en data/songs/demo/
```

## 5. PENDIENTES / decisiones abiertas (importante)

1. **Fotos del canon** — el usuario entrega **3 fotos por personaje** (el "ADN").
   Van en `data/characters/<id>/refs/`. Sin ellas, el canon no se genera y los
   keyframes caen a generación libre (sin consistencia).
2. **Escribir el `description` (ADN) en `character.json`** de `principal` y `secundario`
   (ahora dicen "PENDIENTE"). El acompañante/secundario aún no está definido por el usuario.
3. **Lip sync** — NO hay solución nativa de Google. `src/stages/lipsync/index.ts` tiene:
   - `NoopProvider` (default): copia el clip sin sincronizar → el pipeline corre completo.
   - `ApiProvider`: contrato listo, falta implementar contra el vendor elegido
     (p.ej. Sync.so / Hedra). Setear `LIPSYNC_PROVIDER=api` + URL + KEY en `.env`.
4. **Validar IDs de modelos contra la API vigente** (pueden cambiar):
   - **FOTOS = Gemini** (decisión del usuario, NO Imagen): `GEMINI_IMAGE_MODEL`
     (`gemini-2.5-flash-image`). Llamada vía `generateContent` con
     `responseModalities:['IMAGE']` + imágenes de referencia inline para consistencia
     (`src/ai/gemini-image.ts`). Alternativas si el id falla: `gemini-2.5-flash-image-preview`,
     `gemini-2.0-flash-preview-image-generation`. Probar con `npx tsx scripts/probe-img.ts`.
   - `VEO_MODEL` (`veo-3.1-generate-preview`). Ajustar en `.env` si falla.
   - `imagen.ts` queda como ALTERNATIVA opcional, sin uso por defecto.
   - El **parseo de la respuesta de Veo** (`src/ai/veo.ts`) cubre varias formas posibles
     (`videos` / `generatedSamples` / `gcsUri`); si Veo devuelve solo GCS URI, falta
     añadir la descarga desde GCS.
5. **Política de contenido infantil** — Imagen/Veo pueden restringir la generación de
   menores. Por eso el canon parte de **fotos/arte propio** (customización de sujeto), no
   de texto puro. La etapa de QA (`qaContent`) revisa apto-niños. Validar en pruebas reales.

## 6. Costos (avisar al usuario)

- **Veo** cobra por segundo de video generado (es lo más caro). Una canción de ~3 min ≈
  ~22 clips de 8s → puede costar varios dólares por video. Confirmar tier/precio antes de
  producir en volumen.
- Imagen y Gemini son baratos en comparación.
- Todo corre **local** por ahora; para volumen, mover a un worker (Azure) con cola de jobs.

## 7. Gotchas

- `subtitles=` de ffmpeg en Windows: hay que escapar `:` y usar `/` (ya hecho en `render.ts`).
- Veo es **asíncrono y lento** (polling cada 10s); no es instantáneo.
- El `manifest.json` es el banco de assets: relaciona personajes→canon y canciones→salidas.
- `concatClips` usa `-c copy`; si los clips de Veo tienen códecs distintos, cambiar a
  recodificar (concat filter) en vez del demuxer.
