"""format_select.py — ESTRATEGA DE FORMATOS virales + sonido, con técnicas de retención.
Dado un tipo de contenido (kids|music|women|faceless) + un tema, selecciona de data/formats.json
los formatos que encajan, genera un brief beat-por-beat por formato y elige el SONIDO viral
del banco (retencion-tiktok, emotivo, etc.). Implementa los prompts maestros (edad/seguridad para
kids; sync al drop/loop para music; retención para todos).
Uso: python py/format_select.py <kids|music|women|faceless> "<tema/canción>" [artista] [mood] [bpm]
Salida JSON: {tema, seleccion:[{slug,por_que_encaja,brief}], descartados}
"""
import sys, os, json, urllib.request
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CT = (sys.argv[1] if len(sys.argv) > 1 else "women").lower()
TEMA = sys.argv[2] if len(sys.argv) > 2 else ""
ARTISTA = sys.argv[3] if len(sys.argv) > 3 else ""
MOOD = sys.argv[4] if len(sys.argv) > 4 else ""
BPM = sys.argv[5] if len(sys.argv) > 5 else ""
KEY = open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()
FMT = json.load(open(os.path.join(ADMIN, "data", "formats.json"), encoding="utf-8"))
MOODS = FMT.get("sound_moods", [])
cands = [f for f in FMT["formats"] if CT in f.get("fits", [])]
others = [f["slug"] for f in FMT["formats"] if CT not in f.get("fits", [])]

# Resumen compacto de formatos candidatos (slug + estructura + sonido sugerido para este tipo)
def fline(f):
    snd = (f.get("sonido", {}) or {}).get(CT) or (f.get("sonido", {}) or {}).get("default", "")
    beats = " | ".join(f'{b["t"]} {b["beat"]}: {b["accion"]}' for b in f.get("estructura", []))
    return f'- {f["slug"]} ({f["label"]}): {beats}  [sonido sugerido: {snd}; retención: {f.get("retencion","")}; loop: {f.get("loop_posible")}]'
CAND_TXT = "\n".join(fline(f) for f in cands)

RULES = {
 "kids": ("CANAL EDUCATIVO INFANTIL (6-11). Lenguaje simple y positivo, UNA idea por video, analogías del mundo del niño "
          "(juguetes, juegos, comida, animales), hook claro en 3s, nada que asuste ni sarcasmo ni estereotipos, texto que un niño lea rápido. Duración 15-30s."),
 "music": (f"CORTO MUSICAL para promover una canción. El fragmento más fuerte (drop/verso) debe caer en los primeros 3-5s; marca el segundo del drop. "
           f"Loop perfecto cuando el formato lo permita. Indica cortes al beat. Artista: {ARTISTA}. Mood: {MOOD}. BPM: {BPM}."),
 "women": ("CANAL DE EMPODERAMIENTO FEMENINO (adultas). Tono cercano de amiga, cálido y firme, español neutro. Estructura: nombra el dolor → "
           "validación (no estás sola, no fue tu culpa) → una verdad + un paso concreto → empoderamiento. Es APOYO, no reemplaza ayuda profesional. Duración 20-35s."),
 "faceless": ("CANAL FACELESS de retención. Hook pattern-interrupt en 0.5-3s, open loop, cortes al beat, payoff con dopamina, último frame que dispara rewatch/comentario. Duración 15-30s."),
}.get(CT, "Contenido vertical de retención.")

SYS = ("Eres estratega de formatos + experto en contenido vertical VIRAL con técnicas de RETENCIÓN (2026). "
       "Seleccionas SOLO los formatos que de verdad encajan en este tipo de contenido y generas un brief que SIGUE la estructura "
       "del formato, segundo a segundo, listo para producir (frase de voz, prompts de imagen, prompts de video Veo 8s cuando aplique). "
       "Hook en los primeros 3s SIEMPRE. Elige para cada formato el SONIDO (de la lista) que maximiza retención. Devuelve SOLO JSON.")

USER = f"""TIPO DE CONTENIDO: {CT}
REGLAS: {RULES}
TEMA{'/CANCIÓN' if CT=='music' else ''}: "{TEMA}"

FORMATOS CANDIDATOS (ya filtrados para este tipo):
{CAND_TXT}

SONIDOS DISPONIBLES (moods del banco, elige el que da más retención): {", ".join(MOODS)}

TAREA:
1) Decide "usar" o "descartar" cada formato candidato. USA TODOS los que de verdad sirvan para este tema (normalmente 3-5); descarta SOLO los que claramente no apliquen (motivo de 1 línea).
2) Para cada "usar", genera el brief COMPLETO siguiendo su estructura, adaptado al tema, con hook ≤3s, y elige el sonido del banco.

Devuelve SOLO este JSON:
{{
  "tema": "{TEMA}",
  "seleccion": [
    {{
      "slug": "<slug>",
      "por_que_encaja": "1 línea",
      "sonido_elegido": "<mood de la lista>",
      "brief": {{
        "hook_0_3s": "...",
        "guion_por_beat": [ {{"t":"0-3s","accion":"...","texto_en_pantalla":"...","sync":"beat/drop si aplica"}} ],
        "generadores": {{ "frase": ["..."], "imagen": ["prompt en inglés..."], "video8s": ["prompt en inglés (si aplica)"], "voz": "guion de locución completo" }},
        "analogia_o_loop": "analogía central (kids) o nota de loop/drop (music)"
      }}
    }}
  ],
  "descartados": [ {{"slug":"...","motivo":"..."}} ]
}}"""

body = {"model": "gpt-4o", "temperature": 0.6, "max_tokens": 4000, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": USER}]}
r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.openai.com/v1/chat/completions",
    data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}), timeout=180))
out = json.loads(r["choices"][0]["message"]["content"])
out.setdefault("descartados", [])
# añade los formatos de otros tipos como descartados por defecto (no encajan)
known = {d.get("slug") for d in out.get("descartados", [])} | {s.get("slug") for s in out.get("seleccion", [])}
for s in others:
    if s not in known:
        out["descartados"].append({"slug": s, "motivo": f"no encaja en contenido '{CT}'"})
outdir = os.path.join(ADMIN, "data", "briefs"); os.makedirs(outdir, exist_ok=True)
fn = os.path.join(outdir, f"{CT}_{''.join(c for c in TEMA.lower().replace(' ','-') if c.isalnum() or c=='-')[:40]}.json")
json.dump(out, open(fn, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"TIPO {CT} · tema: {TEMA}")
print(f"USAR: {', '.join(s['slug']+' ('+s.get('sonido_elegido','')+')' for s in out.get('seleccion',[]))}")
print(f"DESCARTAR: {', '.join(d['slug'] for d in out.get('descartados',[]))}")
print(f"-> {fn}")
