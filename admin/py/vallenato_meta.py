"""vallenato_meta.py — METADATA SEO 2026 para un video de vallenato (en español).
Lee data/vallenato/<slug>/ (title.txt, lyrics.txt, artist opcional) y genera título,
descripción larga, tags y hashtags listos para publicar. Salida: es_title/desc/tags.txt + meta.json
Uso: python py/vallenato_meta.py <slug> [artista]
"""
import sys, os, json, urllib.request
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
slug = sys.argv[1]
artist = sys.argv[2] if len(sys.argv) > 2 else ""
D = os.path.join(ADMIN, "data", "vallenato", slug)
def rd(f, d=""):
    p = os.path.join(D, f)
    return open(p, encoding="utf-8").read().strip() if os.path.exists(p) else d
TITLE = rd("title.txt", slug.replace("-", " ").title())
if not artist:
    artist = rd("artist.txt", "")
LYR = rd("lyrics.txt", "")
KEY = open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()

def s2mmss(s):
    s = max(0, int(round(s))); return f"{s//60}:{s%60:02d}"
def build_chapters():
    # Capítulos con timestamps: Intro (0:00) + comienzo de la voz + coros detectados.
    ch = ["0:00 🎶 Intro"]; vs = None; anchors = []
    ass = os.path.join(D, "karaoke.ass"); ana = os.path.join(D, "analysis.json")
    if os.path.exists(ass):
        for ln in open(ass, encoding="utf-8"):
            if ln.startswith("Dialogue:"):
                p = ln[9:].lstrip().split(",", 9)
                try:
                    h, m, sec = p[1].split(":"); st = int(h) * 3600 + int(m) * 60 + float(sec)
                except Exception:
                    continue
                if st > 1.0:
                    vs = st; break
    if os.path.exists(ana):
        try: anchors = json.load(open(ana, encoding="utf-8")).get("chorusAnchors", [])
        except Exception: anchors = []
    pts = ([(vs, "Comienza la canción")] if vs else []) + [(float(a), "Coro") for a in anchors]
    pts.sort(); last = 0.0
    for tsec, label in pts:
        if tsec - last >= 10:
            ch.append(f"{s2mmss(tsec)} {label}"); last = tsec
    return "\n".join(ch) if len(ch) >= 3 else ""
CHAPTERS = build_chapters()

NICHE = ("CHANNEL = 'Vallenatos para Curar el Alma' (@vallenatoinc), an ADULT romantic VALLENATO music channel in Spanish. "
 "Vallenato is Colombian folk music (accordion, caja, guacharaca) about love, heartbreak, longing and life. "
 "Audience: Spanish-speaking adults in the USA and Latin America who love vallenato romántico, clásico and new hits. "
 "Each video is a music visualizer with on-screen SING-ALONG / KARAOKE lyrics. Search intent: LISTEN + FEEL + DEDICATE + "
 "sing along + heartbreak/desamor. Country target: United States, language: Spanish. NOT for kids.")

SYS = ("You are the world's leading YouTube SEO strategist (2026 best practices) for Latin music channels. "
 "Optimize for search, suggested videos, browse, watch time and topic authority via SEMANTIC SEO (entities, long-tail, "
 "synonyms). NOT keyword stuffing — natural, human, professional Spanish with NO AI-sounding phrasing. "
 "Write EVERYTHING 100% in Spanish (neutral latino). Return STRICT JSON only.")

