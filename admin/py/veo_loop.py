"""veo_loop.py — genera UN clip de 8s con Veo 3.1 (primera foto -> última foto) para usarlo
en LOOP durante todo el visualizer de vallenato. Una sola generación Veo (se repite con ffmpeg).
Usa el proyecto zuri-499408 (OAuth) y registra el gasto en el Centro de Gastos.
Uso:  python py/veo_loop.py <frame1> <frame2> <out.mp4> [prompt_o_archivo] [project]
"""
import sys, os, json, base64, urllib.request, urllib.parse, time, subprocess
from PIL import Image, ImageFilter
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f1, f2, out = sys.argv[1], sys.argv[2], sys.argv[3]
parg = sys.argv[4] if len(sys.argv) > 4 else ""
PROJECT = sys.argv[5] if len(sys.argv) > 5 else "vallenato"
narg = sys.argv[6] if len(sys.argv) > 6 else ""
try: DUR = int(float(sys.argv[7])) if len(sys.argv) > 7 else 8
except Exception: DUR = 8
SINGLE = (f2 == "-" or not os.path.exists(f2))   # animar UNA sola imagen (intro) si no hay segunda
prompt = open(parg, encoding="utf-8").read().strip() if (parg and parg != "-" and os.path.exists(parg)) else (parg if parg != "-" else "")
neg = open(narg, encoding="utf-8").read().strip() if (narg and narg != "-" and os.path.exists(narg)) else (narg if narg != "-" else "")
if not prompt:
    prompt = ("Subtle ambient music-video background: soft moving lights, gentle bokeh and glow, slow stable "
              "camera, minimal motion with just a few delicate details, warm cinematic atmosphere, photorealistic, "
              "loopable, no text, no captions, no morphing.")

WORK = os.path.join(os.path.dirname(out), "_loopintake"); os.makedirs(WORK, exist_ok=True)
t = json.load(open("C:/Users/alain/.secrets/zuri-oauth-token.json"))
def token():
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode({"client_id": t["client_id"], "client_secret": t["client_secret"],
        "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode(), timeout=30))["access_token"]
PROJ, LOC, M = "zuri-499408", "us-central1", "veo-3.1-fast-generate-001"

def cover(src, scale=1.0):
    im = Image.open(src).convert("RGB"); w, h = im.size; tg = 16 / 9
    if w / h > tg: nw = round(h * tg); x = (w - nw) // 2; im = im.crop((x, 0, x + nw, h))
    else: nh = round(w / tg); y = (h - nh) // 2; im = im.crop((0, y, w, y + nh))
    base = im.resize((1920, 1080), Image.LANCZOS)
    dst = os.path.join(WORK, f"_{os.path.basename(src)}_{int(scale * 100)}.png")
    if scale >= 0.999: base.save(dst, quality=93); return dst
    bg = base.resize((2400, 1350), Image.LANCZOS).crop((240, 135, 2160, 1215)).filter(ImageFilter.GaussianBlur(28))
    fw, fh = int(1920 * scale), int(1080 * scale); bg.paste(base.resize((fw, fh), Image.LANCZOS), ((1920 - fw) // 2, (1080 - fh) // 2)); bg.save(dst, quality=93); return dst
b = lambda p: base64.b64encode(open(p, "rb").read()).decode()

def gen():
    base = f"https://{LOC}-aiplatform.googleapis.com/v1/projects/{PROJ}/locations/{LOC}/publishers/google/models/{M}"
    durs = [DUR] + ([8] if DUR != 8 else [])   # si la duración elegida falla, reintenta con 8
    for D in durs:
        for mode, sc in [("cover", 1.0), ("shrink", 0.6), ("shrink", 0.45)]:
            inst = {"prompt": prompt, "image": {"bytesBase64Encoded": b(cover(f1, sc)), "mimeType": "image/png"}}
            if not SINGLE:
                inst["lastFrame"] = {"bytesBase64Encoded": b(cover(f2, sc)), "mimeType": "image/png"}
            params = {"aspectRatio": "16:9", "durationSeconds": D, "sampleCount": 1, "resolution": "1080p", "generateAudio": False, "personGeneration": "allow_all"}
            if neg: params["negativePrompt"] = neg
            try:
                H = {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}
                op = json.load(urllib.request.urlopen(urllib.request.Request(f"{base}:predictLongRunning",
                    data=json.dumps({"instances": [inst], "parameters": params}).encode(), headers=H), timeout=90))["name"]
                print("SUBMIT", mode, sc, "dur", D, "single" if SINGLE else "first/last", flush=True)
            except urllib.error.HTTPError as e:
                print("submiterr", e.read().decode()[:140], flush=True); continue
            for i in range(140):
                time.sleep(6)
                try:
                    H = {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}
                    d = json.load(urllib.request.urlopen(urllib.request.Request(f"{base}:fetchPredictOperation",
                        data=json.dumps({"operationName": op}).encode(), headers=H), timeout=60))
                except Exception: continue
                if d.get("done"):
                    v = (d.get("response", {}).get("videos") or [{}])[0]; x = v.get("bytesBase64Encoded")
                    if x:
                        if sc < 0.999:
                            raw = os.path.join(WORK, "_raw.mp4"); open(raw, "wb").write(base64.b64decode(x))
                            subprocess.run(["ffmpeg", "-y", "-i", raw, "-vf",
                                f"crop=iw*{sc}:ih*{sc}:(iw-iw*{sc})/2:(ih-ih*{sc})/2,scale=1920:1080:flags=lanczos,setsar=1",
                                "-c:v", "libx264", "-crf", "17", "-an", out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        else: open(out, "wb").write(base64.b64decode(x))
                        return D
                    break
    return 0

usedD = gen()
if not usedD: print(json.dumps({"ok": False, "reason": "veo bloqueo/fallo"})); sys.exit(1)
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import usage
    usage.record(PROJECT, "loop-clip", "veo", M, usedD, note=os.path.basename(out))
except Exception: pass
print(json.dumps({"ok": True, "file": out, "dur": usedD}))
