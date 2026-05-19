import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Captions } from './Captions';
import { CTAOverlay } from './CTAOverlay';

export interface TikTokVideoProps {
  /** Public URL of the synthesized voiceover (mp3) */
  voiceUrl: string;
  /** Optional background music URL */
  musicUrl?: string;
  /** Word-level captions from Whisper for subtitle timing */
  captions: Array<{ text: string; start: number; end: number }>;
  /** Visual assets in order, each placed at its start time */
  visuals: Array<{
    type: 'image' | 'video' | 'user_clip';
    url: string;
    startSeconds: number;
    durationSeconds: number;
  }>;
  /** CTA text shown in the last seconds */
  ctaText: string;
  /** Total duration (must match audio) */
  durationSeconds: number;
  /** Brand watermark — null for paid plans */
  watermarkText?: string | null;
}

/**
 * 9:16 TikTok composition.
 * Render with:
 *   npx remotion render TikTokVideo out.mp4 --props=props.json --concurrency=4
 */
export const TikTokVideo: React.FC<TikTokVideoProps> = ({
  voiceUrl, musicUrl, captions, visuals, ctaText, durationSeconds, watermarkText,
}) => {
  const { fps } = useVideoConfig();
  const totalFrames = Math.ceil(durationSeconds * fps);
  const ctaStartFrame = Math.max(0, totalFrames - 4 * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Visual track */}
      {visuals.map((v, i) => {
        const fromFrame = Math.floor(v.startSeconds * fps);
        const durationFrames = Math.ceil(v.durationSeconds * fps);
        return (
          <Sequence key={i} from={fromFrame} durationInFrames={durationFrames}>
            {v.type === 'image' ? (
              <KenBurnsImage src={v.url} totalFrames={durationFrames} />
            ) : (
              <OffthreadVideo src={v.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
            )}
          </Sequence>
        );
      })}

      {/* Audio track: voiceover */}
      <Audio src={voiceUrl} />

      {/* Optional background music at low volume */}
      {musicUrl && <Audio src={musicUrl} volume={0.12} />}

      {/* Captions (always on top of visuals) */}
      <Captions tokens={captions} />

      {/* CTA in last 4 seconds */}
      <Sequence from={ctaStartFrame}>
        <CTAOverlay text={ctaText} />
      </Sequence>

      {/* Watermark for free plan */}
      {watermarkText && (
        <div style={{
          position: 'absolute', top: 24, right: 24,
          color: 'rgba(255,255,255,0.55)', fontSize: 28, fontWeight: 600,
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          fontFamily: 'Inter, system-ui',
        }}>{watermarkText}</div>
      )}
    </AbsoluteFill>
  );
};

/** Ken Burns effect: slow zoom on still images for visual energy */
const KenBurnsImage: React.FC<{ src: string; totalFrames: number }> = ({ src, totalFrames }) => {
  const frame = useCurrentFrame();
  const progress = frame / totalFrames;
  const scale = 1 + progress * 0.08; // 8% zoom over duration
  return (
    <Img
      src={src}
      style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${scale})`, transformOrigin: 'center center',
      }}
    />
  );
};