USER = f"""{NICHE}

THIS VIDEO — canción: "{TITLE}"{(' · intérprete: ' + artist) if artist else ''}  (canal: Vallenatos para Curar el Alma, @vallenatoinc)

Letra (contexto; las primeras líneas sirven para el bloque de canta-conmigo, NO la vuelques entera):
{LYR[:900]}

Genera TODA la metadata desde cero (nunca reutilices otros canales). Devuelve un objeto JSON con estas llaves, todo en español:

"title": <=100 caracteres, PREMIUM (sensación de video oficial de alta calidad, elegante, no genérico). Estructura "{TITLE}{(' - ' + artist) if artist else ''} | Vallenato Romántico (Video Oficial con Letra)" o variante elegante; incluye 1 emoji sobrio opcional (🎶/🪗/❤️). Clicable pero NO clickbait.
"description": SOLO PROSA SEO en español neutro, 2500-3500 caracteres, natural y humana, sin relleno ni repetición. La letra completa, los capítulos y los hashtags se AÑADEN AUTOMÁTICAMENTE después — NO los incluyas. Estructura:
  INTRO emotiva (2-3 párrafos: qué sentirá quien la escucha, la atmósfera, por qué este vallenato toca el alma);
  CUERPO LARGO Y DETALLADO: de qué trata la canción y su historia emocional (desamor/recuerdo); el intérprete y el estilo; qué hace especial al vallenato romántico (acordeón, caja, guacharaca); cuándo escucharla (para dedicar, para extrañar, de noche); que es video con LETRA/KARAOKE para cantar; sección de preguntas frecuentes natural (¿de qué trata?, ¿quién la canta?, ¿dónde escuchar más?); por qué existe el canal y qué esperar (autoridad temática);
  CIERRE: llamado fuerte — suscribirse + campana 🔔, dedicar en comentarios, escuchar más vallenatos del canal.
  NO incluyas la letra completa, NI los capítulos/timestamps, NI hashtags (se agregan aparte).
"hashtags": arreglo de 5-8 hashtags TODOS EN MINÚSCULA (con #, ej "#vallenato","#vallenatoromantico").
"tags": arreglo de 30-45 etiquetas de búsqueda que, unidas por comas, sumen entre 440 y 490 caracteres (llena el campo; long-tail, tipo-pregunta, entidades: vallenato romantico, para el desamor, para dedicar, con letra, {TITLE.lower()}, etc.). Sin duplicados.
"primaryKeywords": arreglo (3-6).
"secondaryKeywords": arreglo (5-10).
"topicCluster": string corto.
"searchIntent": string corto.
"category": "Music".
"seoScore": entero 1-100.
"rationale": 2-3 frases de por qué está optimizada.
Devuelve solo el objeto JSON."""

body = {"model": "gpt-4o", "temperature": 0.6, "max_tokens": 6000, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": USER}]}
req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
    headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
r = json.load(urllib.request.urlopen(req, timeout=180))
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import usage
    us = r.get("usage", {}); usage.record_tokens("vallenato", "metadata", "gpt-4o", us.get("prompt_tokens", 0), us.get("completion_tokens", 0), note=slug)
except Exception: pass
meta = json.loads(r["choices"][0]["message"]["content"])
def eff(t): return len(t) + (2 if ' ' in t else 0)
tags = []; n = 0
for t in meta.get("tags", []):
    t = str(t).strip()
    if not t or n + eff(t) + 1 > 480: continue
    tags.append(t); n += eff(t) + 1
# Ensamble final: prosa SEO + capítulos (timestamps) + letra completa + hashtags (minúscula).
# Así el algoritmo de YouTube sabe TODO el contenido (letra, secciones) → más recomendaciones.
hashtags = []
for h in meta.get("hashtags", []):
    h = str(h).strip()
    if not h: continue
    if not h.startswith("#"): h = "#" + h
    hashtags.append(h.lower().replace(" ", ""))
parts = [meta.get("description", "").rstrip()]
if CHAPTERS: parts.append("⏱️ CAPÍTULOS\n" + CHAPTERS)
if LYR: parts.append("📝 LETRA — canta con nosotros:\n" + LYR.strip())
if hashtags: parts.append(" ".join(hashtags))
final_desc = "\n\n".join(p for p in parts if p)[:4950]
meta["description"] = final_desc; meta["chapters"] = CHAPTERS; meta["hashtags"] = hashtags
meta["tags"] = tags; meta["lang"] = "es"; meta["artist"] = artist
json.dump(meta, open(os.path.join(D, "meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(os.path.join(D, "es_title.txt"), "w", encoding="utf-8").write(meta["title"])
open(os.path.join(D, "es_desc.txt"), "w", encoding="utf-8").write(meta["description"])
open(os.path.join(D, "es_tags.txt"), "w", encoding="utf-8").write(",".join(tags))
print("TITLE:", meta["title"], "(", len(meta["title"]), "chars )")
print("desc:", len(meta["description"]), "chars · tags:", len(tags), "(", n, "chars ) · SEO:", meta.get("seoScore"))
