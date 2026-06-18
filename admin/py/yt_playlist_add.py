"""yt_playlist_add.py — agrega videos a una playlist (idempotente, no duplica).
Uso: python py/yt_playlist_add.py <token.json> <playlistId> <videoId> [videoId...]
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
tokf, pid = sys.argv[1], sys.argv[2]
vids = sys.argv[3:]
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

have = set(); page = ""
while True:
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(
            f"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId={pid}&maxResults=50" + (f"&pageToken={page}" if page else ""), headers=H), timeout=30))
    except urllib.error.HTTPError as e:
        print("err leyendo playlist:", e.read().decode()[:160]); break
    for it in d.get("items", []):
        have.add(it["contentDetails"]["videoId"])
    page = d.get("nextPageToken")
    if not page:
        break
for v in vids:
    if v in have:
        print("ya está:", v); continue
    body = {"snippet": {"playlistId": pid, "resourceId": {"kind": "youtube#video", "videoId": v}}}
    try:
        urllib.request.urlopen(urllib.request.Request("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
            data=json.dumps(body).encode(), headers=H), timeout=40)
        print("agregado:", v)
    except urllib.error.HTTPError as e:
        print("FAIL:", v, e.code, e.read().decode()[:160])
