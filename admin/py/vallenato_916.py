"""vallenato_916.py — ANALIZADOR DE PISTA + cortes 9:16 (Shorts/Reels/TikTok).
Tras gen-vallenato (que deja karaoke.ass + photos/ + song), esto:
  1) analiza la cancion: detecta el CORO (repeticion de versos + tiempos del forced-align)
     y la ENERGIA (RMS) -> elige las 2-3 MEJORES partes.
  2) corta clips verticales 9:16 (1080x1920) con Ken Burns + soundwave + karaoke de esa ventana.
Salida: data/vallenato/<slug>/short_1.mp4 ... + analysis.json
Uso: python py/vallenato_916.py <slug> [lang=es]   ·  env: CLIP=30 PCUT=5 NSHORTS=3
"""
import sys, os, re, json, math, subprocess, wave
import numpy as np
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
slug = sys.argv[1]; lang = sys.argv[2] if len(sys.argv) > 2 else "es"
CLIP = float(os.environ.get("CLIP", 30)); PCUT = float(os.environ.get("PCUT", 5)); NS = int(os.environ.get("NSHORTS", 3))
D = os.path.join(ADMIN, "data", "vallenato", slug)
song = os.path.join(D, "song.mp3") if os.path.exists(os.path.join(D, "song.mp3")) else os.path.join(D, "song.wav")
assp = os.path.join(D, "karaoke.ass")
pooldir = os.path.join(D, "photos")
photos = [os.path.join(pooldir, f) for f in sorted(os.listdir(pooldir))] if os.path.isdir(pooldir) else []
photos = [p for p in photos if re.search(r"\.(jpe?g|png)$", p, re.I)]
if not photos:  # modo visualizer/loop: no hay carpeta photos/, usar las imágenes del loop
    import glob
    for n in ("frame1", "frame2", "intro"):
        photos += sorted(glob.glob(os.path.join(D, n + ".*")))
    photos = [p for p in photos if re.search(r"\.(jpe?g|png)$", p, re.I)]
def run(a, **k): return subprocess.run(a, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **k)
def dur(f):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except: return 0.0
DUR = dur(song)
FONT = {"zh":"Microsoft YaHei","hi":"Nirmala UI","pa":"Nirmala UI"}.get(lang, "Palatino Linotype")

# ---------- 1) leer karaoke.ass: lineas (start,end,text) en orden = versos ----------
def tc2s(t):
    h,m,s = t.split(":"); return int(h)*3600+int(m)*60+float(s)
dlg = []  # (start,end,text_raw)
for ln in open(assp, encoding="utf-8").read().splitlines() if os.path.exists(assp) else []:
    if ln.startswith("Dialogue:"):
        p = ln[len("Dialogue:"):].lstrip().split(",", 9)
        if len(p) >= 10 and p[3].strip() == "K":
            dlg.append((tc2s(p[1]), tc2s(p[2]), p[9]))
dlg.sort()
def clean(t):
    t = re.sub(r"\{[^}]*\}", "", t)  # quita tags \kf \fad
    return re.sub(r"[^\wáéíóúñü]", "", t.lower())
# coro = la linea normalizada mas repetida (>=2)
from collections import Counter
norm = [clean(t) for _,_,t in dlg]
cnt = Counter(n for n in norm if len(n) > 4)
chorus_anchors = []
if cnt:
    top, c = cnt.most_common(1)[0]
    if c >= 2:
        chorus_anchors = [dlg[i][0] for i,n in enumerate(norm) if n == top]

