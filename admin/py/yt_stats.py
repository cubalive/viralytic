"""yt_stats.py — lee las ESTADÍSTICAS reales del canal (vistas, likes, comentarios) y guarda
top videos + totales. Uso: python py/yt_stats.py <token.json> <out.json>
(Ingresos requieren YouTube Analytics API + monetización; aquí: vistas/engagement como proxy.)
"""
import sys, os, json, urllib.request, urllib.parse
tokf, out = sys.argv[1], sys.argv[2]
t = json.load(open(tokf, encoding="utf-8"))
cid = t.get("client_id") or os.environ.get("YT_CLIENT_ID"); csec = t.get("client_secret") or os.environ.get("YT_CLIENT_SECRET")
def access():
    d = urllib.parse.urlencode({"client_id": cid, "client_secret": csec, "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=d, timeout=30))["access_token"]
H = {"Authorization": f"Bearer {access()}"}
def G(url): return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40))
ch = G("https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&mine=true")
chst = ch["items"][0].get("statistics", {})
ups = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
ids = []; page = ""
while True:
    d = G(f"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId={ups}" + (f"&pageToken={page}" if page else ""))
    ids += [it["contentDetails"]["videoId"] for it in d.get("items", [])]; page = d.get("nextPageToken")
    if not page or len(ids) >= 200: break
items = []
for i in range(0, len(ids), 50):
    d = G("https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=" + ",".join(ids[i:i+50]))
    for v in d.get("items", []):
        s = v.get("statistics", {})
        items.append({"id": v["id"], "url": f"https://youtu.be/{v['id']}", "title": v["snippet"].get("title", ""),
            "views": int(s.get("viewCount", 0)), "likes": int(s.get("likeCount", 0)), "comments": int(s.get("commentCount", 0)),
            "publishedAt": v["snippet"].get("publishedAt")})
items.sort(key=lambda x: -x["views"])
res = {"channelViews": int(chst.get("viewCount", 0)), "subs": int(chst.get("subscriberCount", 0)), "videoCount": int(chst.get("videoCount", 0)),
       "totalViews": sum(i["views"] for i in items), "top": items[:3], "all": items[:50]}
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({"ok": True, "subs": res["subs"], "views": res["channelViews"], "top": [x["title"][:30] for x in res["top"]]}))
