import { useCurrentFrame, useVideoConfig } from 'remotion';
import { CAPTION_STYLE } from '@viralytic/shared';

interface Token { text: string; start: number; end: number }

/**
 * Animated word-by-word captions, TikTok-style.
 * Each word pops in with a slight scale animation, highlighted on emphasis.
 */
export const Captions: React.FC<{ tokens: Token[] }> = ({ tokens }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tSec = frame / fps;

  // Window: show the current line (group of ~5-9 chars per line, 2-line max)
  const activeTokens = tokens.filter(t => tSec >= t.start - 0.15 && tSec <= t.end + 0.15);
  if (activeTokens.length === 0) return null;

  // Group into lines of max chars
  const lines: Token[][] = [[]];
  let charsInLine = 0;
  for (const tok of activeTokens) {
    if (charsInLine + tok.text.length + 1 > CAPTION_STYLE.maxCharsPerLine && lines[lines.length - 1]!.length > 0) {
      lines.push([]);
      charsInLine = 0;
    }
    lines[lines.length - 1]!.push(tok);
    charsInLine += tok.text.length + 1;
  }
  const visibleLines = lines.slice(0, CAPTION_STYLE.maxLines);

  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0,
      bottom: `${CAPTION_STYLE.marginBottomPct * 100}%`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8,
    }}>
      {visibleLines.map((line, i) => (
        <div key={i} style={{ display: 'flex', gap: 14 }}>
          {line.map((tok, j) => {
            const isActive = tSec >= tok.start && tSec <= tok.end;
            const isEmphasis = tok.text.startsWith('**'); // marked emotion peak
            return (
              <span key={j} style={{
                fontFamily: CAPTION_STYLE.fontFamily,
                fontSize: CAPTION_STYLE.fontSize,
                fontWeight: CAPTION_STYLE.fontWeight,
                color: isEmphasis ? CAPTION_STYLE.highlightColor : CAPTION_STYLE.color,
                WebkitTextStroke: `${CAPTION_STYLE.strokeWidth}px ${CAPTION_STYLE.strokeColor}`,
                textShadow: `0 4px ${CAPTION_STYLE.shadowBlur}px ${CAPTION_STYLE.shadowColor}`,
                textTransform: CAPTION_STYLE.textTransform,
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 80ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                {tok.text.replace(/\*\*/g, '')}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
