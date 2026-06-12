import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer';
import type { TikTokVideoProps } from './compositions/TikTokVideo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundling the Remotion project is expensive; cache it for the process lifetime
// so repeated renders in a long-lived worker only pay the cost once.
let bundlePromise: Promise<string> | null = null;
function getServeUrl(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: path.join(__dirname, 'remotion-entry.ts') });
  }
  return bundlePromise;
}

/**
 * Render the TikTokVideo composition to a local MP4 and return its path.
 * The caller is responsible for uploading and deleting the file.
 *
 * Heavy: downloads a headless browser on first use and renders frame-by-frame.
 * Run with concurrency 1 in the worker.
 */
export async function renderTikTokVideo(
  props: TikTokVideoProps,
  outputPath?: string,
): Promise<string> {
  await ensureBrowser();
  const serveUrl = await getServeUrl();
  const inputProps = props as unknown as Record<string, unknown>;

  const composition = await selectComposition({
    serveUrl,
    id: 'TikTokVideo',
    inputProps,
  });

  // Match the frame count to the actual voiceover duration.
  const durationInFrames = Math.max(1, Math.ceil(props.durationSeconds * composition.fps));
  const out = outputPath ?? path.join(os.tmpdir(), `viralytic-${Date.now()}.mp4`);

  await renderMedia({
    composition: { ...composition, durationInFrames },
    serveUrl,
    codec: 'h264',
    outputLocation: out,
    inputProps,
  });

  return out;
}
