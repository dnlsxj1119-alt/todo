import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { INTERVIEW_SEED } from '../data/interviewChecklistSeed';

// 💼 면접 준비 탭 (interview_checklist 테이블).
// useGoals 와 같은 결: 낙관적 업데이트 + 실시간 echo 중복 방지 + 테이블 없을 때 안내.
// 테이블이 비어 있으면 seed 를 한 번 insert 한다 — SQL 에 계정 ID 를 적지 않아도 되게.

function toLocal(row) {
  return {
    id: row.id,
    section: row.section,
    grp: row.grp ?? '',
    label: row.label,
    optional: !!row.optional,
    done: !!row.done,
    doneAt: row.done_at ?? null,
    sortOrder: row.sort_order ?? 0,
  };
}

function toRow(data, userId) {
  return {
    user_id: userId,
    section: data.section,
    grp: data.grp ?? '',
    label: data.label,
    optional: !!data.optional,
    done: !!data.done,
    done_at: data.doneAt ?? null,
    sort_order: data.sortOrder ?? 0,
  };
}

// 마이그레이션(20261106_interview_checklist.sql)을 아직 안 돌린 환경에서도 앱이 죽지 않게,
// '그런 테이블 없음' 오류는 조용히 빈 목록으로 넘긴다.
function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = String(error.message ?? '');
  return /interview_checklist/.test(msg) && /(does not exist|relation|schema)/i.test(msg);
}

export function useInterviewChecklist(userId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true); // false = 테이블이 아직 없음
  const itemsRef = useRef([]);
  itemsRef.current = items;
  const seededRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('interview_checklist')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!alive) return;
      if (error) {
        if (isMissingTableError(error)) setReady(false);
        else console.error('[interview_checklist load]', error);
        setLoading(false);
        return;
      }
      if (data.length === 0 && !seededRef.current) {
        // 처음 여는 계정: 초기 체크리스트를 한 번만 넣는다
        seededRef.current = true;
        const { data: inserted, error: seedError } = await supabase
          .from('interview_checklist')
          .insert(INTERVIEW_SEED.map(r => toRow(r, userId)))
          .select();
        if (!alive) return;
        if (seedError) console.error('[interview_checklist seed]', seedError);
        else if (inserted) setItems(inserted.map(toLocal));
      } else {
        setItems(data.map(toLocal));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('interview-checklist-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interview_checklist' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== payload.old.id));
          return;
        }
        const row = toLocal(payload.new);
        setItems(prev => {
          const i = prev.findIndex(x => x.id === row.id);
          if (i === -1) return [...prev, row];
          const next = [...prev];
          next[i] = row;
          return next;
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  // 섹션 끝에 새 항목: 그 섹션(소제목)의 마지막 sort_order 뒤
  const addItem = useCallback(async ({ section, grp = '', label, optional = false }) => {
    const text = String(label ?? '').trim();
    if (!text) return null;
    const sortOrder = itemsRef.current
      .filter(i => i.section === section)
      .reduce((max, i) => Math.max(max, i.sortOrder + 10), 10);
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic = { id: tempId, section, grp, label: text, optional, done: false, doneAt: null, sortOrder };
    setItems(prev => [...prev, optimistic]);
    const { data: inserted, error } = await supabase
      .from('interview_checklist')
      .insert(toRow(optimistic, userId)).select().single();
    if (error) {
      console.error('[interview addItem]', error);
      setItems(prev => prev.filter(i => i.id !== tempId));
      window.alert(isMissingTableError(error)
        ? '면접 준비 테이블이 아직 없어요. supabase/migrations/20261106_interview_checklist.sql 을 실행해 주세요.'
        : '항목 추가 실패: ' + error.message);
      return null;
    }
    const row = toLocal(inserted);
    setItems(prev => {
      const withoutTemp = prev.filter(i => i.id !== tempId);
      return withoutTemp.some(i => i.id === row.id) ? withoutTemp : [...withoutTemp, row];
    });
    return row;
  }, [userId]);

  const updateItem = useCallback(async (id, patch) => {
    const current = itemsRef.current.find(i => i.id === id);
    if (!current) return;
    const merged = { ...current, ...patch };
    setItems(prev => prev.map(i => i.id === id ? merged : i));
    const { error } = await supabase
      .from('interview_checklist').update(toRow(merged, userId)).eq('id', id);
    if (error) {
      console.error('[interview updateItem]', error);
      setItems(prev => prev.map(i => i.id === id ? current : i)); // 실패하면 되돌린다
    }
  }, [userId]);

  // 체크: 다시 눌러도 원래 시각을 유지하지 않고, 풀면 시각도 지운다 (언제 끝냈는지 = 마지막 체크)
  const toggleDone = useCallback((id) => {
    const current = itemsRef.current.find(i => i.id === id);
    if (!current) return;
    const done = !current.done;
    return updateItem(id, { done, doneAt: done ? new Date().toISOString() : null });
  }, [updateItem]);

  const editLabel = useCallback((id, label) => {
    const text = String(label ?? '').trim();
    if (!text) return;
    // '(선택)' 을 붙이거나 떼면 optional 도 같이 따라간다
    return updateItem(id, { label: text, optional: /^\(선택\)/.test(text) });
  }, [updateItem]);

  const deleteItem = useCallback(async (id) => {
    const snapshot = itemsRef.current.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase.from('interview_checklist').delete().eq('id', id);
    if (error) {
      console.error('[interview deleteItem]', error);
      if (snapshot) setItems(prev => prev.some(i => i.id === id) ? prev : [...prev, snapshot]);
      window.alert('항목 삭제 실패: ' + error.message);
    }
  }, []);

  return { items, loading, ready, addItem, toggleDone, editLabel, deleteItem };
}
