import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getTimeSlotFromTime, TIME_SLOT_ORDER, timeToSlotPx, addDays } from '../utils/dateUtils';
import { applyGoogleSync, deleteGoogleEvent } from '../lib/googleCalendarApi';

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
    dueDate: row.due_date ?? '',
    priority: row.priority ?? 0,
    status: row.status ?? (row.completed ? 'done' : 'todo'),
    googleEventId: row.google_event_id ?? null,
  };
}

function toRow(data, userId) {
  const status = data.status ?? (data.completed ? 'done' : 'todo');
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
    completed: status === 'done',
    due_date: data.dueDate || null,
    priority: data.priority ?? 0,
    status,
    google_event_id: data.googleEventId ?? null,
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
    const synced = await applyGoogleSync(userId, null, { ...data, timeSlot: slot });
    const { data: inserted } = await supabase
      .from('items')
      .insert(toRow(synced, userId))
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
    const occurrences = dates.map(d => ({
      ...data,
      timeSlot: slot,
      date: d,
      endDate: offsetDays != null ? addDays(d, offsetDays) : '',
    }));
    const synced = await Promise.all(occurrences.map(o => applyGoogleSync(userId, null, o)));
    const rows = synced.map(o => toRow(o, userId));
    const { data: inserted } = await supabase.from('items').insert(rows).select();
    if (inserted) {
      setItems(prev => [
        ...prev,
        ...inserted.filter(row => !prev.some(i => i.id === row.id)).map(toLocal),
      ]);
    }
  }, [userId]);

  const updateItem = useCallback(async (id, data) => {
    const prev = items.find(i => i.id === id);
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : undefined);
    const merged = { ...prev, ...data, timeSlot: slot ?? data.timeSlot };
    const synced = await applyGoogleSync(userId, prev, merged);
    setItems(prevItems => prevItems.map(i => i.id === id ? synced : i));
    await supabase.from('items').update(toRow(synced, userId)).eq('id', id);
  }, [userId, items]);

  const deleteItem = useCallback(async (id) => {
    const item = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    await supabase.from('items').delete().eq('id', id);
    if (item?.googleEventId) {
      deleteGoogleEvent(userId, item.googleEventId).catch(err => console.error('구글 캘린더 이벤트 삭제 실패', err));
    }
  }, [items, userId]);

  const toggleComplete = useCallback(async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const done = !item.completed;
    const status = done ? 'done' : 'todo';
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: done, status } : i));
    await supabase.from('items').update({ completed: done, status }).eq('id', id);
  }, [items]);

  // 3단계 상태 순환: todo → doing → done → todo
  const cycleStatus = useCallback(async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const next = { todo: 'doing', doing: 'done', done: 'todo' }[item.status ?? (item.completed ? 'done' : 'todo')] ?? 'doing';
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: next, completed: next === 'done' } : i));
    await supabase.from('items').update({ status: next, completed: next === 'done' }).eq('id', id);
  }, [items]);

  const setPriority = useCallback(async (id, priority) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, priority } : i));
    await supabase.from('items').update({ priority }).eq('id', id);
  }, []);

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
        // 종료 시간이 새벽(00:00~06:00 이전)이면 전날 밤 슬롯 안에 이미 포함되므로 이어짐 표시 불필요
        if (i.endTime) {
          const [endH] = i.endTime.split(':').map(Number);
          if (endH < 6) return false;
        }
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

  return { items, loading, addItem, addRecurringItems, updateItem, deleteItem, toggleComplete, cycleStatus, setPriority, moveItem, getItemsForDate, getItemsForCell, getBacklogItems };
}
