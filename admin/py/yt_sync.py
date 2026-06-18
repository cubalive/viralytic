"""yt_sync.py — lee del CANAL de YouTube el estado REAL de los videos (fiel) y lo guarda.
Para cada video: id, titulo, privacyStatus (public/private/unlisted), publishAt (programado), publishedAt.
Uso: python py/yt_sync.py <token.json> <out.json>
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
tokf, out = sys.argv[1], sys.argv[2]
t = json.load(open(tokf, encoding="utf-8"))
cid = t.get("client_id") or os.environ.get("YT_CLIENT_ID"); csec = t.get("client_secret") or os.environ.get("YT_CLIENT_SECRET")
def access():
    d = urllib.parse.urlencode({"client_id": cid, "client_secret": csec, "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=d, timeout=30))["access_token"]
tok = access(); H = {"Authorization": f"Bearer {tok}"}
def G(url): return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40))
ch = G("https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true")
ups = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
ids = []; page = ""
while True:
    d = G(f"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId={ups}" + (f"&pageToken={page}" if page else ""))
    ids += [it["contentDetails"]["videoId"] for it in d.get("items", [])]
    page = d.get("nextPageToken");
    if not page or len(ids) >= 200: break
items = []
for i in range(0, len(ids), 50):
    d = G("https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=" + ",".join(ids[i:i+50]))
    for v in d.get("items", []):
        st = v.get("status", {}); sn = v.get("snippet", {})
        items.append({"id": v["id"], "url": f"https://youtu.be/{v['id']}", "title": sn.get("title", ""),
            "privacy": st.get("privacyStatus"), "publishAt": st.get("publishAt"), "publishedAt": sn.get("publishedAt")})
json.dump({"syncedAt": None, "items": items}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({"ok": True, "count": len(items)}))
