import { useState, useEffect, useCallback, useMemo } from 'react';
import { googleCalendarTokenKey, googleCalendarRefreshKey, googleCalendarRefreshAtKey } from './useAuth';
import { fetchServerRefreshToken, saveServerRefreshToken, deleteServerRefreshToken } from '../lib/googleTokenStore';
import {
  readToken, hasRefreshToken, getValidToken, fetchWithAuth,
  GOOGLE_SYNC_EVENT, GOOGLE_SYNC_EXPIRED_MSG,
} from '../lib/googleCalendarApi';
import { readStored, writeStored, removeStored } from '../utils/safeStorage';

// 구글 이벤트는 구글 쪽에 완료 상태가 없어서, 완료 표시는 로컬에만 저장 (사용자별)
function completedStorageKey(userId) {
  return `googleCalendarCompleted:${userId ?? 'anon'}`;
}

function readCompletedSet(userId) {
  try {
    const raw = readStored(completedStorageKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

// 구글 이벤트를 앱 내부 아이템과 비슷한 모양으로 변환 (읽기 전용 오버레이용)
// 구글이 주는 htmlLink 에는 계정 정보가 없어서, 브라우저에 여러 구글 계정이 로그인돼 있으면
// 기본 계정으로 열려 "일정을 찾을 수 없음"이 뜬다. 연동한 계정(기본 캘린더 id = 이메일)을 authuser 로 붙여준다.
function withAccount(link, accountEmail) {
  if (!link || !accountEmail) return link;
  try {
    const url = new URL(link);
    url.searchParams.set('authuser', accountEmail);
    return url.toString();
  } catch {
    return link;
  }
}

function toDisplayEvent(raw, calendar, accountEmail) {
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
    htmlLink: withAccount(raw.htmlLink, accountEmail),
    calendarSummary: calendar.summary,
    calendarColor: calendar.backgroundColor,
  };
}

export function useGoogleCalendar(userId, rangeStart, rangeEnd) {
  const [connected, setConnected] = useState(() => !!readToken(userId) || hasRefreshToken(userId));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // 연동은 살아 있는데 특정 일정이 구글에서 거부된 경우 (빨간 '끊김'과 구분해 주황으로)
  const [syncIssue, setSyncIssue] = useState(null);
  const [completedIds, setCompletedIds] = useState(() => readCompletedSet(userId));

  useEffect(() => {
    setCompletedIds(readCompletedSet(userId));
  }, [userId]);

  const toggleGoogleEventDone = useCallback((id) => {
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      writeStored(completedStorageKey(userId), JSON.stringify([...next]));
      return next;
    });
  }, [userId]);

  useEffect(() => {
    setConnected(!!readToken(userId) || hasRefreshToken(userId));
  }, [userId]);

  // 서버(google_tokens)와 브라우저의 refresh token 을 맞춘다 — 더 최신 쪽이 이긴다.
  // - 이 기기에 없고 서버에 있으면(다른 기기에서 연동) → 받아와서 바로 연동 상태로
  // - 이 기기 것이 더 새것이면(여기서 방금 연동) → 서버에 올려 다른 기기도 쓰게
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const server = await fetchServerRefreshToken(userId);
      if (cancelled) return;
      const local = readStored(googleCalendarRefreshKey(userId));
      const localAt = Number(readStored(googleCalendarRefreshAtKey(userId)) ?? 0);
      if (server && (!local || (server.token !== local && server.updatedAt > localAt))) {
        writeStored(googleCalendarRefreshKey(userId), server.token);
        writeStored(googleCalendarRefreshAtKey(userId), String(server.updatedAt));
        // 예전 기기의 access token 이 남아 있으면 그걸 먼저 쓰다 401 → 재발급으로 넘어가니 지워 둔다
        removeStored(googleCalendarTokenKey(userId));
        setError(null);
        setConnected(true);
      } else if (local && (!server || (server.token !== local && localAt > server.updatedAt))) {
        saveServerRefreshToken(userId, local, localAt || Date.now());
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // '연동됨'은 저장소에 토큰이 있다는 뜻일 뿐이라, 앱을 열 때 실제로 쓸 수 있는 토큰인지 한 번 확인한다.
  // (가져오기 범위를 비워 둬서 구글에서 읽는 동작이 없고, 만료를 알아챌 다른 길이 없었다)
  // 살아 있는 access token 이 있으면 네트워크 호출 없이 끝나고, 없으면 재발급을 한 번 시도한다.
  useEffect(() => {
    if (!userId || !connected) return;
    let cancelled = false;
    (async () => {
      const token = await getValidToken(userId);
      if (!cancelled && !token) setError(GOOGLE_SYNC_EXPIRED_MSG);
    })();
    return () => { cancelled = true; };
  }, [userId, connected]);

  // 일정 저장 시 구글 반영 결과(useItems → applyGoogleSync)를 받아 사이드바 상태에 띄운다
  useEffect(() => {
    const onSync = (e) => {
      const d = e.detail ?? {};
      if (d.ok) { setError(null); setSyncIssue(null); return; }
      if (d.expired) setError(d.message ?? GOOGLE_SYNC_EXPIRED_MSG);
      else setSyncIssue(d.message ?? '구글 캘린더에 반영하지 못했어요.');
    };
    window.addEventListener(GOOGLE_SYNC_EVENT, onSync);
    return () => window.removeEventListener(GOOGLE_SYNC_EVENT, onSync);
  }, []);

  useEffect(() => {
    if (!userId || !connected || !rangeStart || !rangeEnd) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timeMin = new Date(`${rangeStart}T00:00:00`).toISOString();
    const timeMax = new Date(`${rangeEnd}T23:59:59`).toISOString();

    (async () => {
      try {
        const token = await getValidToken(userId);
        if (!token) throw Object.assign(new Error('unauthorized'), { code: 401 });

        const listRes = await fetchWithAuth(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader',
          token,
          userId
        );
        if (listRes.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
        const listData = await listRes.json();
        const calendars = (listData.items ?? []).filter(c => c.selected !== false && !c.hidden);
        const accountEmail = (listData.items ?? []).find(c => c.primary)?.id ?? null;

        const results = await Promise.all(calendars.map(async (cal) => {
          const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`);
          url.searchParams.set('timeMin', timeMin);
          url.searchParams.set('timeMax', timeMax);
          url.searchParams.set('singleEvents', 'true');
          url.searchParams.set('orderBy', 'startTime');
          url.searchParams.set('maxResults', '250');
          const res = await fetchWithAuth(url, token, userId);
          if (res.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.items ?? [])
            .filter(ev => ev.status !== 'cancelled' && (ev.start?.date || ev.start?.dateTime))
            .map(ev => toDisplayEvent(ev, cal, accountEmail));
        }));

        if (!cancelled) setEvents(results.flat());
      } catch (e) {
        if (cancelled) return;
        if (e.code === 401) {
          removeStored(googleCalendarTokenKey(userId));
          removeStored(googleCalendarRefreshKey(userId));
          setConnected(false);
          setError(GOOGLE_SYNC_EXPIRED_MSG);
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
    removeStored(googleCalendarTokenKey(userId));
    removeStored(googleCalendarRefreshKey(userId));
    removeStored(googleCalendarRefreshAtKey(userId));
    deleteServerRefreshToken(userId);
    setConnected(false);
    setError(null);
    setSyncIssue(null);
    setEvents([]);
  }, [userId]);

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

  return { connected, loading, error, syncIssue, events: displayEvents, getGoogleEventsForDate, toggleGoogleEventDone, disconnect };
}
