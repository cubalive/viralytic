import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

const cache = new Map<string, string>();

/**
 * Load a prompt by name (without .md). Caches in memory.
 * Replace {placeholders} with values from the context map.
 */
export async function loadPrompt(
  name: string,
  context: Record<string, unknown> = {}
): Promise<string> {
  let template = cache.get(name);
  if (!template) {
    template = await readFile(join(PROMPTS_DIR, `${name}.md`), 'utf-8');
    cache.set(name, template);
  }
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in context)) return match;
    const val = context[key];
    return typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  });
}
