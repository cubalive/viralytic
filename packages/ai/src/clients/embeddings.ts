import OpenAI from 'openai';
import { AIError, logger } from '@viralytic/shared';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// text-embedding-3-small outputs 1536 dims, matching the `vector(1536)`
// columns on competitor_videos.embedding and scripts.embedding.
export const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Embed a single text into a 1536-dim vector for pgvector similarity search,
 * returning the vector plus the cost in cents. Input is truncated defensively
 * to stay well under the model's token limit.
 */
export async function embedText(
  text: string,
): Promise<{ vector: number[]; costCents: number }> {
  try {
    const input = text.slice(0, 8000);
    const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input });
    const vector = res.data[0]?.embedding;
    if (!vector) {
      throw new AIError('NO_EMBEDDING', 'OpenAI returned no embedding', {});
    }
    // text-embedding-3-small: $0.02 / 1M tokens
    const tokens = res.usage?.total_tokens ?? 0;
    const costCents = Math.max(0, Math.round(((tokens * 0.02) / 1_000_000) * 100));
    logger.info({ model: EMBEDDING_MODEL, tokens, costCents }, 'openai.embed');
    return { vector, costCents };
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError('EMBEDDING_FAILED', 'OpenAI embeddings call failed', {}, err as Error);
  }
}
