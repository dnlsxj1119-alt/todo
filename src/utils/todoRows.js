import { toDateString, addDays } from './dateUtils';
import { getProjectType } from './projectTypes';

// 목록 탭과 달력·주간의 '할일 패널'이 **같은 기준**으로 할일을 나누려고 한곳에 모았다.
// (예전엔 목록의 '미정'과 주간의 '백로그'가 따로 계산돼, 같은 할일인데 화면마다 다른 묶음으로 보였다)

export function catColor(p) {
  return p.color || getProjectType(p.type).border;
}

// 카테고리 완료는 '완료 처리' 버튼으로만 결정 (태스크 진행률과 무관)
export function catDone(p) {
  return !!p.forceCompleted;
}

export function catOf(p) {
  return { id: p.id, name: p.title, color: catColor(p) };
}

// 완료·취소는 '끝난 것'이라 활성 목록에서 빠지고 보관 탭에서만 보인다.
// 둘의 차이는 완료만 '최근 완료'·통계에 들어간다는 점.
export const isArchived = (status) => status === 'done' || status === 'cancelled';

// 중요도는 1(낮음)/2(보통)/3(높음)만 유효하고 그 외는 '없음'.
// 옛 '우선순위' 시절의 다른 척도 값(4 이상 등)이 남아 있으면 PRIO[4] 가 undefined 라
// 막대가 투명해져 '중요도 없음'처럼 보이는데, 정렬에서는 높음(3)보다 위로 올라갔다.
// 화면·정렬에서만 정규화한다 (DB 값은 그대로 둠 — 사용자가 다시 고르면 정상 값으로 저장됨).
export function normPrio(v) {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? n : 0;
}

export function mdLabel(s) {
  const [, m, d] = s.split('-');
  return `${+m}/${+d}`;
}

// 오늘/어제/내일/주말 기준 날짜. 모듈 로드 시점에 한 번만 계산하면
// 앱을 켜둔 채 자정을 넘겼을 때 '오늘' 그룹이 어제 날짜로 남는다 → 매번 다시 계산한다.
function endOfWeekStr() {
  const d = new Date();
  const fromMon = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + (6 - fromMon));
  return toDateString(d);
}

export function computeDayKeys() {
  const today = toDateString(new Date());
  return {
    today,
    tomorrow: addDays(today, 1),
    yesterday: addDays(today, -1),
    eow: endOfWeekStr(),
  };
}

// 달력 항목(items 중 할일)과 프로젝트 태스크를 하나의 행 목록으로 합친다.
export function buildRows(items, projects) {
  const rows = [];
  const projById = {};
  projects.forEach(p => { projById[p.id] = p; });

  items
    .filter(it => it.type === 'todo' || it.type === 'education')
    .forEach(it => {
      const status = it.status || (it.completed ? 'done' : 'todo');
      const p = it.projectId ? projById[it.projectId] : null;
      rows.push({
        key: `i-${it.id}`,
        kind: 'item',
        raw: it,
        title: it.title,
        cat: p ? catOf(p) : null,
        expected: it.date || null,
        due: it.dueDate || null,
        time: it.time || null,
        status,
        priority: normPrio(it.priority),
        sortOrder: it.sortOrder ?? null,
        completedAt: it.completedAt ?? null,
      });
    });

  projects.forEach(p => {
    (p.tasks ?? []).forEach(t => {
      rows.push({
        key: `p-${t.id}`,
        kind: 'task',
        raw: { project: p, task: t },
        title: t.label,
        cat: catOf(p),
        expected: t.planned || null,
        due: t.deadline || null,
        time: null,
        status: t.status === 'done' ? 'done'
          : t.status === 'cancelled' ? 'cancelled'
          : t.status === 'in_progress' ? 'doing' : 'todo',
        priority: normPrio(t.priority),
        sortOrder: null,
        completedAt: t.completedAt ?? null,
      });
    });
  });

  return rows;
}

export function dateBucket(r, { today, tomorrow, yesterday, eow }) {
  if (!isArchived(r.status)) {
    const past = [r.due, r.expected].filter(d => d && d < today).sort();
    if (past.length) return past[past.length - 1] === yesterday ? 'yesterday' : 'overdue';
  }
  if (r.expected === today || r.due === today) return 'today';
  if (r.expected === tomorrow || r.due === tomorrow) return 'tomorrow';
  // 계획일이 없어도 마감일이 있으면 '미정'이 아니다.
  // 예전엔 '자소서 14일 마감'처럼 마감일만 적은 항목이 맨 아래 미정에 묻혀서 기한을 못 봤다.
  if (!r.expected) {
    if (!r.due) return 'unplanned';
    return r.due <= eow ? 'week' : 'later';
  }
  if (r.expected <= eow) return 'week';
  return 'later';
}

