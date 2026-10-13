-- 습관: 잠깐 쉬기 + 주 N회
--   paused_from / paused_until : 쉬는 기간(둘 다 날짜). 이 기간의 날은 '해당 없음'으로 쳐서
--                                목록·주간뷰·달력 달성률·현황 복사에서 빠지고 🔥연속도 끊기지 않는다.
--                                until 이 지나면 자동으로 돌아온다. 보관(archived)과는 다르다.
--   weekly_target              : frequency = 'weekly' 일 때 주당 목표 횟수(요일 자유). 그 외엔 null.
-- 앱은 컬럼이 아직 없어도 깨지지 않는다 ('컬럼 없음' 오류면 그 필드만 빼고 다시 저장).
alter table public.habits add column if not exists paused_from date;
alter table public.habits add column if not exists paused_until date;
alter table public.habits add column if not exists weekly_target integer;
