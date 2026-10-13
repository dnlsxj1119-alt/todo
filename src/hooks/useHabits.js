import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { toDateString } from '../utils/dateUtils';

function toLocal(row) {
  return {
    id: row.id,
    title: row.title,
    frequency: row.frequency ?? 'daily',
    color: row.color ?? '#6366F1',
    completedDates: row.completed_dates ?? [],
    sortOrder: row.sort_order ?? 0,
    archived: row.archived ?? false,
    // 만든 날(로컬 날짜). 달력 달성률에서 '습관이 생기기 전 날'을 0% 로 찍지 않으려고 쓴다
    createdAt: row.created_at ? toDateString(new Date(row.created_at)) : null,
    // 잠깐 쉬기(둘 다 'YYYY-MM-DD') · 주 N회 목표. 마이그레이션 전엔 컬럼이 없어 undefined → null
    pausedFrom: row.paused_from ?? null,
    pausedUntil: row.paused_until ?? null,
    weeklyTarget: row.weekly_target ?? null,
  };
}

// 빈도 판정은 utils/habitStats.js 로 옮겼다 (집계와 같이 두고 node 로 검증하려고). 경로 호환용 re-export.
export { habitAppliesToDate } from '../utils/habitStats';

// 마이그레이션 전 환경(컬럼 없음)에서도 저장이 되게: 선택 컬럼을 넣어 쓰고,
// '컬럼 없음' 오류(PostgREST PGRST204 / 42703)면 그 컬럼을 빼고 한 번 더 시도한다.
async function writeWithOptional(run, base, optional) {
  const first = await run({ ...base, ...optional });
  const msg = `${first.error?.code ?? ''} ${first.error?.message ?? ''}`;
  const missing = first.error && (/PGRST204|42703/.test(msg) || /column .* does not exist|Could not find the .* column/i.test(msg));
  if (!missing) return first;
  console.warn('[habits] 선택 컬럼 없이 다시 저장 (마이그레이션 전?)', first.error.message);
  return run(base);
}

export function useHabits(userId) {
  const [allHabits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('habits')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('[habits load]', error);
        if (data) setHabits(data.map(toLocal).sort((a, b) => a.sortOrder - b.sortOrder));
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('habits-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setHabits(prev => prev.some(h => h.id === payload.new.id) ? prev : [...prev, toLocal(payload.new)]);
        } else if (payload.eventType === 'UPDATE') {
          setHabits(prev => prev.map(h => h.id === payload.new.id ? toLocal(payload.new) : h));
        } else if (payload.eventType === 'DELETE') {
          setHabits(prev => prev.filter(h => h.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const addHabit = useCallback(async (data) => {
    const base = { user_id: userId, title: data.title, frequency: data.frequency, color: data.color, completed_dates: [], sort_order: allHabits.length };
    const { data: inserted, error } = await writeWithOptional(
      (row) => supabase.from('habits').insert(row).select().single(),
      base, { weekly_target: data.frequency === 'weekly' ? (Number(data.weeklyTarget) || 3) : null }
    );
    if (error) { console.error('[addHabit]', error); return; }
    if (inserted) {
      setHabits(prev => prev.some(h => h.id === inserted.id) ? prev : [...prev, toLocal(inserted)]);
    }
  }, [userId, allHabits.length]);

  const updateHabit = useCallback(async (id, data) => {
    const weeklyTarget = data.frequency === 'weekly' ? (Number(data.weeklyTarget) || 3) : null;
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...data, weeklyTarget } : h));
    const { error } = await writeWithOptional(
      (row) => supabase.from('habits').update(row).eq('id', id),
      { title: data.title, frequency: data.frequency, color: data.color }, { weekly_target: weeklyTarget }
    );
    if (error) console.error('[updateHabit]', error);
  }, []);

  // 잠깐 쉬기: 오늘부터 until 까지. 보관과 달리 기간이 끝나면 저절로 돌아온다.
  const pauseHabit = useCallback(async (id, untilDateStr) => {
    const from = toDateString(new Date());
    setHabits(prev => prev.map(h => h.id === id ? { ...h, pausedFrom: from, pausedUntil: untilDateStr } : h));
    const { error } = await supabase.from('habits').update({ paused_from: from, paused_until: untilDateStr }).eq('id', id);
    if (error) console.error('[pauseHabit]', error);
  }, []);

  const resumeHabit = useCallback(async (id) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, pausedFrom: null, pausedUntil: null } : h));
    const { error } = await supabase.from('habits').update({ paused_from: null, paused_until: null }).eq('id', id);
    if (error) console.error('[resumeHabit]', error);
  }, []);

  const deleteHabit = useCallback(async (id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    const { error } = await supabase.from('habits').delete().eq('id', id);
    if (error) console.error('[deleteHabit]', error);
  }, []);

  const toggleHabitDate = useCallback(async (id, dateStr) => {
    const habit = allHabits.find(h => h.id === id);
    if (!habit) return;
    const dates = habit.completedDates || [];
    const newDates = dates.includes(dateStr)
      ? dates.filter(d => d !== dateStr)
      : [...dates, dateStr];
    setHabits(prev => prev.map(h => h.id === id ? { ...h, completedDates: newDates } : h));
    const { error } = await supabase.from('habits').update({ completed_dates: newDates }).eq('id', id);
    if (error) console.error('[toggleHabitDate]', error);
  }, [allHabits]);

  const reorderHabits = useCallback(async (reordered) => {
    setHabits(prev => {
      const archived = prev.filter(h => h.archived);
      return [...reordered, ...archived];
    });
    const results = await Promise.all(
      reordered.map((h, i) => supabase.from('habits').update({ sort_order: i }).eq('id', h.id))
    );
    const failed = results.find(r => r?.error);
    if (failed) console.error('[reorderHabits]', failed.error);
  }, []);

  const archiveHabit = useCallback(async (id) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, archived: true } : h));
    const { error } = await supabase.from('habits').update({ archived: true }).eq('id', id);
    if (error) console.error('[archiveHabit]', error);
  }, []);

  const restoreHabit = useCallback(async (id) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, archived: false } : h));
    const { error } = await supabase.from('habits').update({ archived: false }).eq('id', id);
    if (error) console.error('[restoreHabit]', error);
  }, []);

  const habits = allHabits.filter(h => !h.archived);
  const archivedHabits = allHabits.filter(h => h.archived);

  return {
    habits, archivedHabits, loading,
    addHabit, updateHabit, deleteHabit, toggleHabitDate, reorderHabits,
    archiveHabit, restoreHabit, pauseHabit, resumeHabit,
  };
}
