-- 💼 면접 준비 탭 — 체크리스트 전용 새 테이블
--
-- 왜 새 테이블인가:
--   items(할일)에 섞으면 목록·달력에 100개 가까운 줄이 쏟아진다. 면접 준비는
--   섹션 > 소제목 > 항목 구조라 할일과 모양이 다르고, 면접이 끝나면 통째로 치울 수 있게 분리한다.
--   기존 테이블(items, projects, habits, goals …)과 그 데이터는 **건드리지 않는다**.
--
-- 초기 데이터(seed)는 SQL 로 넣지 않는다 — 앱이 테이블이 비어 있으면
-- src/data/interviewChecklistSeed.js 를 한 번 insert 한다 (계정 ID 를 SQL 에 적을 필요가 없다).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

create table if not exists public.interview_checklist (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  section     text not null,               -- 예: '1. 직무면접 공부' (앞 번호로 정렬)
  grp         text not null default '',    -- 소제목, 없으면 ''
  label       text not null,
  optional    boolean not null default false,  -- '(선택)' 항목 = 우선순위 낮음, 흐리게 표시
  done        boolean not null default false,
  done_at     timestamptz,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists interview_checklist_user_idx
  on public.interview_checklist (user_id, section, sort_order);

-- RLS: 기존 테이블과 같은 규칙 (auth.uid() = user_id)
alter table public.interview_checklist enable row level security;

drop policy if exists "own rows select" on public.interview_checklist;
create policy "own rows select" on public.interview_checklist
  for select using (auth.uid() = user_id);

drop policy if exists "own rows insert" on public.interview_checklist;
create policy "own rows insert" on public.interview_checklist
  for insert with check (auth.uid() = user_id);

drop policy if exists "own rows update" on public.interview_checklist;
create policy "own rows update" on public.interview_checklist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows delete" on public.interview_checklist;
create policy "own rows delete" on public.interview_checklist
  for delete using (auth.uid() = user_id);
