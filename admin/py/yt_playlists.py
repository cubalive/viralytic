"""yt_playlists.py — crea (idempotente) las playlists 'Videos' y 'Shorts' de un canal.
Uso: python py/yt_playlists.py <token.json> <out.json>
Guarda {"videos": id, "shorts": id} en out.json. No duplica si ya existen.
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
tokf, outf = sys.argv[1], sys.argv[2]
t = json.load(open(tokf, encoding="utf-8"))
cid = t.get("client_id") or os.environ.get("YT_CLIENT_ID"); csec = t.get("client_secret") or os.environ.get("YT_CLIENT_SECRET")
def access():
    d = urllib.parse.urlencode({"client_id": cid, "client_secret": csec, "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=d, timeout=30))["access_token"]
tok = access(); H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
# existentes
existing = {}
d = json.load(urllib.request.urlopen(urllib.request.Request("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50", headers=H), timeout=30))
for it in d.get("items", []): existing[it["snippet"]["title"].strip().lower()] = it["id"]
WANT = [("videos", "🎬 Videos", "Todos los videos del canal."), ("shorts", "⚡ Shorts", "Shorts y reels cortos del canal.")]
res = {}
for key, title, desc in WANT:
    if title.strip().lower() in existing: res[key] = existing[title.strip().lower()]; print("ya existe", title); continue
    body = {"snippet": {"title": title, "description": desc}, "status": {"privacyStatus": "public"}}
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", data=json.dumps(body).encode(), headers=H), timeout=40))
        res[key] = r["id"]; print("creada", title, r["id"])
    except urllib.error.HTTPError as e: print("FAIL", title, e.code, e.read().decode()[:120])
json.dump(res, open(outf, "w", encoding="utf-8"), indent=2)
print("->", outf, res)
