"""zuri_meta.py — AUTO-METADATA SEO 2026 (senior). Regenera TODA la metadata de un video,
en el idioma del canal, segun el estandar SEO maestro. Salida lista para publicar.
Uso: python py/zuri_meta.py <song-id>   -> data/output/<song-id>/meta_<lang>.json
"""
import sys, os, json, urllib.request
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SID = sys.argv[1]
SDIR = os.path.join(ADMIN, "data", "songs", SID)
song = json.load(open(os.path.join(SDIR, "song.json"), encoding="utf-8"))
LANG = song.get("lang", "es"); TITLE = song.get("title", ""); LYR = song.get("lyrics", "")
OUT = os.path.join(ADMIN, "data", "output", "zuri", LANG, SID); os.makedirs(OUT, exist_ok=True)
chap = open(os.path.join(OUT, "chapters.txt"), encoding="utf-8").read().strip() if os.path.exists(os.path.join(OUT, "chapters.txt")) else ""
HANDLE = {"es":"@ZuriRockstar","en":"@ZuriRockStarEnglish","zh":"@祖瑞","hi":"@ZuriHindi","pa":"@ZuriPunjabi","pt":"@ZuriRockStarShowPortugues","it":"@ZuriRokStarShowItalia"}.get(LANG, "@ZuriRockstar")
LANGNAME = {"es":"Spanish","en":"English","zh":"Mandarin Chinese","hi":"Hindi","pa":"Punjabi","pt":"Portuguese","it":"Italian"}.get(LANG, LANG)
KEY = open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()

NICHE = ("CHANNEL = 'Zuri', an animated kids & preteen (ages 8-14) MUSIC channel. Zuri is a caramel meerkat girl pop star "
 "who turns emotions into songs (original POP/ROCK/R&B), in a magical glowing forest with her animal friends. "
 "Every video is an animated 3D music video with on-screen SING-ALONG / KARAOKE lyrics. Themes: friendship, emotions, "
 "courage, self-confidence, feeling safe and understood. Audience: kids, preteens and families. Search intent: WATCH + "
 "ENTERTAIN CHILDREN + MUSIC + SING ALONG + learn-emotions. This is YouTube Kids friendly content.")

SYS = ("You are the world's leading YouTube SEO strategist and metadata architect (2026 best practices). "
 "Optimize for search discoverability, suggested videos, browse/home recommendations, session watch time, retention, "
 "and long-term channel + topic authority via SEMANTIC SEO (entities, LSI, long-tail, synonyms, related concepts). "
 "NOT keyword stuffing — write natural, human, professional copy with NO AI-sounding phrasing and NO repetition. "
 "Write EVERYTHING 100% in " + LANGNAME + ", native and fluent. Return STRICT JSON only.")

USER = f"""{NICHE}

THIS VIDEO — song title: "{TITLE}"  (channel handle: {HANDLE})
Chapters (timestamps) to embed VERBATIM in the description:
{chap}

Lyrics (context; first lines are the sing-along, do not dump everything):
{LYR[:1000]}

Regenerate ALL metadata from scratch (never reuse other channels). Return a JSON object with these keys, all in {LANGNAME}:

"title": <=100 chars. Structure "Main Keyword | Emotional Hook | Brand". Primary keyword near the start, natural, clickable but NOT clickbait, 1-2 emojis ok. Brand = Zuri.
"description": Up to 4900 characters, use most of the space NATURALLY. Structure:
  INTRO (what the viewer/child will experience + the song's feeling);
  a SING-ALONG block with the first 4 lyric lines;
  a line with the chapters (paste the chapters block VERBATIM, each "M:SS Label" on its own line);
  BODY: explain the song's message, related concepts and emotions, answer common parent/kid questions, note it is sing-along/karaoke and YouTube-Kids friendly, build topical authority, say WHY the Zuri channel exists and what to expect (builds trust);
  END: strong CTA — subscribe + bell, watch another Zuri song, add to playlist, comment/community invite, "📩 info@passkal.com"; then 3-5 relevant hashtags on the last line (start with #zuri).
  Natural language, no keyword stuffing. The description MUST be at least 2800 characters (target 3500-4900); expand the BODY richly so it is never short.
"hashtags": array of 3-5 hashtags (strings with #), the same ones used at the end of the description.
"tags": array of 30-45 search tags that, joined by commas, MUST total between 440 and 490 characters (fill the field; add long-tail, question-style and related-entity searches). No duplicates.
"primaryKeywords": array (3-6).
"secondaryKeywords": array (5-10).
"topicCluster": short string (the cluster this video reinforces).
"searchIntent": short string.
"category": "Music".
"seoScore": integer 1-100.
"rationale": 2-3 sentences on why this metadata is optimized.
Return only the JSON object."""

body = {"model":"gpt-4o","temperature":0.6,"max_tokens":4000,"response_format":{"type":"json_object"},
        "messages":[{"role":"system","content":SYS},{"role":"user","content":USER}]}
req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
    headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
r = json.load(urllib.request.urlopen(req, timeout=180))
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import usage
    us = r.get("usage", {}); usage.record_tokens("zuri-" + LANG, "metadata", "gpt-4o", us.get("prompt_tokens", 0), us.get("completion_tokens", 0), note=SID)
except Exception: pass
meta = json.loads(r["choices"][0]["message"]["content"])
def eff(t): return len(t)+(2 if ' ' in t else 0)
tags=[]; n=0
for t in meta.get("tags", []):
    t=str(t).strip()
    if not t or n+eff(t)+1>480: continue
    tags.append(t); n+=eff(t)+1
meta["tags"]=tags; meta["lang"]=LANG; meta["handle"]=HANDLE
json.dump(meta, open(os.path.join(OUT, f"meta_{LANG}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
# archivos listos para subir
open(os.path.join(OUT, f"{LANG}_title.txt"),"w",encoding="utf-8").write(meta["title"])
open(os.path.join(OUT, f"{LANG}_desc.txt"),"w",encoding="utf-8").write(meta["description"])
open(os.path.join(OUT, f"{LANG}_tags.txt"),"w",encoding="utf-8").write(",".join(tags))
print("TITLE:", meta["title"], "(", len(meta["title"]), "chars )")
print("desc:", len(meta["description"]), "chars · tags:", len(tags), "(", n, "chars ) · SEO:", meta.get("seoScore"))
print("intent:", meta.get("searchIntent"), "· cluster:", meta.get("topicCluster"))
