import { z } from 'zod';
import { loadPrompt } from '../prompts/loader';
import { callClaude } from '../clients/anthropic';

export const ProductAnalysisSchema = z.object({
  painPoints: z.array(z.object({
    pain: z.string(),
    frequency: z.number(),
    severity: z.number(),
    quotedExample: z.string(),
  })),
  uniqueSellingPoints: z.array(z.object({
    usp: z.string(),
    verifiedInReviews: z.boolean(),
    competitorsLack: z.boolean(),
  })),
  buyerPersonas: z.array(z.object({
    name: z.string(),
    context: z.string(),
    trigger: z.string(),
    objection: z.string(),
  })),
  emotionalOutcomes: z.array(z.object({
    outcome: z.string(),
    quoteCount: z.number(),
  })),
  skepticismTriggers: z.array(z.object({
    objection: z.string(),
    frequency: z.number(),
    handleInScript: z.boolean(),
  })),
  recommendedAngle: z.string(),
  warnings: z.array(z.string()),
});
export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;

export async function analyzeProduct(input: {
  title: string;
  price: number | null;
  description: string;
  features: string[];
  reviews: string[];
  competitorProducts?: Array<{ title: string; price: number | null }>;
}) {
  const systemPrompt = await loadPrompt('product-analyzer', {
    title: input.title,
    price: input.price ?? 'unknown',
    description: input.description,
    features: input.features,
    reviews_json: input.reviews,
    competitor_products: input.competitorProducts ?? [],
  });
  return callClaude({
    systemPrompt,
    userPrompt: 'Analyze and return the JSON.',
    schema: ProductAnalysisSchema,
    temperature: 0.3,
  });
}
