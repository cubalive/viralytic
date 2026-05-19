import { z } from 'zod';
import { loadPrompt } from '../prompts/loader';
import { callClaude } from '../clients/anthropic';
import type { ScriptVariant, Product } from '@viralytic/shared';

export const VisualPlanSchema = z.object({
  assets: z.array(z.object({
    cueIndex: z.number(),
    timestampSeconds: z.number(),
    durationSeconds: z.number(),
    type: z.enum(['ai_image', 'ai_video', 'user_clip']),
    provider: z.enum(['fal', 'revid', 'user']),
    model: z.string(),
    prompt: z.string(),
    negativePrompt: z.string().optional(),
    aspectRatio: z.string(),
    seed: z.number().optional(),
    imageReference: z.string().optional(),
    estimatedCostCents: z.number(),
  })),
  totalEstimatedCostCents: z.number(),
  fallbackPlan: z.string(),
});
export type VisualPlan = z.infer<typeof VisualPlanSchema>;

export async function generateVisualPlan(input: {
  script: ScriptVariant;
  product: Product;
  visualMood: string;
  brandColors: string[];
  avoidList: string[];
  userClipsMetadata?: Array<{ duration: number; description: string; storagePath: string }>;
}) {
  const systemPrompt = await loadPrompt('visual-prompter', {
    script_json: input.script,
    product_json: input.product,
    visual_mood: input.visualMood,
    brand_colors: input.brandColors,
    avoid_list: input.avoidList,
    user_clips_metadata: input.userClipsMetadata ?? [],
  });
  return callClaude({
    systemPrompt,
    userPrompt: 'Generate the visual plan JSON.',
    schema: VisualPlanSchema,
    temperature: 0.5,
  });
}
