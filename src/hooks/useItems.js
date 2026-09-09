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
    sortOrder: row.sort_order ?? null,
    status: row.status ?? (row.completed ? 'done' : 'todo'),
    completedAt: row.completed_at ?? null,
    projectId: row.project_id ?? null,
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
    sort_order: data.sortOrder ?? null,
    status,
    completed_at: data.completedAt ?? null,
    project_id: data.projectId ?? null,
    google_event_id: data.googleEventId ?? null,
  };
}

// 마이그레이션(20260909_item_completed_at.sql)을 아직 실행하지 않은 환경에서
// completed_at 을 쓰면 '컬럼 없음' 오류로 완료 처리 자체가 막힌다.
// 그 경우엔 completed_at 만 빼고 한 번 더 시도해서 최소한 상태 변경은 되게 한다.
function isMissingColumnError(error, column) {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const msg = String(error.message ?? '');
  return msg.includes(column) && /column|schema/i.test(msg);
}

async function updateItemRow(id, patch) {
  const { error } = await supabase.from('items').update(patch).eq('id', id);
  if (!error) return null;
  if ('completed_at' in patch && isMissingColumnError(error, 'completed_at')) {
    const { completed_at: _omit, ...rest } = patch;
    const retry = await supabase.from('items').update(rest).eq('id', id);
    return retry.error ?? null;
  }
  return error;
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
      .then(({ data, error }) => {
        if (error) console.error('[items load]', error);
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
          const n = payload.new;
          setItems(prev => prev.map(i => {
            if (i.id !== n.id) return i;
            const next = toLocal(n);
            // 실시간 페이로드에 컬럼이 빠져 있으면(스키마 캐시 지연) 로컬 값 유지 → 되돌아가는 것 방지
            if (!('project_id' in n)) next.projectId = i.projectId;
            if (!('due_date' in n)) next.dueDate = i.dueDate;
            if (!('priority' in n)) next.priority = i.priority;
            if (!('sort_order' in n)) next.sortOrder = i.sortOrder;
            if (!('status' in n)) next.status = i.status;
            if (!('completed_at' in n)) next.completedAt = i.completedAt;
            return next;
          }));
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
    const { data: inserted, error } = await supabase
      .from('items')
      .insert(toRow(synced, userId))
      .select()
      .single();
    // 저장이 실패하면 화면에도 아무것도 안 남아 입력한 내용이 조용히 사라진다 → 알린다
    if (error) {
      console.error('[addItem]', error);
      window.alert('저장 실패: ' + error.message);
      return;
    }
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
    const { data: inserted, error } = await supabase.from('items').insert(rows).select();
    if (error) {
      console.error('[addRecurringItems]', error);
      window.alert('반복 일정 저장 실패: ' + error.message);
      return;
    }
    if (inserted) {
      setItems(prev => [
        ...prev,
        ...inserted.filter(row => !prev.some(i => i.id === row.id)).map(toLocal),
      ]);
    }
  }, [userId]);

  const updateItem = useCallback(async (id, data) => {
    const prev = items.find(i => i.id === id);
    // 부분 수정(제목만/날짜만 등)에서는 data 에 timeSlot/time 이 없으므로
    // 기존 슬롯을 그대로 유지한다. (예전엔 undefined 가 되어 'morning' 으로 초기화됐다)
    const slot = data.timeSlot || (data.time ? getTimeSlotFromTime(data.time) : undefined);
    const merged = { ...prev, ...data, timeSlot: slot ?? prev?.timeSlot ?? 'morning' };
    // 모달에서 상태를 바꿨을 때도 완료 시각을 맞춰준다 (전환이 있을 때만)
    const wasDone = prev?.status === 'done';
    const nowDone = (merged.status ?? (merged.completed ? 'done' : 'todo')) === 'done';
    if (nowDone && !wasDone) merged.completedAt = new Date().toISOString();
    else if (!nowDone && wasDone) merged.completedAt = null;
    // 구글 동기화는 네트워크 왕복이라 먼저 화면에 반영해두고(응답 지연 체감 제거),
    // 동기화로 googleEventId 가 새로 생기면 그것만 덧붙인다.
    setItems(prevItems => prevItems.map(i => i.id === id ? merged : i));
    const synced = await applyGoogleSync(userId, prev, merged);
    if (synced.googleEventId !== merged.googleEventId) {
      setItems(prevItems => prevItems.map(i => i.id === id ? { ...i, googleEventId: synced.googleEventId } : i));
    }
    const error = await updateItemRow(id, toRow(synced, userId));
    if (error) console.error('[updateItem]', error);
  }, [userId, items]);

  const deleteItem = useCallback(async (id) => {
    const item = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) {
      // 삭제가 실패했는데 화면에서만 사라지면 새로고침 때 되살아나 혼란스럽다 → 즉시 복구
      console.error('[deleteItem]', error);
      if (item) setItems(prev => prev.some(i => i.id === id) ? prev : [...prev, item]);
      window.alert('삭제 실패: ' + error.message);
      return;
    }
    if (item?.googleEventId) {
      deleteGoogleEvent(userId, item.googleEventId).catch(err => console.error('구글 캘린더 이벤트 삭제 실패', err));
    }
  }, [items, userId]);

  const toggleComplete = useCallback(async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const done = !item.completed;
    const status = done ? 'done' : 'todo';
    const completedAt = done ? new Date().toISOString() : null;
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: done, status, completedAt } : i));
    const error = await updateItemRow(id, { completed: done, status, completed_at: completedAt });
    if (error) console.error('[toggleComplete]', error);
  }, [items]);

  // 상태 직접 지정: todo / doing / done
  const setStatus = useCallback(async (id, status) => {
    const done = status === 'done';
    // 완료로 바꿀 때만 시각을 새로 찍고, 완료를 되돌리면 비운다.
    // 이미 완료였던 항목을 다시 완료로 눌러도 원래 시각을 유지한다.
    // 화면과 DB 에 같은 값을 써야 한다 — 예전엔 로컬만 원래 시각을 유지하고
    // DB 로는 새 시각을 보내서 새로고침하면 완료 시각이 바뀌었다.
    const prev = items.find(i => i.id === id);
    const keep = done && prev?.status === 'done' && prev?.completedAt;
    const completedAt = done ? (keep || new Date().toISOString()) : null;
    setItems(prevItems => prevItems.map(i => i.id === id ? { ...i, status, completed: done, completedAt } : i));
    const error = await updateItemRow(id, { status, completed: done, completed_at: completedAt });
    if (error) console.error('[setStatus]', error);
  }, [items]);

  const setPriority = useCallback(async (id, priority) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, priority } : i));
    const { error } = await supabase.from('items').update({ priority }).eq('id', id);
    if (error) console.error('[setPriority]', error);
  }, []);

  const setProject = useCallback(async (id, projectId) => {
    const prevItem = items.find(i => i.id === id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, projectId } : i));
    const { error } = await supabase.from('items').update({ project_id: projectId }).eq('id', id);
    if (error) {
      console.error('카테고리 저장 실패:', error);
      window.alert('카테고리 저장 실패: ' + error.message);
      setItems(prev => prev.map(i => i.id === id ? { ...i, projectId: prevItem?.projectId ?? null } : i));
    }
  }, [items]);

  // 목록 드래그로 그룹 내 수동 순서 저장: order = [{ id, sortOrder }]
  const reorderItems = useCallback(async (order) => {
    const map = new Map(order.map(o => [o.id, o.sortOrder]));
    setItems(prev => prev.map(i => (map.has(i.id) ? { ...i, sortOrder: map.get(i.id) } : i)));
    const results = await Promise.all(
      order.map(o => supabase.from('items').update({ sort_order: o.sortOrder }).eq('id', o.id))
    );
    const failed = results.find(r => r?.error);
    if (failed) console.error('[reorderItems]', failed.error);
  }, []);

  const moveItem = useCallback(async (id, newDate, newTimeSlot) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, date: newDate, timeSlot: newTimeSlot } : i));
    const { error } = await supabase.from('items').update({ date: newDate, time_slot: newTimeSlot }).eq('id', id);
    if (error) console.error('[moveItem]', error);
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

  return { items, loading, addItem, addRecurringItems, updateItem, deleteItem, toggleComplete, setStatus, setPriority, setProject, reorderItems, moveItem, getItemsForDate, getItemsForCell, getBacklogItems };
}
