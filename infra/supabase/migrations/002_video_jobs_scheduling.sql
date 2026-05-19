-- Migration 002: scheduling + tiktok account on video_jobs
alter table video_jobs
  add column if not exists scheduled_for timestamptz,
  add column if not exists tiktok_account_id uuid references tiktok_accounts(id) on delete set null;

create index if not exists idx_video_jobs_scheduled
  on video_jobs (scheduled_for)
  where scheduled_for is not null;
