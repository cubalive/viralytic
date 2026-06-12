import { z } from 'zod';

// ============================================================
// PRODUCT
// ============================================================

export const ProductPlatformSchema = z.enum([
  'tiktok_shop', 'amazon', 'shopify', 'aliexpress', 'temu', 'manual', 'generic'
]);

export const ProductSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  sourceUrl: z.string().url(),
  sourcePlatform: ProductPlatformSchema,
  title: z.string(),
  price: z.number().nullable(),
  currency: z.string().default('USD'),
  description: z.string().nullable(),
  features: z.array(z.string()).default([]),
  painPoints: z.array(z.object({
    pain: z.string(),
    frequency: z.number(), // how many reviews mention it
    severity: z.number().min(1).max(10),
  })).default([]),
  positiveReviews: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
});
export type Product = z.infer<typeof ProductSchema>;

// ============================================================
// COMPETITOR VIDEO ANALYSIS
// ============================================================

export const HookTypeSchema = z.enum([
  'pattern_interrupt', 'curiosity_gap', 'direct_callout',
  'shocking_claim', 'transformation_reveal', 'social_proof',
  'question_hook', 'controversial_opinion'
]);

export const CompetitorVideoSchema = z.object({
  tiktokUrl: z.string().url(),
  hookText: z.string(),
  hookType: HookTypeSchema,
  transcript: z.string(),
  durationSeconds: z.number().int(),
  views: z.number().int(),
  likes: z.number().int(),
  comments: z.number().int(),
  shares: z.number().int(),
  frameworkDetected: z.enum(['AIDA', 'PAS', 'BAB', 'HSO', 'OTHER']),
  viralityScore: z.number().min(0).max(10),
});
export type CompetitorVideo = z.infer<typeof CompetitorVideoSchema>;

// ============================================================
// SCRIPT
// ============================================================

export const FrameworkSchema = z.enum(['PAS', 'AIDA', 'BAB', 'HSO', 'CUSTOM']);

export const VisualCueSchema = z.object({
  timestamp: z.number(),
  type: z.enum([
    'close_up_product', 'wide_product', 'user_reaction', 'before_state',
    'after_state', 'comparison_split', 'social_proof_overlay',
    'price_reveal', 'cta_screen', 'b_roll_lifestyle'
  ]),
  description: z.string(),
});

export const ScriptVariantSchema = z.object({
  framework: FrameworkSchema,
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  fullText: z.string(),
  estimatedDurationSeconds: z.number(),
  emotionTags: z.array(z.string()),
  visualCues: z.array(VisualCueSchema),
  predictedHookStrength: z.number().min(0).max(10),
  whyThisWorks: z.string(),
});
export type ScriptVariant = z.infer<typeof ScriptVariantSchema>;

export const CopywriterInputSchema = z.object({
  product: ProductSchema,
  brand: z.object({
    name: z.string(),
    tone: z.string(),
    targetAudience: z.string(),
    uniqueSellingPoints: z.array(z.string()),
    forbiddenWords: z.array(z.string()).default([]),
    language: z.string().default('es'),
  }),
  competitorScripts: z.array(CompetitorVideoSchema).default([]),
  historicalWinners: z.array(ScriptVariantSchema).default([]),
});
export type CopywriterInput = z.infer<typeof CopywriterInputSchema>;

export const CopywriterOutputSchema = z.object({
  variants: z.array(ScriptVariantSchema).length(3),
  modelUsed: z.string(),
});
export type CopywriterOutput = z.infer<typeof CopywriterOutputSchema>;

// ============================================================
// JUDGE
// ============================================================

