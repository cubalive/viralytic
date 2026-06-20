"""pick_loops.py — elige los loops del banco que PEGAN con una canción, según su LETRA (gpt-4o).
Lee lyrics.txt de la canción + el catálogo de loops, y devuelve los loops ordenados + template de
título + etapa emocional. Escribe <song_dir>/loops.json para que el visualizer los use. Cero Veo.
Uso: python py/pick_loops.py <song_dir>
"""
import os, sys, json, urllib.request

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for line in open(os.path.join(ADMIN, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
KEY = os.environ["OPENAI_API_KEY"]; MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

song_dir = sys.argv[1]
lyr = ""
for n in ("lyrics.txt", "letra.txt"):
    p = os.path.join(song_dir, n)
    if os.path.exists(p): lyr = open(p, encoding="utf-8").read().strip(); break
title = ""
for n in ("title.txt",):
    p = os.path.join(song_dir, n)
    if os.path.exists(p): title = open(p, encoding="utf-8").read().strip()

CATALOG = {
    "01_lluvia_calle": "calle nocturna bajo lluvia, farolas, reflejos en el asfalto — dolor, soledad, desamor",
    "02_bokeh_ciudad": "luces cálidas bokeh de ciudad de noche, ambiente de bar — noche, nuevo intento, salir",
    "03_silueta_carretera": "silueta caminando hacia un atardecer, de espaldas — avanzar, reconstruirse, decisión",
    "04_amanecer_campo": "amanecer dorado sobre campo abierto — esperanza, renacer, superación",
    "05_mar_calma": "mar en calma al amanecer, paz — cierre, paz, perdón, superación total",
    "06_ventana_lluvia": "lluvia en la ventana de noche, íntimo — recuerdo, nostalgia, lo que duele",
    "07_cuarto_vacio": "cuarto vacío con una silla, luz fría — abandono, ausencia, la casa que recuerda",
    "08_bar_botella": "trago y botella en un bar oscuro — despecho, vicio, beber para olvidar, alcohol",
    "09_pareja_lejos": "dos siluetas de pareja a lo lejos en la noche — celos, la vi con otro, comparación, humillación",
    "10_lujo_vacio": "sala de lujo vacía con dinero en la mesa — éxito vacío, dinero y soledad",
    "11_cama_vacia": "cama vacía de noche con luz de luna — insomnio, la cama no te olvida, soledad nocturna",
    "12_telefono_noche": "teléfono brillando en la oscuridad con un chat — ansiedad digital, el chat, la llamada que no llegó",
    "13_deseo_noche": "habitación íntima en penumbra roja/ámbar — deseo, mujer prohibida, tentación, conflicto",
    "14_foto_mesa": "foto enmarcada sobre la mesa junto a una vela — apego visual, recuerdo, tu foto en la mesa",
}
cat_txt = "\n".join(f"- {k}: {v}" for k, v in CATALOG.items())

SYS = ("Eres director visual de un canal de vallenato. Según la LETRA de la canción, eliges del banco los "
       "loops de fondo que mejor pegan con su emoción y sus imágenes, y la etapa emocional. Devuelve SOLO JSON.")
USER = (f"CANCIÓN: \"{title}\".\nLETRA:\n{lyr[:2500]}\n\nBANCO DE LOOPS (nombre: descripción/emoción):\n{cat_txt}\n\n"
        "Devuelve JSON: {\"etapa\": breve (ej. 'dolor/abandono' o 'superación'), \"mood\": 2-3 palabras, "
        "\"loops\": lista ORDENADA de 3-4 nombres del banco que mejor acompañan ESTA canción (del más afín al menos), "
        "\"title\": 'title_a' o 'title_b' (el fondo de título que mejor encaja), \"razon\": 1 frase corta.}")

body = {"model": MODEL, "temperature": 0.4, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": USER}]}
r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.openai.com/v1/chat/completions",
    data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}), timeout=90))
d = json.loads(r["choices"][0]["message"]["content"])
# validar nombres
valid = [n for n in (d.get("loops") or []) if n in CATALOG]
if not valid: valid = ["01_lluvia_calle", "06_ventana_lluvia", "03_silueta_carretera"]
d["loops"] = valid
if d.get("title") not in ("title_a", "title_b"): d["title"] = "title_a"
json.dump(d, open(os.path.join(song_dir, "loops.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"etapa: {d.get('etapa')} · mood: {d.get('mood')}")
print(f"loops: {', '.join(valid)}")
print(f"título: {d.get('title')} · razón: {d.get('razon')}")
