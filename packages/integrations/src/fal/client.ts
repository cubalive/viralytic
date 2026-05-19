import { fal } from '@fal-ai/client';
import { IntegrationError, logger, COSTS_CENTS } from '@viralytic/shared';

fal.config({ credentials: process.env.FAL_KEY });

export interface GenerateImageInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  seed?: number;
  model?: 'fal-ai/flux-pro/v1.1' | 'fal-ai/flux/dev' | 'fal-ai/recraft-v3';
  numImages?: number;
}

export interface GenerateImageOutput {
  url: string;
  width: number;
  height: number;
  seed: number;
  costCents: number;
}

/** Generate a photorealistic image (default: Flux Pro) */
export async function generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { prompt, aspectRatio = '9:16', seed, model = 'fal-ai/flux-pro/v1.1', numImages = 1 } = input;

  try {
    const result = await fal.subscribe(model, {
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        num_images: numImages,
        seed,
        output_format: 'png',
        safety_tolerance: '2',
      },
      logs: false,
    });

    const data = result.data as { images: Array<{ url: string; width: number; height: number }>; seed: number };
    const img = data.images[0];
    if (!img) throw new IntegrationError('FAL_NO_IMAGE', 'No image returned', { result });

    logger.info({ model, seed: data.seed }, 'fal.image.generated');
    return {
      url: img.url,
      width: img.width,
      height: img.height,
      seed: data.seed,
      costCents: COSTS_CENTS.falFluxImage,
    };
  } catch (err) {
    throw new IntegrationError('FAL_IMAGE_FAILED', 'fal.ai image generation failed', { prompt }, err as Error);
  }
}

export interface GenerateVideoInput {
  prompt: string;
  imageUrl?: string;       // for image-to-video
  durationSeconds?: 5 | 10;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  model?: 'fal-ai/kling-video/v1.5/standard' | 'fal-ai/kling-video/v1.5/pro' | 'fal-ai/luma-dream-machine';
}

export interface GenerateVideoOutput {
  url: string;
  durationSeconds: number;
  costCents: number;
}

/** Generate a 5-10s video (text-to-video or image-to-video) */
export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  const {
    prompt,
    imageUrl,
    durationSeconds = 5,
    aspectRatio = '9:16',
    model = 'fal-ai/kling-video/v1.5/standard',
  } = input;

  const isI2V = !!imageUrl;
  const modelPath = isI2V
    ? model.replace('/standard', '/standard/image-to-video').replace('/pro', '/pro/image-to-video')
    : model;

  try {
    const result = await fal.subscribe(modelPath, {
      input: isI2V
        ? { prompt, image_url: imageUrl!, duration: durationSeconds.toString(), aspect_ratio: aspectRatio }
        : { prompt, duration: durationSeconds.toString(), aspect_ratio: aspectRatio },
      logs: false,
    });

    const data = result.data as { video: { url: string } };
    if (!data.video?.url) throw new IntegrationError('FAL_NO_VIDEO', 'No video URL returned', { result });

    const costCents = COSTS_CENTS.falKlingVideoPerSecond * durationSeconds;
    logger.info({ model: modelPath, durationSeconds, costCents }, 'fal.video.generated');

    return { url: data.video.url, durationSeconds, costCents };
  } catch (err) {
    throw new IntegrationError('FAL_VIDEO_FAILED', 'fal.ai video generation failed', { prompt }, err as Error);
  }
}

/** Download a generated asset to a buffer for storage upload */
export async function downloadAsset(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new IntegrationError('FAL_DOWNLOAD', `Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
