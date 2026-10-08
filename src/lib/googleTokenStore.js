import { supabase } from './supabase';

// 구글 refresh token 의 서버 보관소 (public.google_tokens, 본인 행만 RLS).
// 브라우저 localStorage 에만 두면 기기마다 따로 연동해야 했고, 연동 안 한 기기에서 만든 일정은 구글에 안 올라갔다.
// 서버에 같이 두고 앱을 열 때 더 최신 쪽으로 맞춘다.
// 테이블을 아직 안 만든 경우(마이그레이션 미실행)엔 조용히 없는 것으로 친다 — 앱이 멈추면 안 된다.

function isMissingTable(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|Could not find the table/i.test(String(error.message ?? ''));
}

let warnedMissing = false;
function warnMissing() {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('[google_tokens] 테이블이 없어 구글 토큰을 서버에 저장하지 못했어요. supabase/migrations/20261008_google_tokens.sql 을 실행하세요.');
}

// { token, updatedAt(ms) } | null
export async function fetchServerRefreshToken(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('google_tokens')
    .select('refresh_token, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) warnMissing(); else console.error('[google_tokens select]', error);
    return null;
  }
  if (!data?.refresh_token) return null;
  return { token: data.refresh_token, updatedAt: new Date(data.updated_at).getTime() || 0 };
}

export async function saveServerRefreshToken(userId, token, savedAtMs = Date.now()) {
  if (!userId || !token) return;
  const { error } = await supabase
    .from('google_tokens')
    .upsert({ user_id: userId, refresh_token: token, updated_at: new Date(savedAtMs).toISOString() }, { onConflict: 'user_id' });
  if (error) { if (isMissingTable(error)) warnMissing(); else console.error('[google_tokens upsert]', error); }
}

export async function deleteServerRefreshToken(userId) {
  if (!userId) return;
  const { error } = await supabase.from('google_tokens').delete().eq('user_id', userId);
  if (error) { if (isMissingTable(error)) warnMissing(); else console.error('[google_tokens delete]', error); }
}
