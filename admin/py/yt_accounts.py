"""yt_accounts.py — datos REALES de la cuenta/canal vía YouTube Data API (a stdout, JSON).
Devuelve: título, handle, país, miniatura, suscriptores, vistas totales, nº videos,
y el rendimiento de los últimos N videos (vistas/likes/comentarios).
Uso: python py/yt_accounts.py <token.json> [N]
Cuota: ~4 unidades por canal.
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error

tokf = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 6
t = json.load(open(tokf, encoding="utf-8"))
cid = t.get("client_id") or os.environ.get("YT_CLIENT_ID")
csec = t.get("client_secret") or os.environ.get("YT_CLIENT_SECRET")


def access():
    d = urllib.parse.urlencode({
        "client_id": cid, "client_secret": csec,
        "refresh_token": t["refresh_token"], "grant_type": "refresh_token",
    }).encode()
    return json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=d, timeout=30))["access_token"]


try:
    H = {"Authorization": f"Bearer {access()}"}

    def G(url):
        return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40))

    ch = G("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true")
    if not ch.get("items"):
        print(json.dumps({"ok": False, "error": "sin canal"})); sys.exit(0)
    c = ch["items"][0]
    sn = c.get("snippet", {}); st = c.get("statistics", {})
    th = sn.get("thumbnails", {})
    thumb = (th.get("medium") or th.get("default") or {}).get("url", "")
    ups = c["contentDetails"]["relatedPlaylists"]["uploads"]

    recent = []
    pl = G(f"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults={min(N,50)}&playlistId={ups}")
    vids = [it["contentDetails"]["videoId"] for it in pl.get("items", [])][:N]
    if vids:
        vd = G("https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=" + ",".join(vids))
        for v in vd.get("items", []):
            vst = v.get("statistics", {}); vsn = v.get("snippet", {})
            recent.append({
                "id": v["id"], "url": f"https://youtu.be/{v['id']}",
                "title": vsn.get("title", ""), "publishedAt": vsn.get("publishedAt"),
                "privacy": v.get("status", {}).get("privacyStatus"),
                "views": int(vst.get("viewCount", 0) or 0),
                "likes": int(vst.get("likeCount", 0) or 0),
                "comments": int(vst.get("commentCount", 0) or 0),
            })

    print(json.dumps({
        "ok": True,
        "title": sn.get("title", ""), "handle": sn.get("customUrl", ""),
        "country": sn.get("country", ""), "thumb": thumb,
        "createdAt": sn.get("publishedAt"),
        "subs": int(st.get("subscriberCount", 0) or 0),
        "subsHidden": st.get("hiddenSubscriberCount", False),
        "views": int(st.get("viewCount", 0) or 0),
        "videos": int(st.get("videoCount", 0) or 0),
        "recent": recent,
    }, ensure_ascii=False))
except urllib.error.HTTPError as e:
    print(json.dumps({"ok": False, "error": f"HTTP {e.code}", "detail": e.read().decode("utf-8", "ignore")[:160]}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)[:160]}))
