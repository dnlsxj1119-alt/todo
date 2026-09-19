-- '목표' 탭 새 구조 (이번 달 목표 + 언젠가 꼭)
--
-- 왜 새 테이블인가:
--   기존 monthly_goals 는 달마다 리셋되는 주차×열 격자 전용 구조라 새 화면에 맞지 않는다.
--   기존 테이블과 그 안의 데이터는 **건드리지 않는다** (지우지도, 옮기지도 않는다).
--   예전 내용은 목표 탭 아래 '예전 이번달 목표 보기' 로 계속 볼 수 있다.
--
-- 타입 주의:
--   project_id 는 projects.id 가 bigint 이므로 bigint + 외래키.
--   habit_id 는 habits 테이블의 마이그레이션 파일이 없어 id 타입을 확인할 수 없으므로,
--   어떤 타입이든 담기도록 text 로 두고 코드에서 String() 비교한다 (외래키 없음).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

create table if not exists public.goals (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,

  title       text not null,
  why         text not null default '',          -- 한 줄 '왜'

  -- 'month'  = 왼쪽 카드 (이번 달 목표)
  -- 'someday'= 오른쪽 카드 (언젠가 꼭)
  kind        text not null default 'month',

  month       text not null default '',           -- kind='month' 일 때 'YYYY-MM'
  area        text not null default '',           -- 언젠가 항목 분류 (여행 / 커리어 …)
  horizon     text not null default '',           -- 언젠가 항목 기한 라벨 (올해 / 2027 …)

  -- 진행률 출처 (셋 중 하나, 없으면 current/target 직접 입력)
  project_id  bigint references public.projects(id) on delete set null,
  habit_id    text,
  target      int,                                -- 분모
  current     int not null default 0,             -- 직접 입력용 분자

  notion_url  text not null default '',
  completed_at timestamptz,                       -- 이룬 시각 (null = 진행 중)
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists goals_user_kind_idx on public.goals (user_id, kind, sort_order);

-- RLS: 5개 기존 테이블과 같은 규칙 (auth.uid() = user_id)
alter table public.goals enable row level security;

drop policy if exists "goals select own" on public.goals;
create policy "goals select own" on public.goals
  for select using (auth.uid() = user_id);

drop policy if exists "goals insert own" on public.goals;
create policy "goals insert own" on public.goals
  for insert with check (auth.uid() = user_id);

drop policy if exists "goals update own" on public.goals;
create policy "goals update own" on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goals delete own" on public.goals;
create policy "goals delete own" on public.goals
  for delete using (auth.uid() = user_id);
