"""yt_channel_meta.py — perfecciona la METADATA DEL CANAL en YouTube (brandingSettings):
descripción, keywords (etiquetas), país y idioma por defecto. NO toca los videos.
Uso: python py/yt_channel_meta.py <token.json> <channel_config.json> [--apply]
Sin --apply solo muestra lo que haría (dry-run).
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
tokf, cfgf = sys.argv[1], sys.argv[2]
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

def kw(lst):
    out = []; n = 0
    for k in lst:
        k = str(k).strip()
        if not k:
            continue
        tok = '"%s"' % k if " " in k else k
        add = (1 if out else 0) + len(tok)
        if n + add > 490:  # YouTube limita keywords del canal a ~500 chars; llenamos sin cortar palabras
            break
        out.append(tok); n += add
    return " ".join(out)

ch = json.load(urllib.request.urlopen(urllib.request.Request(
    "https://www.googleapis.com/youtube/v3/channels?part=brandingSettings,snippet&mine=true", headers=H), timeout=40))
item = ch["items"][0]; chid = item["id"]
cur = item.get("brandingSettings", {}).get("channel", {})
print("CANAL:", item["snippet"]["title"], "| id", chid)
print("ANTES  -> país:", cur.get("country"), "| idioma:", cur.get("defaultLanguage"), "| keywords:", (cur.get("keywords", "") or "")[:80])

brand = item.get("brandingSettings", {}) or {}
brand["channel"] = brand.get("channel", {}) or {}
brand["channel"]["title"] = cfg.get("title") or brand["channel"].get("title")
brand["channel"]["description"] = cfg.get("description", "")
brand["channel"]["keywords"] = kw(cfg.get("keywords", []))
brand["channel"]["defaultLanguage"] = cfg.get("defaultLanguage", "es")
brand["channel"]["country"] = cfg.get("country", "US")
print("DESPUÉS-> país:", brand["channel"]["country"], "| idioma:", brand["channel"]["defaultLanguage"], "| keywords:", brand["channel"]["keywords"][:80], "…")

if not APPLY:
    print(json.dumps({"ok": True, "dryrun": True})); sys.exit(0)

body = {"id": chid, "brandingSettings": brand}
req = urllib.request.Request("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings",
    data=json.dumps(body).encode(), headers=H, method="PUT")
try:
    r = json.load(urllib.request.urlopen(req, timeout=40))
    c = r.get("brandingSettings", {}).get("channel", {})
    print(json.dumps({"ok": True, "applied": True, "title": c.get("title"), "country": c.get("country"), "lang": c.get("defaultLanguage")}, ensure_ascii=False))
except urllib.error.HTTPError as e:
    print(json.dumps({"ok": False, "err": e.read().decode()[:400]})); sys.exit(1)
