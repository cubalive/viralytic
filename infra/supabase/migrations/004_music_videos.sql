-- ============================================================
-- 004 — Music Video Creator (admin-only engine)
--
-- A separate pipeline from the TikTok product-video flow. Every
-- table is prefixed mv_ and RLS-locked with NO policies, so only
-- the server-side service role — reached behind the admin gate —
-- can read/write. 3 programs × 3 languages (es/en/zh) per program.
-- ============================================================

create table mv_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  protagonist text,
  status text not null default 'draft'
    check (status in ('draft','active','paused','archived')),
  scenario_bible jsonb,                 -- canon of the fixed stage/scenario
  style_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table mv_characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mv_projects(id) on delete cascade,
  name text not null,
  role text not null default 'protagonist'
    check (role in ('protagonist','subcharacter')),
  dna jsonb,                            -- the character DNA you provide
  bible jsonb,                          -- generated canon bible
  canon_photos text[],                  -- storage paths of official canon photos
  created_at timestamptz default now()
);

create table mv_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mv_projects(id) on delete cascade,
  language text not null check (language in ('es','en','zh')),
  youtube_channel_id text,
  youtube_handle text,
  created_at timestamptz default now(),
  unique (project_id, language)
);

create table mv_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mv_projects(id) on delete cascade,
  type text not null check (type in (
    'intro_image','outro_image','intro_audio','outro_audio','canon_photo',
    'music','vocal_stem','image','veo_clip','lipsync_clip','final_video','srt','thumbnail'
  )),
  storage_path text,
  public_url text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table mv_videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references mv_projects(id) on delete cascade,
  title text not null,
  song_title text,
  status text not null default 'draft' check (status in (
    'draft','scripting','generating','rendering','assembling','ready','scheduled','published','failed'
  )),  -- 'rendering' is a transient claim state set by the mv-render worker
  duration_seconds numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One row per language variant of a video (es/en/zh).
create table mv_video_languages (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references mv_videos(id) on delete cascade,
  language text not null check (language in ('es','en','zh')),
  channel_id uuid references mv_channels(id) on delete set null,
  lyrics text,
  music_url text,                       -- full mix (Suno)
  vocal_stem_url text,                  -- vocals only, for caption alignment
  srt_path text,                        -- generated .srt in storage
  final_video_path text,
  youtube_video_id text,
  status text not null default 'draft' check (status in (
    'draft','captioned','rendered','scheduled','published','failed'
  )),
  created_at timestamptz default now(),
  unique (video_id, language)
);

create table mv_scenes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references mv_videos(id) on delete cascade,
  ordinal int not null,
  camera_position text,                 -- from the fixed shot library
  is_closeup boolean default false,     -- closeups get the lip-sync pass
  prompt text,
  image_path text,
  veo_clip_path text,
  lipsync_clip_path text,
  start_seconds numeric,
  duration_seconds numeric,
  created_at timestamptz default now()
);

create table mv_schedule (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references mv_projects(id) on delete cascade,
  video_language_id uuid references mv_video_languages(id) on delete cascade,
  language text check (language in ('es','en','zh')),
  publish_at timestamptz not null,
  status text not null default 'planned'
    check (status in ('planned','scheduled','published','skipped')),
  notes text,
  created_at timestamptz default now()
);

create index on mv_projects (organization_id);
create index on mv_characters (project_id);
create index on mv_assets (project_id, type);
create index on mv_videos (project_id, status);
create index on mv_video_languages (video_id);
create index on mv_scenes (video_id, ordinal);
create index on mv_schedule (organization_id, publish_at);

-- Lock down: RLS on, no policies → only the service role (server-side,
-- behind the admin gate) may touch these tables.
alter table mv_projects        enable row level security;
alter table mv_characters      enable row level security;
alter table mv_channels        enable row level security;
alter table mv_assets          enable row level security;
alter table mv_videos          enable row level security;
alter table mv_video_languages enable row level security;
alter table mv_scenes          enable row level security;
alter table mv_schedule        enable row level security;
