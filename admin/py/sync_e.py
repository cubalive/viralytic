"""sync_e.py — copia los videos de un canal + su JSON de descripción a E: (carpeta propia).
Idempotente. Genérico: sirve para cualquier canal con data/output/<sub>/<slug>/video.mp4.
El JSON de descripción sale de meta_es.json si existe, o se arma de es_title/desc/tags.txt.
Uso: python py/sync_e.py <output_subdir> "<Nombre Carpeta E>"
Ej:  python py/sync_e.py fe "Fe en la Vida Real"
"""
import os, sys, json, shutil, glob

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sub = sys.argv[1]
folder = sys.argv[2]
SRC = os.path.join(ADMIN, "data", "output", sub)
BASE = r"E:\0005. Passkal\Canales de Youtube"
DEST = os.path.join(BASE, folder)

if not os.path.isdir(BASE):
    print(f"sync_e: E: no disponible ({BASE}); salto"); raise SystemExit(0)
os.makedirs(DEST, exist_ok=True)


def read(p):
    try: return open(p, encoding="utf-8").read().strip()
    except: return ""


def meta_for(d):
    mj = os.path.join(d, "meta_es.json")
    if os.path.exists(mj):
        try: return json.load(open(mj, encoding="utf-8"))
        except: pass
    # armar desde los .txt
    tags = read(os.path.join(d, "es_tags.txt"))
    return {
        "title": read(os.path.join(d, "es_title.txt")),
        "description": read(os.path.join(d, "es_desc.txt")),
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
    }


copied = 0
for vid in glob.glob(os.path.join(SRC, "*", "video.mp4")):
    d = os.path.dirname(vid); slug = os.path.basename(d)
    dst_mp4 = os.path.join(DEST, slug + ".mp4")
    if (not os.path.exists(dst_mp4) or os.path.getsize(dst_mp4) != os.path.getsize(vid)
            or os.path.getmtime(vid) > os.path.getmtime(dst_mp4)):
        try:
            shutil.copy2(vid, dst_mp4); copied += 1
            print(f"  -> {slug}")
        except Exception as e:
            print(f"  ! {slug}: {str(e)[:80]}"); continue
    # JSON de descripción siempre actualizado
    try:
        json.dump(meta_for(d), open(os.path.join(DEST, slug + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  ! json {slug}: {str(e)[:60]}")
print(f"sync_e [{folder}]: {copied} videos copiados/actualizados a E:")
