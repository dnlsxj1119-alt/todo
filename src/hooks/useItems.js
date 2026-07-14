import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getTimeSlotFromTime, TIME_SLOT_ORDER, timeToSlotPx, addDays } from '../utils/dateUtils';

// 실제 시간이 없는 옛 항목 대비: 제목 앞 숫자를 HHMM 형태의 시간으로 해석
function legacyTitleMinutes(title) {
  const m = /^(\d{1,4})/.exec((title ?? '').trim());
  if (!m) return null;
  const digits = m[1];
  const hh = digits.length <= 2 ? parseInt(digits, 10) : parseInt(digits.slice(0, -2), 10);
  const mm = digits.length <= 2 ? 0 : parseInt(digits.slice(-2), 10);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function timeMinutes(item) {
  if (item.time) {
    const [h, m] = item.time.split(':').map(Number);
    return h * 60 + m;
  }
  return legacyTitleMinutes(item.title);
}

function sortByTime(list) {
  return [...list].sort((a, b) => {
    const ta = timeMinutes(a);
    const tb = timeMinutes(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  });
}

function toLocal(row) {
  const type = row.type;
  const rawSlot = row.time_slot ?? 'morning';
  const timeSlot = (type !== 'todo' && rawSlot === 'all') ? 'morning' : rawSlot;
  return {
    id: row.id,
    type,
    title: row.title,
    description: row.description ?? '',
    date: row.date,
    time: row.time ?? '',
    endTime: row.end_time ?? '',
    endDate: row.end_date ?? '',
    timeSlot,
    completed: row.completed ?? false,
  };
}

function toRow(data, userId) {
  return {
    user_id: userId,
    type: data.type,
    title: data.title,
    description: data.description ?? '',
    date: data.date || null,
    time: data.time ?? '',
    end_time: data.endTime ?? '',
    end_date: data.endDate ?? '',
    time_slot: data.timeSlot ?? 'morning',
    completed: data.completed ?? false,
  };
}

export function useItems(userId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setItems(data.map(toLocal));
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('items-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setItems(prev => {
            if (prev.some(i => i.id === payload.new.id)) return prev;
            return [...prev, toLocal(payload.new)];
          });
        } else if (payload.eventType === 'UPDATE') {
          setItems(prev => prev.map(i => i.id === payload.new.id ? toLocal(payload.new) : i));
        } else if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId]);

  const addItem = useCallback(async (data) => {
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : 'morning');
    const { data: inserted } = await supabase
      .from('items')
      .insert(toRow({ ...data, timeSlot: slot }, userId))
      .select()
      .single();
    if (inserted) {
      setItems(prev => prev.some(i => i.id === inserted.id) ? prev : [...prev, toLocal(inserted)]);
    }
  }, [userId]);

  const addRecurringItems = useCallback(async (data, dates) => {
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : 'morning');
    const offsetDays = data.endDate && data.date
      ? (new Date(data.endDate) - new Date(data.date)) / (1000 * 60 * 60 * 24)
      : null;
    const rows = dates.map(d => toRow({
      ...data,
      timeSlot: slot,
      date: d,
      endDate: offsetDays != null ? addDays(d, offsetDays) : '',
    }, userId));
    const { data: inserted } = await supabase.from('items').insert(rows).select();
    if (inserted) {
      setItems(prev => [
        ...prev,
        ...inserted.filter(row => !prev.some(i => i.id === row.id)).map(toLocal),
      ]);
    }
  }, [userId]);

  const updateItem = useCallback(async (id, data) => {
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : undefined);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...data, timeSlot: slot ?? data.timeSlot } : i));
    await supabase.from('items').update(toRow({ ...data, timeSlot: slot ?? data.timeSlot }, userId)).eq('id', id);
  }, [userId]);

  const deleteItem = useCallback(async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    await supabase.from('items').delete().eq('id', id);
  }, []);

  const toggleComplete = useCallback(async (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: !i.completed } : i));
    const item = items.find(i => i.id === id);
    if (!item) return;
    await supabase.from('items').update({ completed: !item.completed }).eq('id', id);
  }, [items]);

  const moveItem = useCallback(async (id, newDate, newTimeSlot) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, date: newDate, timeSlot: newTimeSlot } : i));
    await supabase.from('items').update({ date: newDate, time_slot: newTimeSlot }).eq('id', id);
  }, []);

  const getItemsForDate = useCallback((dateStr) =>
    sortByTime(items.filter(i =>
      i.date === dateStr ||
      (i.type !== 'todo' && i.endDate && i.date < dateStr && i.endDate >= dateStr)
    )), [items]);

  const getItemsForCell = useCallback((dateStr, slot) => {
    if (slot === 'all') {
      // 시간이 설정된 할일은 해당 시간대 행에 표시되므로 전체 행에서는 제외
      return sortByTime(items.filter(i => i.date === dateStr && i.type === 'todo' && !i.time));
    }
    return sortByTime(items.filter(i => {
      if (i.type === 'todo') {
        return i.date === dateStr && !!i.time && getTimeSlotFromTime(i.time) === slot;
      }
      if (i.date === dateStr) return i.timeSlot === slot;
      if (i.endDate && i.date < dateStr && i.endDate > dateStr) return true;
      if (i.endDate === dateStr && i.date < dateStr) {
        const endSlotKey = i.endTime ? getTimeSlotFromTime(i.endTime) : TIME_SLOT_ORDER[TIME_SLOT_ORDER.length - 1];
        const endIdx = TIME_SLOT_ORDER.indexOf(endSlotKey);
        const slotIdx = TIME_SLOT_ORDER.indexOf(slot);
        if (slotIdx < endIdx) return true;
        if (slotIdx === endIdx) return timeToSlotPx(i.endTime, endSlotKey) > 0;
        return false;
      }
      return false;
    }));
  }, [items]);

  const getBacklogItems = useCallback(() =>
    items.filter(i => i.type === 'todo' && !i.date), [items]);

  return { items, loading, addItem, addRecurringItems, updateItem, deleteItem, toggleComplete, moveItem, getItemsForDate, getItemsForCell, getBacklogItems };
}
