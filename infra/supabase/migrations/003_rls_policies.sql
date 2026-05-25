-- ============================================================
-- Migration 003: RLS policies for multi-tenant tables
--
-- Covers the 13 tables that had RLS enabled in 001 but no
-- policies. brands (already done in 001) and trending_products
-- (public read in 001) are not touched.
--
-- Pattern: a user can access rows whose organization_id is in
-- the orgs where they are a member (via organization_members).
-- Tables without a direct organization_id resolve membership
-- through their parent (video_jobs, products, publications).
--
-- Idempotent: each policy is dropped first so this can be
-- re-applied safely.
-- ============================================================

-- ------------------------------------------------------------
-- 0) CLEANUP — remove old incomplete read/write policies
--    (these have different names than the new FOR ALL policies
--    below, so without this they would coexist as duplicates).
--    Brands policies from 001 ("members can read/write their
--    org data") and trending_products ("anyone authenticated
--    can read trending") are NOT dropped here.
-- ------------------------------------------------------------

drop policy if exists "video_jobs read" on video_jobs;
drop policy if exists "video_jobs write" on video_jobs;
drop policy if exists "products read" on products;
drop policy if exists "products write" on products;
drop policy if exists "assets read" on assets;
drop policy if exists "assets write" on assets;
drop policy if exists "voices read" on voices;
drop policy if exists "voices write" on voices;
drop policy if exists "usage_events read" on usage_events;
drop policy if exists "usage_events write" on usage_events;
drop policy if exists "tiktok_accounts read" on tiktok_accounts;
drop policy if exists "tiktok_accounts write" on tiktok_accounts;
drop policy if exists "orgs read member" on organizations;
drop policy if exists "orgs write member" on organizations;
drop policy if exists "org members read" on organization_members;
drop policy if exists "org members write" on organization_members;
drop policy if exists "brands read" on brands;
drop policy if exists "brands write" on brands;

-- ------------------------------------------------------------
-- 1) TENANCY: organizations + organization_members
-- ------------------------------------------------------------

drop policy if exists "members read own orgs" on organizations;
create policy "members read own orgs"
  on organizations for select
  to authenticated
  using (
    id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "members read own membership" on organization_members;
create policy "members read own membership"
  on organization_members for select
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2) TABLES WITH DIRECT organization_id
-- ------------------------------------------------------------

drop policy if exists "members access own org video_jobs" on video_jobs;
create policy "members access own org video_jobs"
  on video_jobs for all
  to authenticated
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "members access own org products" on products;
create policy "members access own org products"
  on products for all
  to authenticated
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "members access own org assets" on assets;
create policy "members access own org assets"
  on assets for all
  to authenticated
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "members access own org voices" on voices;
create policy "members access own org voices"
  on voices for all
  to authenticated
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "members access own org usage_events" on usage_events;
create policy "members access own org usage_events"
  on usage_events for all
  to authenticated
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "members access own org tiktok_accounts" on tiktok_accounts;
create policy "members access own org tiktok_accounts"
  on tiktok_accounts for all
  to authenticated
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 3) TABLES INDIRECT via video_jobs.organization_id (job_id)
-- ------------------------------------------------------------

drop policy if exists "members access own org scripts" on scripts;
create policy "members access own org scripts"
  on scripts for all
  to authenticated
  using (
    job_id in (
      select id from video_jobs
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  )
  with check (
    job_id in (
      select id from video_jobs
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  );

drop policy if exists "members access own org shot_lists" on shot_lists;
create policy "members access own org shot_lists"
  on shot_lists for all
  to authenticated
  using (
    job_id in (
      select id from video_jobs
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  )
  with check (
    job_id in (
      select id from video_jobs
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  );

drop policy if exists "members access own org publications" on publications;
create policy "members access own org publications"
  on publications for all
  to authenticated
  using (
    job_id in (
      select id from video_jobs
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  )
  with check (
    job_id in (
      select id from video_jobs
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- 4) TABLES INDIRECT 2-hop: metrics -> publications -> video_jobs
-- ------------------------------------------------------------

drop policy if exists "members access own org metrics" on metrics;
create policy "members access own org metrics"
  on metrics for all
  to authenticated
  using (
    publication_id in (
      select id from publications
      where job_id in (
        select id from video_jobs
        where organization_id in (
          select organization_id from organization_members
          where user_id = auth.uid()
        )
      )
    )
  )
  with check (
    publication_id in (
      select id from publications
      where job_id in (
        select id from video_jobs
        where organization_id in (
          select organization_id from organization_members
          where user_id = auth.uid()
        )
      )
    )
  );

-- ------------------------------------------------------------
-- 5) TABLES INDIRECT via products.organization_id (product_id)
-- ------------------------------------------------------------

drop policy if exists "members access own org competitor_videos" on competitor_videos;
create policy "members access own org competitor_videos"
  on competitor_videos for all
  to authenticated
  using (
    product_id in (
      select id from products
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  )
  with check (
    product_id in (
      select id from products
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- 6) PROFILES — each user only accesses their own profile
-- ------------------------------------------------------------

alter table profiles enable row level security;

drop policy if exists "users read own profile" on profiles;
create policy "users read own profile"
  on profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile"
  on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "users insert own profile" on profiles;
create policy "users insert own profile"
  on profiles for insert to authenticated
  with check (id = auth.uid());
