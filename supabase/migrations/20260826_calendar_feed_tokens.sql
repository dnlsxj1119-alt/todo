-- 외부 캘린더 구독(ICS 피드)용 시크릿 토큰 테이블.
-- 기존 테이블은 건드리지 않는 순수 추가 마이그레이션.
-- 유저당 토큰 1개 (user_id PK). 재발급 = upsert로 토큰 교체 → 이전 URL 즉시 무효화.

create table if not exists public.calendar_feed_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.calendar_feed_tokens enable row level security;

create policy "Users can view own feed token"
  on public.calendar_feed_tokens for select
  using (auth.uid() = user_id);

create policy "Users can create own feed token"
  on public.calendar_feed_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update own feed token"
  on public.calendar_feed_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own feed token"
  on public.calendar_feed_tokens for delete
  using (auth.uid() = user_id);
