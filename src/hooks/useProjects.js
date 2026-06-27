import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function toLocal(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    deadline: row.deadline ?? '',
    tasks: row.tasks ?? [],
    goals: row.goals ?? [],
    notes: row.notes ?? '',
    sortOrder: row.sort_order ?? 0,
  };
}

function toRow(data) {
  return {
    type: data.type,
    title: data.title,
    deadline: data.deadline || null,
    tasks: data.tasks ?? [],
    goals: data.goals ?? [],
    notes: data.notes ?? '',
    sort_order: data.sortOrder ?? 0,
  };
}

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // 초기 로드
  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setProjects(data.map(toLocal).sort((a, b) => a.sortOrder - b.sortOrder));
        setLoading(false);
      });
  }, []);

  // 실시간 구독
  useEffect(() => {
    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setProjects(prev => [...prev, toLocal(payload.new)]);
        } else if (payload.eventType === 'UPDATE') {
          setProjects(prev => prev.map(p => p.id === payload.new.id ? toLocal(payload.new) : p));
        } else if (payload.eventType === 'DELETE') {
          setProjects(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const addProject = useCallback(async (data) => {
    const { data: inserted } = await supabase
      .from('projects').insert(toRow(data)).select().single();
    if (inserted) {
      setProjects(prev => prev.some(p => p.id === inserted.id) ? prev : [...prev, toLocal(inserted)]);
    }
  }, []);

  const updateProject = useCallback(async (id, data) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    await supabase.from('projects').update(toRow(data)).eq('id', id);
  }, []);

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

  const reorderProjects = useCallback(async (reordered) => {
    setProjects(reordered);
    await Promise.all(
      reordered.map((p, i) => supabase.from('projects').update({ sort_order: i }).eq('id', p.id))
    );
  }, []);

  return { projects, loading, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus, reorderProjects };
}
