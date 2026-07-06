import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function toLocal(row) {
  return {
    id: row.id,
    month: row.month,
    notes: row.notes ?? '',
    items: row.items ?? [],
  };
}

export function useMonthlyGoals(userId) {
  const [goalsByMonth, setGoalsByMonth] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('monthly_goals')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error('[monthly_goals load]', error);
        if (data) {
          const map = {};
          data.forEach(row => { map[row.month] = toLocal(row); });
          setGoalsByMonth(map);
        }
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('monthly-goals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_goals' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setGoalsByMonth(prev => {
            const next = { ...prev };
            delete next[payload.old.month];
            return next;
          });
        } else {
          const row = toLocal(payload.new);
          setGoalsByMonth(prev => ({ ...prev, [row.month]: row }));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const getForMonth = useCallback((month) => goalsByMonth[month] ?? { month, notes: '', items: [] },
    [goalsByMonth]);

  const upsert = useCallback(async (month, patch) => {
    const current = goalsByMonth[month] ?? { month, notes: '', items: [] };
    const next = { ...current, ...patch };
    setGoalsByMonth(prev => ({ ...prev, [month]: next }));
    const { error } = await supabase
      .from('monthly_goals')
      .upsert({ user_id: userId, month, notes: next.notes, items: next.items }, { onConflict: 'user_id,month' });
    if (error) console.error('[monthly_goals upsert]', error);
  }, [userId, goalsByMonth]);

  const updateNotes = useCallback((month, notes) => upsert(month, { notes }), [upsert]);

  const addItem = useCallback((month, week, col, text) => {
    const current = goalsByMonth[month] ?? { month, notes: '', items: [] };
    const item = { id: crypto.randomUUID(), week, col, text, completed: false };
    return upsert(month, { items: [...current.items, item] });
  }, [goalsByMonth, upsert]);

  const toggleItem = useCallback((month, itemId) => {
    const current = goalsByMonth[month] ?? { month, notes: '', items: [] };
    const items = current.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i);
    return upsert(month, { items });
  }, [goalsByMonth, upsert]);

  const deleteItem = useCallback((month, itemId) => {
    const current = goalsByMonth[month] ?? { month, notes: '', items: [] };
    const items = current.items.filter(i => i.id !== itemId);
    return upsert(month, { items });
  }, [goalsByMonth, upsert]);

  const editItem = useCallback((month, itemId, text) => {
    const current = goalsByMonth[month] ?? { month, notes: '', items: [] };
    const items = current.items.map(i => i.id === itemId ? { ...i, text } : i);
    return upsert(month, { items });
  }, [goalsByMonth, upsert]);

  const reorderItems = useCallback((month, items) => upsert(month, { items }), [upsert]);

  return { loading, getForMonth, updateNotes, addItem, toggleItem, deleteItem, editItem, reorderItems };
}
