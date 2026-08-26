import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// 외부 캘린더 구독용 시크릿 토큰 관리.
// 토큰은 클라이언트에서 생성해 RLS로 보호되는 테이블에 저장하고,
// 재발급(upsert)하면 이전 URL은 즉시 무효화된다.

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function useCalendarFeed(userId) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('calendar_feed_tokens')
      .select('token')
      .maybeSingle()
      .then(({ data }) => {
        setToken(data?.token ?? null);
        setLoading(false);
      });
  }, [userId]);

  const regenerate = useCallback(async () => {
    const next = generateToken();
    const { error } = await supabase
      .from('calendar_feed_tokens')
      .upsert({ user_id: userId, token: next, created_at: new Date().toISOString() });
    if (error) return false;
    setToken(next);
    return true;
  }, [userId]);

  const revoke = useCallback(async () => {
    const { error } = await supabase.from('calendar_feed_tokens').delete().eq('user_id', userId);
    if (!error) setToken(null);
  }, [userId]);

  const feedUrl = token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ics-feed?token=${token}`
    : null;

  return { feedUrl, hasToken: !!token, loading, regenerate, revoke };
}
