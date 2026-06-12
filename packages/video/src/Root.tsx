import type { ComponentType } from 'react';
import { Composition } from 'remotion';
import { TikTokVideo } from './compositions/TikTokVideo';
// Import the pure constants module directly (not the barrel) so the Remotion
// browser bundle never pulls in shared's Node-only code (pino logger, node:crypto).
import { VIDEO_CONFIG } from '@viralytic/shared/src/constants';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="TikTokVideo"
      component={TikTokVideo as unknown as ComponentType<Record<string, unknown>>}
      durationInFrames={VIDEO_CONFIG.optimalDurationSeconds * VIDEO_CONFIG.fps}
      fps={VIDEO_CONFIG.fps}
      width={VIDEO_CONFIG.width}
      height={VIDEO_CONFIG.height}
      defaultProps={{
        voiceUrl: '',
        captions: [],
        visuals: [],
        ctaText: 'Tap the link below',
        durationSeconds: VIDEO_CONFIG.optimalDurationSeconds,
        watermarkText: null,
      }}
    />
  </>
);
