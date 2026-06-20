"""content_check.py — ¿cada canal está recibiendo contenido?
Para canales que publican desde backlog (zuri/vallenato/sabikids) cuenta los productos
PENDIENTES (no publicados aún, según calendar.json). Para faceless/claseo marca auto-generación.
Replica la detección de productos de daily_cron.py. Read-only.
"""
import os, json, re

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def J(f, d):
    try: return json.load(open(f, encoding="utf-8"))
    except: return d

REG = J(os.path.join(ADMIN, "dashboard", "projects.json"), {"groups": []})
CAL = J(os.path.join(ADMIN, "data", "youtube", "calendar.json"), [])
done = {c.get("file") for c in CAL}
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
            if f.endswith(".mp4") and (not filt or filt in f) and isProduct(f):
                out.append(os.path.relpath(os.path.join(d, f), ADMIN).replace("\\", "/"))
    return out

print(f"{'CANAL':<26}{'KIND':<16}{'MECANISMO':<22}{'ESTADO'}")
print("-"*92)
for g in REG["groups"]:
    for p in g["projects"]:
        tf = absf(p.get("ytToken", "")); conn = bool(tf and os.path.exists(tf))
        kind = p.get("kind", ""); name = p["id"]
        if not conn:
            print(f"{name:<26}{kind:<16}{'—':<22}❌ SIN CONECTAR"); continue
        if kind == "faceless":
            if name == "claseo":
                print(f"{name:<26}{kind:<16}{'tarea propia':<22}✅ auto-genera 5/día (ClaseoShowDaily)")
            else:
                print(f"{name:<26}{kind:<16}{'cron: admin.ts':<22}✅ auto-genera+publica 5/día")
        elif kind in ("music-zuri", "music-vallenato"):
            prods = products(p["outputsDir"], p.get("filter"))
            pend = [f for f in prods if f not in done]
            mark = "✅" if pend else "⚠️ "
            note = f"{len(pend)} pendientes / {len(prods)} total en backlog"
            if not prods: note = "SIN contenido producido (backlog vacío)"
            print(f"{name:<26}{kind:<16}{'cron: backlog':<22}{mark} {note}")
        elif kind in ("edu", "edu-view"):
            prods = products(p["outputsDir"], p.get("filter"))
            pend = [f for f in prods if f not in done]
            mark = "✅" if pend else "⚠️ "
            note = f"{len(pend)} pendientes / {len(prods)} en backlog"
            if not prods: note = "SIN backlog (genera con gen-formats)"
            print(f"{name:<26}{kind:<16}{'cron: sabikids':<22}{mark} {note}")
        else:
            print(f"{name:<26}{kind:<16}{'?':<22}⚠️  kind no manejado por el cron")
print("-"*92)
print("Nota: faceless/claseo se auto-generan (siempre tienen contenido).")
print("      zuri/vallenato/sabikids publican desde backlog → necesitan productos pendientes.")
