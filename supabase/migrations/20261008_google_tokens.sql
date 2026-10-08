-- 구글 캘린더 refresh token 을 서버에 저장 (기기마다 따로 연동하지 않아도 되게)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- 본인 행만 읽고 쓸 수 있게 RLS 를 건다. (개인용 앱이라 평문 저장. 서비스 키로만 전체 조회 가능)

create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

drop policy if exists "own google token select" on public.google_tokens;
drop policy if exists "own google token insert" on public.google_tokens;
drop policy if exists "own google token update" on public.google_tokens;
drop policy if exists "own google token delete" on public.google_tokens;

create policy "own google token select" on public.google_tokens
  for select using (auth.uid() = user_id);
create policy "own google token insert" on public.google_tokens
  for insert with check (auth.uid() = user_id);
create policy "own google token update" on public.google_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own google token delete" on public.google_tokens
  for delete using (auth.uid() = user_id);
