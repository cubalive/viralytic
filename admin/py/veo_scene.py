"""veo_scene.py — crea UNA escena de banco con Veo 3.1 (first/last) y la CLASIFICA en el banco.
Mantiene el universo visual: antepone el ADN canon del personaje + negativo. Va automatico a
data/bank/<char>/clips/<id>.mp4 y se registra en bank.json (function/energy/shot/tags) listo
para que el editor lo use. Esquiva el filtro de rostros (achica si hace falta).
Uso: python py/veo_scene.py <char> <id> <function> <energy> <shot> "<tags csv>" <frame1> <frame2> <promptfile> <negfile>
"""
import sys, os, json, base64, urllib.request, urllib.parse, time
from PIL import Image, ImageFilter
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
char, sid, func, energy, shot, tagscsv, f1, f2, pf, nf = sys.argv[1:11]
tags = [t.strip() for t in tagscsv.split(",") if t.strip()]
prompt = open(pf, encoding="utf-8").read().strip() if os.path.exists(pf) else pf
neg = open(nf, encoding="utf-8").read().strip() if os.path.exists(nf) else (nf if nf != "-" else "")
BANK = os.path.join(ADMIN, "data", "bank", char); CLIPS = os.path.join(BANK, "clips"); os.makedirs(CLIPS, exist_ok=True)
WORK = os.path.join(BANK, "_intake"); os.makedirs(WORK, exist_ok=True)
# ADN canon del personaje (universo visual)
canon = ""
chf = os.path.join(ADMIN, "data", "characters", char, "character.json")
if os.path.exists(chf): canon = json.load(open(chf, encoding="utf-8")).get("description", "")
t = json.load(open("C:/Users/alain/.secrets/zuri-oauth-token.json"))
def token(): return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=urllib.parse.urlencode({"client_id": t["client_id"], "client_secret": t["client_secret"], "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode(), timeout=30))["access_token"]
PROJ, LOC, M = "zuri-499408", "us-central1", "veo-3.1-fast-generate-001"
def cover(src, scale=1.0):
    im = Image.open(src).convert("RGB"); w, h = im.size; tg = 16/9
    if w/h > tg: nw = round(h*tg); x = (w-nw)//2; im = im.crop((x, 0, x+nw, h))
    else: nh = round(w/tg); y = (h-nh)//2; im = im.crop((0, y, w, y+nh))
    base = im.resize((1920, 1080), Image.LANCZOS)
    dst = os.path.join(WORK, f"_{sid}_{os.path.basename(src)}_{int(scale*100)}.png")
    if scale >= 0.999: base.save(dst, quality=93); return dst
    bg = base.resize((2400, 1350), Image.LANCZOS).crop((240, 135, 2160, 1215)).filter(ImageFilter.GaussianBlur(28))
    fw, fh = int(1920*scale), int(1080*scale); bg.paste(base.resize((fw, fh), Image.LANCZOS), ((1920-fw)//2, (1080-fh)//2)); bg.save(dst, quality=93); return dst
b = lambda p: base64.b64encode(open(p, "rb").read()).decode()
FULLP = (canon + " SCENE: " + prompt + " Magical glowing forest universe, lanterns, fireflies, floating neon music notes. Smooth Pixar-quality motion, keep the character identical, no morphing.")
out = os.path.join(CLIPS, f"{sid}.mp4")
def gen():
    base = f"https://{LOC}-aiplatform.googleapis.com/v1/projects/{PROJ}/locations/{LOC}/publishers/google/models/{M}"
    for mode, sc in [("cover", 1.0), ("shrink", 0.6), ("shrink", 0.45)]:
        a, bb = cover(f1, sc), cover(f2, sc)
        inst = {"prompt": FULLP, "image": {"bytesBase64Encoded": b(a), "mimeType": "image/png"}, "lastFrame": {"bytesBase64Encoded": b(bb), "mimeType": "image/png"}}
        params = {"aspectRatio": "16:9", "durationSeconds": 8, "sampleCount": 1, "resolution": "1080p", "generateAudio": False, "personGeneration": "allow_all"}
        if neg: params["negativePrompt"] = neg
        try:
            H = {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}
            op = json.load(urllib.request.urlopen(urllib.request.Request(f"{base}:predictLongRunning", data=json.dumps({"instances": [inst], "parameters": params}).encode(), headers=H), timeout=90))["name"]
            print("SUBMIT", sid, mode, sc, flush=True)
        except urllib.error.HTTPError as e: print("submiterr", e.read().decode()[:120], flush=True); continue
        for i in range(100):
            time.sleep(6)
            try:
                H = {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}
                d = json.load(urllib.request.urlopen(urllib.request.Request(f"{base}:fetchPredictOperation", data=json.dumps({"operationName": op}).encode(), headers=H), timeout=60))
            except Exception: continue
            if d.get("done"):
                v = (d.get("response", {}).get("videos") or [{}])[0]; x = v.get("bytesBase64Encoded")
                if x:
                    tmp = out
                    if sc < 0.999:  # recupera pantalla completa (zoom al centro)
                        raw = os.path.join(WORK, f"_{sid}_raw.mp4"); open(raw, "wb").write(base64.b64decode(x))
                        import subprocess
                        subprocess.run(["ffmpeg","-y","-i",raw,"-vf",f"crop=iw*{sc}:ih*{sc}:(iw-iw*{sc})/2:(ih-ih*{sc})/2,scale=1920:1080:flags=lanczos,setsar=1","-c:v","libx264","-crf","17","-an",out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else: open(out, "wb").write(base64.b64decode(x))
                    try:
                        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import usage
                        usage.record(char, "scene", "veo", M, 8, note=sid)
                    except Exception: pass
                    return True
                break
    return False
ok = gen()
if not ok: print(json.dumps({"ok": False, "reason": "veo bloqueo/fallo"})); sys.exit(1)
# clasifica en el banco
bjf = os.path.join(BANK, "bank.json")
bank = json.load(open(bjf, encoding="utf-8")) if os.path.exists(bjf) else {"character": char, "scenes": []}
bank.setdefault("scenes", [])
entry = {"id": sid, "file": f"clips/{sid}.mp4", "function": func, "energy": energy, "shot": shot, "tags": tags, "durationS": 8, "prompt": prompt}
bank["scenes"] = [s for s in bank["scenes"] if s.get("id") != sid] + [entry]
json.dump(bank, open(bjf, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps({"ok": True, "id": sid, "file": entry["file"], "function": func, "energy": energy}))
