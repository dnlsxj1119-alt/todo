import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // URL에 code 파라미터가 있으면 코드 교환 먼저 처리
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const errorParam = url.searchParams.get('error');

    if (errorParam) {
      window.history.replaceState({}, '', '/');
      setLoading(false);
      return;
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(window.location.href)
        .then(({ data, error }) => {
          if (!error && data.session) {
            setUser(data.session.user);
          }
          window.history.replaceState({}, '', '/');
          setLoading(false);
        });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  const signOut = () => supabase.auth.signOut();

  return { user, loading, signInWithGoogle, signOut };
}
