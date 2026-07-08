import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { addDays, toDateString } from '../utils/dateUtils';

// achievements 컬럼은 예전 데이터 호환을 위해 읽을 때만 learnings에 합쳐준다 (배운점/성과 통합)
function toLocal(row) {
  return {
    id: row.id,
    date: row.date,
    learnings: [...(row.learnings ?? []), ...(row.achievements ?? [])],
    bestChoice: row.best_choice ?? '',
    tomorrowPlan: row.tomorrow_plan ?? '',
  };
}

const empty = (date) => ({ date, learnings: [], bestChoice: '', tomorrowPlan: '' });

function hasContent(r) {
  return !!r && (r.learnings.length > 0 || !!r.bestChoice.trim() || !!r.tomorrowPlan.trim());
}

export function useDailyReflections(userId) {
  const [reflectionsByDate, setReflectionsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  // 이 날짜에 대해 아직 처리 중인(전송 대기/진행 중) 로컬 저장이 있는 동안에는
  // 실시간 echo를 무시한다 - 로컬 낙관적 상태가 항상 더 최신이기 때문
  const pendingRef = useRef({});

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('daily_reflections')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error('[daily_reflections load]', error);
        if (data) {
          const map = {};
          data.forEach(row => { map[row.date] = toLocal(row); });
          setReflectionsByDate(map);
        }
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('daily-reflections-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reflections' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setReflectionsByDate(prev => {
            const next = { ...prev };
            delete next[payload.old.date];
            return next;
          });
        } else {
          const row = toLocal(payload.new);
          if ((pendingRef.current[row.date] ?? 0) > 0) return; // 아직 처리 중인 로컬 변경이 있으면 echo 무시
          setReflectionsByDate(prev => ({ ...prev, [row.date]: row }));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const getForDate = useCallback((date) => reflectionsByDate[date] ?? empty(date), [reflectionsByDate]);

  // 빠르게 연속으로 upsert가 호출될 때 네트워크 응답 순서가 뒤바뀌어
  // 최신 내용이 이전 내용에 덮어써지지 않도록 요청을 순서대로 처리한다
  const upsertQueueRef = useRef(Promise.resolve());

  const upsert = useCallback((date, patch) => {
    const current = reflectionsByDate[date] ?? empty(date);
    const next = { ...current, ...patch };
    setReflectionsByDate(prev => ({ ...prev, [date]: next }));
    pendingRef.current[date] = (pendingRef.current[date] ?? 0) + 1;
    const run = async () => {
      const { error } = await supabase
        .from('daily_reflections')
        .upsert({
          user_id: userId,
          date,
          learnings: next.learnings,
          achievements: [],
          best_choice: next.bestChoice,
          tomorrow_plan: next.tomorrowPlan,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,date' });
      if (error) console.error('[daily_reflections upsert]', error);
      pendingRef.current[date] = Math.max(0, (pendingRef.current[date] ?? 1) - 1);
    };
    upsertQueueRef.current = upsertQueueRef.current.then(run, run);
    return upsertQueueRef.current;
  }, [userId, reflectionsByDate]);

  const addLearning = useCallback((date, text) => {
    const current = reflectionsByDate[date] ?? empty(date);
    const item = { id: crypto.randomUUID(), text };
    return upsert(date, { learnings: [...current.learnings, item] });
  }, [reflectionsByDate, upsert]);

  const editLearning = useCallback((date, id, text) => {
    const current = reflectionsByDate[date] ?? empty(date);
    const learnings = current.learnings.map(i => i.id === id ? { ...i, text } : i);
    return upsert(date, { learnings });
  }, [reflectionsByDate, upsert]);

  const deleteLearning = useCallback((date, id) => {
    const current = reflectionsByDate[date] ?? empty(date);
    const learnings = current.learnings.filter(i => i.id !== id);
    return upsert(date, { learnings });
  }, [reflectionsByDate, upsert]);

  const updateBestChoice = useCallback((date, text) => upsert(date, { bestChoice: text }), [upsert]);
  const updateTomorrowPlan = useCallback((date, text) => upsert(date, { tomorrowPlan: text }), [upsert]);

  // 이번 주(월~일) 배운 점 개수 + 오늘까지의 연속 작성일수
  const getWeekStats = useCallback((referenceDate) => {
    const ref = new Date(referenceDate);
    const day = ref.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + mondayOffset);

    let learningCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const r = reflectionsByDate[toDateString(d)];
      if (r) learningCount += r.learnings.length;
    }

    let streak = 0;
    let cursor = toDateString(new Date());
    while (hasContent(reflectionsByDate[cursor])) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    return { learningCount, streak };
  }, [reflectionsByDate]);

  const reflectionDates = new Set(
    Object.keys(reflectionsByDate).filter(d => hasContent(reflectionsByDate[d]))
  );

  return {
    loading,
    getForDate,
    addLearning, editLearning, deleteLearning,
    updateBestChoice, updateTomorrowPlan,
    getWeekStats,
    reflectionDates,
  };
}
