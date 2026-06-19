"""claseo_sample.py — MUESTRA de contenido para ClaseoShow (canal de empoderamiento femenino, 9:16, ES).
Genera con gpt-4o: 5 ideas de video + 1 guion completo en tono 'amiga', estilo mix (mensaje + mini-historia),
con guardrail etico. Solo para VALIDAR la voz editorial antes de producir. No gasta Veo/voz/imagenes.
"""
import sys, os, json, urllib.request
KEY = open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()

SYS = (
"Eres la directora de contenido de 'ClaseoShow', un canal de YouTube en ESPANOL de videos verticales 9:16 (30-45s) "
"para MUJERES que atraviesan situaciones duras: embarazo en soledad, abandono de pareja, madres solteras, baja "
"autoestima, dependencia economica o emocional, relaciones toxicas. La mision: un refugio que nombra el problema y "
"SIEMPRE entrega una salida y empoderamiento ('si se puede, vas a renacer'). "
"TONO: cercano, de amiga que te habla de tu (2da persona), calido pero firme, espanol neutro latino, real y humano. "
"NUNCA lastima, NUNCA miedo, NUNCA promesas falsas, NUNCA culpar a la mujer. "
"ESTRUCTURA MIX por video: (1) GANCHO 3s que nombra el dolor exacto; (2) mini-situacion real + validacion ('te entiendo, "
"no estas sola, no fue tu culpa'); (3) una VERDAD que libera + UN paso concreto y accionable; (4) cierre de "
"EMPODERAMIENTO breve. 90-120 palabras habladas. "
"ETICA: esto es APOYO, no reemplaza ayuda profesional (psicologica/medica/legal); si el tema es grave, invita con "
"delicadeza a buscar ayuda/recursos. Respeto total, sin explotar el dolor. "
"Devuelve SOLO JSON."
)
USER = (
"Genera para ClaseoShow, todo en espanol:\n"
'"ideas": arreglo de 5 ideas de video (cada una: {"pilar","titulo","gancho"}) que cubran distintos pilares '
"(embarazo en soledad, abandono, madre soltera, autoestima, relaciones toxicas, independencia economica).\n"
'"guion": UN guion completo del primer tema, con {"titulo","gancho","cuerpo","cierre","voz_completa","hashtags"}: '
'"voz_completa" = el texto exacto que leera la voz (90-120 palabras, tono amiga, estructura mix), '
'"hashtags" = 4-6 en minuscula.\n'
"Devuelve solo el objeto JSON."
)
body = {"model": "gpt-4o", "temperature": 0.7, "max_tokens": 2000, "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": USER}]}
r = json.load(urllib.request.urlopen(urllib.request.Request("https://api.openai.com/v1/chat/completions",
    data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}), timeout=120))
m = json.loads(r["choices"][0]["message"]["content"])
print("==== 5 IDEAS ====")
for i, idea in enumerate(m.get("ideas", []), 1):
    print(f"{i}. [{idea.get('pilar')}] {idea.get('titulo')}\n   gancho: {idea.get('gancho')}")
g = m.get("guion", {})
print("\n==== GUION COMPLETO (tema 1) ====")
print("TITULO:", g.get("titulo"))
print("\nVOZ (lo que lee ElevenLabs):\n", g.get("voz_completa"))
print("\nHASHTAGS:", " ".join(g.get("hashtags", [])))
os.makedirs(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "claseo"), exist_ok=True)
json.dump(m, open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "claseo", "sample.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