export const JudgeOutputSchema = z.object({
  ranking: z.array(z.object({
    variantIndex: z.number(),
    source: z.string(), // 'claude' | 'openai'
    score: z.number().min(0).max(100),
    reasoning: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
  })),
  winner: z.object({
    variantIndex: z.number(),
    source: z.string(),
    confidence: z.number(),
  }),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

// ============================================================
// VIDEO JOB
// ============================================================

export const VideoModeSchema = z.enum(['ai_full', 'user_filmed', 'hybrid']);

export const VideoJobStatusSchema = z.enum([
  'pending', 'analyzing', 'scripting', 'awaiting_script_selection',
  'voicing', 'visualizing', 'awaiting_clips', 'assembling',
  'ready', 'scheduled', 'posted', 'failed', 'cancelled'
]);

export const CreateJobInputSchema = z.object({
  organizationId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  productUrl: z.string().url().optional(),
  mode: VideoModeSchema,
  brandId: z.string().uuid(),
  voiceId: z.string().uuid(),
  language: z.string().default('es'),
  autoPublish: z.boolean().default(false),
  scheduledFor: z.string().datetime().optional(),
}).refine(d => d.productId || d.productUrl, {
  message: 'Either productId or productUrl is required',
});
export type CreateJobInput = z.infer<typeof CreateJobInputSchema>;

// ============================================================
// SHOT LIST (for user_filmed mode)
// ============================================================

export const ShotSchema = z.object({
  order: z.number().int(),
  description: z.string(),
  angle: z.enum(['close_up', 'medium', 'wide', 'overhead', 'low_angle', 'pov']),
  durationSeconds: z.number(),
  lighting: z.string(),
  dialogue: z.string().nullable(),
  bRoll: z.boolean(),
  tips: z.array(z.string()),
});
export const ShotListSchema = z.object({
  shots: z.array(ShotSchema),
  totalDurationSeconds: z.number(),
  generalNotes: z.string(),
  equipmentNeeded: z.array(z.string()),
});
export type ShotList = z.infer<typeof ShotListSchema>;

// ============================================================
// VOICE
// ============================================================

export const VoiceSynthesisInputSchema = z.object({
  text: z.string(),
  voiceId: z.string(),
  emotionPeaks: z.array(z.object({
    position: z.number(),
    intensity: z.number().min(0).max(1),
  })).default([]),
  stability: z.number().min(0).max(1).default(0.5),
  similarity: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0.3),
  language: z.string().default('es'),
});
export type VoiceSynthesisInput = z.infer<typeof VoiceSynthesisInputSchema>;

// ============================================================
// TRENDING DISCOVERY
// ============================================================

export const TrendingSourceSchema = z.enum([
  'tiktok_creative_center', 'tiktok_hashtags', 'google_trends',
  'pipiads', 'ecomhunt', 'sell_the_trend', 'reddit', 'amazon_movers'
]);

export const TrendingProductSchema = z.object({
  source: TrendingSourceSchema,
  title: z.string(),
  category: z.string(),
  thumbnailUrl: z.string().nullable(),
  productUrl: z.string().url().nullable(),
  estimatedPrice: z.number().nullable(),
  viralityScore: z.number().min(0).max(100),
  growthRate7d: z.number(), // percentage
  competitionLevel: z.enum(['low', 'medium', 'high']),
  marginEstimate: z.enum(['low', 'medium', 'high']).nullable(),
  topVideoUrls: z.array(z.string().url()).default([]),
  discoveredAt: z.string().datetime(),
});
export type TrendingProduct = z.infer<typeof TrendingProductSchema>;

// ============================================================
// PUBLICATION
// ============================================================

export const PublicationInputSchema = z.object({
  jobId: z.string().uuid(),
  tiktokAccountId: z.string().uuid(),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()),
  scheduledFor: z.string().datetime().optional(),
});
export type PublicationInput = z.infer<typeof PublicationInputSchema>;

// ============================================================
// BRAND & VOICE SETUP (onboarding)
// ============================================================

export const BrandInputSchema = z.object({
  name: z.string().min(1),
  tone: z.string().optional(),
  targetAudience: z.string().optional(),
  uniqueSellingPoints: z.array(z.string()).optional(),
  forbiddenWords: z.array(z.string()).optional(),
  language: z.string().default('es'),
});
export type BrandInput = z.infer<typeof BrandInputSchema>;

export const VoiceInputSchema = z.object({
  name: z.string().min(1),
  elevenlabsVoiceId: z.string().min(1),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
});
export type VoiceInput = z.infer<typeof VoiceInputSchema>;
