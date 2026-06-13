/**
 * Premium karaoke captions (ASS) for the music-video pipeline.
 *
 * Pipeline: Azure Speech (word-level timestamps on the VOCAL STEM) -> forced
 * alignment of the APPROVED LYRICS onto those timings (the text ALWAYS comes
 * from the approved lyrics, NEVER from the transcription) -> buildAss() karaoke
 * .ass -> ffmpeg burns it.
 *
 * Anti-hallucination guard: Azure words that are not in the approved lyrics are
 * discarded; lyric words that Azure missed get interpolated timing. No caption
 * text is ever invented from the audio.
 *
 * Bilingual note: the rendered text is exactly the approved lyric lines, so a
 * Spanish bridge inside the English version (bilingual audio) shows its Spanish
 * lines verbatim — just include those lines in the `en` approved lyrics.
 */

export interface TimedWord { text: string; start: number; end: number } // seconds
export interface CaptionLine { words: TimedWord[]; start: number; end: number }

// ---------------------------------------------------------------------------
// Tokenizing / normalizing
// ---------------------------------------------------------------------------
const CJK = /[㐀-鿿豈-﫿぀-ヿ]/;
const isCjk = (s: string) => CJK.test(s);

/** Split a lyric line into caption tokens: per-character for CJK, per-word otherwise. */
export function tokenizeLine(line: string): string[] {
  if (isCjk(line)) return Array.from(line.replace(/\s+/g, '')).filter(Boolean);
  return line.trim().split(/\s+/).filter(Boolean);
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\p{M}]/gu, '').replace(/[^\p{L}\p{N}]/gu, '');

// ---------------------------------------------------------------------------
// Forced alignment: approved lyric lines + Azure words -> timed caption lines.
// Text is taken from the lyrics; timing is borrowed from the matching Azure
// word. Azure words with no lyric match are skipped (hallucination guard).
// ---------------------------------------------------------------------------
export function alignLyrics(lyricLines: string[], azureWords: TimedWord[], totalDuration: number): CaptionLine[] {
  const lines = lyricLines.map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Flatten lyric tokens, remembering their line index.
  const toks: { text: string; line: number }[] = [];
  lines.forEach((l, li) => tokenizeLine(l).forEach((t) => toks.push({ text: t, line: li })));

  // Greedy align: walk Azure words; for each lyric token find the next Azure
  // word (within a lookahead window) whose normalized text matches.
  const timing: (TimedWord | null)[] = new Array(toks.length).fill(null);
  let aw = 0;
  const LOOKAHEAD = 6;
  for (let i = 0; i < toks.length; i++) {
    const want = norm(toks[i]!.text);
    if (!want) continue;
    for (let j = aw; j < Math.min(azureWords.length, aw + LOOKAHEAD); j++) {
      if (norm(azureWords[j]!.text) === want) {
        timing[i] = { text: toks[i]!.text, start: azureWords[j]!.start, end: azureWords[j]!.end };
        aw = j + 1; // consume up to here; skips any unmatched (hallucinated) Azure words
        break;
      }
    }
  }

  // Interpolate timing for lyric tokens Azure missed, between known anchors.
  for (let i = 0; i < toks.length; i++) {
    if (timing[i]) continue;
    let p = i - 1; while (p >= 0 && !timing[p]) p--;
    let n = i + 1; while (n < toks.length && !timing[n]) n++;
    const from = p >= 0 ? timing[p]!.end : 0;
    const to = n < toks.length ? timing[n]!.start : totalDuration;
    const gapCount = n - p; // tokens (incl. this) sharing the gap
    const slot = Math.max(0.12, (to - from) / Math.max(1, gapCount));
    const k = i - p;
    timing[i] = { text: toks[i]!.text, start: from + slot * (k - 1), end: from + slot * k };
  }

  // Regroup into lines.
  const out: CaptionLine[] = lines.map(() => ({ words: [] as TimedWord[], start: 0, end: 0 }));
  toks.forEach((t, i) => out[t.line]!.words.push(timing[i]!));
  for (const cl of out) {
    if (cl.words.length) { cl.start = cl.words[0]!.start; cl.end = cl.words[cl.words.length - 1]!.end; }
  }
  return out.filter((c) => c.words.length);
}

// ---------------------------------------------------------------------------
// Mock timestamps (for building/testing the .ass without Azure): spread each
// line's words evenly across the song duration, proportional to line length.
// ---------------------------------------------------------------------------
export function mockWordTimestamps(lyricLines: string[], totalDuration: number): TimedWord[] {
  const lines = lyricLines.map((l) => l.trim()).filter(Boolean);
  const perLine = lines.map((l) => tokenizeLine(l));
  const totalToks = perLine.reduce((a, l) => a + l.length, 0) || 1;
  const words: TimedWord[] = [];
  let t = 0;
  const per = totalDuration / totalToks;
  for (const lineToks of perLine) {
    for (const tk of lineToks) { words.push({ text: tk, start: t, end: t + per * 0.9 }); t += per; }
  }
  return words;
}

