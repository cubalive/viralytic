"""sync_claseo_e.py — copia los videos de ClaseoShow + su JSON de descripción a E:.
Idempotente: solo copia los que faltan o cambiaron. Lo llama claseo-daily.cmd cada día.
Destino: E:\\0005. Passkal\\Canales de Youtube\\Clase o show\\<slug>.mp4 (+ <slug>.json)
"""
import os, shutil, glob

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ADMIN, "data", "output", "claseo")
DEST = r"E:\0005. Passkal\Canales de Youtube\Clase o show"

if not os.path.isdir(os.path.dirname(DEST)):
    print(f"sync_claseo_e: destino no disponible ({DEST}); salto"); raise SystemExit(0)
os.makedirs(DEST, exist_ok=True)

copied = 0
for vid in glob.glob(os.path.join(SRC, "*", "video.mp4")):
    d = os.path.dirname(vid); slug = os.path.basename(d)
    for src_name, dst_name in [("video.mp4", slug + ".mp4"), ("meta_es.json", slug + ".json")]:
        s = os.path.join(d, src_name)
        if not os.path.exists(s):
            continue
        dst = os.path.join(DEST, dst_name)
        # copia solo si falta o el origen es más nuevo/distinto tamaño
        if (not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(s)
                or os.path.getmtime(s) > os.path.getmtime(dst)):
            try:
                shutil.copy2(s, dst); copied += 1
                if src_name == "video.mp4": print(f"  -> {slug}")
            except Exception as e:
                print(f"  ! {slug} {src_name}: {str(e)[:80]}")
print(f"sync_claseo_e: {copied} archivos copiados/actualizados a E:")
