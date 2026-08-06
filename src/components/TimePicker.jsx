import { useState, useEffect } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 10, 20, 30, 40, 50];

export default function TimePicker({ value, onChange, placeholder = '시간 선택' }) {
  const [h, m] = value ? value.split(':').map(Number) : [null, null];
  const [pendingH, setPendingH] = useState(null);
  const [pendingM, setPendingM] = useState(null);

  // value가 바뀌면(부모에서 초기화 등) 임시 선택값도 리셋
  useEffect(() => { setPendingH(null); setPendingM(null); }, [value]);

  const displayH = h ?? pendingH;
  const displayM = m ?? pendingM;

  // 시를 고르면 분은 아직 안 골랐어도 00으로 자동입력해서 바로 onChange를 쏜다.
  // 반대로 분을 먼저 고른 경우엔 시가 정해지기 전까지 onChange를 쏘지 않는다 -
  // 그 순간 시를 0으로 가정해버리면 "가짜" 시간값이 시작시간과 비교되어
  // 잘못된 종료 날짜 자동입력을 유발하기 때문 (55d71df 참고).
  const handleHour = (e) => {
    const val = e.target.value;
    if (val === '') { setPendingH(null); onChange(''); return; }
    const newH = Number(val);
    const newM = displayM ?? 0;
    if (displayM === null) setPendingM(newM);
    onChange(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
  };

  const handleMinute = (e) => {
    const val = e.target.value;
    if (val === '') { setPendingM(null); onChange(''); return; }
    const newM = Number(val);
    if (displayH === null) { setPendingM(newM); return; }
    onChange(`${String(displayH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
  };

  return (
    <div className="time-picker">
      <select className="time-select" value={displayH ?? ''} onChange={handleHour}>
        <option value="">시</option>
        {HOURS.map(i => (
          <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
        ))}
      </select>
      <span className="time-colon">:</span>
      <select className="time-select" value={displayM ?? ''} onChange={handleMinute}>
        <option value="">분</option>
        {MINUTES.map(i => (
          <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
        ))}
      </select>
    </div>
  );
}
