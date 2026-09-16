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
    completedAt: row.completed_at ?? null,
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
    completed_at: data.completedAt ?? null,
  };
}

// completed_at 마이그레이션을 아직 안 돌린 환경에서도 앱이 깨지지 않게,
// '그런 컬럼 없음' 오류면 그 필드만 빼고 한 번 더 시도한다 (useItems 와 같은 방식)
function isMissingColumnError(error, column) {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const msg = String(error.message ?? '');
  return msg.includes(column) && /column|schema/i.test(msg);
}

async function updateProjectRow(id, patch) {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (!error) return null;
  if ('completed_at' in patch && isMissingColumnError(error, 'completed_at')) {
    const { completed_at: _omit, ...rest } = patch;
    const retry = await supabase.from('projects').update(rest).eq('id', id);
    return retry.error ?? null;
  }
  return error;
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
          // 낙관적 추가와 실시간 echo 가 겹쳐 같은 카테고리가 두 번 들어가지 않게 (key 중복도 방지)
          setProjects(prev => prev.some(p => p.id === payload.new.id) ? prev : [...prev, toLocal(payload.new)]);
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
    let { data: inserted, error } = await supabase
      .from('projects').insert(toRow(data, userId)).select().single();
    if (error && isMissingColumnError(error, 'completed_at')) {
      // 마이그레이션 전 환경: completed_at 만 빼고 다시
      const { completed_at: _omit, ...rest } = toRow(data, userId);
      ({ data: inserted, error } = await supabase.from('projects').insert(rest).select().single());
    }
    if (error) {
      console.error('[addProject]', error);
      window.alert('카테고리 추가 실패: ' + error.message);
      return null;
    }
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
    const error = await updateProjectRow(id, toRow(merged, userId));
    if (error) console.error('[updateProject]', error);
  }, [userId]);

  const deleteProject = useCallback(async (id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) console.error('[deleteProject]', error);
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
    // 완료를 '언제' 눌렀는지 남긴다 (공유 텍스트의 최근 3일 완료에 싣기 위해).
    // 이미 완료였던 걸 다시 눌러도 원래 시각을 유지한다.
    const prev = projectsRef.current.find(p => p.id === projectId);
    const completedAt = (prev?.forceCompleted && prev?.completedAt) || new Date().toISOString();
    setProjects(p => p.map(x => x.id === projectId ? { ...x, forceCompleted: true, completedAt } : x));
    const error = await updateProjectRow(projectId, { force_completed: true, completed_at: completedAt });
    if (error) console.error('[completeProject]', error);
  }, []);

  const uncompleteProject = useCallback(async (projectId) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, forceCompleted: false, completedAt: null } : p));
    const error = await updateProjectRow(projectId, { force_completed: false, completed_at: null });
    if (error) console.error('[uncompleteProject]', error);
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
    const results = await Promise.all(
      reordered.map((p, i) => supabase.from('projects').update({ sort_order: i }).eq('id', p.id))
    );
    const failed = results.find(r => r?.error);
    if (failed) console.error('[reorderProjects]', failed.error);
  }, []);

  return { projects, loading, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus, reorderProjects, togglePin, completeProject, uncompleteProject };
}
