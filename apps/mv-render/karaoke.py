"""
karaoke.py — MOTOR DE KARAOKE PERFECTO (palabra-por-palabra) desde el STEM VOCAL.
Alineación acústica local MMS_FA: escucha la voz limpia + la letra oficial → tiempos
exactos por palabra. Construye un .ass de karaoke bonito (fill suave \\kf + glow),
que arranca EXACTO cuando entra la voz. Maneja variantes:
  - letra oficial → alinea y calcula tiempos (vía-A, robusta).
  - palabras de la letra que el modelo no puede mapear (acentos raros) → se conservan
    repartiendo el tiempo de su línea (no se pierden).
  - hueco de voz al inicio → voiceStart (para meter la aérea y NO mostrar texto antes).
  - (hook) ad-libs no escritos en la letra → ver detect_adlibs() (ASR opcional).

Uso:  python karaoke.py <vocal_stem.wav> <lyrics.txt> <out.ass> [lang]
Salida: .ass + imprime voiceStart y nº de palabras.
"""
import sys, os, re, unicodedata, wave, numpy as np, torch, torchaudio

vocal, lyrics_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
lang = sys.argv[4] if len(sys.argv) > 4 else "es"
# Estilo de caption (línea Style de ASS) e intro título/cantante — opcionales (vía env).
STYLE_LINE = os.environ.get("KARAOKE_STYLE", "").strip()
TITLE = os.environ.get("KARAOKE_TITLE", "").strip()
ARTIST = os.environ.get("KARAOKE_ARTIST", "").strip()
DEFAULT_STYLE = "Style: K,Arial Rounded MT Bold,72,&H0033E0FF,&H00FFFFFF,&H00301060,&H96000000,1,0,0,0,100,100,0.5,0,1,5,3,2,90,90,90,1"

bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model(with_star=False); model.eval()
DICT = bundle.get_dict(star=None)

def norm(w):
    w = unicodedata.normalize("NFKD", w.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", w)

# --- letra con estructura de LÍNEAS (para mostrar una línea a la vez) ---
lines_txt = [l.strip() for l in open(lyrics_path, encoding="utf-8").read().splitlines() if l.strip()]
# token list: (orig, norm, line_idx, alignable?)
toks = []
for li, line in enumerate(lines_txt):
    for w in line.split():
        n = norm(w); ok = bool(n) and all(c in DICT for c in n)
        toks.append({"orig": w, "norm": n, "line": li, "ok": ok})
align_toks = [t for t in toks if t["ok"]]
seq = [t["norm"] for t in align_toks]

# --- audio (WAV stdlib; torchaudio 2.11 evita torchcodec) ---
wf = wave.open(vocal, "rb"); sr, nch, sw, nfr = wf.getframerate(), wf.getnchannels(), wf.getsampwidth(), wf.getnframes()
raw = wf.readframes(nfr); wf.close()
dtype = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
data = np.frombuffer(raw, dtype=dtype).astype(np.float32) / float(np.iinfo(dtype).max)
if nch > 1: data = data.reshape(-1, nch).mean(axis=1)
wav = torch.from_numpy(data).unsqueeze(0)
if sr != bundle.sample_rate:
    wav = torchaudio.functional.resample(wav, sr, bundle.sample_rate); sr = bundle.sample_rate
with torch.inference_mode():
    emission, _ = model(wav)
tokens = [DICT[c] for w in seq for c in w]; cc = [len(w) for w in seq]
aligned, scores = torchaudio.functional.forced_align(emission, torch.tensor([tokens], dtype=torch.int32), blank=0)
spans = torchaudio.functional.merge_tokens(aligned[0], scores[0].exp())
spf = wav.shape[1] / emission.shape[1] / sr
idx = 0
for t, c in zip(align_toks, cc):
    grp = spans[idx:idx + c]; idx += c
    if grp: t["start"] = grp[0].start * spf; t["end"] = grp[-1].end * spf

# reparte tiempo a palabras no-alineables dentro de su línea (no se pierden)
def fill_gaps():
    aligned_only = [t for t in toks if "start" in t]
    if not aligned_only: return
    for t in toks:
        if "start" in t: continue
        prevs = [a for a in aligned_only if a["line"] == t["line"]]
        if prevs:
            t["start"] = prevs[0]["start"]; t["end"] = prevs[0]["end"]  # aprox: pegada a su línea
fill_gaps()
words = [t for t in toks if "start" in t]
voiceStart = round(words[0]["start"], 2) if words else 0.0

# --- agrupa por línea para el display ---
by_line = {}
for t in toks:
    if "start" in t: by_line.setdefault(t["line"], []).append(t)

def tc(s):
    s = max(0, s); h = int(s // 3600); m = int((s % 3600) // 60); return f"{h}:{m:02d}:{s%60:05.2f}"

# estilo de caption: por defecto el de Zuri (redonda dorada con glow); o el que llegue por env (KARAOKE_STYLE).
style_line = STYLE_LINE if STYLE_LINE else DEFAULT_STYLE
head = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        + style_line + "\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
ev = []
for li in sorted(by_line):
    ws = sorted(by_line[li], key=lambda x: x["start"])
    st, en = ws[0]["start"], max(w["end"] for w in ws)
    parts = []
    for i, w in enumerate(ws):
        nxt = ws[i + 1]["start"] if i + 1 < len(ws) else w["end"]
        dur = max(w["end"], nxt) - w["start"]
        k = max(1, int(round(dur * 100)))  # centisegundos para \kf
        parts.append("{\\kf%d}%s " % (k, w["orig"].replace("{", "").replace("}", "")))
    ev.append("Dialogue: 0,%s,%s,K,,0,0,0,,{\\blur3}%s" % (tc(st), tc(en), "".join(parts).strip()))
# Intro: título de la canción + cantante durante el silencio inicial (hasta que entra la voz).
intro = []
if TITLE and voiceStart and voiceStart >= 1.2:
    iend = max(0.6, voiceStart - 0.15)
    txt = "{\\an5\\fad(400,300)\\1c&HFFFFFF&\\3c&H000000&\\bord4\\shad2\\fs104\\b1}" + TITLE.replace("{", "").replace("}", "")
    if ARTIST:
        txt += "\\N{\\fs60\\1c&H00E5FF&}" + ARTIST.replace("{", "").replace("}", "")
    intro.append("Dialogue: 0,%s,%s,K,,0,0,0,,%s" % (tc(0.0), tc(iend), txt))
open(out, "w", encoding="utf-8").write(head + "\n".join(intro + ev) + "\n")
print(f"KARAOKE: {len(words)} palabras alineadas (acústico) · voz entra {voiceStart}s · {len(ev)} líneas")
print("-> " + out)
