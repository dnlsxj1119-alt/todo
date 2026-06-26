export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.setDate(diff));
}

export function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

export function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay(); // 0=Sun

  const days = [];
  // Prev month padding
  for (let i = 0; i < startDay; i++) {
    const d = new Date(year, month, -startDay + i + 1);
    days.push({ date: d, isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  // Next month padding to fill grid
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }
  return days;
}

export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isToday(date) {
  return toDateString(date) === toDateString(new Date());
}

export function formatMonthYear(date) {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
}

export function formatWeekRange(weekStart) {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  const opts = { month: 'long', day: 'numeric' };
  return `${weekStart.toLocaleDateString('ko-KR', opts)} - ${end.toLocaleDateString('ko-KR', opts)}`;
}

export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
export const DAY_NAMES_WEEK = ['월', '화', '수', '목', '금', '토', '일'];

export const TIME_SLOTS = [
  { key: 'morning', label: '아침', emoji: '🌅', range: '06:00 – 12:00' },
  { key: 'lunch',   label: '점심', emoji: '☀️',  range: '12:00 – 17:00' },
  { key: 'evening', label: '저녁', emoji: '🌆', range: '17:00 – 21:00' },
  { key: 'night',   label: '밤',   emoji: '🌙', range: '21:00 – 06:00' },
];

export const TIME_SLOT_ORDER = ['morning', 'lunch', 'evening', 'night'];

export function getSpanCount(startSlot, endSlot) {
  const s = TIME_SLOT_ORDER.indexOf(startSlot);
  const e = TIME_SLOT_ORDER.indexOf(endSlot);
  if (s === -1 || e === -1 || e <= s) return 1;
  return e - s + 1;
}

export function getTimeSlotFromTime(time) {
  if (!time) return 'morning';
  const [h] = time.split(':').map(Number);
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'lunch';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}
