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

  // 시/분이 둘 다 정해졌을 때만 onChange를 쏜다 (한쪽만 고른 순간의
  // "가짜" 시간값이 시작시간과 비교되어 잘못된 자동입력을 유발하는 것을 방지)
  const handleHour = (e) => {
    const val = e.target.value;
    if (val === '') { setPendingH(null); onChange(''); return; }
    const newH = Number(val);
    if (displayM === null) { setPendingH(newH); return; }
    onChange(`${String(newH).padStart(2, '0')}:${String(displayM).padStart(2, '0')}`);
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
