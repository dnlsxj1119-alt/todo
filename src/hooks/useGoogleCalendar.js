import { useState, useEffect, useCallback, useMemo } from 'react';
import { GOOGLE_CALENDAR_TOKEN_KEY } from './useAuth';

function readToken() {
  try {
    const raw = localStorage.getItem(GOOGLE_CALENDAR_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || parsed.expiresAt < Date.now()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

// 구글 이벤트는 구글 쪽에 완료 상태가 없어서, 완료 표시는 로컬에만 저장 (사용자별)
function completedStorageKey(userId) {
  return `googleCalendarCompleted:${userId ?? 'anon'}`;
}

function readCompletedSet(userId) {
  try {
    const raw = localStorage.getItem(completedStorageKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

// 구글 이벤트를 앱 내부 아이템과 비슷한 모양으로 변환 (읽기 전용 오버레이용)
function toDisplayEvent(raw, calendar) {
  const isAllDay = !!raw.start?.date;
  const startStr = raw.start?.date ?? raw.start?.dateTime;
  const endStr = raw.end?.date ?? raw.end?.dateTime;
  const date = startStr.slice(0, 10);
  let endDate = endStr.slice(0, 10);
  // 구글의 all-day 종료일은 배타적(exclusive)이라 하루 빼서 실제 마지막 날로 보정
  if (isAllDay && endDate > date) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - 1);
    endDate = d.toISOString().slice(0, 10);
  }
  return {
    id: `google-${calendar.id}-${raw.id}`,
    source: 'google',
    title: raw.summary || '(제목 없음)',
    date,
    time: isAllDay ? '' : (raw.start.dateTime.slice(11, 16)),
    endDate: endDate !== date ? endDate : '',
    endTime: isAllDay ? '' : (raw.end?.dateTime?.slice(11, 16) ?? ''),
    allDay: isAllDay,
    htmlLink: raw.htmlLink,
    calendarSummary: calendar.summary,
    calendarColor: calendar.backgroundColor,
  };
}

export function useGoogleCalendar(userId, rangeStart, rangeEnd) {
  const [connected, setConnected] = useState(() => !!readToken());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [completedIds, setCompletedIds] = useState(() => readCompletedSet(userId));

  useEffect(() => {
    setCompletedIds(readCompletedSet(userId));
  }, [userId]);

  const toggleGoogleEventDone = useCallback((id) => {
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(completedStorageKey(userId), JSON.stringify([...next]));
      return next;
    });
  }, [userId]);

  useEffect(() => {
    setConnected(!!readToken());
  }, [userId]);

  useEffect(() => {
    if (!userId || !connected || !rangeStart || !rangeEnd) {
      setEvents([]);
      return;
    }
    const token = readToken();
    if (!token) {
      setConnected(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timeMin = new Date(`${rangeStart}T00:00:00`).toISOString();
    const timeMax = new Date(`${rangeEnd}T23:59:59`).toISOString();
    const headers = { Authorization: `Bearer ${token}` };

    (async () => {
      try {
        const listRes = await fetch(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader',
          { headers }
        );
        if (listRes.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
        const listData = await listRes.json();
        const calendars = (listData.items ?? []).filter(c => c.selected !== false && !c.hidden);

        const results = await Promise.all(calendars.map(async (cal) => {
          const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`);
          url.searchParams.set('timeMin', timeMin);
          url.searchParams.set('timeMax', timeMax);
          url.searchParams.set('singleEvents', 'true');
          url.searchParams.set('orderBy', 'startTime');
          url.searchParams.set('maxResults', '250');
          const res = await fetch(url, { headers });
          if (res.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.items ?? [])
            .filter(ev => ev.status !== 'cancelled' && (ev.start?.date || ev.start?.dateTime))
            .map(ev => toDisplayEvent(ev, cal));
        }));

        if (!cancelled) setEvents(results.flat());
      } catch (e) {
        if (cancelled) return;
        if (e.code === 401) {
          localStorage.removeItem(GOOGLE_CALENDAR_TOKEN_KEY);
          setConnected(false);
          setError('구글 로그인이 만료됐어요. 다시 연결해 주세요.');
        } else {
          setError('구글 캘린더를 불러오지 못했어요.');
        }
        setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, connected, rangeStart, rangeEnd]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(GOOGLE_CALENDAR_TOKEN_KEY);
    setConnected(false);
    setEvents([]);
  }, []);

  const displayEvents = useMemo(
    () => events.map(ev => ({ ...ev, completed: completedIds.has(ev.id) })),
    [events, completedIds]
  );

  const eventsByDate = useMemo(() => {
    const map = {};
    displayEvents.forEach(ev => {
      const start = ev.date;
      const end = ev.endDate || ev.date;
      let cursor = start;
      let guard = 0;
      while (cursor <= end && guard < 366) {
        (map[cursor] ??= []).push(ev);
        if (cursor === end) break;
        const d = new Date(cursor);
        d.setDate(d.getDate() + 1);
        cursor = d.toISOString().slice(0, 10);
        guard++;
      }
    });
    return map;
  }, [displayEvents]);

  const getGoogleEventsForDate = useCallback((ds) => eventsByDate[ds] ?? [], [eventsByDate]);

  return { connected, loading, error, events: displayEvents, getGoogleEventsForDate, toggleGoogleEventDone, disconnect };
}
