import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { AIError, logger } from '@viralytic/shared';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-2024-08-06';

export interface OpenAICallOptions<T extends z.ZodType> {
  systemPrompt: string;
  userPrompt: string;
  schema: T;
  schemaName: string;
  model?: string;
  temperature?: number;
}

/**
 * Call OpenAI with strict structured output (native JSON Schema mode).
 */
export async function callOpenAI<T extends z.ZodType>(
  opts: OpenAICallOptions<T>
): Promise<{ data: z.infer<T>; costCents: number }> {
  const {
    systemPrompt,
    userPrompt,
    schema,
    schemaName,
    model = DEFAULT_OPENAI_MODEL,
    temperature = 0.7,
  } = opts;

  try {
    const completion = await client.beta.chat.completions.parse({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new AIError('NO_PARSED_OUTPUT', 'OpenAI returned no parsed content', { completion });
    }

    // Cost: gpt-4o = $2.5/1M input, $10/1M output (approx)
    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const costCents = Math.round((inputTokens * 0.25 + outputTokens * 1.0) / 100);

    logger.info({ model, inputTokens, outputTokens, costCents }, 'openai.call');
    return { data: parsed, costCents };
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError('OPENAI_CALL_FAILED', 'OpenAI API call failed', {}, err as Error);
  }
}
