-- 완료를 '언제' 눌렀는지 기록할 컬럼
-- 지금까지는 status='done' 이라는 사실만 남아서, 최근에 무엇을 끝냈는지 알 수 없었다.
-- 컬럼 1개만 추가 · nullable · default 없음 → 기존 데이터/코드에 영향 없음 (추가 전용)
-- 이미 완료된 항목은 누른 시각을 알 방법이 없으므로 비워 둔다 (임의 값을 채우지 않음)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

alter table public.items add column if not exists completed_at timestamptz;
