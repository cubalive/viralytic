import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AIError, logger, COSTS_CENTS } from '@viralytic/shared';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const DEFAULT_MODEL = 'claude-opus-4-7';

export interface ClaudeCallOptions<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  model?: string;
  maxTokens?: number;
  /** Forwarded only to models that accept it. Verified against the live API:
   *  Opus 4.7/4.8 reject a custom `temperature` (HTTP 400 "deprecated");
   *  Sonnet/Haiku accept 0–1. See the model guard in callClaude. */
  temperature?: number;
}

/**
 * Validate a tool_use payload against the schema, tolerating a flaky failure
 * mode where the model wraps the real payload under spurious placeholder keys
 * (observed in the wild: "$PARAMETER_NAME", "$PARAMETER_VALUE"). Tries the
 * payload directly, then probes nested object values; on failure throws the
 * descriptive ZodError from the direct attempt.
 */
function parseToolInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const direct = schema.safeParse(input);
  if (direct.success) return direct.data;

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    const candidates: unknown[] = [];
    if ('$PARAMETER_VALUE' in obj) candidates.push(obj['$PARAMETER_VALUE']);
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') candidates.push(v);
    }
    for (const candidate of candidates) {
      const attempt = schema.safeParse(candidate);
      if (attempt.success) return attempt.data;
    }
  }

  return schema.parse(input); // throws the original descriptive ZodError
}

/**
 * Call Claude with structured output enforced via tool use.
 * Returns the parsed, schema-validated object.
 */
export async function callClaude<T>(opts: ClaudeCallOptions<T>): Promise<{
  data: T;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const {
    systemPrompt,
    userPrompt,
    schema,
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    temperature,
  } = opts;

  // Opus 4.7/4.8 reject a custom temperature (HTTP 400); Sonnet/Haiku accept it.
  const acceptsTemperature = !model.includes('opus');

  // Convert zod schema to JSON Schema for the tool definition
  // (uses zod-to-json-schema package, kept simple here)
  const { zodToJsonSchema } = await import('zod-to-json-schema');
  const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined && acceptsTemperature ? { temperature } : {}),
      system: systemPrompt,
      tools: [{
        name: 'return_structured_output',
        description: 'Return the analysis as structured JSON matching the schema.',
        input_schema: jsonSchema as Anthropic.Messages.Tool.InputSchema,
      }],
      tool_choice: { type: 'tool', name: 'return_structured_output' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new AIError('NO_TOOL_USE', 'Claude did not return a tool_use block', { response });
    }

    const parsed = parseToolInput(schema, toolUse.input);

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costCents = Math.round(
      (inputTokens / 1000) * COSTS_CENTS.anthropicPer1kInputTokens +
      (outputTokens / 1000) * COSTS_CENTS.anthropicPer1kOutputTokens
    );

    logger.info({ model, inputTokens, outputTokens, costCents }, 'claude.call');
    return { data: parsed, costCents, inputTokens, outputTokens };
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof z.ZodError) {
      throw new AIError('SCHEMA_VALIDATION', 'Claude output did not match schema', { issues: err.issues }, err);
    }
    throw new AIError('CLAUDE_CALL_FAILED', 'Claude API call failed', {}, err as Error);
  }
}
