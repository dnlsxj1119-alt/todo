import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// 할 일 푸시 알림 — pg_cron 이 매시 정각에 부른다 (supabase/migrations/20261007_push_cron.sql).
//
//  · 9시      : 아침 브리핑 — 오늘 🟢일정 + 남은 할 일
//  · 10~22시  : 남은 할 일이 있으면 매시간. 다 끝내면 그날은 더 안 온다(보낼 게 없으니까).
//
// '남은 할 일' = 목록 탭의 지난/어제/오늘 그룹과 같은 기준:
//   할일(+옛 '매우중요')과 카테고리 태스크 중 완료·취소가 아니고, 계획일이나 마감일이 오늘 이하.
//   완료 처리한 카테고리에 속한 것은 뺀다(목록에서도 아카이브라 안 보인다).
//
// 사용자는 한국에 있으므로 '오늘'과 시각은 한국 시간(UTC+9, 서머타임 없음)으로 계산한다.
//
// 배포: verify_jwt 를 끈다(cron 은 사용자 토큰이 없다). 대신 x-cron-secret 헤더로 막는다.
// 비밀값: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET (SUPABASE_URL / SERVICE_ROLE_KEY 는 기본 제공)
//
// 수동 테스트: body 에 { "hour": 9 } 처럼 시각을 넣으면 그 시각인 것처럼 바로 보낸다.

const BRIEFING_HOUR = 9;
const LAST_HOUR = 22;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type Todo = { title: string; priority: number; date: string | null; due: string | null };
type Schedule = { title: string; time: string; date: string; endDate: string };

