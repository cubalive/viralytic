"""new_channel.py — CREA UN CANAL NUEVO adaptando un motor existente (faceless/visualizer/music).
Genera config con metadata 2026 (GPT, en su idioma), lo registra en projects.json (grupo+kind+rutas),
crea carpetas, y queda listo para conectar + publicar con el MISMO sistema (OpenAI fotos + karaoke + publicación).
Uso: python py/new_channel.py <type> <id> <lang> "<name>" "<handle>" "<niche>"
type: faceless | visualizer | music
"""
import sys, os, json, urllib.request
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
typ, cid, lang, name, handle, niche = sys.argv[1], sys.argv[2].strip().lower().replace(" ", "-"), sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
LANGNAME = {"es": "Spanish", "en": "English", "zh": "Mandarin Chinese", "hi": "Hindi", "pa": "Punjabi", "pt": "Portuguese", "it": "Italian"}.get(lang, lang)
KEY = open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()
# 1) metadata 2026 del canal (About + keywords) via GPT, en su idioma
sysmsg = "You are the world's leading YouTube SEO strategist (2026). Return STRICT JSON only, written 100% in " + LANGNAME + ", natural and native."
usr = (f"New YouTube channel. Name: {name}. Handle: {handle}. Type: {typ}. Niche/description: {niche}. "
 f"Return JSON: {{\"description\": <SEO-rich channel About, 600-1200 chars, with what viewers get, why the channel exists, semantic keywords, a subscribe CTA, and 'info@passkal.com'>, "
 f"\"keywords\": [<12-18 high-value search keywords for this niche>]}}. All in {LANGNAME}.")
body = {"model": "gpt-4o", "temperature": 0.6, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": sysmsg}, {"role": "user", "content": usr}]}
try:
    r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}), timeout=120))
    meta = json.loads(r["choices"][0]["message"]["content"])
except Exception as e:
    meta = {"description": niche, "keywords": []}; print("meta-warn", str(e)[:60])
cat = "10" if typ in ("visualizer", "music") else "27"
cfg = {"lang": lang, "country": "US", "title": name, "handle": handle, "categoryId": cat, "madeForKids": typ in ("music",),
       "description": meta.get("description", niche), "keywords": meta.get("keywords", [])}
chf = os.path.join(ADMIN, "data", "youtube", f"channel_{cid}.json")
json.dump(cfg, open(chf, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
# 2) registrar en projects.json (clona el motor del tipo)
KIND = {"faceless": "faceless", "visualizer": "music-vallenato", "music": "music-zuri"}[typ]
GROUP = {"faceless": "faceless", "visualizer": "vallenato", "music": "zuri"}[typ]
outdir = {"faceless": f"data/output/{cid}", "visualizer": "data/vallenato", "music": f"data/output/{cid}"}[typ]
entry = {"id": cid, "name": name, "handle": handle, "kind": KIND, "lang": lang, "desc": niche,
         "outputsDir": outdir, "channel": f"data/youtube/channel_{cid}.json", "ytToken": f"C:/Users/alain/.secrets/yt-token-{cid}.json"}
if typ == "faceless": entry["cmd"] = f"npx tsx scripts/admin.ts {cid} {{n}}"
if typ == "music": entry["char"] = cid
reg = json.load(open(os.path.join(ADMIN, "dashboard", "projects.json"), encoding="utf-8"))
grp = next((g for g in reg["groups"] if g["key"] == GROUP), None)
if not grp: grp = {"key": GROUP, "title": GROUP, "projects": []}; reg["groups"].append(grp)
grp["projects"] = [p for p in grp["projects"] if p["id"] != cid] + [entry]
json.dump(reg, open(os.path.join(ADMIN, "dashboard", "projects.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
# 3) carpetas
os.makedirs(os.path.join(ADMIN, outdir.replace("/", os.sep)), exist_ok=True)
if typ == "music":
    for s in ("clips", "bumpers"): os.makedirs(os.path.join(ADMIN, "data", "bank", cid, s), exist_ok=True)
    bf = os.path.join(ADMIN, "data", "bank", cid, "bank.json")
    if not os.path.exists(bf): json.dump({"character": cid, "bumpers": {}, "scenes": []}, open(bf, "w", encoding="utf-8"), indent=2)
    os.makedirs(os.path.join(ADMIN, "data", "characters", cid, "refs"), exist_ok=True); os.makedirs(os.path.join(ADMIN, "data", "characters", cid, "canon"), exist_ok=True)
print(json.dumps({"ok": True, "id": cid, "kind": KIND, "group": GROUP, "channel": f"channel_{cid}.json"}))
