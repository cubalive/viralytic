import { z } from 'zod';
import { loadPrompt } from '../prompts/loader';
import { callClaude } from '../clients/anthropic';
import { CompetitorVideoSchema } from '@viralytic/shared';

export const TrendAnalysisOutputSchema = z.object({
  videoAnalyses: z.array(z.object({
    tiktokUrl: z.string(),
    hookType: z.string(),
    hookText: z.string(),
    hookWordCount: z.number(),
    timeToProductRevealSeconds: z.number(),
    averageCutIntervalSeconds: z.number(),
    framework: z.string(),
    ctaPlacement: z.object({ type: z.string(), timestampSeconds: z.number() }),
    viralityScore: z.number(),
    viralityFactors: z.array(z.string()),
  })),
  nicheInsights: z.object({
    dominantHookTypes: z.array(z.object({ type: z.string(), frequency: z.number() })),
    dominantFrameworks: z.array(z.object({ framework: z.string(), frequency: z.number() })),
    averageDurationSeconds: z.number(),
    averageHookWordCount: z.number(),
    averageTimeToProductRevealSeconds: z.number(),
    averageCutIntervalSeconds: z.number(),
    commonVisualPatterns: z.array(z.string()),
    commonLinguisticHooks: z.array(z.string()),
    ctaPatterns: z.array(z.string()),
    trendingSoundsToConsider: z.array(z.string()),
    thingsThatAreDying: z.array(z.string()),
  }),
  recommendationForCopywriter: z.string(),
});
export type TrendAnalysisOutput = z.infer<typeof TrendAnalysisOutputSchema>;

export async function analyzeTrends(input: {
  productSummary: string;
  competitorVideos: z.infer<typeof CompetitorVideoSchema>[];
  timeframe: string;
  region: string;
  language: string;
}): Promise<{ data: TrendAnalysisOutput; costCents: number }> {
  const systemPrompt = await loadPrompt('trend-analyzer', {
    product_summary: input.productSummary,
    competitor_videos_json: input.competitorVideos,
    timeframe: input.timeframe,
    region: input.region,
    language: input.language,
  });

  const result = await callClaude({
    systemPrompt,
    userPrompt: 'Analyze the patterns and return the JSON.',
    schema: TrendAnalysisOutputSchema,
    temperature: 0.3,
  });

  return { data: result.data, costCents: result.costCents };
}