// ---------------------------------------------------------------------------
// buildAss — karaoke .ass. Fredoka bold rounded, thick outline, lower third
// (never centered), word fills gold as sung with a pink outline glow, a pop-in
// per cue, max 2 lines on screen at once.
// ---------------------------------------------------------------------------
export interface AssOptions {
  playResX?: number; playResY?: number;
  fontName?: string; fontSize?: number;
  marginV?: number;            // distance from bottom (lower third, NOT center)
  sung?: string;               // PrimaryColour (sung)  &HAABBGGRR
  unsung?: string;             // SecondaryColour (unsung)
  outline?: string;            // OutlineColour (pink glow)
}

const ASS_DEFAULTS: Required<AssOptions> = {
  playResX: 1920, playResY: 1080,
  fontName: 'Fredoka', fontSize: 96,
  marginV: 150,                                  // ~ lower third on 1080
  sung: '&H0000D7FF',   // gold  (RGB FFD700)
  unsung: '&H00FFFFFF', // white
  outline: '&H00B469FF', // pink  (RGB FF69B4)
};

function assTime(s: number): string {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000),
    sec = Math.floor((cs % 6000) / 100), c = cs % 100;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${h}:${p(m)}:${p(sec)}.${p(c)}`;
}

/** Karaoke text for one display cue (1-2 lines), with gap-fills and a pop-in. */
function cueText(cueLines: CaptionLine[], cueStart: number): string {
  const pop = '{\\fad(120,80)\\fscx82\\fscy82\\t(0,170,\\fscx100\\fscy100)}';
  const parts: string[] = [];
  let cursor = cueStart;
  cueLines.forEach((cl, li) => {
    if (li > 0) parts.push('\\N');
    for (const w of cl.words) {
      const gap = Math.round((w.start - cursor) * 100);
      if (gap > 2) parts.push(`{\\k${gap}}`);          // silent gap before the word
      const dur = Math.max(1, Math.round((w.end - w.start) * 100));
      const sep = isCjk(w.text) ? '' : ' ';
      parts.push(`{\\kf${dur}}${w.text}${sep}`);        // \kf = smooth fill (word lights up)
      cursor = w.end;
    }
  });
  return pop + parts.join('');
}

export function buildAss(lines: CaptionLine[], opts: AssOptions = {}): string {
  const o = { ...ASS_DEFAULTS, ...opts };
  // Group lyric lines into cues of at most 2 lines.
  const cues: CaptionLine[][] = [];
  for (let i = 0; i < lines.length; i += 2) cues.push(lines.slice(i, i + 2));

  const header = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${o.playResX}`, `PlayResY: ${o.playResY}`,
    'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Alignment=2 (bottom-center) + MarginV -> lower third. Outline 6 (thick), Shadow 3.
    `Style: K,${o.fontName},${o.fontSize},${o.sung},${o.unsung},${o.outline},&H64000000,-1,0,0,0,100,100,0,0,1,6,3,2,60,60,${o.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events = cues.map((cue) => {
    const start = cue[0]!.start;
    const end = cue[cue.length - 1]!.end;
    return `Dialogue: 0,${assTime(start)},${assTime(end)},K,,0,0,0,,${cueText(cue, start)}`;
  }).join('\n');

  return `${header}\n${events}\n`;
}

// ---------------------------------------------------------------------------
// Azure Speech — word-level timestamps via the Fast Transcription REST API.
// Wired to env (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION); UNTESTED until the key
// is loaded. locale per language: es-ES / en-US / zh-CN.
// ---------------------------------------------------------------------------
export interface AzureCfg { key: string; region: string; endpoint?: string }

export async function azureWordTimestamps(audio: Buffer, locale: string, cfg: AzureCfg): Promise<TimedWord[]> {
  const base = cfg.endpoint?.replace(/\/$/, '') ?? `https://${cfg.region}.api.cognitive.microsoft.com`;
  const url = `${base}/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(audio)]), 'vocal.wav');
  form.append('definition', JSON.stringify({ locales: [locale], profanityFilterMode: 'None' }));
  const res = await fetch(url, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': cfg.key }, body: form });
  if (!res.ok) throw new Error(`Azure transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { phrases?: { words?: { text: string; offsetMilliseconds: number; durationMilliseconds: number }[] }[] };
  const words: TimedWord[] = [];
  for (const ph of data.phrases ?? []) {
    for (const w of ph.words ?? []) {
      words.push({ text: w.text, start: w.offsetMilliseconds / 1000, end: (w.offsetMilliseconds + w.durationMilliseconds) / 1000 });
    }
  }
  return words;
}
