"""seo_meta.py — MOTOR MAESTRO DE SEO 2026 (universal, por canal y tipo de video).
Aplica el estándar SEO (título | gancho | marca, descripción larga, hashtags, tags 500 chars,
keywords, cluster, intent, score) ADAPTADO al nicho de cada canal (data/seo_profiles.json).
Para música (type=song) añade automáticamente CAPÍTULOS (timestamps) + LETRA completa.

Uso: python py/seo_meta.py <channel_id> <content_dir> [--song|--topic] [--title "..."] [--topic-text "..."]
Salida en content_dir: <lang>_title.txt, <lang>_desc.txt, <lang>_tags.txt, meta_<lang>.json
"""
import sys, os, json, urllib.request
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cid_arg = sys.argv[1]; CDIR = sys.argv[2]
FORCE_TYPE = "song" if "--song" in sys.argv else ("topic" if "--topic" in sys.argv else None)
def opt(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv and sys.argv.index(flag) + 1 < len(sys.argv) else None
def rd(f, d=""):
    p = os.path.join(CDIR, f)
    return open(p, encoding="utf-8").read().strip() if os.path.exists(p) else d

# ---- resolver canal (projects.json) + perfil (seo_profiles.json) ----
REG = json.load(open(os.path.join(ADMIN, "dashboard", "projects.json"), encoding="utf-8"))
proj = None
for g in REG["groups"]:
    for p in g["projects"]:
        if p["id"] == cid_arg: proj = p
if not proj: print(json.dumps({"ok": False, "err": "canal no encontrado: " + cid_arg})); sys.exit(1)
PROF = json.load(open(os.path.join(ADMIN, "data", "seo_profiles.json"), encoding="utf-8"))
prof = dict(PROF.get("by_kind", {}).get(proj.get("kind", ""), {}))
prof.update(PROF.get("channels", {}).get(cid_arg, {}))
LANG = prof.get("language") or proj.get("lang", "es")
BRAND = prof.get("brand") or proj.get("name", "")
HANDLE = proj.get("handle", "")
TYPE = FORCE_TYPE or prof.get("type", "topic")
TITLE = opt("--title") or rd("title.txt") or proj.get("name", "")
LYR = rd("lyrics.txt") if TYPE == "song" else ""
TOPIC = opt("--topic-text") or rd("topic.txt") or rd("script.txt")
KEY = open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()
LANGNAME = {"es": "Spanish", "en": "English", "zh": "Mandarin Chinese", "hi": "Hindi", "pa": "Punjabi", "pt": "Portuguese", "it": "Italian"}.get(LANG, LANG)

# ---- capítulos (solo música, desde karaoke.ass + analysis.json) ----
def s2mmss(s):
    s = max(0, int(round(s))); return f"{s//60}:{s%60:02d}"
def build_chapters():
    ch = ["0:00 Intro"]; vs = None; anchors = []
    ass = os.path.join(CDIR, "karaoke.ass"); ana = os.path.join(CDIR, "analysis.json")
    if os.path.exists(ass):
        for ln in open(ass, encoding="utf-8"):
            if ln.startswith("Dialogue:"):
                pp = ln[9:].lstrip().split(",", 9)
                try:
                    h, m, sec = pp[1].split(":"); st = int(h) * 3600 + int(m) * 60 + float(sec)
                except Exception: continue
                if st > 1.0: vs = st; break
    if os.path.exists(ana):
        try: anchors = json.load(open(ana, encoding="utf-8")).get("chorusAnchors", [])
        except Exception: anchors = []
    pts = ([(vs, "Comienza" if LANG != "en" else "Song begins")] if vs else []) + [(float(a), "Coro" if LANG != "en" else "Chorus") for a in anchors]
    pts.sort(); last = 0.0
    for tsec, label in pts:
        if tsec - last >= 10: ch.append(f"{s2mmss(tsec)} {label}"); last = tsec
    return "\n".join(ch) if len(ch) >= 3 else ""
CHAPTERS = build_chapters() if TYPE == "song" else ""

# ---- prompt maestro (estándar SEO 2026, adaptado al perfil del canal) ----
NICHE = (f"CHANNEL = '{BRAND}' ({HANDLE}). NICHE: {prof.get('niche','')}. "
 f"AUDIENCE: {prof.get('audience','')}. SEARCH INTENT: {prof.get('intent','')}. "
 f"BRAND VOICE: {prof.get('voice','')}. CONTENT TYPE: {'music video with on-screen karaoke lyrics' if TYPE=='song' else 'short-form video'}. "
 f"This is {'made for kids / family content' if prof.get('madeForKids') else 'general audience (not for kids)'}.")

SYS = ("You are the world's leading YouTube SEO strategist, metadata architect and audience-growth expert (2026 best practices). "
 "Maximize: search discoverability, suggested videos, browse/home recommendations, session watch time, retention, channel + topic authority, "
 "brand recognition and SEMANTIC understanding by YouTube's AI (entities, related concepts, LSI, long-tail, synonyms, audience questions). "
 "This is NOT keyword stuffing — write natural, human, professional copy with NO AI-sounding phrasing and NO repetition. "
 f"Write EVERYTHING 100% in {LANGNAME}, native and fluent. Maintain a consistent voice for this channel. Return STRICT JSON only.")

CONTENT = (f'SONG TITLE: "{TITLE}". Lyrics (context; first lines = sing-along):\n{LYR[:900]}'
           if TYPE == "song" else f'VIDEO TOPIC / TITLE: "{TITLE}".\n{("Details: " + TOPIC[:1200]) if TOPIC else ""}')

USER = f"""{NICHE}

THIS VIDEO:
{CONTENT}

Regenerate ALL metadata from scratch (never reuse other channels; this description must be unique). Return a JSON object, everything in {LANGNAME}:

"title": <=100 chars. Structure "Main Keyword | Emotional Hook | {BRAND}". Primary keyword near the start, natural, clickable, NOT clickbait. 1 sober emoji optional.
"description": ONLY PROSE (the {'lyrics, chapters and ' if TYPE=='song' else ''}hashtags are appended automatically — do NOT include them). {('2500-3500' if TYPE=='song' else '3500-4800')} characters, use as much space as possible, natural and human. Structure: INTRO (what the viewer will get/feel); BODY (detailed: related concepts, answer common audience questions, build TOPICAL AUTHORITY, semantic entities/people/places/terms when relevant, WHY this channel exists and what to expect → builds trust); END (strong CTA: subscribe + bell, watch another video, playlist recommendation, community/comment invitation). No keyword stuffing, no repetition.
"hashtags": array of 3-5 hashtags, ALL lowercase (with #), specific to topic + niche + brand. No spam.
"tags": array of 30-45 search tags that joined by commas total 440-490 characters (fill the field): mix high-volume, medium, long-tail, brand, related entities, question searches, audience intent. No duplicates.
"primaryKeywords": array (3-6).
"secondaryKeywords": array (5-10).
"topicCluster": short string (the cluster this video reinforces).
"searchIntent": short string.
"category": one of Music/Education/Entertainment/People & Blogs/Howto & Style/Science & Technology.
"seoScore": integer 1-100.
"rationale": 2-3 sentences on why this metadata is optimized.
Return only the JSON object."""

body = {"model": "gpt-4o", "temperature": 0.6, "max_tokens": 6000, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": USER}]}
req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
    headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
r = json.load(urllib.request.urlopen(req, timeout=200))
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import usage
    us = r.get("usage", {}); usage.record_tokens(cid_arg, "metadata", "gpt-4o", us.get("prompt_tokens", 0), us.get("completion_tokens", 0), note=os.path.basename(CDIR))
except Exception: pass
meta = json.loads(r["choices"][0]["message"]["content"])

# tags -> 440-490 chars (acepta array o string separado por comas)
def eff(t): return len(t) + (2 if ' ' in t else 0)
raw_tags = meta.get("tags", [])
if isinstance(raw_tags, str): raw_tags = [x.strip() for x in raw_tags.split(",")]
tags = []; n = 0; seen = set()
for t in raw_tags:
    t = str(t).strip().lstrip("#").strip()
    k = t.lower()
    if not t or k in seen or n + eff(t) + 1 > 480: continue
    tags.append(t); seen.add(k); n += eff(t) + 1

# hashtags minúscula
hashtags = []
for h in meta.get("hashtags", []):
    h = str(h).strip()
    if not h: continue
    if not h.startswith("#"): h = "#" + h
    hashtags.append(h.lower().replace(" ", ""))

# ensamble final de la descripción
LBL = {"chapters": "⏱️ CAPÍTULOS" if LANG != "en" else "⏱️ CHAPTERS",
       "lyrics": "📝 LETRA — canta con nosotros:" if LANG != "en" else "📝 LYRICS — sing along:"}
parts = [meta.get("description", "").rstrip()]
if TYPE == "song" and CHAPTERS: parts.append(LBL["chapters"] + "\n" + CHAPTERS)
if TYPE == "song" and LYR: parts.append(LBL["lyrics"] + "\n" + LYR.strip())
if hashtags: parts.append(" ".join(hashtags))
final_desc = "\n\n".join(p for p in parts if p)[:4950]

meta.update({"description": final_desc, "tags": tags, "hashtags": hashtags, "chapters": CHAPTERS,
             "lang": LANG, "channel": cid_arg, "brand": BRAND, "type": TYPE})
json.dump(meta, open(os.path.join(CDIR, f"meta_{LANG}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(os.path.join(CDIR, f"{LANG}_title.txt"), "w", encoding="utf-8").write(meta["title"])
open(os.path.join(CDIR, f"{LANG}_desc.txt"), "w", encoding="utf-8").write(final_desc)
open(os.path.join(CDIR, f"{LANG}_tags.txt"), "w", encoding="utf-8").write(",".join(tags))
print(f"[{cid_arg}/{TYPE}/{LANG}] TITLE: {meta['title']} ({len(meta['title'])} chars)")
print(f"desc: {len(final_desc)} chars · tags: {len(tags)} ({n} chars) · hashtags: {len(hashtags)} · SEO: {meta.get('seoScore')} · cluster: {meta.get('topicCluster')}")
