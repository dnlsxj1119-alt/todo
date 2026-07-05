export function buildDeadlineMap(projects) {
  const map = {};
  const add = (date, entry) => {
    if (!date) return;
    if (!map[date]) map[date] = [];
    map[date].push(entry);
  };
  (projects ?? []).forEach(p => {
    const isCompleted = p.tasks?.length > 0 && p.tasks.every(t => t.status === 'done');
    if (p.deadline) {
      add(p.deadline, { key: `proj-${p.id}`, type: 'project', project: p, title: p.title, done: isCompleted });
    }
    (p.tasks ?? []).forEach(t => {
      if (t.deadline) {
        add(t.deadline, { key: `task-${t.id}`, type: 'task', project: p, title: `${t.label}(${p.title})`, done: t.status === 'done' });
      }
    });
  });
  return map;
}
