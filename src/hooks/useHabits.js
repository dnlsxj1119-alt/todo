import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function toLocal(row) {
  return {
    id: row.id,
    title: row.title,
    frequency: row.frequency ?? 'daily',
    color: row.color ?? '#6366F1',
    completedDates: row.completed_dates ?? [],
    sortOrder: row.sort_order ?? 0,
  };
}

export function habitAppliesToDate(habit, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekday') return dow >= 1 && dow <= 5;
  if (habit.frequency === 'weekend') return dow === 0 || dow === 6;
  return false;
}

export function useHabits(userId) {
  const [habits, setHabits] = useState([]);
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
      .insert({ user_id: userId, title: data.title, frequency: data.frequency, color: data.color, completed_dates: [] })
      .select()
      .single();
    if (error) { console.error('[addHabit]', error); return; }
    if (inserted) {
      setHabits(prev => prev.some(h => h.id === inserted.id) ? prev : [...prev, toLocal(inserted)]);
    }
  }, [userId]);

  const updateHabit = useCallback(async (id, data) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...data } : h));
    await supabase.from('habits').update({ title: data.title, frequency: data.frequency, color: data.color }).eq('id', id);
  }, []);

  const deleteHabit = useCallback(async (id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    await supabase.from('habits').delete().eq('id', id);
  }, []);

  const toggleHabitDate = useCallback(async (id, dateStr) => {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    const dates = habit.completedDates || [];
    const newDates = dates.includes(dateStr)
      ? dates.filter(d => d !== dateStr)
      : [...dates, dateStr];
    setHabits(prev => prev.map(h => h.id === id ? { ...h, completedDates: newDates } : h));
    await supabase.from('habits').update({ completed_dates: newDates }).eq('id', id);
  }, [habits]);

  const reorderHabits = useCallback(async (reordered) => {
    setHabits(reordered);
    await Promise.all(
      reordered.map((h, i) => supabase.from('habits').update({ sort_order: i }).eq('id', h.id))
    );
  }, []);

  return { habits, loading, addHabit, updateHabit, deleteHabit, toggleHabitDate, reorderHabits };
}
