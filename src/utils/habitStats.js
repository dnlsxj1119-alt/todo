// 습관 집계 — 목록 탭 '오늘' 습관 줄, 월간 달력 달성률, 현황 복사가 같이 쓴다.
// 습관 데이터: { id, title, color, frequency: 'daily'|'weekday'|'weekend', completedDates: ['YYYY-MM-DD'] }
import { addDays } from './dateUtils.js';

// 그 날에 이 습관을 해야 하는지 (빈도별). useHabits 가 re-export 해서 기존 import 경로도 그대로 쓴다.
// 훅 파일은 supabase 를 끌고 와서, 순수 집계는 여기(훅과 분리)에 둔다 — node 로 단위 검증이 된다.
export function habitAppliesToDate(habit, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekday') return dow >= 1 && dow <= 5;
  if (habit.frequency === 'weekend') return dow === 0 || dow === 6;
  return false;
}

// 그 날에 해당하는 습관과 그중 체크한 수. 해당 습관이 없으면 total 0.
// 습관을 만들기 전 날은 세지 않는다 (만든 날이 없는 옛 데이터는 포함) — 안 그러면 과거가 전부 0% 로 붉게 찍힌다.
export function habitDayStats(habits, dateStr) {
  const due = (habits ?? []).filter(h => habitAppliesToDate(h, dateStr) && (!h.createdAt || h.createdAt <= dateStr));
  const done = due.filter(h => (h.completedDates ?? []).includes(dateStr));
  return { total: due.length, done: done.length, due, doneSet: new Set(done.map(h => h.id)) };
}

// 🔥 연속 일수 — 그 날(dateStr)부터 거슬러 올라가며 '해당하는 날'을 빠짐없이 체크한 수.
// 해당하지 않는 날(평일 습관의 주말 등)은 끊김으로 치지 않고 건너뛴다.
// 오늘 아직 안 했으면 오늘은 빼고 어제까지로 센다 (아직 하루가 안 끝났는데 0으로 떨어지면 억울하다).
export function habitStreak(habit, dateStr) {
  const doneSet = new Set(habit.completedDates ?? []);
  let d = dateStr;
  if (habitAppliesToDate(habit, d) && !doneSet.has(d)) d = addDays(d, -1);
  let streak = 0;
  // 해당 안 하는 날을 건너뛰어도 끝나게 400일에서 멈춘다 (1년 넘는 연속은 그 이상 셀 필요가 없다)
  for (let i = 0; i < 400; i++) {
    if (habitAppliesToDate(habit, d)) {
      if (!doneSet.has(d)) break;
      streak++;
    }
    d = addDays(d, -1);
  }
  return streak;
}

// 최근 N일(오늘 포함) 동안 해당 날 수와 체크한 수 — 현황 복사용
export function habitRecentStats(habit, todayStr, days = 7) {
  let total = 0;
  let done = 0;
  const doneSet = new Set(habit.completedDates ?? []);
  for (let i = 0; i < days; i++) {
    const d = addDays(todayStr, -i);
    if (!habitAppliesToDate(habit, d)) continue;
    total++;
    if (doneSet.has(d)) done++;
  }
  return { total, done };
}
