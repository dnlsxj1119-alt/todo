const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 10, 20, 30, 40, 50];

export default function TimePicker({ value, onChange, placeholder = '시간 선택' }) {
  const [h, m] = value ? value.split(':').map(Number) : [null, null];

  const update = (newH, newM) => {
    if (newH === null || newM === null) { onChange(''); return; }
    onChange(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
  };

  const handleHour = (e) => {
    const val = e.target.value;
    if (val === '') { onChange(''); return; }
    update(Number(val), m ?? 0);
  };

  const handleMinute = (e) => {
    const val = e.target.value;
    if (val === '') { onChange(''); return; }
    update(h ?? 0, Number(val));
  };

  return (
    <div className="time-picker">
      <select className="time-select" value={h ?? ''} onChange={handleHour}>
        <option value="">시</option>
        {HOURS.map(i => (
          <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
        ))}
      </select>
      <span className="time-colon">:</span>
      <select className="time-select" value={m ?? ''} onChange={handleMinute}>
        <option value="">분</option>
        {MINUTES.map(i => (
          <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
        ))}
      </select>
    </div>
  );
}
