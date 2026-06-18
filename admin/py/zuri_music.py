"""zuri_music.py — Editor de musica DESDE EL BANCO (reusa el banco fijo, ~$0 Veo/cancion).
UN CLIC por idioma: el usuario pone song.json (pista + voz-sin-musica + letra) y esto produce:
  data/output/<song-id>/master_16x9.mp4  + chapters.txt
Karaoke: latino (es/en/pt/it) = forced-align MMS_FA; no-latino (zh/hi/pa) = Whisper word-times.
Letra OFICIAL siempre. Titulo grande + capitulos. Fuente por idioma (latina/CJK/indica).
Uso:  python py/zuri_music.py <song-id>
"""
import sys, os, re, json, subprocess, unicodedata, wave, uuid, urllib.request, shutil
import numpy as np
ADMIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONG_ID = sys.argv[1]
SDIR = os.path.join(ADMIN, "data", "songs", SONG_ID)
song = json.load(open(os.path.join(SDIR, "song.json"), encoding="utf-8"))
LANG = song.get("lang", "es"); TITLE = song.get("title", "")
char = (song.get("characters") or ["zuri"])[0]
BANKDIR = os.path.join(ADMIN, "data", "bank", char)
bank = json.load(open(os.path.join(BANKDIR, "bank.json"), encoding="utf-8"))
OUT = os.path.join(ADMIN, "data", "output", "zuri", LANG, SONG_ID); os.makedirs(OUT, exist_ok=True)
WORK = os.path.join(OUT, "_work"); os.makedirs(WORK, exist_ok=True)
def bankfile(rel): return os.path.join(BANKDIR, rel)
def run(a, **k): return subprocess.run(a, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **k)
def dur(f):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except: return 0.0

LATIN = LANG in ("es","en","pt","it")
FONT = {"zh":"Microsoft YaHei","hi":"Nirmala UI","pa":"Nirmala UI"}.get(LANG, "Arial Black")
# copia pista y voz a rutas ASCII (ffmpeg falla con rutas no-ASCII como chino)
_ss = song["audioPath"]; _st = song.get("vocalStemPath") or _ss
SONG = os.path.join(WORK, "song" + os.path.splitext(_ss)[1]); shutil.copy(_ss, SONG)
if os.path.exists(_st):
    STEM = os.path.join(WORK, "stem" + os.path.splitext(_st)[1]); shutil.copy(_st, STEM)
else:
    STEM = SONG
SONG_D = dur(SONG)
lines_txt = [l.strip() for l in song["lyrics"].splitlines() if l.strip()]

def head(font):
    return ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: K,{font},84,&H0000F0FF,&H00FFFFFF,&H00202020,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,120,120,96,1\n"
        f"Style: Title,{font},140,&H00FFFFFF,&H00FFFFFF,&H007E2DFF,&H80000000,-1,0,0,0,100,100,1,0,1,7,4,5,60,60,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
