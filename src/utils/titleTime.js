// 제목 끝에 적은 시간을 읽어 낸다 — 시간 칸에서 시·분을 일일이 고르기 귀찮아서 도입.
//   '팀 회의 1400'        → 제목 '팀 회의', 시작 14:00
//   '팀 회의 1400-1530'   → 시작 14:00, 종료 15:30   (구분은 - 또는 ~)
//   '팀 회의 14:00'       → 콜론을 써도 된다 ('9:30' 처럼 시가 한 자리여도)
// 일부러 좁게 읽는다:
//   - 콜론 없는 숫자는 **딱 4자리**만. '토익 900', '3회' 같은 건 시간이 아니다.
//   - 숫자 앞에 **띄어쓰기**가 있어야 한다. 'A1400' 같은 품번·제목만 숫자인 경우는 건드리지 않는다.
//   - 24:00 이상·60분 이상은 시간이 아니다 ('예산 2580').
// 그래도 '계획 2026' 은 20:26 으로 읽히므로, 쓰는 쪽에서 읽은 결과를 미리 보여 주고 끌 수 있게 한다.

const ONE = '(\\d{1,2}:\\d{2}|\\d{4})';
const TAIL = new RegExp(`^(.*\\S)\\s+${ONE}(?:\\s*[-~]\\s*${ONE})?$`);

function toTime(raw) {
  const [h, m] = raw.includes(':')
    ? raw.split(':').map(Number)
    : [Number(raw.slice(0, 2)), Number(raw.slice(2))];
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 돌려주는 값: { title, time, endTime, raw } 또는 null(끝에 시간이 없음)
export function parseTitleTime(input) {
  const text = String(input ?? '').trim();
  const match = TAIL.exec(text);
  if (!match) return null;
  const [, title, startRaw, endRaw] = match;
  const time = toTime(startRaw);
  if (!time) return null;
  const endTime = endRaw ? toTime(endRaw) : '';
  // 종료 쪽이 시간이 아니면('회의 1400-9999') 통째로 제목으로 둔다 — 반만 읽으면 제목이 깨진다
  if (endRaw && !endTime) return null;
  return { title, time, endTime, raw: text.slice(title.length).trim() };
}
