/**
 * sync-bank — mirror every rendered viralytic video (Zuri / Caroline / Faceless)
 * from Supabase storage into the shared local "BANCO DE VIDEOS GENERAL".
 *
 *   <BANK_DIR>/<Canal>/<IDIOMA>/Generados/<slug>.mp4
 *
 * "Generados" is the single source of truth: nothing reaches YouTube without
 * first being generated, so the local bank only keeps Generados (by language).
 * Idempotent + resumable: never copies a file that is already there. Read-only
 * on the DB and never writes under admin/ (the convention is replicated here on
 * purpose so apps/ does not depend on admin/).
 *
 *   tsx src/sync-bank.ts          sync once
 *   DRY=1 tsx src/sync-bank.ts    report only (no download)
 *   BANK_DIR="D:\\..." override   the bank location
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const db: SupabaseClient = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
const bucket = process.env.MV_BUCKET ?? 'assets';
const BANK_DIR = process.env.BANK_DIR || 'E:\\0005. Passkal\\Canales de Youtube\\BANCO DE VIDEOS GENERAL';
const STATUS = 'Generados'; // single source of truth (see header)
const DRY = process.env.DRY === '1';

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ svc: 'sync-bank', msg, ...extra }));

/** project name -> readable bank channel (admin/BANK.md). */
function channelName(project: string): string {
  if (/zuri/i.test(project)) return 'Zuri';
  if (/caroline/i.test(project)) return 'Caroline';
  if (/faceless/i.test(project)) return 'Faceless';
  return project;
}

/** URL/Windows-safe slug that keeps unicode letters (so ZH/accented titles survive). */
function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

/** True if the slug is already banked, with OR without a "NNN - " number prefix
 *  (the bank gets numbered by number-bank.ts; don't re-copy a numbered file). */
function alreadyBanked(dir: string, file: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const re = new RegExp(`^(\\d{3,} - )?${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return fs.readdirSync(dir).some((f) => re.test(f));
}

/** Place a downloaded buffer into <Canal>/<IDIOMA>/Generados. Returns true if it wrote a new file. */
function writeToBank(channel: string, lang: string, name: string, data: Buffer): boolean {
  const L = lang.toUpperCase();
  const file = name.endsWith('.mp4') ? name : `${name}.mp4`;
  const dir = path.join(BANK_DIR, channel, L, STATUS);
  if (alreadyBanked(dir, file)) return false; // resume: already banked (numbered or not)
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), data);
  return true;
}

async function download(p: string): Promise<Buffer> {
  const { data, error } = await db.storage.from(bucket).download(p);
  if (error || !data) throw new Error(`download ${p}: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}

interface Item {
  channel: string;
  lang: string;
  name: string;
  path: string;
}

async function collect(): Promise<Item[]> {
  const items: Item[] = [];

  // Zuri / Faceless — music + faceless videos (one row per language variant).
  const { data: vls, error: e1 } = await db
    .from('mv_video_languages')
    .select('language, final_video_path, short_video_path, mv_videos!inner(title, song_title, mv_projects!inner(name))')
    .not('final_video_path', 'is', null);
  if (e1) throw new Error(`mv_video_languages: ${e1.message}`);
  for (const row of vls ?? []) {
    const v = row as any;
    const project: string = v.mv_videos?.mv_projects?.name ?? 'Unknown';
    const title: string = v.mv_videos?.song_title || v.mv_videos?.title || 'untitled';
    const channel = channelName(project);
    const slug = slugify(title);
    items.push({ channel, lang: v.language, name: slug, path: v.final_video_path });
    if (v.short_video_path) items.push({ channel, lang: v.language, name: `${slug}-short`, path: v.short_video_path });
  }

  // Caroline — songs (single ES music channel).
  const { data: songs, error: e2 } = await db
    .from('mv_songs')
    .select('title, final_path')
    .not('final_path', 'is', null);
  if (e2) throw new Error(`mv_songs: ${e2.message}`);
  for (const row of songs ?? []) {
    const s = row as any;
    items.push({ channel: 'Caroline', lang: 'es', name: slugify(s.title ?? 'untitled'), path: s.final_path });
  }

  return items;
}

async function main(): Promise<void> {
  const items = await collect();
  log('found', { count: items.length, dry: DRY, bank: BANK_DIR });
  let wrote = 0;
  let skipped = 0;
  for (const it of items) {
    if (DRY) {
      log('would-place', { ...it });
      continue;
    }
    const buf = await download(it.path);
    if (writeToBank(it.channel, it.lang, it.name, buf)) {
      wrote++;
      log('placed', { channel: it.channel, lang: it.lang, name: it.name, bytes: buf.length });
    } else {
      skipped++;
    }
  }
  log('done', { wrote, skipped, total: items.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
