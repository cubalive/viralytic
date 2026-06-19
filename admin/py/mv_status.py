"""mv_status.py — estado del mundo RAILWAY/SUPABASE (Caroline + lo que rinde el worker).
Lee mv_channels + mv_projects + mv_youtube_connections + mv_video_languages y resume,
por canal: conexión, conteo por estado (generating/rendered/ready/published) y últimos
publicados con su link de YouTube. Escribe data/youtube/mv_status.json.
Uso: python py/mv_status.py
"""
import os, json, urllib.request, urllib.parse, datetime

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env():
    for line in open(os.path.join(ADMIN, ".env"), encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
URL = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def G(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(URL + "/rest/v1/" + path, headers=H), timeout=40))


try:
    chans = G("mv_channels?select=id,youtube_handle,language,project_id")
    projs = {p["id"]: p.get("name", "") for p in G("mv_projects?select=id,name")}
    conns = G("mv_youtube_connections?select=channel_id,connection_status,youtube_title")
    conn_by = {c["channel_id"]: c for c in conns}
    vids = G("mv_video_languages?select=channel_id,language,status,youtube_video_id,final_video_path,created_at&order=created_at.desc")

    by_ch = {}
    for v in vids:
        by_ch.setdefault(v["channel_id"], []).append(v)

    out = []
    for c in chans:
        cid = c["id"]
        vl = by_ch.get(cid, [])
        counts = {}
        for v in vl:
            s = v.get("status") or "?"
            counts[s] = counts.get(s, 0) + 1
        recent = [{
            "title": (os.path.basename(v.get("final_video_path") or "") or v.get("language", "")) or "video",
            "lang": v.get("language", ""), "status": v.get("status"),
            "url": f"https://youtu.be/{v['youtube_video_id']}" if v.get("youtube_video_id") else None,
            "createdAt": v.get("created_at"),
        } for v in vl[:6]]
        conn = conn_by.get(cid, {})
        out.append({
            "handle": c.get("youtube_handle") or "—",
            "lang": c.get("language", ""),
            "project": projs.get(c.get("project_id"), ""),
            "connected": conn.get("connection_status") == "connected",
            "ytTitle": conn.get("youtube_title", ""),
            "total": len(vl),
            "published": counts.get("published", 0),
            "counts": counts,
            "recent": recent,
        })

    # ordena: más publicados primero
    out.sort(key=lambda x: -x["published"])
    res = {
        "syncedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "totals": {
            "channels": len(out),
            "connected": len([c for c in out if c["connected"]]),
            "published": sum(c["published"] for c in out),
            "videos": sum(c["total"] for c in out),
        },
        "channels": out,
    }
    json.dump(res, open(os.path.join(ADMIN, "data", "youtube", "mv_status.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for c in out:
        print(f"  {c['handle']} ({c['lang']}): {c['published']} pub / {c['total']} total · {'conectado' if c['connected'] else 'sin conexión'}")
    print(f"DONE {res['totals']['connected']}/{res['totals']['channels']} conectados · {res['totals']['published']} publicados")
except Exception as e:
    import traceback
    print("ERR", str(e)[:200])
    json.dump({"error": str(e)[:200]}, open(os.path.join(ADMIN, "data", "youtube", "mv_status.json"), "w", encoding="utf-8"))
