"""daily_cron.py — MOTOR AUTOMÁTICO (tarea de Windows). Si el cron está ENCENDIDO:
 1) sincroniza cada canal conectado con YouTube (estado fiel),
 2) REPROGRAMA los que fallaron (privados con publishAt vencido -> publica ya),
 3) publica por CADENCIA: música Zuri sáb+mié + 2 reels/día · visualizer 3/sem + reels · faceless 5/día.
Lee el toggle en data/youtube/cron.json. Idempotente (no republica lo ya publicado, según calendar.json).
"""
import os, sys, json, subprocess, datetime, urllib.request, urllib.parse, re
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def J(f, d):
    try: return json.load(open(f, encoding="utf-8"))
    except: return d
if not J(os.path.join(ADMIN, "data", "youtube", "cron.json"), {}).get("enabled"):
    print("cron apagado"); sys.exit(0)
REG = J(os.path.join(ADMIN, "dashboard", "projects.json"), {"groups": []})
CALF = os.path.join(ADMIN, "data", "youtube", "calendar.json"); CAL = J(CALF, [])
done_files = {c.get("file") for c in CAL}
wd = datetime.datetime.now().weekday()  # lun=0 ... dom=6
def absf(p): return p if os.path.isabs(p) else os.path.join(ADMIN, p)
def tok_access(t):
    cid = t.get("client_id") or os.environ.get("YT_CLIENT_ID"); cs = t.get("client_secret") or os.environ.get("YT_CLIENT_SECRET")
    d = urllib.parse.urlencode({"client_id": cid, "client_secret": cs, "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=d, timeout=30))["access_token"]
def isProduct(n):
    return n in ("master_16x9.mp4", "video.mp4") or re.match(r"^(reel|short)_\d+\.mp4$", n) or re.match(r"^reel_(es|en|it|zh|pt|hi|pa)\.mp4$", n) or (not n.startswith("reel_") and re.search(r"_(ES|EN|ZH|IT|PT|HI|PA)\.mp4$", n))
def products(dirr, filt):
    out = []; root = absf(dirr)
    for d, subs, fs in os.walk(root):
        subs[:] = [s for s in subs if not s.startswith("_") and s not in ("photos", "clips", "bumpers")]
        for f in fs:
            if f.endswith(".mp4") and (not filt or filt in f) and isProduct(f): out.append(os.path.relpath(os.path.join(d, f), ADMIN).replace("\\", "/"))
    return sorted(out)
def run(a): return subprocess.run(a, cwd=ADMIN, capture_output=True, text=True)

# === AUTO-RELLENADO: genera contenido cuando el backlog está bajo, SIN intervención ===
# SabiKids tiene motor autónomo (sabikids-daily.ts: remixes cero-Veo + compilación).
# Si el idioma con menos pendientes baja del umbral, genera más solo.
SABI_MIN = 10
def pend_of(p): return [f for f in products(p.get("outputsDir", ""), p.get("filter")) if f not in done_files]
sabi = [p for g in REG["groups"] for p in g["projects"]
        if p.get("kind") in ("edu", "edu-view") and os.path.exists(absf(p.get("ytToken", "")))]
if sabi:
    mins = min(len(pend_of(p)) for p in sabi)
    if mins < SABI_MIN:
        print(f"== auto-rellenado SabiKids: backlog bajo ({mins} mín) -> generando (cero Veo)")
        r = run(["npx", "tsx", "scripts/sabikids-daily.ts", "3"])
        print("  ", "ok" if r.returncode == 0 else f"err {r.stderr[-200:] if r.stderr else ''}")
    else:
        print(f"== SabiKids backlog OK ({mins} mín por idioma), no hace falta generar")

# Dormir Bebés: motor autónomo (pista en loop 8h, pantalla negra, cero Veo). Auto-genera si backlog < 2.
SLEEP_MIN = 2
for p in [pp for g in REG["groups"] for pp in g["projects"] if pp.get("kind") == "music-sleep" and not pp.get("paused")]:
    if len(pend_of(p)) < SLEEP_MIN:
        print(f"== auto-generando {p['id']} (8h, pantalla negra, cero Veo)")
        r = run(["python", "py/gen_dormir_bebes.py", "8"])
        print("  ", "ok" if r.returncode == 0 else f"err {r.stderr[-200:] if r.stderr else ''}")

# Música real (Zuri/Vallenato): el motor NECESITA una canción; no se puede auto-crear.
# Avisar cuando un canal de música se quede sin backlog (para subir canción / decidir AI-music).
for g in REG["groups"]:
    for p in g["projects"]:
        if p.get("kind") in ("music-zuri", "music-vallenato") and not p.get("paused") and os.path.exists(absf(p.get("ytToken", ""))):
            if not pend_of(p):
                print(f"!! {p['id']}: SIN backlog — necesita canción (no se auto-genera música)")

for g in REG["groups"]:
    for p in g["projects"]:
        if p.get("paused"): continue  # canal en pausa: no publicar ni generar
        tf = absf(p.get("ytToken", ""))
        if not tf or not os.path.exists(tf): continue
        t = J(tf, {})
        print("== ", p["id"])
        # 1) sync
        ytc = os.path.join(ADMIN, "data", "youtube", f"ytcal_{p['id']}.json")
        run(["python", "py/yt_sync.py", tf, ytc])
        yt = J(ytc, {"items": []}).get("items", [])
        # 2) reprogramar fallidos (privado con publishAt vencido -> publicar ya)
        try:
            acc = tok_access(t); now = datetime.datetime.now(datetime.timezone.utc)
            for v in yt:
                pa = v.get("publishAt")
                if v.get("privacy") == "private" and pa:
                    try: due = datetime.datetime.fromisoformat(pa.replace("Z", "+00:00"))
                    except: continue
                    if due < now:
                        body = {"id": v["id"], "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": True}}
                        try:
                            urllib.request.urlopen(urllib.request.Request("https://www.googleapis.com/youtube/v3/videos?part=status", data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {acc}", "Content-Type": "application/json"}, method="PUT"), timeout=40)
                            print("  reprogramado->publicado", v["id"])
                        except Exception as e: print("  reprog err", str(e)[:50])
        except Exception as e: print("  acc err", str(e)[:50])
        # 3) cadencia
        kind = p.get("kind", "")
        if kind == "faceless":
            if p["id"] == "claseo": print("  claseo: lo maneja su tarea propia (ClaseoShowDaily), salto"); continue
            run(["npx", "tsx", "scripts/admin.ts", p["id"], "5"]); print("  faceless gen+pub 5")
        elif kind == "edu":
            # SabiKids: admin.ts sabikids publica los 4 idiomas (ES/EN/IT/ZH) round-robin desde el backlog.
            # Solo se dispara una vez (en sabi-es, kind="edu"); los sabi-en/it/zh son "edu-view" (solo stats).
            run(["npx", "tsx", "scripts/admin.ts", "sabikids", "5"]); print("  sabikids pub 5/idioma desde backlog")
        elif kind in ("music-zuri", "music-vallenato"):
            pend = [f for f in products(p["outputsDir"], p.get("filter")) if f not in done_files]
            reels = [f for f in pend if re.search(r"(reel|short)_\d", f)]; masters = [f for f in pend if f not in reels]
            pub = reels[:2]
            day_ok = (wd in (5, 2)) if kind == "music-zuri" else (wd in (0, 2, 4))  # sáb=5,mié=2 / lun-mié-vie
            if day_ok and masters: pub = masters[:1] + reels[:2]
            lang = p.get("lang", "es")
            for f in pub:
                dd = os.path.dirname(f); desc = absf(os.path.join(dd, f"{lang}_desc.txt")); tags = absf(os.path.join(dd, f"{lang}_tags.txt")); th = absf(os.path.join(dd, f"{lang}_thumb.png"))
                r = run(["python", "py/yt_schedule.py", tf, absf(f), "now", lang, os.path.basename(f)[:-4], desc if os.path.exists(desc) else "-", tags if os.path.exists(tags) else "-", th if os.path.exists(th) else ""])
                m = re.search(r'\{"id".*?\}', r.stdout or "")
                if m:
                    j = json.loads(m.group(0)); CAL.append({"project": p["id"], "channel": p["name"], "file": f, "videoId": j["id"], "url": j["url"], "when": now.isoformat(), "privacy": j.get("privacy"), "title": os.path.basename(f)[:-4], "ts": now.isoformat()}); done_files.add(f); print("  publicado", f)
        elif kind == "music-sleep":
            # Dormir Bebés: publica 1/día desde el backlog, con el título SEO (es_title.txt).
            lang = p.get("lang", "es")
            pend = [f for f in products(p["outputsDir"], p.get("filter")) if f not in done_files]
            for f in pend[:1]:
                dd = os.path.dirname(f)
                tfile = absf(os.path.join(dd, f"{lang}_title.txt"))
                title = open(tfile, encoding="utf-8").read().strip() if os.path.exists(tfile) else "Dormir Bebes"
                desc = absf(os.path.join(dd, f"{lang}_desc.txt")); tags = absf(os.path.join(dd, f"{lang}_tags.txt"))
                r = run(["python", "py/yt_schedule.py", tf, absf(f), "now", lang, title, desc if os.path.exists(desc) else "-", tags if os.path.exists(tags) else "-", ""])
                m = re.search(r'\{"id".*?\}', r.stdout or "")
                if m:
                    j = json.loads(m.group(0)); CAL.append({"project": p["id"], "channel": p["name"], "file": f, "videoId": j["id"], "url": j["url"], "when": now.isoformat(), "privacy": j.get("privacy"), "title": title, "ts": now.isoformat()}); done_files.add(f); print("  publicado", f)
json.dump(CAL, open(CALF, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("DONE cron")
