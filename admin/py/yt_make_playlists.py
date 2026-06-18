"""yt_make_playlists.py — crea (idempotente) las playlists de un canal según su config.
Lee config['playlists'] = [{title, desc}]. No duplica si el título ya existe.
Uso: python py/yt_make_playlists.py <token.json> <channel_config.json> <out.json> [--apply]
Sin --apply solo muestra qué crearía (dry-run).
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
tokf, cfgf, outf = sys.argv[1], sys.argv[2], sys.argv[3]
APPLY = "--apply" in sys.argv
t = json.load(open(tokf, encoding="utf-8"))
cfg = json.load(open(cfgf, encoding="utf-8"))

def env_val(key):
    try:
        envf = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        for line in open(envf, encoding="utf-8"):
            line = line.strip()
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        return None
cid = t.get("client_id") or os.environ.get("YT_CLIENT_ID") or env_val("YT_CLIENT_ID")
csec = t.get("client_secret") or os.environ.get("YT_CLIENT_SECRET") or env_val("YT_CLIENT_SECRET")

def access():
    d = urllib.parse.urlencode({"client_id": cid, "client_secret": csec, "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=d, timeout=30))["access_token"]
H = {"Authorization": f"Bearer {access()}", "Content-Type": "application/json"}

# playlists existentes (para no duplicar)
existing = {}; page = ""
while True:
    d = json.load(urllib.request.urlopen(urllib.request.Request(
        "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50" + (f"&pageToken={page}" if page else ""), headers=H), timeout=30))
    for it in d.get("items", []):
        existing[it["snippet"]["title"].strip().lower()] = it["id"]
    page = d.get("nextPageToken")
    if not page:
        break

res = {}
try: res = json.load(open(outf, encoding="utf-8"))
except Exception: res = {}
lang = cfg.get("defaultLanguage", "es")
for pl in cfg.get("playlists", []):
    title = pl["title"]; key = title.strip().lower()
    if key in existing:
        res[title] = existing[key]; print("ya existe:", title, existing[key]); continue
    if not APPLY:
        print("crearía:", title); continue
    body = {"snippet": {"title": title, "description": pl.get("desc", ""), "defaultLanguage": lang}, "status": {"privacyStatus": "public"}}
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request(
            "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", data=json.dumps(body).encode(), headers=H), timeout=40))
        res[title] = r["id"]; print("creada:", title, r["id"])
    except urllib.error.HTTPError as e:
        print("FAIL:", title, e.code, e.read().decode()[:160])
json.dump(res, open(outf, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("->", outf, "·", len(res), "playlists")
