-- 푸시 알림 예약 실행 — 매시 정각에 Edge Function push-reminders 를 부른다.
-- 이 파일은 Edge Function 을 배포하고 비밀값을 넣은 **뒤에** 실행한다.
--
-- 실행 전에 아래 두 곳을 바꿀 것:
--   <PROJECT_REF>   : Supabase 프로젝트 주소의 xxxx 부분 (https://xxxx.supabase.co)
--   <CRON_SECRET>   : Edge Function 비밀값 CRON_SECRET 에 넣은 것과 같은 문자열
--
-- 시간대: pg_cron 은 UTC 기준. '0 0-13 * * *' = UTC 0~13시 = 한국 9~22시 매시 정각.
-- (함수도 한국 시간으로 9~22시가 아니면 아무것도 안 보내므로, 여기 범위를 넓혀도 안전하다)
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 다시 실행해도 중복 등록되지 않게 기존 작업을 먼저 지운다
select cron.unschedule('push-reminders')
where exists (select 1 from cron.job where jobname = 'push-reminders');

select cron.schedule(
  'push-reminders',
  '0 0-13 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- 끄고 싶으면: select cron.unschedule('push-reminders');
-- 실행 기록 보기: select * from cron.job_run_details order by start_time desc limit 20;
