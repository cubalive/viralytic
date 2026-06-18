"""reel_from_master.py — REELS 9:16 reciclando el MASTER 16:9 (karaoke ya quemado).
Analiza la pista/letra (coro + energia) y corta 2-3 ganchos virales; cada reel = el 16:9
centrado sobre un fondo del MISMO video difuminado y semi-oscuro + CTA "ver completo".
Uso:  python py/reel_from_master.py <lang> <song-id>  [N=3] [LEN=24]
Salida: data/output/zuri/<lang>/<song-id>/reels/reel_1.mp4 ...
"""
import sys, os, re, json, subprocess, wave, unicodedata
import numpy as np
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lang, sid = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 3
LEN = float(sys.argv[4]) if len(sys.argv) > 4 else 24.0
D = os.path.join(ADMIN, "data", "output", "zuri", lang, sid)
master = os.path.join(D, "master_16x9.mp4")
ass = os.path.join(D, f"karaoke_{lang}.ass")
song = json.load(open(os.path.join(ADMIN, "data", "songs", sid, "song.json"), encoding="utf-8")) if os.path.exists(os.path.join(ADMIN, "data", "songs", sid, "song.json")) else {}
OUT = os.path.join(D, "reels"); os.makedirs(OUT, exist_ok=True)
def run(a, cwd=None): return subprocess.run(a, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=cwd)
def dur(f):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except: return 0.0
MD = dur(master); INTRO = 8.0  # bumper del master (el karaoke va a INTRO + tiempo de cancion)

# --- tiempos de linea desde el .ass + coro (linea mas repetida) ---
def tc(t): h,m,s = t.split(":"); return int(h)*3600+int(m)*60+float(s)
def cl(t):
    t = re.sub(r"\{[^}]*\}", "", t); t = unicodedata.normalize("NFKD", t.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in t if not unicodedata.combining(c)))
lines = []
for ln in (open(ass, encoding="utf-8").read().splitlines() if os.path.exists(ass) else []):
    if ln.startswith("Dialogue:"):
        p = ln[len("Dialogue:"):].lstrip().split(",", 9)
        if len(p) >= 10 and p[3].strip() == "K": lines.append((tc(p[1]), p[9]))
lines.sort()
from collections import Counter
cnt = Counter(cl(t) for _, t in lines if len(cl(t)) > 4)
anchors = []
if cnt and cnt.most_common(1)[0][1] >= 2:
    top = cnt.most_common(1)[0][0]; anchors = [s for s, t in lines if cl(t) == top]
if not anchors and lines: anchors = [lines[len(lines)//3][0], lines[2*len(lines)//3][0]]

# --- energia RMS para rankear ganchos ---
w = os.path.join(OUT, "_a.wav"); run(["ffmpeg","-y","-i",master,"-ac","1","-ar","16000","-c:a","pcm_s16le",w])
rms = np.array([0.0])
if os.path.exists(w):
    wf = wave.open(w,"rb"); sr=wf.getframerate(); x=np.frombuffer(wf.readframes(wf.getnframes()),dtype=np.int16).astype(np.float32)/32768.0; wf.close()
    win=int(sr*0.5); rms=np.array([np.sqrt(np.mean(x[i*win:(i+1)*win]**2)+1e-9) for i in range(max(1,len(x)//win))])
def energy(mt):
    a=int(mt/0.5); b=int((mt+LEN)/0.5); seg=rms[a:b]; return float(seg.mean()) if len(seg) else 0.0
# anchor (song-time) -> master-time
wins = sorted(({"mt": INTRO+a, "e": energy(INTRO+a)} for a in anchors), key=lambda x:-x["e"])
picked=[]
for win_ in wins:
    if win_["mt"]+5 > MD: continue
    if all(abs(win_["mt"]-q["mt"]) >= LEN*0.8 for q in picked): picked.append(win_)
    if len(picked) >= N: break
picked.sort(key=lambda x:x["mt"])

# --- CTA fija (9:16) ---
CTA = ("[Script Info]\nPlayResX: 1080\nPlayResY: 1920\nScriptType: v4.00+\n\n[V4+ Styles]\n"
 "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginV\n"
 "Style: C,Arial Black,52,&H00FFFFFF,&H00FF0066,&H64000000,-1,1,4,1,2,150\n\n[Events]\nFormat: Layer, Start, End, Style, Text\n"
 "Dialogue: 0,0:00:00.00,9:00:00.00,C,▶ Mira el video completo en el canal\n")
cap = os.path.join(OUT, "_cta.ass"); open(cap,"w",encoding="utf-8").write(CTA)
made=[]
for i,wn in enumerate(picked):
    s = max(0, wn["mt"]); L = min(LEN, MD-s)
    out = os.path.join(OUT, f"reel_{i+1}.mp4")
    vf = ("[0:v]split=2[bg][fg];"
          "[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=26,eq=brightness=-0.10:saturation=1.1[b];"
          "[fg]scale=1040:-2[f];[b][f]overlay=(W-w)/2:(H-h)/2[ov];[ov]ass=_cta.ass[v]")
    run(["ffmpeg","-y","-ss",f"{s:.2f}","-i",master,"-t",f"{L:.2f}","-filter_complex",vf,"-map","[v]","-map","0:a",
         "-c:v","libx264","-pix_fmt","yuv420p","-crf","19","-c:a","aac","-b:a","192k",out], cwd=OUT)
    if os.path.exists(out) and os.path.getsize(out) > 1000: made.append(out); print("REEL", os.path.basename(out), f"@{s:.0f}s")
for t in [w, cap]:
    try: os.remove(t)
    except: pass
print("REELS:", len(made), "->", OUT)