# ---------- 2) energia RMS de la cancion ----------
w16 = os.path.join(D, "_rms16k.wav"); run(["ffmpeg","-y","-i",song,"-ac","1","-ar","16000","-c:a","pcm_s16le",w16])
wf = wave.open(w16,"rb"); sr=wf.getframerate(); raw=wf.readframes(wf.getnframes()); wf.close()
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32)/32768.0
win = int(sr*0.5); n = max(1, len(x)//win)
rms = np.array([np.sqrt(np.mean(x[i*win:(i+1)*win]**2)+1e-9) for i in range(n)])
def energy(s,e):
    a=int(s/0.5); b=max(a+1,int(e/0.5)); seg=rms[a:b]; return float(seg.mean()) if len(seg) else 0.0

# ---------- 3) elegir 2-3 mejores ventanas (coro + energia, sin solापe) ----------
cands = chorus_anchors[:] if chorus_anchors else [i*0.5 for i in range(n) if rms[i] > np.percentile(rms,80)]
scored = sorted(({"start":max(0,a), "end":min(DUR,a+CLIP), "e":energy(a,a+CLIP)} for a in cands), key=lambda w:-w["e"])
picked = []
for w in scored:
    if w["end"]-w["start"] < 15: continue
    if all(abs(w["start"]-q["start"]) >= CLIP*0.8 for q in picked):
        picked.append(w)
    if len(picked) >= NS: break
picked.sort(key=lambda w:w["start"])
analysis = {"slug":slug,"dur":round(DUR,1),"chorusAnchors":[round(a,1) for a in chorus_anchors],
            "highlights":[{"start":round(w["start"],1),"end":round(w["end"],1)} for w in picked]}
json.dump(analysis, open(os.path.join(D,"analysis.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("ANALISIS:", "coros@", analysis["chorusAnchors"][:6], "· highlights", analysis["highlights"])

# ---------- 4) render de cada short 9:16 ----------
HEAD = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n"
 "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
 f"Style: K,{FONT},72,&H00DCF5FF,&H0033B0E0,&H00202020,&H80000000,-1,1,0,0,100,100,0,0,1,3,2,2,80,80,300,1\n\n"
 "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
def s2tc(s):
    s=max(0,s); h=int(s//3600); m=int((s%3600)//60); return f"{h}:{m:02d}:{s%60:05.2f}"
made=[]
for i,w in enumerate(picked):
    s,e = w["start"], w["end"]; L = e-s
    # 4a) audio del tramo
    au = os.path.join(D, f"_a{i}.m4a"); run(["ffmpeg","-y","-ss",f"{s}","-t",f"{L:.2f}","-i",song,"-c:a","aac","-b:a","192k",au])
    # 4b) Ken Burns 9:16
    # 9:16 fondo desenfocado + contenido centrado. Si hay clip animado de Veo (_loop8.mp4) se usa (movimiento real); si no, la imagen fija.
    segs = []; vs = os.path.join(D, f"_vs{i}.mp4")
    loopclip = os.path.join(D, "_loop8.mp4")
    fc = ("[0:v]split=2[a][b];"
          "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=26,eq=brightness=-0.05,setsar=1[bg];"
          "[b]scale=1040:-2[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]")
    if os.path.exists(loopclip) and os.path.getsize(loopclip) > 10000:
        run(["ffmpeg","-y","-stream_loop","-1","-i",loopclip,"-t",f"{L:.2f}","-filter_complex",fc,"-map","[v]","-r","30","-c:v","libx264","-pix_fmt","yuv420p",vs])
    else:
        img = photos[i % len(photos)]
        run(["ffmpeg","-y","-loop","1","-i",img,"-filter_complex",fc,"-map","[v]","-t",f"{L:.2f}","-r","30","-c:v","libx264","-pix_fmt","yuv420p",vs])
    # 4c) karaoke de la ventana (re-timed, estilo 9:16)
    ev=[]
    for (ds,de,txt) in dlg:
        if de <= s or ds >= e: continue
        ev.append(f"Dialogue: 0,{s2tc(ds-s)},{s2tc(de-s)},K,,0,0,0,,{txt}")
    sass = os.path.join(D, f"_k{i}.ass"); open(sass,"w",encoding="utf-8").write(HEAD+"\n".join(ev)+"\n")
    # 4d) montaje: soundwave + karaoke + audio
    out = os.path.join(D, f"short_{i+1}.mp4")
    filt = (f"[1:a]showwaves=s=1080x130:mode=cline:rate=30:colors=0xFF0066|0x00E5FF,format=rgba,colorchannelmixer=aa=0.9[w];"
            f"[0:v][w]overlay=0:H-150[bv];[bv]subtitles='_k{i}.ass'[v]")
    run(["ffmpeg","-y","-i",vs,"-i",au,"-filter_complex",filt,"-map","[v]","-map","1:a","-t",f"{L:.2f}",
         "-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k",out], cwd=D)
    made.append(out)
    for o in segs+[vs,au,sass]:
        try: os.remove(o)
        except: pass
try: os.remove(w16)
except: pass
print("SHORTS 9:16:", [os.path.basename(m) for m in made])
print("DONE")