def tc(s):
    s=max(0,s); h=int(s//3600); m=int((s%3600)//60); return f"{h}:{m:02d}:{s%60:05.2f}"
ass = os.path.join(OUT, f"karaoke_{LANG}.ass")
line_starts = {}

# ----------- KARAOKE LATINO: forced-align MMS_FA -----------
if LATIN:
    import torch, torchaudio
    def norm(w):
        w=unicodedata.normalize("NFKD",w.lower()); w="".join(c for c in w if not unicodedata.combining(c)); return re.sub(r"[^a-z]","",w)
    v16=os.path.join(WORK,"vocal16k.wav"); run(["ffmpeg","-y","-i",STEM,"-ac","1","-ar","16000",v16])
    bundle=torchaudio.pipelines.MMS_FA; model=bundle.get_model(with_star=False); model.eval(); DICT=bundle.get_dict(star=None)
    toks=[]
    for li,line in enumerate(lines_txt):
        for w in line.split():
            n=norm(w); ok=bool(n) and all(c in DICT for c in n); toks.append({"orig":w,"norm":n,"line":li,"ok":ok})
    al=[t for t in toks if t["ok"]]; seq=[t["norm"] for t in al]
    wf=wave.open(v16,"rb"); sr,nch,sw,nfr=wf.getframerate(),wf.getnchannels(),wf.getsampwidth(),wf.getnframes(); raw=wf.readframes(nfr); wf.close()
    dt={1:np.int8,2:np.int16,4:np.int32}[sw]; data=np.frombuffer(raw,dtype=dt).astype(np.float32)/float(np.iinfo(dt).max)
    if nch>1: data=data.reshape(-1,nch).mean(axis=1)
    wav=torch.from_numpy(data).unsqueeze(0)
    if sr!=bundle.sample_rate: wav=torchaudio.functional.resample(wav,sr,bundle.sample_rate); sr=bundle.sample_rate
    with torch.inference_mode(): emission,_=model(wav)
    tokens=[DICT[c] for w in seq for c in w]; cc=[len(w) for w in seq]
    aligned,scores=torchaudio.functional.forced_align(emission,torch.tensor([tokens],dtype=torch.int32),blank=0)
    spans=torchaudio.functional.merge_tokens(aligned[0],scores[0].exp()); spf=wav.shape[1]/emission.shape[1]/sr; idx=0
    for t,c in zip(al,cc):
        grp=spans[idx:idx+c]; idx+=c
        if grp: t["start"]=grp[0].start*spf; t["end"]=grp[-1].end*spf
    ao=[t for t in toks if "start" in t]
    for t in toks:
        if "start" in t: continue
        pl=[a for a in ao if a["line"]==t["line"]]
        if pl: t["start"]=pl[0]["start"]; t["end"]=pl[0]["end"]
    by_line={}
    for t in toks:
        if "start" in t: by_line.setdefault(t["line"],[]).append(t)
    ev=[]
    for li in sorted(by_line):
        ws=sorted(by_line[li],key=lambda x:x["start"]); st=ws[0]["start"]; en=max(w["end"] for w in ws); parts=[]
        for i,w in enumerate(ws):
            nxt=ws[i+1]["start"] if i+1<len(ws) else w["end"]; k=max(1,int(round((max(w["end"],nxt)-w["start"])*100)))
            parts.append("{\\kf%d}%s "%(k,w["orig"].replace("{","").replace("}","")))
        ev.append("Dialogue: 0,%s,%s,K,,0,0,0,,{\\fad(120,120)}%s"%(tc(st),tc(en),"".join(parts).strip()))
        line_starts[li]=st
# ----------- KARAOKE NO-LATINO: Whisper word/segment timestamps -----------
else:
    KEY=open("C:/Users/alain/.secrets/openai2-key.txt").read().strip()
    mp3=os.path.join(WORK,"vocal.mp3"); run(["ffmpeg","-y","-i",STEM,"-ac","1","-ar","16000","-b:a","96k",mp3])
    b=str(uuid.uuid4().hex); bnd="----z"+b
    def part(n,v): return (f'--{bnd}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n').encode()
    body=part("model","whisper-1")+part("language",LANG)+part("response_format","verbose_json")+part("timestamp_granularities[]","segment")
    body+=(f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="v.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode()+open(mp3,"rb").read()+f"\r\n--{bnd}--\r\n".encode()
    req=urllib.request.Request("https://api.openai.com/v1/audio/transcriptions",data=body,headers={"Authorization":f"Bearer {KEY}","Content-Type":f"multipart/form-data; boundary={bnd}"})
    r=json.load(urllib.request.urlopen(req,timeout=240))
    segs=[s for s in r.get("segments",[]) if s.get("text","").strip()]
    json.dump(r,open(os.path.join(WORK,"whisper.json"),"w",encoding="utf-8"),ensure_ascii=False)
    nL=len(lines_txt); nS=len(segs) or 1
    # mapea cada linea oficial a un segmento por indice proporcional (sigue el ritmo real)
    for i in range(nL):
        si=min(nS-1, round(i*nS/nL)); line_starts[i]=float(segs[si]["start"])
    ev=[]
    for li,line in enumerate(lines_txt):
        st=line_starts[li]; en=line_starts[li+1] if li+1<nL else float(segs[-1]["end"])
        en=max(en, st+0.6); chars=[c for c in line if not c.isspace()]
        per=max(1,int(round((en-st)*100/max(1,len(chars)))))
        parts=[]
        for ch in line:
            if ch.isspace(): parts.append(ch)
            else: parts.append("{\\kf%d}%s"%(per,ch.replace("{","").replace("}","")))
        ev.append("Dialogue: 0,%s,%s,K,,0,0,0,,{\\fad(120,120)}%s"%(tc(st),tc(en),"".join(parts)))

ev.insert(0,"Dialogue: 1,0:00:01.50,0:00:10.50,Title,,0,0,0,,{\\fad(400,500)\\t(0,500,\\fscx115\\fscy115)\\t(500,900,\\fscx100\\fscy100)}%s"%TITLE)
open(ass,"w",encoding="utf-8").write(head(FONT)+"\n".join(ev)+"\n")
print("KARAOKE("+("forced" if LATIN else "whisper")+"): voz entra", round(min(line_starts.values()),2),"s ·", len(lines_txt),"lineas · fuente",FONT)

# ======================= 2) ENSAMBLADO desde el banco =======================
DEFAULT_ORDER=["cam_a","cam_b","lift_a","lift_b","cine_in","esc_a","esc_b","ronda_a","ronda_b","ronda_c","abrazo","selfie"]
order=song.get("sceneOrder") or DEFAULT_ORDER
by_id={s["id"]:s for s in bank["scenes"]}
scene_files=[bankfile(by_id[i]["file"]) for i in order if i in by_id and os.path.exists(bankfile(by_id[i]["file"]))]
bm=bank["bumpers"]; intro_b=bankfile(bm["intro"]); outro_b=bankfile(bm["outro"]); aer_in=bankfile(bm["aerial_in"]); aer_out=bankfile(bm["aerial_out"])
VF="scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,format=yuv420p"
aer_each=max(4.0,(SONG_D-8.0*len(scene_files))/2)
norm_clips=[]; allbody=[aer_in]+scene_files+[aer_out]
for i,c in enumerate(allbody):
    o=os.path.join(WORK,f"n{i:02d}.mp4"); cmd=["ffmpeg","-y","-i",c,"-an","-vf",VF,"-c:v","libx264","-crf","18","-preset","medium","-r","30"]
    cmd+=["-t",f"{aer_each:.3f}"] if c in (aer_in,aer_out) else ["-t","8.0"]
    cmd.append(o); run(cmd); norm_clips.append(o)
open(os.path.join(WORK,"body.txt"),"w").write("".join(f"file '{o}'\n" for o in norm_clips))
run(["ffmpeg","-y","-f","concat","-safe","0","-i",os.path.join(WORK,"body.txt"),"-c","copy",os.path.join(WORK,"body_cat.mp4")])
BD=dur(os.path.join(WORK,"body_cat.mp4")); ratio=SONG_D/max(0.1,BD)
run(["ffmpeg","-y","-i",os.path.join(WORK,"body_cat.mp4"),"-vf",f"setpts={ratio:.5f}*PTS","-an","-r","30","-c:v","libx264","-crf","18","-preset","medium",os.path.join(WORK,"body_fit.mp4")])
run(["ffmpeg","-y","-i",os.path.join(WORK,"body_fit.mp4"),"-vf",f"subtitles=karaoke_{LANG}.ass","-c:v","libx264","-crf","18","-preset","medium",os.path.join(WORK,"body_sub.mp4")],cwd=OUT)
run(["ffmpeg","-y","-i",os.path.join(WORK,"body_sub.mp4"),"-i",SONG,"-t",f"{SONG_D}","-c:v","copy","-c:a","aac","-b:a","192k","-ar","48000","-ac","2","-map","0:v","-map","1:a","-shortest",os.path.join(WORK,"body_final.mp4")])
INTRO_A="E:/0005. Passkal/Canales de Youtube/@Zury/Imagenes_video_general/suno_intro.wav"
OUTRO_A="E:/0005. Passkal/Canales de Youtube/@Zury/Imagenes_video_general/suno_outro.wav"
def bumper(vid,aud,out):
    if not os.path.exists(vid): return None
    d=dur(vid); a=aud if os.path.exists(aud) else None; cmd=["ffmpeg","-y","-i",vid]
    if a: cmd+=["-i",a]
    cmd+=["-vf",VF,"-c:v","libx264","-crf","18","-preset","medium","-r","30","-t",f"{d}"]
    if a: cmd+=["-af","apad","-c:a","aac","-b:a","192k","-ar","48000","-ac","2","-map","0:v","-map","1:a"]
    cmd.append(out); run(cmd); return out
ib=bumper(intro_b,INTRO_A,os.path.join(WORK,"intro.mp4")); ob=bumper(outro_b,OUTRO_A,os.path.join(WORK,"outro.mp4"))
segs2=[s for s in [ib,os.path.join(WORK,"body_final.mp4"),ob] if s and os.path.exists(s)]
open(os.path.join(WORK,"final.txt"),"w").write("".join(f"file '{s}'\n" for s in segs2))
MASTER=os.path.join(OUT,"master_16x9.mp4")
run(["ffmpeg","-y","-f","concat","-safe","0","-i",os.path.join(WORK,"final.txt"),"-c:v","libx264","-crf","18","-preset","medium","-c:a","aac","-b:a","192k",MASTER])
intro_off=dur(ib) if ib else 0.0
# ======================= 3) CAPITULOS =======================
SECKEYS=[(0,"chorus"),(2,"verse1"),(4,"chorus"),(8,"verse2"),(16,"chorus"),(20,"bridge"),(22,"finale")]
LAB={
 "es":{"intro":"Intro","chorus":"Coro","verse1":"Verso 1","verse2":"Verso 2","bridge":"Puente","finale":"Gran final"},
 "en":{"intro":"Intro","chorus":"Chorus","verse1":"Verse 1","verse2":"Verse 2","bridge":"Bridge","finale":"Grand Finale"},
 "pt":{"intro":"Intro","chorus":"Refrão","verse1":"Verso 1","verse2":"Verso 2","bridge":"Ponte","finale":"Grande final"},
 "it":{"intro":"Intro","chorus":"Ritornello","verse1":"Strofa 1","verse2":"Strofa 2","bridge":"Bridge","finale":"Gran finale"},
 "zh":{"intro":"开场","chorus":"副歌","verse1":"主歌 1","verse2":"主歌 2","bridge":"过渡段","finale":"大结局"},
 "hi":{"intro":"इंट्रो","chorus":"कोरस","verse1":"अंतरा 1","verse2":"अंतरा 2","bridge":"ब्रिज","finale":"भव्य समापन"},
 "pa":{"intro":"ਇੰਟ੍ਰੋ","chorus":"ਕੋਰਸ","verse1":"ਅੰਤਰਾ 1","verse2":"ਅੰਤਰਾ 2","bridge":"ਬ੍ਰਿਜ","finale":"ਸ਼ਾਨਦਾਰ ਅੰਤ"},
}.get(LANG, None) or {"intro":"Intro","chorus":"Coro","verse1":"Verso 1","verse2":"Verso 2","bridge":"Puente","finale":"Gran final"}
def fmt(v): m=int(v//60); s=int(round(v%60)); return f"{m}:{s:02d}"
chs=[(0.0,LAB["intro"])]
for li,key in SECKEYS:
    if li in line_starts: chs.append((intro_off+line_starts[li],LAB[key]))
clean=[chs[0]]
for v,l in chs[1:]:
    if v-clean[-1][0]>=10: clean.append((v,l))
chap="\n".join(f"{fmt(v)} {l}" for v,l in clean)
open(os.path.join(OUT,"chapters.txt"),"w",encoding="utf-8").write(chap+"\n")
print("CAPITULOS:\n"+chap)
print("MASTER ->",MASTER,f"{dur(MASTER):.1f}s")
