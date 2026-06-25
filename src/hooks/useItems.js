import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getTimeSlotFromTime } from '../utils/dateUtils';

function toLocal(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? '',
    date: row.date,
    time: row.time ?? '',
    timeSlot: row.time_slot ?? 'morning',
    completed: row.completed ?? false,
    priority: row.priority ?? 'medium',
  };
}

function toRow(data) {
  return {
    type: data.type,
    title: data.title,
    description: data.description ?? '',
    date: data.date,
    time: data.time ?? '',
    time_slot: data.timeSlot ?? 'morning',
    completed: data.completed ?? false,
    priority: data.priority ?? 'medium',
  };
}

export function useItems() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // 초기 로드
  useEffect(() => {
    supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setItems(data.map(toLocal));
        setLoading(false);
      });
  }, []);

  // 실시간 구독
  useEffect(() => {
    const channel = supabase
      .channel('items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setItems(prev => [...prev, toLocal(payload.new)]);
        } else if (payload.eventType === 'UPDATE') {
          setItems(prev => prev.map(i => i.id === payload.new.id ? toLocal(payload.new) : i));
        } else if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const addItem = useCallback(async (data) => {
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : 'morning');
    await supabase.from('items').insert(toRow({ ...data, timeSlot: slot }));
  }, []);

  const updateItem = useCallback(async (id, data) => {
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : undefined);
    await supabase.from('items').update(toRow({ ...data, timeSlot: slot ?? data.timeSlot })).eq('id', id);
  }, []);

  const deleteItem = useCallback(async (id) => {
    await supabase.from('items').delete().eq('id', id);
  }, []);

  const toggleComplete = useCallback(async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    await supabase.from('items').update({ completed: !item.completed }).eq('id', id);
  }, [items]);

  const moveItem = useCallback(async (id, newDate, newTimeSlot) => {
    await supabase.from('items').update({ date: newDate, time_slot: newTimeSlot }).eq('id', id);
  }, []);

  const getItemsForDate = useCallback((dateStr) =>
    items.filter(i => i.date === dateStr), [items]);

  const getItemsForCell = useCallback((dateStr, slot) =>
    items.filter(i => i.date === dateStr && i.timeSlot === slot), [items]);

  return { items, loading, addItem, updateItem, deleteItem, toggleComplete, moveItem, getItemsForDate, getItemsForCell };
}
