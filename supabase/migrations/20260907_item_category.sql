-- 달력 할일(items)을 카테고리(= projects)에 연결
-- 카테고리는 기존 projects 테이블을 그대로 활용 (이름/색/완료처리 이미 있음)
-- projects.id 가 bigint 이므로 project_id 도 bigint
-- 컬럼 1개만 추가, nullable → 기존 데이터/코드 영향 없음
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

alter table public.items
  add column if not exists project_id bigint
  references public.projects(id) on delete set null;
