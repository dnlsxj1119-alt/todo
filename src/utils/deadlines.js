// 날짜 -> 그 날 마감인 것들. 달력·주간뷰의 마감 칩에 쓴다.
// items 를 같이 넘기면 **할일의 마감일(dueDate)** 도 포함한다 —
// 예전엔 카테고리·태스크 마감만 담아서, '계획일 10/6 · 마감일 10/8' 할일이
// 달력에 6일 하루만 뜨고 8일엔 아무 표시가 없었다.
export function buildDeadlineMap(projects, items) {
  const map = {};
  const add = (date, entry) => {
    if (!date) return;
    if (!map[date]) map[date] = [];
    map[date].push(entry);
  };
  (projects ?? []).forEach(p => {
    // 카테고리를 '완료 처리'했거나 태스크가 전부 끝났으면 마감 칩도 완료로 표시
    const isCompleted = !!p.forceCompleted || (p.tasks?.length > 0 && p.tasks.every(t => t.status === 'done'));
    if (p.deadline) {
      add(p.deadline, { key: `proj-${p.id}`, type: 'project', project: p, title: p.title, done: isCompleted });
    }
    (p.tasks ?? []).forEach(t => {
      if (t.deadline) {
        add(t.deadline, { key: `task-${t.id}`, type: 'task', project: p, title: `${t.label}(${p.title})`, done: t.status === 'done' });
      }
    });
  });

  const catTitle = {};
  (projects ?? []).forEach(p => { catTitle[p.id] = p.title; });
  (items ?? []).forEach(it => {
    if (!it.dueDate || it.type === 'schedule') return;
    // 계획일과 마감일이 같은 날이면 항목 칩이 이미 그 칸에 있으므로 중복으로 넣지 않는다
    if (it.date === it.dueDate) return;
    const cat = it.projectId != null ? catTitle[it.projectId] : null;
    const done = it.status === 'done' || it.status === 'cancelled' || !!it.completed;
    add(it.dueDate, {
      key: `item-${it.id}`,
      type: 'item',
      item: it,
      title: cat ? `${it.title}(${cat})` : it.title,
      done,
    });
  });
  return map;
}
