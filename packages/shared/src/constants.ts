// Tuned for TikTok virality + conversion. Change only with A/B data.

export const VIDEO_CONFIG = {
  // Format
  width: 1080,
  height: 1920,
  fps: 30,
  aspectRatio: '9:16',

  // Duration (data: 18-32s has highest completion + conversion)
  minDurationSeconds: 15,
  maxDurationSeconds: 45,
  optimalDurationSeconds: 25,

  // Hook
  maxHookSeconds: 3,
  maxHookWords: 12,

  // Pacing
  minCutIntervalSeconds: 1.2,
  maxCutIntervalSeconds: 2.0,

  // CTA
  ctaLastSeconds: 4,
} as const;

export const CAPTION_STYLE = {
  fontFamily: 'TikTokSans-Bold, ProximaNova-Black, Inter, sans-serif',
  fontSize: 84, // px in 1080x1920 canvas
  fontWeight: 900,
  color: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 6,
  shadowBlur: 8,
  shadowColor: 'rgba(0,0,0,0.8)',
  textTransform: 'uppercase' as const,
  maxCharsPerLine: 9,
  maxLines: 2,
  marginBottomPct: 0.22, // % from bottom (above CTA bar)
  highlightColor: '#39FF14', // word highlight on emphasis
} as const;

export const BANNED_TIKTOK_WORDS_ES = [
  // Words that limit reach on TikTok (Spanish)
  'matar', 'muerte', 'suicidio', 'arma', 'cocaína', 'heroína',
  'estafa', 'fraude', 'porno', 'sexo', 'desnudo',
  // Restrictive product claims
  'cura', 'milagro', 'garantizado al 100%',
];

export const BANNED_TIKTOK_WORDS_EN = [
  'kill', 'death', 'suicide', 'gun', 'weapon', 'cocaine', 'heroin',
  'scam', 'fraud', 'porn', 'sex', 'nude',
  'cure', 'miracle', 'guaranteed 100%',
];

export const TRENDING_DISCOVERY = {
  topResultsPerSource: 50,
  minViralityScore: 60,
  defaultTimeframe: '7d' as const,
  refreshIntervalHours: 12,
} as const;

export const PLAN_QUOTAS = {
  free:     { videosPerMonth: 3,   voices: 1, tiktokAccounts: 1,  watermark: true },
  pro:      { videosPerMonth: 50,  voices: 1, tiktokAccounts: 1,  watermark: false },
  agency:   { videosPerMonth: 500, voices: 10, tiktokAccounts: 10, watermark: false },
  enterprise: { videosPerMonth: -1, voices: -1, tiktokAccounts: -1, watermark: false },
} as const;

export const COSTS_CENTS = {
  elevenlabsPer1kChars: 30, // approx
  falFluxImage: 5,
  falKlingVideoPerSecond: 35,
  revidVideoPerSecond: 20,
  anthropicPer1kInputTokens: 0.3,
  anthropicPer1kOutputTokens: 1.5,
} as const;

export const QUEUE_NAMES = {
  trendingDiscovery: 'trending-discovery',
  productAnalysis: 'product-analysis',
  competitorResearch: 'competitor-research',
  scriptGeneration: 'script-generation',
  voiceSynthesis: 'voice-synthesis',
  visualGeneration: 'visual-generation',
  videoAssembly: 'video-assembly',
  publishing: 'publishing',
  metricsCollection: 'metrics-collection',
} as const;

// Self-reinforcing learning loop: a published video whose views clear this
// bar is treated as a "winner" — its selected script gets embedded so future
// script generation can retrieve it as a historical winner.
export const LEARNING = {
  winnerMinViews: 10_000,
} as const;
