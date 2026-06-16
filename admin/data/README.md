# Carpeta `data/`

Aquí viven los insumos y los resultados.

```
data/
├── characters/
│   ├── principal/
│   │   ├── character.json   ← ADN escrito del personaje
│   │   ├── refs/            ← PON AQUÍ las 3 fotos de referencia
│   │   └── canon/           ← (generado) set canon consistente
│   └── secundario/          ← igual para el acompañante
├── songs/
│   └── demo/
│       ├── song.json        ← título, idioma, letra, personajes, escenario
│       ├── lyrics.txt       ← respaldo de la letra
│       └── audio.mp3        ← PON AQUÍ el audio de la canción
├── output/
│   └── <song-id>/           ← (generado) keyframes, clips, master_16x9, reel_9x16
└── manifest.json            ← (generado) banco de assets reutilizable
```

## Para arrancar una canción nueva
1. Crea `data/songs/<id>/song.json` (copia el de `demo`).
2. Pon el audio en esa carpeta y apunta `audioPath` a él.
3. Pega la letra en `lyrics`.
4. `npm run run -- <id>`
