import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// '목표' 탭의 새 구조 (goals 테이블).
// 기존 monthly_goals 훅(useMonthlyGoals)은 예전 화면용으로 그대로 남겨 둔다 —
// 거기 적어둔 내용은 지우지 않고 '예전 이번달 목표 보기' 에서 계속 볼 수 있다.

function toLocal(row) {
  return {
    id: row.id,
    title: row.title,
    why: row.why ?? '',
    kind: row.kind ?? 'month',        // 'month' | 'someday'
    month: row.month ?? '',
    area: row.area ?? '',
    horizon: row.horizon ?? '',
    projectId: row.project_id ?? null,
    habitId: row.habit_id ?? null,
    target: row.target ?? null,
    current: row.current ?? 0,
    notionUrl: row.notion_url ?? '',
    completedAt: row.completed_at ?? null,
    sortOrder: row.sort_order ?? 0,
  };
}

function toRow(data, userId) {
  return {
    user_id: userId,
    title: data.title,
    why: data.why ?? '',
    kind: data.kind ?? 'month',
    month: data.month ?? '',
    area: data.area ?? '',
    horizon: data.horizon ?? '',
    project_id: data.projectId ?? null,
    habit_id: data.habitId == null ? null : String(data.habitId),
    target: data.target ?? null,
    current: data.current ?? 0,
    notion_url: data.notionUrl ?? '',
    completed_at: data.completedAt ?? null,
    sort_order: data.sortOrder ?? 0,
  };
}

// 마이그레이션(20260919_goals.sql)을 아직 안 돌린 환경에서도 앱이 죽지 않게,
// '그런 테이블/관계 없음' 오류는 조용히 빈 목록으로 넘긴다.
function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = String(error.message ?? '');
  return /goals/.test(msg) && /(does not exist|relation|schema)/i.test(msg);
}

export function useGoals(userId) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true); // false = 테이블이 아직 없음
  // 저장 시 항상 최신 전체 값을 기준으로 합치기 위한 미러
  const goalsRef = useRef([]);
  goalsRef.current = goals;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    supabase
      .from('goals')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          if (isMissingTableError(error)) setReady(false);
          else console.error('[goals load]', error);
        }
        if (data) setGoals(data.map(toLocal));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('goals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setGoals(prev => prev.filter(g => g.id !== payload.old.id));
          return;
        }
        const row = toLocal(payload.new);
        setGoals(prev => {
          // 낙관적 추가와 실시간 echo 가 겹쳐 같은 목표가 두 번 들어가지 않게
          const i = prev.findIndex(g => g.id === row.id);
          if (i === -1) return [...prev, row];
          const next = [...prev];
          next[i] = row;
          return next;
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const addGoal = useCallback(async (data) => {
    const sortOrder = goalsRef.current
      .filter(g => g.kind === (data.kind ?? 'month'))
      .reduce((max, g) => Math.max(max, g.sortOrder + 1), 0);
    const { data: inserted, error } = await supabase
      .from('goals').insert(toRow({ ...data, sortOrder }, userId)).select().single();
    if (error) {
      console.error('[addGoal]', error);
      window.alert(isMissingTableError(error)
        ? '목표 테이블이 아직 없어요. supabase/migrations/20260919_goals.sql 을 실행해 주세요.'
        : '목표 추가 실패: ' + error.message);
      return null;
    }
    if (inserted) {
      const row = toLocal(inserted);
      setGoals(prev => prev.some(g => g.id === row.id) ? prev : [...prev, row]);
      return row;
    }
    return null;
  }, [userId]);

  // 일부 필드만 넘겨도 되도록 부분 병합 (updateItem 과 같은 방식)
  const updateGoal = useCallback(async (id, patch) => {
    const current = goalsRef.current.find(g => g.id === id);
    if (!current) return;
    const merged = { ...current, ...patch };
    setGoals(prev => prev.map(g => g.id === id ? merged : g));
    const { error } = await supabase.from('goals').update(toRow(merged, userId)).eq('id', id);
    if (error) console.error('[updateGoal]', error);
  }, [userId]);

  const deleteGoal = useCallback(async (id) => {
    const snapshot = goalsRef.current.find(g => g.id === id);
    setGoals(prev => prev.filter(g => g.id !== id));
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) {
      // 삭제가 실패했는데 화면에서만 사라지면 새로고침 때 되살아나 혼란스럽다 → 즉시 복구
      console.error('[deleteGoal]', error);
      if (snapshot) setGoals(prev => prev.some(g => g.id === id) ? prev : [...prev, snapshot]);
      window.alert('목표 삭제 실패: ' + error.message);
    }
  }, []);

  // 이룸/되돌리기. 이미 이룬 것을 다시 눌러도 원래 시각을 유지한다 (항목 완료와 같은 규칙)
  const setGoalDone = useCallback(async (id, done) => {
    const current = goalsRef.current.find(g => g.id === id);
    if (!current) return;
    const completedAt = done ? (current.completedAt || new Date().toISOString()) : null;
    updateGoal(id, { completedAt });
  }, [updateGoal]);

  return { goals, loading, ready, addGoal, updateGoal, deleteGoal, setGoalDone };
}
