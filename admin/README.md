# Kids Music Studio 🎬🎵

Pipeline para **mass-producir videos musicales infantiles (6–14 años)** en
**español, portugués, italiano e inglés**, para **YouTube Kids + Reels**.

Usa **Google Vertex AI** (Imagen + Veo + Gemini) y **ffmpeg**.

## Pipeline (9 etapas)

```
3 fotos por personaje  ──►  [1] CANON (Imagen, consistente)  ──►  [2] QA (Gemini visión)
                                                                        │
letra + audio  ──►  [3] LETRA→ESCENAS (Gemini)  ──►  [4] KEYFRAMES (Imagen)
                                                                        │
[5] VIDEO 8s (Veo, frame inicial+final)  ──►  [6] LIP SYNC  ──►  [7] RENDER 16:9 (ffmpeg + música + captions)
                                                                        │
                                                  [8] REFRAME 9:16 con blur (Reels/YT Kids)
                                                                        │
                                                  [9] BANCO reutilizable (manifest.json)
```

## Setup

```bash
npm install
cp .env.example .env      # ya trae defaults; ajusta si hace falta
npm run verify            # revisa ADC, ffmpeg y Gemini
```

> Las credenciales de Google son **ADC** (ya configuradas con
> `gcloud auth application-default login`, proyecto `passkal`). No hay API keys de Google en el .env.

## Uso

```bash
# 1) Construir el canon de cada personaje (necesita 3 fotos en data/characters/<id>/refs/)
npm run canon -- principal
npm run canon -- secundario

# 2) Generar el video musical completo de una canción
npm run run -- demo
```

Salidas en `data/output/<song-id>/`:
- `master_16x9.mp4` — producto principal (YouTube)
- `reel_9x16.mp4` — versión vertical con barras blur (Reels / YT Kids)

## Estado actual
✅ Todo el sistema está cableado y corre de punta a punta.
⏳ Falta: las **3 fotos por personaje** (canon), elegir **proveedor de lip sync**,
y validar **IDs de modelos** Imagen/Veo. Ver **HANDOFF.md**.

## Estructura
```
src/
├── config.ts            # env, paths, IDs de modelos, tamaños de video
├── types.ts
├── lib/                 # auth (ADC), vertex (REST), files (+manifest), ffmpeg, log
├── ai/                  # gemini.ts, imagen.ts, veo.ts
├── stages/              # canon, qa, script, keyframes, video, lipsync/, render, reframe
├── pipeline.ts          # orquestador (6 pasos, con estado resumible)
├── verify.ts            # doctor
└── cli.ts               # verify | canon <id> | run <song-id>
data/                    # personajes, canciones, output, manifest (ver data/README.md)
```