// 그룹 안 정렬: 끝난 것은 뒤 → 중요도(높음→낮음) → 날짜(빠른 것 먼저).
// 완전히 같은 조건이면 Array.sort 가 안정 정렬이라 만든 순서가 유지된다.
export function compareRows(a, b) {
  if (isArchived(a.status) !== isArchived(b.status)) return isArchived(a.status) ? 1 : -1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  const da = a.expected || a.due || '9999-99-99';
  const db = b.expected || b.due || '9999-99-99';
  return da < db ? -1 : da > db ? 1 : 0;
}

// 프로젝트 태스크를 하나씩 저장하면 저장할 때마다 태스크 배열 전체를 같은(낡은) 값으로
// 덮어써서 마지막 하나만 반영된다 → 카테고리별로 모아 한 번에 반영한다.
export function patchTasksBulk(taskRows, patchOf, onSaveProject) {
  const byProject = new Map();
  taskRows.forEach(r => {
    const p = r.raw.project;
    if (!byProject.has(p.id)) byProject.set(p.id, { project: p, ids: new Set() });
    byProject.get(p.id).ids.add(r.raw.task.id);
  });
  byProject.forEach(({ project, ids }) => {
    const tasks = (project.tasks ?? []).map(t => (ids.has(t.id) ? { ...t, ...patchOf(t) } : t));
    onSaveProject(project.id, { ...project, tasks });
  });
}

// 계획일을 지워 '미정'으로 보낸다.
// 마감일은 이미 지난 것만 지운다 — 아직 안 지난 마감일(예: 자소서 14일 마감)까지 지우면
// 사용자가 적어 둔 기한이 조용히 사라진다. 그런 항목은 마감일 기준 그룹으로 옮겨 간다.
export function clearOverdueRows(list, today, { onUpdateItem, onSaveProject }) {
  if (!list.length) return;
  const keepDue = list.filter(r => r.due && r.due >= today).length;
  const note = keepDue > 0
    ? `\n(아직 안 지난 마감일 ${keepDue}개는 그대로 둬서, 그 항목은 마감일 그룹으로 옮겨져요)`
    : '\n(항목은 그대로 남아요)';
  if (!window.confirm(`지난 항목 ${list.length}개의 계획일을 지울까요?${note}`)) return;
  list.filter(r => r.kind === 'item').forEach(r => {
    const patch = { date: '' };
    if (r.due && r.due < today) patch.dueDate = '';
    onUpdateItem(r.raw.id, patch);
  });
  patchTasksBulk(list.filter(r => r.kind === 'task'), t => (
    t.deadline && t.deadline < today ? { planned: '', deadline: '' } : { planned: '' }
  ), onSaveProject);
}

// 지난/어제 항목을 오늘로 다시 잡기.
// 마감일이 지난 채로 남으면 그룹 분류상 계속 '지난'에 남으므로,
// 이미 지나간 마감일만 오늘로 맞춘다 (아직 안 지난 마감일은 그대로 둔다).
export function moveOverdueRowsToToday(list, today, { onUpdateItem, onSaveProject }) {
  if (!list.length) return;
  const pastDue = list.filter(r => r.due && r.due < today).length;
  const note = pastDue > 0
    ? `\n(계획일을 오늘로 옮기고, 이미 지난 마감일 ${pastDue}개도 오늘로 맞춥니다)`
    : '\n(계획일만 오늘로 옮기고 마감일은 그대로 둡니다)';
  if (!window.confirm(`지난 항목 ${list.length}개를 오늘로 옮길까요?${note}`)) return;
  list.filter(r => r.kind === 'item').forEach(r => {
    const patch = { date: today };
    if (r.due && r.due < today) patch.dueDate = today;
    onUpdateItem(r.raw.id, patch);
  });
  patchTasksBulk(list.filter(r => r.kind === 'task'), t => (
    t.deadline && t.deadline < today
      ? { planned: today, deadline: today }
      : { planned: today }
  ), onSaveProject);
}
