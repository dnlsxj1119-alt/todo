import { googleCalendarTokenKey, googleCalendarRefreshKey } from '../hooks/useAuth';
import { addDays } from '../utils/dateUtils';
import { supabase } from './supabase';
import { readStored, writeStored } from '../utils/safeStorage';

export function readToken(userId) {
  try {
    const raw = readStored(googleCalendarTokenKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || parsed.expiresAt < Date.now()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

export function hasRefreshToken(userId) {
  return !!readStored(googleCalendarRefreshKey(userId));
}

export function isGoogleConnected(userId) {
  return !!readToken(userId) || hasRefreshToken(userId);
}

// access token이 만료됐을 때, 저장해둔 refresh token으로 서버(Edge Function)에서
// 새 access token을 조용히 재발급받는다 (사용자가 다시 로그인할 필요 없음)
export async function refreshAccessToken(userId) {
  const refreshToken = readStored(googleCalendarRefreshKey(userId));
  if (!refreshToken) return null;
  try {
    const { data, error } = await supabase.functions.invoke('refresh-google-token', {
      body: { refresh_token: refreshToken },
    });
    if (error || !data?.access_token) return null;
    const expiresAt = Date.now() + Math.max(60, (data.expires_in ?? 3300) - 120) * 1000;
    writeStored(googleCalendarTokenKey(userId), JSON.stringify({ token: data.access_token, expiresAt }));
    return data.access_token;
  } catch {
    return null;
  }
}

export async function getValidToken(userId) {
  return readToken(userId) ?? (await refreshAccessToken(userId));
}

// 동기화 결과를 화면(useGoogleCalendar)에 알리는 통로.
// 예전엔 실패해도 console 에만 남겨서, 사이드바는 '연동됨'인데 구글엔 아무것도 안 올라가는 상태를
// 사용자가 알 길이 없었다. (refresh token 이 죽어도 재발급 실패 → null → 조용히 넘어갔다)
export const GOOGLE_SYNC_EVENT = 'google-calendar-sync';
export const GOOGLE_SYNC_EXPIRED_MSG = '구글 로그인이 만료됐어요. 다시 연결해 주세요.';
export const GOOGLE_SYNC_FAILED_MSG = '구글 캘린더에 반영하지 못했어요.';
function notifySync(detail) {
  try { window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_EVENT, { detail })); } catch { /* 테스트 환경 등 */ }
}

// 401을 받으면 refresh token으로 한 번 재발급받아 재시도한다
export async function fetchWithAuth(url, token, userId, options = {}) {
  let currentToken = token;
  const build = (t) => ({ ...options, headers: { ...(options.headers ?? {}), Authorization: `Bearer ${t}` } });
  let res = await fetch(url, build(currentToken));
  if (res.status === 401) {
    currentToken = await refreshAccessToken(userId);
    if (!currentToken) return res;
    res = await fetch(url, build(currentToken));
  }
  return res;
}

// 앱 아이템(일정)을 구글 캘린더 이벤트 body 형태로 변환
function itemToGoogleEvent(item) {
  if (!item.date) return null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = { summary: item.title || '(제목 없음)' };
  if (item.description) body.description = item.description;

  if (item.time) {
    const endDate = item.endDate || item.date;
    let endTime = item.endTime;
    if (!endTime) {
      const [h, m] = item.time.split(':').map(Number);
      const d = new Date(2000, 0, 1, h, m + 60);
      endTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    body.start = { dateTime: `${item.date}T${item.time}:00`, timeZone };
    body.end = { dateTime: `${endDate}T${endTime}:00`, timeZone };
  } else {
    // 구글의 all-day 종료일은 배타적(exclusive)이라 실제 종료일 다음날로 지정
    const exclusiveEnd = addDays(item.endDate || item.date, 1);
    body.start = { date: item.date };
    body.end = { date: exclusiveEnd };
  }
  return body;
}

// PATCH 는 보내지 않은 필드를 그대로 남긴다. 그런데 구글 이벤트의 start/end 는
// `date`(종일) 와 `dateTime`(시간 지정) 중 하나만 있어야 한다.
// 그래서 종일 → 시간 지정으로 바꾸면 기존 `date` 가 남아 둘이 함께 있는 잘못된 값이 되고,
// 구글이 400 을 내거나 예전 종일 일정 그대로 남는다
// (실제로 "시간 없이 만든 일정에 시간을 넣었는데 구글엔 그대로"인 문제가 났다).
// → 쓰지 않는 쪽을 null 로 명시해서 지운다. 생성(POST)에는 붙이지 않는다.
function clearUnusedTimeFields(body) {
  if (!body) return body;
  const fix = (v) => {
    if (!v) return v;
    if (v.dateTime) return { ...v, date: null };
    if (v.date) return { ...v, dateTime: null, timeZone: null };
    return v;
  };
  return { ...body, start: fix(body.start), end: fix(body.end) };
}

const EVENTS_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function createGoogleEvent(userId, item) {
  const token = await getValidToken(userId);
  if (!token) return null;
  const body = itemToGoogleEvent(item);
  if (!body) return null;
  const res = await fetchWithAuth(EVENTS_BASE, token, userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`구글 캘린더 생성 실패 (${res.status})`);
  return res.json();
}

export async function updateGoogleEvent(userId, eventId, item) {
  const token = await getValidToken(userId);
  if (!token) return null;
  const body = clearUnusedTimeFields(itemToGoogleEvent(item));
  if (!body) return null;
  const url = `${EVENTS_BASE}/${encodeURIComponent(eventId)}`;
  const res = await fetchWithAuth(url, token, userId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 404 || res.status === 410) {
    // 구글 쪽에서 이미 삭제된 이벤트라면 새로 생성
    return createGoogleEvent(userId, item);
  }
  // 왜 실패했는지 모르면 손댈 수가 없어서 응답 본문까지 남긴다
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`구글 캘린더 수정 실패 (${res.status}) ${detail}`.trim());
  }
  return res.json();
}

