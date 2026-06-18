"""yt_schedule.py — sube un video a YouTube PROGRAMADO (publishAt) o publico/ya.
Uso: python py/yt_schedule.py <token.json> <video.mp4> <when_iso|now> <lang> <title> <descfile|-> <tags|-> [thumb]
token.json: {refresh_token, client_id, client_secret}  (o usa YT_CLIENT_ID/SECRET del entorno)
when_iso: '2026-06-20T15:00:00Z' (programa privado->publico) o 'now' (publico ya).
Imprime JSON: {"id","url","privacy"}
"""
import sys, os, json, urllib.request, urllib.parse, urllib.error
tokf, video, when, lang, title = sys.argv[1:6]
descfile = sys.argv[6] if len(sys.argv) > 6 else "-"
tagsarg  = sys.argv[7] if len(sys.argv) > 7 else "-"
thumb    = sys.argv[8] if len(sys.argv) > 8 else ""
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
tok = access()
desc = open(descfile, encoding="utf-8").read() if descfile and descfile != "-" and os.path.exists(descfile) else ""
tags = [x.strip() for x in open(tagsarg, encoding="utf-8").read().split(",") if x.strip()] if tagsarg and tagsarg != "-" and os.path.exists(tagsarg) else ([x.strip() for x in tagsarg.split(",") if x.strip()] if tagsarg and tagsarg != "-" else [])
mfk = os.environ.get("YT_MADE_FOR_KIDS", "1") != "0"   # vallenato/adultos: exporta YT_MADE_FOR_KIDS=0
status = {"selfDeclaredMadeForKids": mfk}
if when == "private":
    status["privacyStatus"] = "private"                  # privado indefinido (sin fecha)
elif when and when != "now":
    status["privacyStatus"] = "private"; status["publishAt"] = when     # programado
else:
    status["privacyStatus"] = "public"
meta = {"snippet": {"title": title, "description": desc, "tags": tags, "categoryId": "10", "defaultLanguage": lang, "defaultAudioLanguage": lang}, "status": status}
size = os.path.getsize(video)
req = urllib.request.Request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    data=json.dumps(meta).encode(), headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": "video/*", "X-Upload-Content-Length": str(size)}, method="POST")
up = urllib.request.urlopen(req, timeout=60).headers["Location"]
put = urllib.request.Request(up, data=open(video, "rb").read(), method="PUT",
    headers={"Authorization": f"Bearer {tok}", "Content-Type": "video/*", "Content-Length": str(size)})
res = json.load(urllib.request.urlopen(put, timeout=1800)); vid = res["id"]
if thumb and os.path.exists(thumb):
    try:
        tok = access()
        urllib.request.urlopen(urllib.request.Request(f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={vid}",
            data=open(thumb, "rb").read(), headers={"Authorization": f"Bearer {tok}", "Content-Type": "image/png"}, method="POST"), timeout=120)
    except Exception: pass
print(json.dumps({"id": vid, "url": f"https://youtu.be/{vid}", "privacy": status["privacyStatus"], "publishAt": status.get("publishAt")}))
