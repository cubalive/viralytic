import { ShotListSchema, type ScriptVariant, type Product } from '@viralytic/shared';
import { loadPrompt } from '../prompts/loader';
import { callClaude } from '../clients/anthropic';

export async function generateShotList(input: {
  script: ScriptVariant;
  product: Product;
  equipment: string[];
  spaceDescription: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
}) {
  const systemPrompt = await loadPrompt('shot-list', {
    script_json: input.script,
    product_json: input.product,
    equipment: input.equipment.join(', '),
    space_description: input.spaceDescription,
    skill_level: input.skillLevel,
  });
  return callClaude({
    systemPrompt,
    userPrompt: 'Generate the shot list JSON.',
    schema: ShotListSchema,
    temperature: 0.4,
  });
}
