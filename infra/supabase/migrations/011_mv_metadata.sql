-- ============================================================
-- 011 — Per-language YouTube metadata for Zuri/Faceless videos.
-- The render pollers now generate algorithm-tuned metadata (title/description/
-- tags/chapters) per language at render time (METADATA_STRATEGY.md) and store it
-- here; the publisher (cron) reads + applies it. Caroline already has
-- mv_songs.metadata (010); this brings mv_video_languages to parity.
-- Idempotent. RLS already enabled on the table.
-- ============================================================

alter table mv_video_languages add column if not exists metadata jsonb;
