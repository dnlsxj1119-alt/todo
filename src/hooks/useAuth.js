import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const GOOGLE_CALENDAR_TOKEN_KEY = 'google_calendar_token';

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
          localStorage.setItem(GOOGLE_CALENDAR_TOKEN_KEY, JSON.stringify({
            token: session.provider_token,
            expiresAt: Date.now() + 55 * 60 * 1000, // 구글 access token은 보통 1시간 유효
          }));
        }
      }
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(GOOGLE_CALENDAR_TOKEN_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: { prompt: 'consent' },
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
