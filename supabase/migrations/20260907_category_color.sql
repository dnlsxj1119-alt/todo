-- 카테고리(projects)에 자유 색상 컬럼 추가
-- 기존엔 종류(type)로만 색이 정해졌는데, 독립적인 색을 쓰도록 함
-- nullable → 비어있으면 코드가 종류 기반 기존 색으로 폴백
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

alter table public.projects add column if not exists color text;
