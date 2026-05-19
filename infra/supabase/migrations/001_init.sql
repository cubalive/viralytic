-- ============================================================
-- Viralytic - Schema multi-tenant para SaaS
-- Postgres + Supabase + pgvector
-- ============================================================

create extension if not exists "vector";
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. TENANCY (organizaciones / workspaces)
-- ============================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'free' check (plan in ('free','pro','agency','enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  monthly_video_quota int default 3,
  videos_used_this_month int default 0,
  quota_resets_at timestamptz default (now() + interval '1 month'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table organization_members (
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz default now(),
  primary key (organization_id, user_id)
);

-- ============================================================
-- 2. CONFIGURACIÓN POR ORG: marcas, voces, cuentas de TikTok
-- ============================================================

create table brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  tone text,                          -- "friendly", "expert", "edgy"
  target_audience text,
  unique_selling_points text[],
  forbidden_words text[],
  brand_colors jsonb,
  language text default 'es',
  created_at timestamptz default now()
);

create table voices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  name text not null,
  elevenlabs_voice_id text not null,
  language text default 'es',
  default_stability numeric default 0.5,
  default_similarity numeric default 0.75,
  default_style numeric default 0.3,
  created_at timestamptz default now()
);

create table tiktok_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tiktok_user_id text,
  username text,
  display_name text,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  expires_at timestamptz,
  scopes text[],
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- 3. INTELIGENCIA DE PRODUCTO
-- ============================================================

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_url text not null,
  source_platform text,               -- tiktok_shop, amazon, shopify, aliexpress
  title text,
  price numeric,
  currency text default 'USD',
  description text,
  features jsonb,
  pain_points jsonb,                  -- extraído de reseñas reales
  positive_reviews jsonb,
  images text[],
  scraped_at timestamptz,
  created_at timestamptz default now()
);

create table competitor_videos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  tiktok_url text,
  thumbnail_url text,
  hook_text text,
  transcript text,
  duration_seconds int,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  framework_detected text,
  hook_type text,                     -- pattern_interrupt, curiosity_gap, callout, shock
  embedding vector(1536),             -- para búsqueda semántica
  analyzed_at timestamptz default now()
);

-- ============================================================
-- 4. JOBS DE VIDEO (entidad central del pipeline)
-- ============================================================

create table video_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references profiles(id),
  product_id uuid references products(id),
  brand_id uuid references brands(id),
  voice_id uuid references voices(id),
  mode text not null check (mode in ('ai_full','user_filmed','hybrid')),
  status text not null default 'pending'
    check (status in ('pending','analyzing','scripting','awaiting_script_selection',
                      'voicing','visualizing','awaiting_clips','assembling',
                      'ready','scheduled','posted','failed','cancelled')),
  current_step text,
  progress int default 0,
  error_message text,
  total_cost_cents int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on video_jobs (organization_id, status);
create index on video_jobs (created_at desc);

-- ============================================================
-- 5. SCRIPTS (con embedding para aprendizaje)
-- ============================================================

create table scripts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references video_jobs(id) on delete cascade,
  variant int not null,
  framework text,                     -- AIDA, PAS, BAB, Hook-Story-Offer
  hook text,
  body text,
  cta text,
  full_text text not null,
  emotion_tags text[],
  estimated_duration_seconds numeric,
  visual_cues jsonb,                  -- timestamps con tipo de toma
  selected boolean default false,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- ============================================================
-- 6. ASSETS GENERADOS Y SUBIDOS POR EL USUARIO
-- ============================================================

create table assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid references video_jobs(id) on delete cascade,
  type text not null check (type in
    ('voice_audio','ai_image','ai_video','user_clip','user_photo','final_video','thumbnail')),
  provider text,                      -- elevenlabs, fal, revid, user_upload
  storage_path text not null,         -- Supabase Storage path
  public_url text,
  mime_type text,
  width int,
  height int,
  duration_seconds numeric,
  metadata jsonb,
  created_at timestamptz default now()
);

create table shot_lists (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references video_jobs(id) on delete cascade,
  shots jsonb not null,               -- [{order,description,angle,duration,lighting,dialogue,b_roll}]
  total_duration_seconds numeric,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- 7. PUBLICACIÓN Y MÉTRICAS (bucle de aprendizaje)
-- ============================================================

create table publications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references video_jobs(id) on delete cascade,
  tiktok_account_id uuid references tiktok_accounts(id),
  caption text,
  hashtags text[],
  scheduled_at timestamptz,
  posted_at timestamptz,
  tiktok_post_id text,
  tiktok_post_url text,
  status text default 'draft'
    check (status in ('draft','scheduled','posting','posted','failed')),
  error_message text,
  created_at timestamptz default now()
);

create table metrics (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  views bigint default 0,
  likes bigint default 0,
  comments bigint default 0,
  shares bigint default 0,
  saves bigint default 0,
  watch_time_avg_seconds numeric,
  completion_rate numeric,
  ctr numeric,
  conversions int default 0,
  revenue_cents int default 0,
  recorded_at timestamptz default now()
);

create index on metrics (publication_id, recorded_at desc);

-- ============================================================
-- 8. BILLING Y USAGE (medición para SaaS)
-- ============================================================

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid references video_jobs(id),
  type text not null,                 -- video_generated, voice_chars, fal_image, revid_seconds
  quantity numeric not null,
  cost_cents int default 0,
  created_at timestamptz default now()
);

create index on usage_events (organization_id, created_at desc);

-- ============================================================
-- 9. ROW LEVEL SECURITY (aislamiento entre tenants)
-- ============================================================

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table brands enable row level security;
alter table voices enable row level security;
alter table tiktok_accounts enable row level security;
alter table products enable row level security;
alter table competitor_videos enable row level security;
alter table video_jobs enable row level security;
alter table scripts enable row level security;
alter table assets enable row level security;
alter table shot_lists enable row level security;
alter table publications enable row level security;
alter table metrics enable row level security;
alter table usage_events enable row level security;

-- Helper: ¿el usuario actual pertenece a esta org?
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

-- Policy template: aplicar a todas las tablas con organization_id
create policy "members can read their org data" on brands
  for select using (is_org_member(organization_id));
create policy "members can write their org data" on brands
  for all using (is_org_member(organization_id));

-- Repetir el mismo patrón para: voices, tiktok_accounts, products,
-- competitor_videos, video_jobs, assets, publications, usage_events
-- (Se genera automáticamente con un script en la fase de setup)

-- ============================================================
-- 10. TRIGGERS Y FUNCIONES
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_orgs_updated before update on organizations
  for each row execute function public.touch_updated_at();
create trigger trg_jobs_updated before update on video_jobs
  for each row execute function public.touch_updated_at();

-- Crear automáticamente perfil + org al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare new_org_id uuid;
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');

  insert into organizations (name, slug)
  values (coalesce(new.raw_user_meta_data->>'full_name','My Workspace'),
          'org-' || substr(new.id::text, 1, 8))
  returning id into new_org_id;

  insert into organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 11. TRENDING PRODUCTS CACHE (global, refreshed by cron)
-- ============================================================

create table if not exists trending_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  source text not null,
  thumbnail_url text,
  product_url text,
  estimated_price numeric,
  virality_score numeric not null,
  growth_rate_7d numeric,
  competition_level text,
  top_video_urls text[],
  region text not null,
  language text not null,
  discovered_at timestamptz default now(),
  unique (title, region)
);
create index if not exists idx_trending_score on trending_products (region, language, virality_score desc);

-- This table is public (read-only for all members)
alter table trending_products enable row level security;
create policy "anyone authenticated can read trending" on trending_products
  for select to authenticated using (true);
