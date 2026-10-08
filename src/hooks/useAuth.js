import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { writeStored, removeStoredByPrefix } from '../utils/safeStorage';
import { saveServerRefreshToken } from '../lib/googleTokenStore';

export const GOOGLE_CALENDAR_TOKEN_KEY = 'google_calendar_token';
export const GOOGLE_CALENDAR_REFRESH_KEY = 'google_calendar_refresh_token';
// refresh token 을 받은 시각(ms). 서버에 저장된 것과 어느 쪽이 최신인지 비교하는 데 쓴다
export const GOOGLE_CALENDAR_REFRESH_AT_KEY = 'google_calendar_refresh_at';

// 같은 브라우저를 여러 앱 계정이 돌려쓰는 경우를 대비해 앱 사용자별로 분리 저장
export const googleCalendarTokenKey = (userId) => `${GOOGLE_CALENDAR_TOKEN_KEY}:${userId}`;
export const googleCalendarRefreshKey = (userId) => `${GOOGLE_CALENDAR_REFRESH_KEY}:${userId}`;
export const googleCalendarRefreshAtKey = (userId) => `${GOOGLE_CALENDAR_REFRESH_AT_KEY}:${userId}`;

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'SIGNED_IN') {
        window.history.replaceState({}, '', '/');
        // Google 캘린더 조회 권한으로 로그인한 경우, 세션 시작 시점에만 내려오는
        // provider_token(구글 access token)을 붙잡아 다음 API 호출에 쓸 수 있게 저장
        if (session?.provider_token) {
          writeStored(googleCalendarTokenKey(session.user.id), JSON.stringify({
            token: session.provider_token,
            expiresAt: Date.now() + 55 * 60 * 1000, // 구글 access token은 보통 1시간 유효
          }));
        }
        // refresh token은 만료가 없어서, access token이 끊겨도 이걸로 서버에서 재발급받아 재로그인 없이 연동 유지
        // 서버(google_tokens)에도 같이 저장 → 다른 기기에서도 따로 연동하지 않고 바로 쓴다
        if (session?.provider_refresh_token) {
          const now = Date.now();
          writeStored(googleCalendarRefreshKey(session.user.id), session.provider_refresh_token);
          writeStored(googleCalendarRefreshAtKey(session.user.id), String(now));
          saveServerRefreshToken(session.user.id, session.provider_refresh_token, now);
        }
      }
      if (event === 'SIGNED_OUT') {
        // 이 브라우저에 남아있는 구글 캘린더 토큰을 전부 정리 (공유 컴퓨터 대비)
        removeStoredByPrefix(GOOGLE_CALENDAR_TOKEN_KEY, GOOGLE_CALENDAR_REFRESH_KEY, GOOGLE_CALENDAR_REFRESH_AT_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // readonly: 캘린더 목록/일정 조회, events: 앱에서 만든 일정을 구글 캘린더에 쓰기
        scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events',
        // access_type=offline이어야 refresh token이 내려와서, access token 만료 후에도
        // 재로그인 없이 서버(Edge Function)에서 조용히 재발급받을 수 있다
        queryParams: { prompt: 'consent', access_type: 'offline' },
      },
    });
  };

  const toFakeEmail = (username) => `${username.trim()}@todo-app.local`;

  const signInWithEmail = async (username, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: toFakeEmail(username), password });
    if (error) throw error;
  };

  const signUpWithEmail = async (username, password) => {
    const { error } = await supabase.auth.signUp({
      email: toFakeEmail(username),
      password,
      options: { data: { name: username } },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut };
}