function kstNow() {
  const d = new Date(Date.now() + KST_OFFSET_MS);
  return { today: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

const isArchived = (s: string | null | undefined) => s === 'done' || s === 'cancelled';
const normPrio = (v: unknown) => { const n = Number(v); return n === 1 || n === 2 || n === 3 ? n : 0; };
const onOrBefore = (d: string | null, today: string) => !!d && d <= today;

// 오늘 할 일 먼저(사용자 요청) → 그 안에서 중요도 높은 것 먼저 → 같으면 더 오래 밀린(이른 날짜) 것 먼저.
// '밀림' = 계획일·마감일 중 하나라도 오늘 전 — 목록의 지난/어제 그룹과 같은 기준.
// 알림 본문엔 3개만 보여서, 밀린 일이 앞을 차지하면 오늘 할 일이 '외 N개'에 묻혔다.
function sortTodos(list: Todo[], today: string) {
  const overdue = (t: Todo) => [t.date, t.due].some(d => d && d < today) ? 1 : 0;
  const key = (t: Todo) => [t.date, t.due].filter(Boolean).sort()[0] ?? '9999';
  return list.sort((a, b) => overdue(a) - overdue(b) || b.priority - a.priority || key(a).localeCompare(key(b)));
}

function scheduleLine(s: Schedule, today: string) {
  if (s.date !== today) return `↩ ${s.title}`;      // 어제부터 이어지는 여러 날 일정
  return s.time ? `${s.time} ${s.title}` : `종일 ${s.title}`;
}

async function loadUser(db: ReturnType<typeof createClient>, userId: string, today: string) {
  const [itemsRes, schedRes, projRes] = await Promise.all([
    db.from('items')
      .select('title, type, status, completed, priority, date, due_date, project_id')
      .eq('user_id', userId)
      .in('type', ['todo', 'education'])
      .or(`date.lte.${today},due_date.lte.${today}`),
    db.from('items')
      .select('title, status, completed, date, time, end_date')
      .eq('user_id', userId)
      .eq('type', 'schedule')
      .or(`date.eq.${today},and(date.lt.${today},end_date.gte.${today})`),
    db.from('projects')
      .select('id, tasks, force_completed')
      .eq('user_id', userId),
  ]);
  for (const r of [itemsRes, schedRes, projRes]) if (r.error) throw r.error;

  const doneCat = new Set((projRes.data ?? []).filter(p => p.force_completed).map(p => p.id));

  const todos: Todo[] = [];
  for (const it of itemsRes.data ?? []) {
    const status = it.status || (it.completed ? 'done' : 'todo');
    if (isArchived(status) || it.completed) continue;
    if (it.project_id != null && doneCat.has(it.project_id)) continue;
    todos.push({ title: it.title, priority: normPrio(it.priority), date: it.date, due: it.due_date });
  }
  for (const p of projRes.data ?? []) {
    if (p.force_completed) continue;
    for (const t of (p.tasks ?? []) as Record<string, unknown>[]) {
      if (isArchived(t.status as string)) continue;
      const date = (t.planned as string) || null;
      const due = (t.deadline as string) || null;
      if (!onOrBefore(date, today) && !onOrBefore(due, today)) continue;
      todos.push({ title: String(t.label ?? ''), priority: normPrio(t.priority), date, due });
    }
  }

  const schedules: Schedule[] = (schedRes.data ?? [])
    .filter(s => !isArchived(s.status) && !s.completed)
    .map(s => ({ title: s.title, time: s.time ?? '', date: s.date, endDate: s.end_date ?? '' }))
    // 이어지는 일정·종일 일정 먼저, 그 다음 시간순
    .sort((a, b) => (a.date === today ? a.time : '').localeCompare(b.date === today ? b.time : ''));

  return { todos: sortTodos(todos, today), schedules };
}

// 본문 순서(사용자 요청): ① 오늘 일정 ② 오늘 할 일 **전부**(중요도순) ③ 지난 할 일은 **개수만**
//   📅 10:00 회의 · 14:00 치과
//   오늘: 메일 · 운동 · 장보기 · 빨래
//   지난 할 일 3개
// 보낼 수 있는 양(약 4KB)은 넉넉하다. 접힌 알림에선 뒤가 잘리지만 펼치면 다 보인다 — 사용자가 이쪽을 골랐다.
// 매시 알림의 일정은 **아직 안 지난 것만**(종일·이어지는 일정은 계속) — 지나간 회의를 다시 알릴 필요가 없다.
// 매시 알림을 보낼지는 여전히 '남은 할 일이 있는가'로만 정한다(일정만 남았으면 안 보냄).
function buildMessage(hour: number, today: string, todos: Todo[], schedules: Schedule[]) {
  const briefing = hour === BRIEFING_HOUR;
  if (briefing ? !todos.length && !schedules.length : !todos.length) return null;

  const nowHHMM = `${String(hour).padStart(2, '0')}:00`;
  const sched = briefing
    ? schedules
    : schedules.filter(s => s.date !== today || !s.time || s.time >= nowHHMM);
  const isOverdue = (t: Todo) => [t.date, t.due].some(d => d && d < today);
  const todayTodos = todos.filter(t => !isOverdue(t));
  const overdueTodos = todos.filter(isOverdue);

  const lines: string[] = [];
  if (sched.length) lines.push('📅 ' + sched.map(s => scheduleLine(s, today)).join(' · '));
  if (todayTodos.length) lines.push('오늘: ' + todayTodos.map(t => t.title).join(' · '));
  if (overdueTodos.length) lines.push(`지난 할 일 ${overdueTodos.length}개`);

  const head = [
    sched.length ? `일정 ${sched.length}개` : null,
    todos.length ? `할 일 ${todos.length}개` : null,
  ].filter(Boolean).join(' · ');
  return { title: briefing ? `☀️ 오늘 ${head}` : `남은 ${head}`, body: lines.join('\n'), tag: 'flow-todo' };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const now = kstNow();
  const hour = Number.isInteger(body?.hour) ? body.hour : now.hour;
  if (hour < BRIEFING_HOUR || hour > LAST_HOUR) {
    return Response.json({ skipped: 'outside hours', hour });
  }

  webpush.setVapidDetails(
    'mailto:noreply@todoo-9x7.pages.dev',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: subs, error } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const result = { hour, users: byUser.size, sent: 0, removed: 0, failed: 0, nothing: 0 };

  for (const [userId, userSubs] of byUser) {
    let msg;
    try {
      const { todos, schedules } = await loadUser(db, userId, now.today);
      msg = buildMessage(hour, now.today, todos, schedules);
    } catch (e) {
      console.error('[load]', userId, e);
      result.failed += userSubs.length;
      continue;
    }
    if (!msg) { result.nothing++; continue; }

    const payload = JSON.stringify({ ...msg, url: '/' });
    for (const s of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 50, urgency: 'normal' },   // 다음 알림 전까지만 유효 — 늦게 도착한 옛 알림은 버린다
        );
        result.sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          // 앱 삭제·권한 해제 등으로 만료된 구독
          await db.from('push_subscriptions').delete().eq('id', s.id);
          result.removed++;
        } else {
          console.error('[send]', code, (e as Error).message);
          result.failed++;
        }
      }
    }
  }

  return Response.json(result);
});
