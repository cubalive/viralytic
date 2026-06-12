'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';

const LANGUAGES = ['es', 'en', 'zh'] as const;

/**
 * Create a music-video engine (project) and its three YouTube channels
 * (Spanish, English, Chinese).
 */
export async function createProject(formData: FormData): Promise<void> {
  const { orgId, db } = await requireAdmin();

  const name = String(formData.get('name') ?? '').trim();
  const protagonist = String(formData.get('protagonist') ?? '').trim();
  if (!name) return;

  const { data: project, error } = await db
    .from('mv_projects')
    .insert({ organization_id: orgId, name, protagonist: protagonist || null })
    .select('id')
    .single();
  if (error || !project) return;

  await db
    .from('mv_channels')
    .insert(LANGUAGES.map((language) => ({ project_id: project.id, language })));

  revalidatePath('/music-videos');
}
