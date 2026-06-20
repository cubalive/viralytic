"""verify_all.py — verifica por canal: ¿genera? ¿publica? Cruza:
- projects.json (canal, kind, paused, token)
- accounts.json (videos reales en YouTube + último publicado, vía API)
- calendar.json + kat_published_*.json (publicaciones registradas por el sistema)
- backlog (productos generados sin publicar)
"""
import os, json, re, glob

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def J(f, d):
    try: return json.load(open(f, encoding="utf-8"))
    except: return d

REG = J(os.path.join(ADMIN, "dashboard", "projects.json"), {"groups": []})
ACC = {c["id"]: c for c in J(os.path.join(ADMIN, "data", "youtube", "accounts.json"), {}).get("channels", [])}
CAL = J(os.path.join(ADMIN, "data", "youtube", "calendar.json"), [])
done = {c.get("file") for c in CAL}
calcount = {}
for c in CAL: calcount[c.get("project")] = calcount.get(c.get("project"), 0) + 1
def absf(p): return p if os.path.isabs(p) else os.path.join(ADMIN, p)

def isProduct(n):
    return n in ("master_16x9.mp4", "video.mp4") or re.match(r"^(reel|short)_\d+\.mp4$", n) \
        or re.match(r"^reel_(es|en|it|zh|pt|hi|pa)\.mp4$", n) \
        or (not n.startswith("reel_") and re.search(r"_(ES|EN|ZH|IT|PT|HI|PA)\.mp4$", n))
def products(dirr, filt):
    out = []; root = absf(dirr)
    if not os.path.isdir(root): return out
    for d, subs, fs in os.walk(root):
        subs[:] = [s for s in subs if not s.startswith("_") and s not in ("photos", "clips", "bumpers")]
        for f in fs:
            if f.endswith(".mp4") and (not filt or filt in f) and isProduct(f): out.append(os.path.relpath(os.path.join(d, f), ADMIN).replace("\\", "/"))
    return out

# publicaciones faceless (kat_published_*.json)
katpub = {}
for f in glob.glob(os.path.join(ADMIN, "data", "youtube", "kat_published_*.json")):
    slot = os.path.basename(f).replace("kat_published_", "").replace(".json", "")
    katpub[slot] = len(J(f, {}))

print(f"{'CANAL':<14}{'CONECT':<8}{'GENERA':<22}{'PUBLICA (YouTube)':<26}{'VEREDICTO'}")
print("-" * 96)
for g in REG["groups"]:
    for p in g["projects"]:
        cid = p["id"]; kind = p.get("kind", "")
        conn = os.path.exists(absf(p.get("ytToken", "")))
        acc = ACC.get(cid, {})
        vids = acc.get("videos", 0) if acc.get("ok") else "?"
        recent = acc.get("recent", []) if acc.get("ok") else []
        last = (recent[0].get("publishedAt", "")[:10] if recent else "—")
        backlog = len([f for f in products(p.get("outputsDir", ""), p.get("filter")) if f not in done])
        # ¿genera?
        if p.get("paused"): gen = "⏸ pausado"
        elif kind == "faceless" and cid not in ("claseo", "fe"): gen = "auto (admin.ts)"
        elif cid in ("claseo",): gen = "auto (tarea propia)"
        elif cid in ("fe",): gen = f"auto · {backlog} backlog"
        elif kind == "music-sleep": gen = f"auto · {backlog} backlog"
        elif kind in ("edu", "edu-view"): gen = f"auto · {backlog} backlog"
        elif kind in ("music-zuri", "music-vallenato"): gen = f"backlog: {backlog}"
        else: gen = "?"
        # ¿publica? (señal de YouTube + registros del sistema)
        pubreg = calcount.get(cid, 0) + (katpub.get(cid, 0) if kind == "faceless" else 0)
        pub = f"{vids} en YT · últ {last}"
        # veredicto
        if p.get("paused"): verd = "⏸ en pausa (a propósito)"
        elif not conn: verd = "❌ sin conectar"
        elif (isinstance(vids, int) and vids > 0) or pubreg > 0: verd = "✅ genera y publica"
        elif backlog > 0: verd = "🟡 genera; aún sin publicar (cron lo hará)"
        else: verd = "⚠️ revisar"
        print(f"{cid:<14}{('sí' if conn else 'NO'):<8}{gen:<22}{pub:<26}{verd}")
print("-" * 96)
print("✅ = ya tiene videos en YouTube o publicaciones registradas")
print("🟡 = tiene backlog generado; el cron diario lo publicará en su próxima corrida")
