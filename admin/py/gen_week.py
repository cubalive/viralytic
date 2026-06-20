"""gen_week.py — genera la NECESIDAD SEMANAL de un canal y la deja PROGRAMADA (publishAt).
Lee data/weekly.json (perDay, slots Miami, gen, tzOffset). Si el backlog no alcanza, genera lo
que falte; luego programa perDay×7 videos repartidos en los próximos 7 días en sus franjas.
Uso: python py/gen_week.py <channel_id>
"""
import os, sys, json, re, subprocess, datetime

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for line in open(os.path.join(ADMIN, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

cid = sys.argv[1]
WK = json.load(open(os.path.join(ADMIN, "data", "weekly.json"), encoding="utf-8"))
cfg = WK["channels"].get(cid)
if not cfg:
    print(f"gen_week: '{cid}' no está en weekly.json"); sys.exit(1)
tzoff = WK.get("tzOffset", -4)
perDay = cfg["perDay"]; slots = cfg["slots"][:perDay]; lang = cfg.get("lang", "es")
DAYS = 7; need = perDay * DAYS

REG = json.load(open(os.path.join(ADMIN, "dashboard", "projects.json"), encoding="utf-8"))
proj = next((p for g in REG["groups"] for p in g["projects"] if p["id"] == cid), None)
if not proj: print(f"gen_week: proyecto '{cid}' no existe"); sys.exit(1)
tok = proj["ytToken"]; tok = tok if os.path.isabs(tok) else os.path.join(ADMIN, tok)
outdir = proj["outputsDir"]; filt = proj.get("filter")
if not os.path.exists(tok): print(f"gen_week: '{cid}' sin conectar (falta token)"); sys.exit(1)

CALF = os.path.join(ADMIN, "data", "youtube", "calendar.json")
CAL = json.load(open(CALF, encoding="utf-8")) if os.path.exists(CALF) else []
done = {c.get("file") for c in CAL}
def absf(p): return p if os.path.isabs(p) else os.path.join(ADMIN, p)

def isProduct(n):
    return n in ("master_16x9.mp4", "video.mp4") or re.match(r"^(reel|short)_\d+\.mp4$", n) \
        or re.match(r"^reel_(es|en|it|zh|pt|hi|pa)\.mp4$", n) \
        or (not n.startswith("reel_") and re.search(r"_(ES|EN|ZH|IT|PT|HI|PA)\.mp4$", n))
def pending():
    out = []; root = absf(outdir)
    if not os.path.isdir(root): return out
    for d, subs, fs in os.walk(root):
        subs[:] = [s for s in subs if not s.startswith("_") and s not in ("photos", "clips", "bumpers")]
        for f in fs:
            if f.endswith(".mp4") and (not filt or filt in f) and isProduct(f):
                rel = os.path.relpath(os.path.join(d, f), ADMIN).replace("\\", "/")
                if rel not in done: out.append(rel)
    return sorted(out)

def run(cmd): return subprocess.run(cmd, cwd=ADMIN, shell=True)

# 1) Generar lo que falte
have = len(pending())
short = max(0, need - have)
print(f"[{cid}] necesidad semanal: {need} ({perDay}/día×7) · backlog: {have} · a generar: {short}")
if short > 0 and cfg.get("gen"):
    if cfg.get("loop"):
        for i in range(short):
            print(f"  generando {i+1}/{short}…"); run(cfg["gen"])
    else:
        run(cfg["gen"].replace("{n}", str(short)))

# 2) Programar perDay×7 con publishAt en los próximos 7 días
pend = pending()
print(f"[{cid}] backlog tras generar: {len(pend)} · programando hasta {need}")
today = datetime.date.today()
slotsdt = []
for d in range(DAYS):
    day = today + datetime.timedelta(days=d + 1)  # empieza mañana
    for s in slots:
        hh, mm = map(int, s.split(":"))
        # Miami -> UTC (UTC = Miami - tzOffset)
        utc = datetime.datetime(day.year, day.month, day.day, hh, mm) - datetime.timedelta(hours=tzoff)
        slotsdt.append(utc)
slotsdt = slotsdt[:need]

scheduled = 0
for f, when in zip(pend, slotsdt):
    dd = os.path.dirname(f)
    tfile = absf(os.path.join(dd, f"{lang}_title.txt"))
    title = open(tfile, encoding="utf-8").read().strip() if os.path.exists(tfile) else os.path.basename(os.path.dirname(f))
    desc = absf(os.path.join(dd, f"{lang}_desc.txt")); tags = absf(os.path.join(dd, f"{lang}_tags.txt"))
    iso = when.strftime("%Y-%m-%dT%H:%M:%SZ")
    r = subprocess.run(["python", "py/yt_schedule.py", tok, absf(f), iso, lang, title,
                        desc if os.path.exists(desc) else "-", tags if os.path.exists(tags) else "-", ""],
                       cwd=ADMIN, capture_output=True, text=True)
    m = re.search(r'\{"id".*?\}', r.stdout or "")
    if m:
        j = json.loads(m.group(0))
        CAL.append({"project": cid, "channel": proj["name"], "file": f, "videoId": j["id"], "url": j["url"],
                    "when": iso, "publishAt": iso, "privacy": j.get("privacy"), "title": title,
                    "ts": datetime.datetime.now().isoformat()})
        done.add(f); scheduled += 1
        print(f"  📅 {iso}  {title[:50]}")
    else:
        err = (r.stderr or r.stdout or "")
        if re.search(r"quota|403|exceeded", err, re.I):
            print(f"  ⛔ CUOTA de YouTube agotada — paro de programar. Quedan {len(pend)-scheduled} en backlog (el cron diario los publicará).")
            break
        print(f"  ⚠️ no programado: {os.path.basename(os.path.dirname(f))} · {err[-120:]}")

json.dump(CAL, open(CALF, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"✅ [{cid}] {scheduled} videos PROGRAMADOS en 7 días (publishAt). Backlog restante: {len(pending())}")
