"""yt_accounts_all.py — recorre TODOS los canales conectados (projects.json) y escribe
data/youtube/accounts.json con los datos reales de cada cuenta + totales de la red.
Uso: python py/yt_accounts_all.py
Cuota: ~4 unidades por canal conectado.
"""
import os, json, urllib.request, urllib.parse, urllib.error, datetime

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env():
    p = os.path.join(ADMIN, ".env")
    if not os.path.exists(p):
        return
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
REG = json.load(open(os.path.join(ADMIN, "dashboard", "projects.json"), encoding="utf-8"))


def absf(p):
    return p if os.path.isabs(p) else os.path.join(ADMIN, p)


def fetch(tokf, N=6):
    t = json.load(open(tokf, encoding="utf-8"))
    cid = t.get("client_id") or os.environ.get("YT_CLIENT_ID")
    csec = t.get("client_secret") or os.environ.get("YT_CLIENT_SECRET")
    d = urllib.parse.urlencode({"client_id": cid, "client_secret": csec, "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    tok = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", data=d, timeout=30))["access_token"]
    H = {"Authorization": f"Bearer {tok}"}

    def G(url):
        return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40))

    ch = G("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true")
    if not ch.get("items"):
        return {"ok": False, "error": "sin canal"}
    c = ch["items"][0]; sn = c.get("snippet", {}); st = c.get("statistics", {})
    th = sn.get("thumbnails", {}); thumb = (th.get("medium") or th.get("default") or {}).get("url", "")
    ups = c["contentDetails"]["relatedPlaylists"]["uploads"]
    recent = []
    pl = G(f"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults={N}&playlistId={ups}")
    vids = [it["contentDetails"]["videoId"] for it in pl.get("items", [])][:N]
    if vids:
        vd = G("https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=" + ",".join(vids))
        for v in vd.get("items", []):
            vst = v.get("statistics", {}); vsn = v.get("snippet", {})
            recent.append({"id": v["id"], "url": f"https://youtu.be/{v['id']}", "title": vsn.get("title", ""),
                           "publishedAt": vsn.get("publishedAt"), "privacy": v.get("status", {}).get("privacyStatus"),
                           "views": int(vst.get("viewCount", 0) or 0), "likes": int(vst.get("likeCount", 0) or 0),
                           "comments": int(vst.get("commentCount", 0) or 0)})
    return {"ok": True, "title": sn.get("title", ""), "handle": sn.get("customUrl", ""), "country": sn.get("country", ""),
            "thumb": thumb, "createdAt": sn.get("publishedAt"), "subs": int(st.get("subscriberCount", 0) or 0),
            "subsHidden": st.get("hiddenSubscriberCount", False), "views": int(st.get("viewCount", 0) or 0),
            "videos": int(st.get("videoCount", 0) or 0), "recent": recent}


out = []
for g in REG["groups"]:
    for p in g["projects"]:
        tf = absf(p.get("ytToken", ""))
        if not tf or not os.path.exists(tf):
            out.append({"id": p["id"], "name": p["name"], "kind": p.get("kind", ""), "lang": p.get("lang", ""),
                        "group": g["key"], "connected": False})
            continue
        row = {"id": p["id"], "name": p["name"], "kind": p.get("kind", ""), "lang": p.get("lang", ""),
               "group": g["key"], "connected": True}
        try:
            row.update(fetch(tf))
        except urllib.error.HTTPError as e:
            row.update({"ok": False, "error": f"HTTP {e.code}"})
        except Exception as e:
            row.update({"ok": False, "error": str(e)[:120]})
        out.append(row)
        print(f"  {p['id']}: " + (f"{row.get('subs',0)} subs · {row.get('views',0)} vistas" if row.get("ok") else f"⚠️ {row.get('error')}"))

ok = [r for r in out if r.get("ok")]
totals = {"channels": len(out), "connected": len([r for r in out if r.get("connected")]),
          "subs": sum(r.get("subs", 0) for r in ok), "views": sum(r.get("views", 0) for r in ok),
          "videos": sum(r.get("videos", 0) for r in ok)}
res = {"syncedAt": datetime.datetime.now().isoformat(timespec="seconds"), "totals": totals, "channels": out}
outf = os.path.join(ADMIN, "data", "youtube", "accounts.json")
json.dump(res, open(outf, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"DONE {totals['connected']}/{totals['channels']} canales · {totals['subs']} subs · {totals['views']} vistas")
