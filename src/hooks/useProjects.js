import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function toLocal(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    totalWeeks: row.total_weeks ?? null,
    currentWeek: row.current_week ?? null,
    tasks: row.tasks ?? [],
    emails: row.emails ?? [],
    notes: row.notes ?? '',
    nextAction: row.next_action ?? '',
    contact: row.contact ?? '',
  };
}

function toRow(data) {
  return {
    type: data.type,
    title: data.title,
    total_weeks: data.totalWeeks ?? null,
    current_week: data.currentWeek ?? null,
    tasks: data.tasks ?? [],
    emails: data.emails ?? [],
    notes: data.notes ?? '',
    next_action: data.nextAction ?? '',
    contact: data.contact ?? '',
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
        if (data) setProjects(data.map(toLocal));
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
    await supabase.from('projects').insert(toRow(data));
  }, []);

  const updateProject = useCallback(async (id, data) => {
    await supabase.from('projects').update(toRow(data)).eq('id', id);
  }, []);

  const deleteProject = useCallback(async (id) => {
    await supabase.from('projects').delete().eq('id', id);
  }, []);

  const toggleTask = useCallback(async (projectId, taskId) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const tasks = project.tasks.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, status: t.status === 'done' ? 'upcoming' : 'done' };
    });
    await supabase.from('projects').update({ tasks }).eq('id', projectId);
  }, [projects]);

  const cycleEmailStatus = useCallback(async (projectId, emailId) => {
    const cycle = { draft: 'sent', sent: 'planned', planned: 'draft' };
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const emails = project.emails.map(e =>
      e.id === emailId ? { ...e, status: cycle[e.status] } : e
    );
    await supabase.from('projects').update({ emails }).eq('id', projectId);
  }, [projects]);

  return { projects, loading, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus };
}
