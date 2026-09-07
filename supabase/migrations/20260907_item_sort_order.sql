-- 목록에서 할일(items) 수동 순서(드래그)를 저장할 컬럼
-- nullable → 비어있으면 코드가 중요도 → 날짜 순 기존 정렬로 폴백
-- 드래그로 한 번 순서를 바꾸면 해당 그룹 항목에 0,1,2… 값이 채워짐
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

alter table public.items add column if not exists sort_order double precision;
