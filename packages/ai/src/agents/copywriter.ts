import {
  CopywriterInputSchema, CopywriterOutputSchema, JudgeOutputSchema,
  type CopywriterInput, type ScriptVariant
} from '@viralytic/shared';
import { z } from 'zod';
import { loadPrompt } from '../prompts/loader';
import { callClaude } from '../clients/anthropic';
import { callOpenAI } from '../clients/openai';
import { logger } from '@viralytic/shared';

/**
 * Generate 3 viral script variants using a Claude + GPT-4 ensemble + Judge ranking.
 *
 * Flow:
 *  1. Claude generates 3 variants in parallel with OpenAI generating 3 variants
 *  2. Judge agent (Claude) scores all 6 against historical winners + competitor virals
 *  3. Top 3 ranked variants are returned for the user to choose from
 */
export async function generateScripts(input: CopywriterInput): Promise<{
  topVariants: ScriptVariant[];
  judgeReasoning: z.infer<typeof JudgeOutputSchema>;
  totalCostCents: number;
}> {
  CopywriterInputSchema.parse(input);

  const banned = input.brand.forbiddenWords.join(', ') || 'none';
  const promptCtx = {
    product_json: input.product,
    brand_json: input.brand,
    target_audience: input.brand.targetAudience,
    competitor_scripts: input.competitorScripts,
    historical_winners: input.historicalWinners,
    language: input.brand.language,
    banned_words: banned,
    tone: input.brand.tone,
  };

  const systemPrompt = await loadPrompt('copywriter', promptCtx);
  const userPrompt = `Generate 3 variants now. Return only the JSON.`;

  logger.info({ productTitle: input.product.title }, 'copywriter.start');

  // === Run Claude + OpenAI in parallel ===
  const [claudeResult, openaiResult] = await Promise.all([
    callClaude({
      systemPrompt,
      userPrompt,
      schema: CopywriterOutputSchema,
      temperature: 0.85,
    }).catch(err => {
      logger.error({ err }, 'copywriter.claude.failed');
      return null;
    }),
    callOpenAI({
      systemPrompt,
      userPrompt,
      schema: CopywriterOutputSchema,
      schemaName: 'CopywriterOutput',
      temperature: 0.85,
    }).catch(err => {
      logger.error({ err }, 'copywriter.openai.failed');
      return null;
    }),
  ]);

  const candidates: { source: string; variant: ScriptVariant }[] = [];
  if (claudeResult) {
    claudeResult.data.variants.forEach(v => candidates.push({ source: 'claude', variant: v }));
  }
  if (openaiResult) {
    openaiResult.data.variants.forEach(v => candidates.push({ source: 'openai', variant: v }));
  }

  if (candidates.length === 0) {
    throw new Error('Both Claude and OpenAI failed to generate scripts');
  }

  // === Judge ranks all candidates ===
  const judgeSystem = await loadPrompt('judge', {
    product_summary: input.product.title,
    variants_json: candidates.map((c, i) => ({ index: i, source: c.source, ...c.variant })),
    historical_winners: input.historicalWinners,
    competitor_videos: input.competitorScripts,
    banned_words: banned,
  });

  const judgeResult = await callClaude({
    systemPrompt: judgeSystem,
    userPrompt: 'Rank the candidates. Return only the JSON.',
    schema: JudgeOutputSchema,
    temperature: 0.2, // judge should be deterministic
  });

  const topIndices = judgeResult.data.ranking
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(r => r.variantIndex);

  const topVariants = topIndices.map(i => candidates[i]!.variant);

  const totalCostCents =
    (claudeResult?.costCents ?? 0) +
    (openaiResult?.costCents ?? 0) +
    judgeResult.costCents;

  logger.info({ totalCostCents, topIndices }, 'copywriter.done');
  return { topVariants, judgeReasoning: judgeResult.data, totalCostCents };
}
