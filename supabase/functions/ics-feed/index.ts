import { createClient } from 'npm:@supabase/supabase-js@2';

// 외부 캘린더 클라이언트(구글/애플/노션 캘린더 등)가 구독하는 ICS(RFC 5545) 피드.
// 캘린더 클라이언트는 인증 헤더를 못 보내므로 URL의 시크릿 토큰으로 인증한다
// (구글 캘린더의 "비공개 주소"와 같은 방식). 읽기 전용 SELECT만 수행한다.
// 배포 시 JWT 검증을 꺼야 한다: supabase functions deploy ics-feed --no-verify-jwt

const TZID = 'Asia/Seoul';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// '2026-08-26' → '20260826'
function fmtDate(ds: string) {
  return ds.replaceAll('-', '');
}

// ('2026-08-26', '09:30') → '20260826T093000'
function fmtDateTime(ds: string, time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${fmtDate(ds)}T${pad(h)}${pad(m)}00`;
}

function addDaysStr(ds: string, n: number) {
  const d = new Date(`${ds}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function plusOneHour(ds: string, time: string) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 60;
  if (total >= 1440) return { date: addDaysStr(ds, 1), time: `${pad(Math.floor((total - 1440) / 60))}:${pad((total - 1440) % 60)}` };
  return { date: ds, time: `${pad(Math.floor(total / 60))}:${pad(total % 60)}` };
}

// RFC 5545 텍스트 이스케이프
function esc(text: string) {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

// 75옥텟 라인 폴딩. UTF-8 멀티바이트 문자(한글 등)가 잘리지 않게 문자 단위로 접는다.
function fold(line: string) {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = encoder.encode(ch).length;
    if (bytes + len > 74) {
      out.push(current);
      current = ' ' + ch; // continuation line은 공백으로 시작
      bytes = 1 + len;
    } else {
      current += ch;
      bytes += len;
    }
  }
  out.push(current);
  return out.join('\r\n');
}

// created_at(ISO) → '20260826T083000Z'
function fmtStamp(iso: string | null) {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

type ItemRow = {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  date: string | null;
  time: string | null;
  end_time: string | null;
  end_date: string | null;
  completed: boolean | null;
  created_at: string | null;
};

function buildEvent(item: ItemRow): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${item.id}@flow-todo`,
    `DTSTAMP:${fmtStamp(item.created_at)}`,
    `SUMMARY:${esc(item.title ?? '(제목 없음)')}`,
  ];
  if (item.description) lines.push(`DESCRIPTION:${esc(item.description)}`);

  const date = item.date!;
  const time = (item.time ?? '').slice(0, 5); // 'HH:MM:SS' 대비
  const endTime = (item.end_time ?? '').slice(0, 5);
  const endDate = item.end_date || date;

  if (time) {
    // 시간 지정 이벤트. 종료가 없거나 시작보다 이르면 1시간짜리로 처리.
    let end = { date: endDate, time: endTime };
    if (!endTime || `${endDate}T${endTime}` <= `${date}T${time}`) {
      end = plusOneHour(endDate, time);
    }
    lines.push(`DTSTART;TZID=${TZID}:${fmtDateTime(date, time)}`);
    lines.push(`DTEND;TZID=${TZID}:${fmtDateTime(end.date, end.time)}`);
  } else {
    // 종일 이벤트. DTEND는 exclusive라 하루 더한다.
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(addDaysStr(endDate, 1))}`);
  }

  lines.push('END:VEVENT');
  return lines;
}

function buildCalendar(items: ItemRow[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//flow-todo//ics-feed//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:플로우',
    `X-WR-TIMEZONE:${TZID}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:KST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const item of items) lines.push(...buildEvent(item));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const token = new URL(req.url).searchParams.get('token');
  if (!token || token.length < 32) {
    return new Response('Not Found', { status: 404 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: tokenRow } = await supabase
    .from('calendar_feed_tokens')
    .select('user_id')
    .eq('token', token)
    .maybeSingle();
  if (!tokenRow) {
    // 유효하지 않은 토큰은 존재 여부를 드러내지 않도록 동일하게 404
    return new Response('Not Found', { status: 404 });
  }

  const { data: items, error } = await supabase
    .from('items')
    .select('id, type, title, description, date, time, end_time, end_date, completed, created_at')
    .eq('user_id', tokenRow.user_id)
    .order('date', { ascending: true });
  if (error) {
    return new Response('Internal Server Error', { status: 500 });
  }

  const dated = (items ?? []).filter((it) => it.date);
  const body = buildCalendar(dated as ItemRow[]);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="flow.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
