"""gen_dormir_bebes.py — motor canal "Dormir Bebés" (sleep music, pantalla negra).
1 pista por video, en loop hasta 5-8 horas, PANTALLA 100% NEGRA (el TV se ve apagado).
Cero Veo, cero imagen. Rota las pistas (estado en _used.json) para no repetir.
Uso: python py/gen_dormir_bebes.py [horas=8] [--secs N (override para test)] [--track archivo]
"""
import os, sys, json, subprocess, re, datetime, glob

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = os.environ.get("FFMPEG_PATH", "ffmpeg")
FP = os.environ.get("FFPROBE_PATH", "ffprobe")
TRACKS = os.path.join(ADMIN, "data", "suno-dormir-bebes")
OUT = os.path.join(ADMIN, "data", "output", "dormir-bebes")
os.makedirs(OUT, exist_ok=True)

# args
hours = 8
secs = None
track = None
a = sys.argv[1:]
for i, x in enumerate(a):
    if x == "--secs": secs = int(a[i + 1])
    elif x == "--track": track = a[i + 1]
    elif x.isdigit(): hours = int(x)
target = secs if secs else hours * 3600

# elegir pista (rotación)
usedf = os.path.join(OUT, "_used.json")
used = json.load(open(usedf)) if os.path.exists(usedf) else []
all_tracks = sorted(glob.glob(os.path.join(TRACKS, "*.mp3")))
if not all_tracks:
    print("no hay pistas en data/suno-dormir-bebes"); sys.exit(1)
if not track:
    fresh = [t for t in all_tracks if os.path.basename(t) not in used]
    if not fresh:  # ya se usaron todas -> reiniciar ciclo
        used = []; fresh = all_tracks
    track = fresh[0]
tname = os.path.basename(track)

# duración de la pista
def dur(f):
    r = subprocess.run([FP, "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", f], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except: return 0.0
tdur = dur(track)
loops = max(1, int(target / tdur) + 1) if tdur else 1

slug = re.sub(r"[^a-z0-9]+", "-", tname.lower().replace(".mp3", "")).strip("-")
ddir = os.path.join(OUT, slug)
os.makedirs(ddir, exist_ok=True)
outf = os.path.join(ddir, "video.mp4")

print(f"pista: {tname} ({tdur:.0f}s) -> objetivo {target}s (~{target/3600:.1f}h), {loops} loops")

# render: PANTALLA NEGRA PURA (1080p) + audio en loop hasta target. Negro real (full range).
cmd = [
    FF, "-y",
    "-f", "lavfi", "-i", f"color=c=black:s=1920x1080:r=4",
    "-stream_loop", "-1", "-i", track,
    "-t", str(target),
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage",
    "-pix_fmt", "yuv420p", "-color_range", "tv", "-g", "120",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    outf,
]
print("renderizando…")
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print("ERROR ffmpeg:", (r.stderr or "")[-400:]); sys.exit(1)
sz = os.path.getsize(outf) / 1e6
print(f"✅ {outf}  ({sz:.0f} MB, {dur(outf)/3600:.2f}h)")

# marcar pista usada
if tname not in used:
    used.append(tname); json.dump(used, open(usedf, "w"))
print(f"pistas usadas: {len(used)}/{len(all_tracks)}")

# SEO (es + en) listo para publicar — solo en render real (no en tests con --secs)
if not secs:
    print("generando SEO…")
    subprocess.run([sys.executable, os.path.join(ADMIN, "py", "seo_dormir.py"), ddir, str(hours), "es,en"], cwd=ADMIN)
