// 습관 집계 — 목록 탭 '오늘' 습관 줄, 월간 달력 달성률, 현황 복사가 같이 쓴다.
// 습관 데이터: { id, title, color, frequency: 'daily'|'weekday'|'weekend', completedDates: ['YYYY-MM-DD'] }
import { addDays } from './dateUtils.js';

// 그 날에 이 습관을 해야 하는지 (빈도별). useHabits 가 re-export 해서 기존 import 경로도 그대로 쓴다.
// 훅 파일은 supabase 를 끌고 와서, 순수 집계는 여기(훅과 분리)에 둔다 — node 로 단위 검증이 된다.
export function habitAppliesToDate(habit, dateStr) {
  // 쉬는 기간은 '해당 없음' — 그래서 체크 대상에서도, 🔥연속 계산에서도, 달력 달성률에서도 자연히 빠진다
  if (isHabitPausedOn(habit, dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekday') return dow >= 1 && dow <= 5;
  if (habit.frequency === 'weekend') return dow === 0 || dow === 6;
  if (habit.frequency === 'weekly') return true; // 주 N회: 아무 날이나 할 수 있다
  return false;
}

// 잠깐 쉬기 — pausedFrom ≤ 날짜 ≤ pausedUntil 이면 쉬는 날. until 이 지나면 저절로 끝난다.
export function isHabitPausedOn(habit, dateStr) {
  return !!(habit.pausedFrom && habit.pausedUntil && habit.pausedFrom <= dateStr && dateStr <= habit.pausedUntil);
}

export function isWeeklyHabit(habit) {
  return habit.frequency === 'weekly';
}

// 주 N회 습관의 그 주(월~일) 진행: { done, target, weekStart }
export function habitWeekStats(habit, dateStr) {
  const weekStart = weekStartOf(dateStr);
  const target = Math.max(1, Number(habit.weeklyTarget) || 1);
  const doneSet = new Set(habit.completedDates ?? []);
  let done = 0;
  for (let i = 0; i < 7; i++) if (doneSet.has(addDays(weekStart, i))) done++;
  return { done, target, weekStart };
}

// 🔥 주 단위 연속 — 목표를 채운 주가 몇 주째 이어지는지. 이번 주는 이미 채웠을 때만 센다
// (아직 주가 안 끝났는데 0 으로 떨어지면 억울하다). 쉬는 주(7일 전부 쉼)는 건너뛴다.
export function habitWeekStreak(habit, dateStr) {
  let ws = weekStartOf(dateStr);
  const cur = habitWeekStats(habit, ws);
  if (cur.done < cur.target) ws = addDays(ws, -7);
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const allPaused = Array.from({ length: 7 }, (_, k) => addDays(ws, k)).every(d => isHabitPausedOn(habit, d));
    if (!allPaused) {
      const st = habitWeekStats(habit, ws);
      if (st.done < st.target) break;
      streak++;
    }
    ws = addDays(ws, -7);
  }
  return streak;
}

// 칩 제목: 주 N회면 '운동 1/3' 처럼 이번 주 진행을 붙인다
export function habitChipLabel(habit, dateStr) {
  if (!isWeeklyHabit(habit)) return habit.title;
  const { done, target } = habitWeekStats(habit, dateStr);
  return `${habit.title} ${done}/${target}`;
}

// 🔥 표시용: 매일류는 '일', 주 N회는 '주'
export function habitStreakLabel(habit, dateStr) {
  if (isWeeklyHabit(habit)) {
    const n = habitWeekStreak(habit, dateStr);
    return n > 0 ? `${n}주` : '';
  }
  const n = habitStreak(habit, dateStr);
  return n > 0 ? String(n) : '';
}

// 월요일 시작 주의 첫날 (dateUtils.getWeekStart 와 같은 기준, 문자열용)
export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

// 그 날에 해당하는 습관과 그중 체크한 수. 해당 습관이 없으면 total 0.
// 습관을 만들기 전 날은 세지 않는다 (만든 날이 없는 옛 데이터는 포함) — 안 그러면 과거가 전부 0% 로 붉게 찍힌다.
// 주 N회 습관은 '그 날 안 했다'가 실패가 아니라서 날짜별 달성률에서 뺀다.
export function habitDayStats(habits, dateStr) {
  const due = (habits ?? []).filter(h => !isWeeklyHabit(h) && habitAppliesToDate(h, dateStr) && (!h.createdAt || h.createdAt <= dateStr));
  const done = due.filter(h => (h.completedDates ?? []).includes(dateStr));
  return { total: due.length, done: done.length, due, doneSet: new Set(done.map(h => h.id)) };
}

// 습관을 처음 체크한 날 — 달력 달성률은 이 날부터 찍는다. 습관을 만들어 두고 안 쓰던 기간이
// 전부 0% 로 붉게 찍히는 걸 막는다 (만든 날만으로는 부족: 미리 만들어 둔 습관이 있다). 체크가 없으면 null.
export function firstHabitCheckDate(habits) {
  let first = null;
  for (const h of habits ?? []) for (const d of h.completedDates ?? []) if (!first || d < first) first = d;
  return first;
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
