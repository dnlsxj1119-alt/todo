-- 푸시 알림 구독 (할 일 알림)
-- 새 테이블 추가만 — 기존 테이블·데이터는 건드리지 않는다.
--
-- 한 행 = (앱 계정, 브라우저 구독) 한 쌍. 기기마다 '알림 켜기'를 누르면 행이 생긴다.
-- 공유 브라우저에서 두 계정이 각각 켤 수 있도록 endpoint 단독이 아니라 (user_id, endpoint) 로 유일.
-- 서버(Edge Function push-reminders)가 보낼 때 410/404 를 받으면 그 행을 지운다(만료된 구독).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

create table if not exists public.push_subscriptions (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions own rows" on public.push_subscriptions;
create policy "push_subscriptions own rows" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
