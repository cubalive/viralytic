"""seo_dormir.py — metadata SEO 2026 para el canal "Dormir Bebés" (sleep music, pantalla negra).
Genera <lang>_title/desc/tags.txt en el dir del video con gpt-4o (crédito OpenAI).
Uso: python py/seo_dormir.py <video_dir> <horas> [langs=es,en]
"""
import os, sys, json, urllib.request

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for line in open(os.path.join(ADMIN, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
KEY = os.environ["OPENAI_API_KEY"]; MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

vdir = sys.argv[1]; hours = sys.argv[2] if len(sys.argv) > 2 else "8"
langs = (sys.argv[3].split(",") if len(sys.argv) > 3 else ["es", "en"])

LANGNAME = {"es": "español", "en": "English"}
def chat(system, user):
    body = json.dumps({"model": MODEL, "temperature": 0.8,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"}}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=90))
    return json.loads(r["choices"][0]["message"]["content"])

for lang in langs:
    sys_p = (f"Eres experto en SEO de YouTube 2026 para el nicho SLEEP MUSIC / música para dormir bebés "
        f"(pantalla negra, {hours} horas, nanas relajantes). Responde TODO en {LANGNAME.get(lang, lang)}. "
        "Devuelve JSON con: title (≤95 chars, formato 'Keyword | Gancho | Marca', incluye las horas y 'Pantalla Negra'/'Black Screen', 1-2 emojis suaves 🌙😴), "
        "description (larga, 1500-2500 chars: beneficios para el sueño del bebé, qué incluye, cuándo usarla, "
        "instrucciones de pantalla negra para ahorrar batería/TV, llamado a suscribirse, 5-8 hashtags en minúscula al final), "
        "tags (array de 25-35 palabras clave del nicho, mezcla long-tail y cortas).")
    usr = (f"Video: música de cuna para dormir bebés, UNA pista en loop, {hours} horas, PANTALLA TOTALMENTE NEGRA "
        "(el televisor se ve apagado, ideal para la noche, ahorra energía). Marca del canal: 'Dormir Bebés'. "
        "Hazlo irresistible para padres que buscan dormir a su bebé y para que el algoritmo lo posicione.")
    try:
        d = chat(sys_p, usr)
        title = (d.get("title") or "").strip()[:100]
        desc = (d.get("description") or "").strip()
        tags = d.get("tags") or []
        if isinstance(tags, str): tags = [t.strip() for t in tags.split(",") if t.strip()]
        # limitar tags a ~480 chars efectivos
        out, ln = [], 0
        for t in tags:
            t = str(t).strip()
            add = len(t) + (2 if " " in t else 0) + 1
            if ln + add > 480: break
            out.append(t); ln += add
        open(os.path.join(vdir, f"{lang}_title.txt"), "w", encoding="utf-8").write(title)
        open(os.path.join(vdir, f"{lang}_desc.txt"), "w", encoding="utf-8").write(desc)
        open(os.path.join(vdir, f"{lang}_tags.txt"), "w", encoding="utf-8").write(",".join(out))
        print(f"  ✅ {lang}: {title[:60]} | desc {len(desc)}c | {len(out)} tags")
    except Exception as e:
        print(f"  ❌ {lang}: {str(e)[:120]}")
