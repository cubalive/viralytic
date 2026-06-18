"""channel_seo.py — METADATA DE CANAL (About) SEO 2026 con ChatGPT (gpt-4o), por canal e idioma.
Genera descripcion (hasta ~1000 chars, tope de YouTube) + keywords (~500 chars) en el idioma del
canal, con hashtags en minuscula, segun el nicho (data/seo_profiles.json). Escribe el config y,
con --apply, lo sube al canal (channels.update brandingSettings). Preserva country/title si existen.
Uso: python py/channel_seo.py <channel_id> [--apply]
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cid = sys.argv[1]; APPLY = "--apply" in sys.argv
def env_val(key):
    try:
        for line in open(os.path.join(ADMIN, ".env"), encoding="utf-8"):
            line = line.strip()
            if line.startswith(key + "="): return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception: return None

REG = json.load(open(os.path.join(ADMIN, "dashboard", "projects.json"), encoding="utf-8"))
proj = next((p for g in REG["groups"] for p in g["projects"] if p["id"] == cid), None)
if not proj: print(json.dumps({"ok": False, "err": "no channel " + cid})); sys.exit(1)
PROF = json.load(open(os.path.join(ADMIN, "data", "seo_profiles.json"), encoding="utf-8"))
prof = dict(PROF.get("by_kind", {}).get(proj.get("kind", ""), {}))
prof.update(PROF.get("channels", {}).get(cid, {}))
LANG = prof.get("language") or proj.get("lang", "es")
NAME = proj.get("name", ""); HANDLE = proj.get("handle", "")
cfgpath = proj.get("channel") or f"data/youtube/channel_{cid}.json"
cfgpath = cfgpath if os.path.isabs(cfgpath) else os.path.join(ADMIN, cfgpath)
cfg = json.load(open(cfgpath, encoding="utf-8")) if os.path.exists(cfgpath) else {}
LANGNAME = {"es": "Spanish", "en": "English", "zh": "Mandarin Chinese", "hi": "Hindi", "pa": "Punjabi", "pt": "Portuguese", "it": "Italian"}.get(LANG, LANG)
KEY = open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()

SYS = ("You are the world's leading YouTube channel SEO strategist (2026). Write a CHANNEL 'About' that maximizes "
 "search discoverability, browse/suggested recommendations, topic authority, brand recognition and semantic understanding "
 "by YouTube AI. NOT keyword stuffing — natural, human, professional. "
 f"Write EVERYTHING 100% in {LANGNAME}, native and fluent. Return STRICT JSON only.")
USER = f"""CHANNEL: "{NAME}" ({HANDLE}). NICHE: {prof.get('niche','')}. AUDIENCE: {prof.get('audience','')}.
SEARCH INTENT: {prof.get('intent','')}. VOICE: {prof.get('voice','')}. {'Family / made-for-kids.' if prof.get('madeForKids') else 'General audience (adults).'}

Generate the channel metadata, everything in {LANGNAME}. Return JSON:
"description": the channel About, UP TO 950 characters — use as much space as possible, natural. Structure: what the channel is and the feeling/value; what viewers will find; how often we upload; why this channel exists and what to expect (topical authority + trust); strong CTA (subscribe + bell). Do NOT include hashtags here (appended automatically).
"keywords": array of 20-30 channel keywords that joined by commas total 440-490 characters (fill it): mix broad + long-tail + brand + related entities + audience intent. No duplicates.
"hashtags": array of 4-6 hashtags ALL lowercase (with #), specific to the niche/brand.
Return only the JSON object."""
body = {"model": "gpt-4o", "temperature": 0.6, "max_tokens": 2000, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": USER}]}
r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.openai.com/v1/chat/completions",
    data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}), timeout=120))
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import usage
    us = r.get("usage", {}); usage.record_tokens(cid, "channel-meta", "gpt-4o", us.get("prompt_tokens", 0), us.get("completion_tokens", 0), note=cid)
except Exception: pass
m = json.loads(r["choices"][0]["message"]["content"])
hashtags = []
for h in m.get("hashtags", []):
    h = str(h).strip()
    if not h: continue
    if not h.startswith("#"): h = "#" + h
    hashtags.append(h.lower().replace(" ", ""))
desc = m.get("description", "").rstrip()
if hashtags: desc = (desc + "\n\n" + " ".join(hashtags))
desc = desc[:990]
kws = m.get("keywords", [])
if isinstance(kws, str): kws = [x.strip() for x in kws.split(",")]
kws = [str(k).strip() for k in kws if str(k).strip()][:30]

cfg.update({"lang": LANG, "defaultLanguage": cfg.get("defaultLanguage") or LANG,
            "country": cfg.get("country") or "US", "title": cfg.get("title") or NAME,
            "handle": cfg.get("handle") or HANDLE, "description": desc, "keywords": kws})
os.makedirs(os.path.dirname(cfgpath), exist_ok=True)
json.dump(cfg, open(cfgpath, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"[{cid}/{LANG}] desc {len(desc)} chars · {len(kws)} keywords · hashtags {len(hashtags)} -> {os.path.basename(cfgpath)}")

if APPLY:
    tok = proj.get("ytToken", ""); tokp = tok if os.path.isabs(tok) else os.path.join(ADMIN, tok)
    t = json.load(open(tokp, encoding="utf-8"))
    ci = t.get("client_id") or env_val("YT_CLIENT_ID"); cs = t.get("client_secret") or env_val("YT_CLIENT_SECRET")
    acc = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=urllib.parse.urlencode(
        {"client_id": ci, "client_secret": cs, "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode(), timeout=30))["access_token"]
    H = {"Authorization": f"Bearer {acc}", "Content-Type": "application/json"}
    ch = json.load(urllib.request.urlopen(urllib.request.Request("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&mine=true", headers=H), timeout=40))
    item = ch["items"][0]; brand = item.get("brandingSettings", {}) or {}; brand["channel"] = brand.get("channel", {}) or {}
    def kwstr(lst):
        out = []; n = 0
        for k in lst:
            tok2 = '"%s"' % k if " " in k else k; add = (1 if out else 0) + len(tok2)
            if n + add > 490: break
            out.append(tok2); n += add
        return " ".join(out)
    brand["channel"].update({"title": cfg["title"], "description": desc, "keywords": kwstr(kws),
                             "defaultLanguage": cfg["defaultLanguage"], "country": cfg["country"]})
    body2 = {"id": item["id"], "brandingSettings": brand}
    try:
        urllib.request.urlopen(urllib.request.Request("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings",
            data=json.dumps(body2).encode(), headers=H, method="PUT"), timeout=40)
        print(f"  -> APLICADO en YouTube ({cfg['country']}/{cfg['defaultLanguage']})")
    except urllib.error.HTTPError as e:
        print("  -> FAIL apply:", e.read().decode()[:200])
