-- ============================================================
-- 012 — mv_reels: addictive vertical Shorts (tech / music / kids).
-- Admin creates a reel (mode + topic) → status='generating' → the reels-poll
-- worker renders the retention-engineered Short (reels-render) → status='ready'
-- + video_path → published to the assigned channel by the cron. RLS ON,
-- service-role only (same model as mv_songs).
-- ============================================================

create table if not exists mv_reels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  mode text not null default 'tech' check (mode in ('tech','music','kids')),
  topic text not null,                 -- topic (tech/kids) or music mood (music)
  status text not null default 'draft'
    check (status in ('draft','generating','rendering','ready','publishing','published','failed')),
  video_path text,                     -- storage: rendered 9:16 short
  youtube_video_id text,
  channel_id uuid references mv_channels(id) on delete set null,  -- where to publish
  metadata jsonb,                      -- {title, description, tags[]}
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists mv_reels_status_idx on mv_reels (status);
alter table mv_reels enable row level security;
