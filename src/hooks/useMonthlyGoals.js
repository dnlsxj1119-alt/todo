import { useState, useEffect, useCallback, useRef } from 'react';
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
  // 이 달에 대해 아직 처리 중인(전송 대기/진행 중) 로컬 저장이 있는 동안에는
  // 실시간 echo를 무시한다 - 로컬 낙관적 상태가 항상 더 최신이기 때문
  const pendingRef = useRef({});

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
          if ((pendingRef.current[row.month] ?? 0) > 0) return; // 아직 처리 중인 로컬 변경이 있으면 echo 무시
          setGoalsByMonth(prev => ({ ...prev, [row.month]: row }));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const getForMonth = useCallback((month) => goalsByMonth[month] ?? { month, notes: '', items: [] },
    [goalsByMonth]);

  // 빠르게 연속으로 upsert가 호출될 때 네트워크 응답 순서가 뒤바뀌어
  // 최신 내용이 이전 내용에 덮어써지지 않도록 요청을 순서대로 처리한다
  const upsertQueueRef = useRef(Promise.resolve());

  const upsert = useCallback((month, patch) => {
    const current = goalsByMonth[month] ?? { month, notes: '', items: [] };
    const next = { ...current, ...patch };
    setGoalsByMonth(prev => ({ ...prev, [month]: next }));
    pendingRef.current[month] = (pendingRef.current[month] ?? 0) + 1;
    const run = async () => {
      const { error } = await supabase
        .from('monthly_goals')
        .upsert({ user_id: userId, month, notes: next.notes, items: next.items }, { onConflict: 'user_id,month' });
      if (error) console.error('[monthly_goals upsert]', error);
      pendingRef.current[month] = Math.max(0, (pendingRef.current[month] ?? 1) - 1);
    };
    upsertQueueRef.current = upsertQueueRef.current.then(run, run);
    return upsertQueueRef.current;
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