// 구글에 그 이벤트가 아직 있는지. 없음(404/410) 또는 구글에서 삭제됨(status cancelled)이면 false.
// 다른 계정의 토큰으로 만든 이벤트도 지금 계정에선 404 라 false 가 된다.
// 네트워크 오류 등 판단이 안 되면 null (그대로 둔다).
export async function googleEventExists(userId, eventId) {
  const token = await getValidToken(userId);
  if (!token) return null;
  const url = `${EVENTS_BASE}/${encodeURIComponent(eventId)}`;
  const res = await fetchWithAuth(url, token, userId);
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data ? data.status !== 'cancelled' : null;
}

export async function deleteGoogleEvent(userId, eventId) {
  const token = await getValidToken(userId);
  if (!token) return;
  const url = `${EVENTS_BASE}/${encodeURIComponent(eventId)}`;
  const res = await fetchWithAuth(url, token, userId, { method: 'DELETE' });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`구글 캘린더 삭제 실패 (${res.status})`);
  }
}

// 앱 아이템 저장(추가/수정) 전에 호출: 필요하면 구글 캘린더에 생성/수정/삭제를 반영하고
// 새 googleEventId를 포함한 아이템을 돌려준다. 구글 연동이 안 돼 있으면 아무 것도 하지 않는다.
export async function applyGoogleSync(userId, prevItem, nextItem) {
  const isSchedule = nextItem.type === 'schedule';
  const existingId = nextItem.googleEventId ?? prevItem?.googleEventId ?? null;

  if (!isSchedule) {
    if (existingId) {
      deleteGoogleEvent(userId, existingId).catch(err => console.error('구글 캘린더 이벤트 삭제 실패', err));
    }
    return { ...nextItem, googleEventId: null };
  }

  if (!isGoogleConnected(userId)) {
    return { ...nextItem, googleEventId: existingId };
  }

  // 저장소엔 토큰이 있는데 재발급이 안 되면(refresh token 만료·철회) 연동이 죽은 것 → 화면에 알린다
  if (!(await getValidToken(userId))) {
    notifySync({ ok: false, expired: true, message: GOOGLE_SYNC_EXPIRED_MSG });
    return { ...nextItem, googleEventId: existingId };
  }

  try {
    let result;
    if (existingId) {
      const updated = await updateGoogleEvent(userId, existingId, nextItem);
      result = { ...nextItem, googleEventId: updated?.id ?? existingId };
    } else {
      const created = await createGoogleEvent(userId, nextItem);
      result = { ...nextItem, googleEventId: created?.id ?? null };
    }
    notifySync({ ok: true });
    return result;
  } catch (err) {
    console.error('구글 캘린더 동기화 실패', err);
    notifySync({ ok: false, message: `${GOOGLE_SYNC_FAILED_MSG} (${err?.message ?? '알 수 없는 오류'})` });
    return { ...nextItem, googleEventId: existingId };
  }
}
