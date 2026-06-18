"""yt_update_meta.py — actualiza la metadata (snippet) de un video YA subido, sin re-subirlo.
Uso: python py/yt_update_meta.py <token.json> <videoId> <lang> <titlefile> <descfile> <tagsfile>
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
tokf, vid, lang, tf, df, gf = sys.argv[1:7]
t = json.load(open(tokf, encoding="utf-8"))
def env_val(key):
    try:
        for line in open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), encoding="utf-8"):
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
title = open(tf, encoding="utf-8").read().strip()
desc = open(df, encoding="utf-8").read() if os.path.exists(df) else ""
tags = [x.strip() for x in open(gf, encoding="utf-8").read().split(",") if x.strip()] if os.path.exists(gf) else []
body = {"id": vid, "snippet": {"title": title, "description": desc, "tags": tags, "categoryId": "10", "defaultLanguage": lang, "defaultAudioLanguage": lang}}
req = urllib.request.Request("https://www.googleapis.com/youtube/v3/videos?part=snippet",
    data=json.dumps(body).encode(), headers=H, method="PUT")
try:
    r = json.load(urllib.request.urlopen(req, timeout=40))
    print(json.dumps({"ok": True, "id": vid, "title": r["snippet"]["title"], "tags": len(tags), "descLen": len(desc)}, ensure_ascii=False))
except urllib.error.HTTPError as e:
    print(json.dumps({"ok": False, "err": e.read().decode()[:300]})); sys.exit(1)
