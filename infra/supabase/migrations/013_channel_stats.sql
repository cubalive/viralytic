-- ============================================================
-- 013 — mv_channel_stats: rendimiento por video de TODOS los canales
-- (faceless del admin + viralytic), recolectado desde YouTube Data API por
-- `admin/scripts/collect-stats.ts`. Es el "puente de métricas" que unifica el
-- dashboard sin migrar la publicación, y la base para la auto-optimización
-- (decidir qué temas/prompts repetir según vistas). Upsert por video_id.
-- RLS ON, service-role only (igual que mv_songs). Idempotente.
-- ============================================================

create table if not exists mv_channel_stats (
  video_id text primary key,                 -- YouTube videoId
  organization_id uuid references organizations(id) on delete cascade,
  channel_key text not null,                 -- slot admin ('wealth','kat-en','signal','sabikids-es'…) o mv_channels.id
  channel_name text not null,                -- nombre legible (World Wealth Mindset…)
  language text,
  title text,
  pillar text,                               -- tema/categoría si se conoce
  published_at timestamptz,
  views bigint default 0,
  likes bigint default 0,
  comments bigint default 0,
  collected_at timestamptz default now()
);

create index if not exists mv_channel_stats_channel_idx on mv_channel_stats (channel_name);
create index if not exists mv_channel_stats_views_idx on mv_channel_stats (views desc);
alter table mv_channel_stats enable row level security;
