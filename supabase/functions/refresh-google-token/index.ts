import { corsHeaders } from '../_shared/cors.ts';

// Supabase Auth는 구글 provider_token(1시간 만료)을 갱신해주지 않으므로,
// 클라이언트가 보관 중인 provider_refresh_token으로 여기서 새 access_token을 발급받는다.
// client_secret이 필요한 단계라 반드시 서버(Edge Function)에서만 처리한다.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { refresh_token } = await req.json();
    if (!refresh_token) {
      return new Response(JSON.stringify({ error: 'refresh_token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'server not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: data.error ?? 'refresh_failed' }), {
        status: tokenRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ access_token: data.access_token, expires_in: data.expires_in }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
