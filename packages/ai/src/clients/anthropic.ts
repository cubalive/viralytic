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
  temperature?: number;
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
    temperature = 0.7,
  } = opts;

  // Convert zod schema to JSON Schema for the tool definition
  // (uses zod-to-json-schema package, kept simple here)
  const { zodToJsonSchema } = await import('zod-to-json-schema');
  const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
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

    const parsed = schema.parse(toolUse.input);

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
