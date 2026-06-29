import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'SIGNED_IN') {
        window.history.replaceState({}, '', '/');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
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
