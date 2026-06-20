"""gen_vallenato_loops.py — banco de loops de vallenato SIN Veo: imágenes (gpt-image) + efectos ffmpeg.
Cada imagen -> loop 8s SEAMLESS (Ken Burns palíndromo + pulso de luz + grano + viñeta).
También genera templates de título (J.J). Resultado reutilizable para las 12 canciones. Cero Veo.
Uso: python py/gen_vallenato_loops.py
"""
import os, json, base64, subprocess, urllib.request

ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for line in open(os.path.join(ADMIN, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
KEY = os.environ["OPENAI_API_KEY"]
IMG_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
FF = os.environ.get("FFMPEG_PATH", "ffmpeg")
LOOPS = os.path.join(ADMIN, "data", "bank", "vallenato-loops")
TITLES = os.path.join(ADMIN, "data", "bank", "vallenato-titles")
os.makedirs(LOOPS, exist_ok=True); os.makedirs(TITLES, exist_ok=True)

STYLE = "cinematic vallenato music visualizer background, ultra realistic, premium, dark elegant tones, warm golden and deep blue light, film look, 16:9, highly detailed, no text, no watermark, no people faces"
loops = {
    "01_lluvia_calle": "rainy night street with glowing streetlights and wet asphalt reflections, lonely melancholic, " + STYLE,
    "02_bokeh_ciudad": "warm bokeh city lights at night, soft out-of-focus golden lights, intimate bar atmosphere, " + STYLE,
    "03_silueta_carretera": "silhouette of a man walking forward on an empty road toward a warm sunset, seen from behind, " + STYLE,
    "04_amanecer_campo": "golden sunrise over an open field with soft mist, hope and new beginning, " + STYLE,
    "05_mar_calma": "calm sea at sunrise with gentle waves and warm golden horizon, peace, " + STYLE,
    "06_ventana_lluvia": "rain sliding down a dark window at night with soft warm light behind, intimate, " + STYLE,
    "07_cuarto_vacio": "an empty dim room with a single wooden chair by a window, cold blue morning light, lonely, " + STYLE,
    "08_bar_botella": "a glass and a bottle of liquor on a dark bar counter with warm dim light, lonely drinking, despecho, " + STYLE,
    "09_pareja_lejos": "two distant blurred silhouettes of a couple walking together far away on a night street, seen from afar, jealousy, " + STYLE,
    "10_lujo_vacio": "an elegant empty luxury living room at night with money on a glass table, success but lonely, cold light, " + STYLE,
    "11_cama_vacia": "an empty unmade bed in a dark bedroom at night with soft moonlight, insomnia, longing, " + STYLE,
    "12_telefono_noche": "a smartphone glowing in the dark on a table showing a chat, late night, anxiety, " + STYLE,
    "13_deseo_noche": "a dim intimate bedroom in red and amber low light, tension and forbidden desire, cinematic, " + STYLE,
    "14_foto_mesa": "a framed photo standing on a table next to a candle, warm nostalgic light, attachment, " + STYLE,
}
titles = {
    "title_a": "cinematic vallenato album cover background, dark moody, rain and warm streetlight glow, lots of empty negative space at the top for a title, premium, " + STYLE,
    "title_b": "cinematic vallenato album cover background, dramatic sunset over a lonely road, empty space for a title, premium, " + STYLE,
}


def gen_image(prompt, out):
    if os.path.exists(out) and os.path.getsize(out) > 10000:
        return True
    body = json.dumps({"model": IMG_MODEL, "prompt": prompt, "size": "1536x1024", "n": 1}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=180))
    b64 = r["data"][0].get("b64_json")
    open(out, "wb").write(base64.b64decode(b64))
    return True


def make_loop(img, out):
    """Imagen -> loop 8s seamless: 4s Ken Burns + efectos, luego palíndromo (+reverso)."""
    half = out + ".half.mp4"
    vf = ("scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296,"
          "zoompan=z='min(1.0+0.006*on,1.12)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,"
          "eq=brightness='0.02*sin(2*PI*t/4)':saturation=1.05,"
          "noise=alls=7:allf=t,vignette=PI/5")
    subprocess.run([FF, "-y", "-loop", "1", "-i", img, "-t", "4", "-vf", vf, "-r", "30",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", half], check=True, capture_output=True)
    rev = out + ".rev.mp4"
    subprocess.run([FF, "-y", "-i", half, "-vf", "reverse", "-an", rev], check=True, capture_output=True)
    lst = out + ".txt"
    open(lst, "w").write(f"file '{os.path.abspath(half)}'\nfile '{os.path.abspath(rev)}'\n".replace("\\", "/"))
    subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out], check=True, capture_output=True)
    for f in (half, rev, lst):
        try: os.remove(f)
        except: pass


print("=== generando loops de vallenato (imagen + efectos, cero Veo) ===")
for name, prompt in loops.items():
    img = os.path.join(LOOPS, name + ".png"); loop = os.path.join(LOOPS, name + ".mp4")
    try:
        gen_image(prompt, img)
        if not (os.path.exists(loop) and os.path.getsize(loop) > 50000):
            make_loop(img, loop)
        print(f"  ✅ {name}.mp4")
    except Exception as e:
        print(f"  ❌ {name}: {str(e)[:120]}")

print("=== templates de título (J.J) ===")
for name, prompt in titles.items():
    img = os.path.join(TITLES, name + ".png")
    try:
        gen_image(prompt, img); print(f"  ✅ {name}.png")
    except Exception as e:
        print(f"  ❌ {name}: {str(e)[:120]}")
print("DONE — banco en data/bank/vallenato-loops/ y vallenato-titles/")
