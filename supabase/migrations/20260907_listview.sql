-- 통합 목록 뷰(ListView)용 컬럼 추가
-- 전부 nullable / default 있음 → 기존 데이터와 기존 코드에 영향 없음 (추가 전용)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

alter table public.items add column if not exists due_date  date;
alter table public.items add column if not exists priority  smallint not null default 0;  -- 0 없음 · 1 낮음 · 2 보통 · 3 높음
alter table public.items add column if not exists status    text     not null default 'todo'; -- todo · doing · done

-- 이미 완료 처리된 항목은 status 도 done 으로 맞춰줌
update public.items
   set status = 'done'
 where completed = true
   and status <> 'done';
