-- 푸시 알림 예약을 매시 정각 → **10분마다** 로 바꾼다 (시간 정한 할일·일정 30분 전 ⏰ 알림용).
-- 20261007_push_cron.sql 과 같은 작업 이름(push-reminders)을 다시 등록하므로 그 파일 대신 이걸 실행한다.
-- Edge Function push-reminders 의 새 코드를 먼저 붙여넣어 배포한 **뒤에** 실행할 것
-- (옛 코드는 정각이 아니면 'outside hours' 로 아무것도 안 하므로 순서가 바뀌어도 사고는 없다).
--
-- 실행 전에 아래 두 곳을 바꿀 것 (20261007 파일에 넣었던 값과 같다):
--   <PROJECT_REF>   : Supabase 프로젝트 주소의 xxxx 부분 (https://xxxx.supabase.co)
--   <CRON_SECRET>   : Edge Function 비밀값 CRON_SECRET
--
-- 하루 종일 돈다(UTC 전체) — 아침 8시 할일의 7:30 알림은 UTC 22:30 이라 시간대 제한을 둘 수 없다.
-- 매시 알림은 함수 안에서 한국 시간 9~22시 정각일 때만 보내므로 그대로다.
-- 한 달 약 4,300회 호출 — Supabase 무료 한도(50만) 안에서 넉넉하다.

select cron.unschedule('push-reminders')
where exists (select 1 from cron.job where jobname = 'push-reminders');

select cron.schedule(
  'push-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- 실행 기록 보기: select * from cron.job_run_details order by start_time desc limit 20;
