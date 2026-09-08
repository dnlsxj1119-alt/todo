import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

function toLocal(row) {
  return {
    id: row.id,
    type: row.type,
    color: row.color ?? '',
    title: row.title,
    startDate: row.start_date ?? '',
    deadline: row.deadline ?? '',
    tasks: row.tasks ?? [],
    goals: row.goals ?? [],
    notes: row.notes ?? '',
    sortOrder: row.sort_order ?? 0,
    pinned: row.pinned ?? false,
    forceCompleted: row.force_completed ?? false,
  };
}

function toRow(data, userId) {
  return {
    user_id: userId,
    type: data.type,
    color: data.color || null,
    title: data.title,
    start_date: data.startDate || null,
    deadline: data.deadline || null,
    tasks: data.tasks ?? [],
    goals: data.goals ?? [],
    notes: data.notes ?? '',
    sort_order: data.sortOrder ?? 0,
    pinned: data.pinned ?? false,
    force_completed: data.forceCompleted ?? false,
  };
}

export function useProjects(userId) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  // 저장 시 항상 최신 프로젝트 전체 값을 기준으로 합치기 위한 미러
  const projectsRef = useRef([]);
  projectsRef.current = projects;

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('[projects load]', error);
        if (data) setProjects(data.map(toLocal).sort((a, b) => a.sortOrder - b.sortOrder));
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setProjects(prev => [...prev, toLocal(payload.new)]);
        } else if (payload.eventType === 'UPDATE') {
          const n = payload.new;
          setProjects(prev => prev.map(p => {
            if (p.id !== n.id) return p;
            const next = toLocal(n);
            // 실시간 페이로드에 새 컬럼(color)이 빠져 있으면 로컬 값 유지
            if (!('color' in n)) next.color = p.color;
            return next;
          }));
        } else if (payload.eventType === 'DELETE') {
          setProjects(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId]);

  const addProject = useCallback(async (data) => {
    const { data: inserted } = await supabase
      .from('projects').insert(toRow(data, userId)).select().single();
    if (inserted) {
      setProjects(prev => prev.some(p => p.id === inserted.id) ? prev : [...prev, toLocal(inserted)]);
      return toLocal(inserted);
    }
    return null;
  }, [userId]);

  const updateProject = useCallback(async (id, data) => {
    // toRow 는 모든 컬럼을 통째로 덮어쓰므로, 일부 필드만 넘어온 경우
    // 기존 값과 합쳐서 저장해야 나머지 컬럼이 비워지지 않는다.
    const current = projectsRef.current.find(p => p.id === id);
    const merged = current ? { ...current, ...data } : data;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    await supabase.from('projects').update(toRow(merged, userId)).eq('id', id);
  }, [userId]);

  const deleteProject = useCallback(async (id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    await supabase.from('projects').delete().eq('id', id);
  }, []);

  const toggleTask = useCallback(async (projectId, taskId) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const cycle = { upcoming: 'in_progress', in_progress: 'done', done: 'upcoming' };
    const tasks = project.tasks.map(t =>
      t.id !== taskId ? t : { ...t, status: cycle[t.status] ?? 'in_progress' }
    );
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks } : p));
    await supabase.from('projects').update({ tasks }).eq('id', projectId);
  }, [projects]);

  const cycleEmailStatus = useCallback(async (projectId, emailId) => {
    const cycle = { draft: 'sent', sent: 'planned', planned: 'draft' };
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const emails = project.emails.map(e =>
      e.id === emailId ? { ...e, status: cycle[e.status] } : e
    );
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, emails } : p));
    await supabase.from('projects').update({ emails }).eq('id', projectId);
  }, [projects]);

  const completeProject = useCallback(async (projectId) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, forceCompleted: true } : p));
    await supabase.from('projects').update({ force_completed: true }).eq('id', projectId);
  }, []);

  const uncompleteProject = useCallback(async (projectId) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, forceCompleted: false } : p));
    await supabase.from('projects').update({ force_completed: false }).eq('id', projectId);
  }, []);

  const togglePin = useCallback(async (id) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    const pinned = !project.pinned;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, pinned } : p));
    await supabase.from('projects').update({ pinned }).eq('id', id);
  }, [projects]);

  const reorderProjects = useCallback(async (reordered) => {
    setProjects(reordered);
    await Promise.all(
      reordered.map((p, i) => supabase.from('projects').update({ sort_order: i }).eq('id', p.id))
    );
  }, []);

  return { projects, loading, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus, reorderProjects, togglePin, completeProject, uncompleteProject };
}
