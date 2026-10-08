import { getProjectType } from './projectTypes';

// 카테고리에 시작일과 마감 기한이 둘 다 있으면 달력·주간뷰에 '기간 막대'로 그린다.
// (예전엔 마감일 칸에 🏁 칩만 찍혀서, 시작일을 넣어도 기간이 안 보였다)
// 막대 코드(SpanChip·줄 배정)는 항목(item) 모양을 기대하므로, 카테고리를 항목처럼 생긴 가짜 항목으로 바꿔 준다.

export function projectColorOf(p) {
  return p.color || getProjectType(p.type).border;
}

export function isProjectDone(p) {
  return !!p.forceCompleted || (p.tasks?.length > 0 && p.tasks.every(t => t.status === 'done'));
}

export function hasProjectSpan(p) {
  return !!p?.startDate && !!p?.deadline && p.deadline > p.startDate;
}

export function buildProjectSpans(projects) {
  return (projects ?? []).filter(hasProjectSpan).map(p => ({
    id: `proj-${p.id}`,
    type: 'project',
    title: p.title,
    date: p.startDate,
    endDate: p.deadline,
    completed: isProjectDone(p),
    color: projectColorOf(p),
    _project: p,
  }));
}
