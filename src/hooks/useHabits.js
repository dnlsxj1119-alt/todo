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
  };
}

// 빈도 판정은 utils/habitStats.js 로 옮겼다 (집계와 같이 두고 node 로 검증하려고). 경로 호환용 re-export.
export { habitAppliesToDate } from '../utils/habitStats';

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
    const { data: inserted, error } = await supabase
      .from('habits')
      .insert({ user_id: userId, title: data.title, frequency: data.frequency, color: data.color, completed_dates: [], sort_order: allHabits.length })
      .select()
      .single();
    if (error) { console.error('[addHabit]', error); return; }
    if (inserted) {
      setHabits(prev => prev.some(h => h.id === inserted.id) ? prev : [...prev, toLocal(inserted)]);
    }
  }, [userId, allHabits.length]);

  const updateHabit = useCallback(async (id, data) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...data } : h));
    const { error } = await supabase.from('habits').update({ title: data.title, frequency: data.frequency, color: data.color }).eq('id', id);
    if (error) console.error('[updateHabit]', error);
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
    archiveHabit, restoreHabit,
  };
}
