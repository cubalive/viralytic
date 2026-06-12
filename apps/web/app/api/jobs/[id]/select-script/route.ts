import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServer, getActiveOrgId, getActiveVoiceId } from '@/lib/supabase';
import { enqueueVoiceSynthesis } from '@/lib/queue';
import { logger } from '@viralytic/shared';

const BodySchema = z.object({ scriptId: z.string().uuid() });

// POST — the user picks one of the generated scripts. Marks it selected,
// ensures the job has a voice, advances to `voicing`, and enqueues
// voice-synthesis. Idempotent: re-selecting re-runs the same safe steps.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const supabase = await getSupabaseServer();
  const orgId = await getActiveOrgId();
  if (!orgId) return new NextResponse('Unauthorized', { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { scriptId } = parsed.data;

  // Job must belong to the active org.
  const { data: job } = await supabase
    .from('video_jobs')
    .select('id, status, voice_id, brand_id')
    .eq('id', jobId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!job) return new NextResponse('Job not found', { status: 404 });

  // Only selectable while waiting (or already voicing — safe re-select).
  // Prevents re-selecting from resetting a job that already advanced.
  if (!['awaiting_script_selection', 'voicing'].includes(job.status)) {
    return new NextResponse('El job no está esperando selección de guion', { status: 409 });
  }

  // Script must belong to this job.
  const { data: script } = await supabase
    .from('scripts')
    .select('id')
    .eq('id', scriptId)
    .eq('job_id', jobId)
    .maybeSingle();
  if (!script) return new NextResponse('Script not found for this job', { status: 404 });

  // Ensure a voice is set; without one, voice-synthesis cannot run.
  let voiceId = job.voice_id as string | null;
  if (!voiceId) {
    voiceId =
      (await getActiveVoiceId(supabase, orgId, job.brand_id ?? undefined)) ??
      (await getActiveVoiceId(supabase, orgId));
    if (!voiceId) return new NextResponse('Configura una voz primero', { status: 400 });
  }

  // Mark only the chosen script as selected.
  await supabase.from('scripts').update({ selected: false }).eq('job_id', jobId);
  await supabase.from('scripts').update({ selected: true }).eq('id', scriptId);

  await supabase
    .from('video_jobs')
    .update({ voice_id: voiceId, status: 'voicing', current_step: 'voice-synthesis' })
    .eq('id', jobId);

  try {
    await enqueueVoiceSynthesis({ jobId, scriptId });
  } catch (err) {
    logger.error({ err, jobId }, 'select_script.enqueue_failed');
    return NextResponse.json({
      ok: true,
      queued: false,
      message: 'Script selected but not enqueued; stays in voicing for manual retry.',
    });
  }

  return NextResponse.json({ ok: true });
}
