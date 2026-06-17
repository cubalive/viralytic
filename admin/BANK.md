# 🎬 Banco de Videos General — convención compartida

**Todos** los videos de **todos** los proyectos viven en una sola carpeta, organizados igual:

```
E:\0005. Passkal\Canales de Youtube\BANCO DE VIDEOS GENERAL\
└── <Canal>\<IDIOMA>\<Publicados|Generados>\<nombre>.mp4
```

- **Canal** = nombre legible del canal (ej. `World Wealth Mindset`, `Katharsis`, `SabiKids`, `Zuri`, `Caroline`).
- **IDIOMA** = `ES` `EN` `IT` `ZH` (mayúsculas).
- **Publicados** = ya subido a YouTube · **Generados** = generado pero aún no publicado.
- La ruta se puede cambiar con la variable de entorno `BANK_DIR`.

## ✅ Ya en el banco (proyecto admin/)
World Wealth Mindset (EN), Katharsis (ES/EN), SabiKids (ES/EN/IT/ZH) — vía `scripts/organize-bank.ts`.

## ⏳ Pendiente: canales de viralytic (Zuri, Caroline…)
Esos videos están en **Supabase storage** (no locales). Para meterlos al banco, el pipeline de viralytic
(o el agente que lo conoce) solo tiene que llamar al helper compartido **`admin/scripts/bank.ts`**:

```ts
import { placeInBank, writeToBank } from '../../admin/scripts/bank';

// Si tienes el archivo local:
placeInBank('Zuri', 'es', 'Publicados', 'mi-lugar-seguro', '/ruta/al/video.mp4');

// Si lo bajas de Supabase storage (Buffer):
const { data } = await supabase.storage.from('<bucket>').download('<path>.mp4');
writeToBank('Zuri', 'es', 'Generados', 'mi-lugar-seguro', Buffer.from(await data.arrayBuffer()));
```

Mapear: bucket/canal → `Canal`, idioma → `IDIOMA`, y usar `Publicados` si ya está en YouTube (según el estado de publicación de viralytic), si no `Generados`.
