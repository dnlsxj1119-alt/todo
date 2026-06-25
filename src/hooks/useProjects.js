import { useState, useCallback } from 'react';

const INITIAL_PROJECTS = [
  {
    id: 1,
    type: 'education',
    title: 'Advanced Materials Course',
    totalWeeks: 12,
    currentWeek: 4,
    tasks: [
      { id: 1, label: 'Week 1–2 강의 완료', status: 'done' },
      { id: 2, label: 'Lab report 작성 완료', status: 'done' },
      { id: 3, label: 'Week 3–4 강의 중 (진행중)', status: 'in_progress' },
      { id: 4, label: 'Week 5 과제 예정', status: 'upcoming' },
    ],
    notes: 'XRD 데이터 분석 방법 학습, 라마곡선 해석까지 이해',
    nextAction: '열분석(TGA) 실습',
    contact: '',
    emails: [],
  },
  {
    id: 2,
    type: 'sponsorship',
    title: 'DTU 연구지원',
    totalWeeks: null,
    currentWeek: null,
    tasks: [
      { id: 1, label: '예산안 작성', status: 'done' },
      { id: 2, label: '메일 템플릿 준비', status: 'done' },
      { id: 3, label: '교수님께 검토 요청', status: 'in_progress' },
      { id: 4, label: '최종 제출서류 작성', status: 'upcoming' },
      { id: 5, label: '회사에 메일 발송', status: 'upcoming' },
    ],
    notes: '',
    nextAction: '',
    contact: 'sponsorship@company.com',
    emails: [
      { id: 1, label: '첫번째 메일', status: 'draft' },
      { id: 2, label: '탐색 메일', status: 'sent' },
      { id: 3, label: '최종 신청서', status: 'planned' },
    ],
  },
];

let nextId = INITIAL_PROJECTS.length + 1;

export function useProjects() {
  const [projects, setProjects] = useState(INITIAL_PROJECTS);

  const addProject = useCallback((data) => {
    setProjects(prev => [...prev, { ...data, id: nextId++ }]);
  }, []);

  const updateProject = useCallback((id, data) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const deleteProject = useCallback((id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const toggleTask = useCallback((projectId, taskId) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const tasks = p.tasks.map(t => {
        if (t.id !== taskId) return t;
        const next = t.status === 'done' ? 'upcoming' : 'done';
        return { ...t, status: next };
      });
      return { ...p, tasks };
    }));
  }, []);

  const cycleEmailStatus = useCallback((projectId, emailId) => {
    const cycle = { draft: 'sent', sent: 'planned', planned: 'draft' };
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const emails = p.emails.map(e => e.id === emailId ? { ...e, status: cycle[e.status] } : e);
      return { ...p, emails };
    }));
  }, []);

  return { projects, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus };
}
