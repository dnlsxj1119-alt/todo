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

// 시간대 행 높이 (px) — 시간당 20px 비율
export const SLOT_HEIGHTS = { morning: 120, lunch: 120, evening: 120, night: 120 };
export const SLOT_START_H  = { morning: 6,   lunch: 12,  evening: 17, night: 21  };
const PX_PER_HOUR = 20;
const GRID_GAP = 1;

export function timeToSlotPx(timeStr, slotKey) {
  if (!timeStr || SLOT_START_H[slotKey] === undefined) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  let hours = h - SLOT_START_H[slotKey] + m / 60;
  if (hours < 0) hours += 24; // night slot wrap
  return Math.max(0, Math.min(hours * PX_PER_HOUR, SLOT_HEIGHTS[slotKey]));
}

// 다일 이벤트 시작일: 시작 시간부터 밤 끝까지 채우는 높이
function getMultiDayStartStyle(item) {
  const top = timeToSlotPx(item.time, item.timeSlot);
  const startIdx = TIME_SLOT_ORDER.indexOf(item.timeSlot);
  const endIdx = TIME_SLOT_ORDER.indexOf('night');
  let height = SLOT_HEIGHTS[item.timeSlot] - top;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    height += GRID_GAP + SLOT_HEIGHTS[TIME_SLOT_ORDER[i]];
  }
  return { position: 'absolute', top, left: 4, right: 4, height: Math.max(36, height) };
}

export function getEndDayCardStyle(item, slot) {
  const endSlotKey = item.endTime ? getTimeSlotFromTime(item.endTime) : TIME_SLOT_ORDER[TIME_SLOT_ORDER.length - 1];
  const endIdx = TIME_SLOT_ORDER.indexOf(endSlotKey);
  const slotIdx = TIME_SLOT_ORDER.indexOf(slot);
  if (slotIdx < endIdx) {
    return { position: 'absolute', top: 0, left: 4, right: 4, bottom: 0, opacity: 0.75 };
  }
  const endPx = timeToSlotPx(item.endTime, endSlotKey);
  return { position: 'absolute', top: 0, left: 4, right: 4, height: Math.max(16, endPx), opacity: 0.75 };
}

export function getCardStyle(item, span, spanStartSlot = null) {
  if (item.type === 'todo' || !item.time) return {};

  // 다일 이벤트 시작일(자기 슬롯 셀): 밤 끝까지 채우는 스타일
  // spanStartSlot이 없거나 자기 슬롯과 같으면 primary 셀임
  if (item.endDate && item.endDate > item.date && (!spanStartSlot || spanStartSlot === item.timeSlot)) {
    return getMultiDayStartStyle(item);
  }

  // 스패닝 셀 안에 있는 다른 슬롯 항목은 위 슬롯 높이만큼 top 오프셋 추가
  const cellStartSlot = spanStartSlot || item.timeSlot;
  const cellStartIdx = TIME_SLOT_ORDER.indexOf(cellStartSlot);
  const itemSlotIdx  = TIME_SLOT_ORDER.indexOf(item.timeSlot);
  let topOffset = 0;
  for (let i = cellStartIdx; i < itemSlotIdx; i++) {
    topOffset += SLOT_HEIGHTS[TIME_SLOT_ORDER[i]] + GRID_GAP;
  }

  const startPx = timeToSlotPx(item.time, item.timeSlot);
  const top = topOffset + startPx;

  if (!item.endTime) {
    const maxH = SLOT_HEIGHTS[item.timeSlot] - startPx;
    return { position: 'absolute', top, left: 4, right: 4, height: Math.max(36, maxH) };
  }

  const endSlot  = getTimeSlotFromTime(item.endTime);
  const endSlotIdx = TIME_SLOT_ORDER.indexOf(endSlot);
  const endPx   = timeToSlotPx(item.endTime, endSlot);

  let height;
  if (endSlotIdx === itemSlotIdx) {
    height = endPx - startPx;
  } else {
    height = SLOT_HEIGHTS[item.timeSlot] - startPx;
    for (let i = itemSlotIdx + 1; i <= endSlotIdx; i++) {
      height += GRID_GAP;
      height += i < endSlotIdx ? SLOT_HEIGHTS[TIME_SLOT_ORDER[i]] : endPx;
    }
  }

  return { position: 'absolute', top, left: 4, right: 4, height: Math.max(36, height) };
}

export function getTimeSlotFromTime(time) {
  if (!time) return 'morning';
  const [h] = time.split(':').map(Number);
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'lunch';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  return toDateString(date);
}

function addMonthsClamped(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, daysInMonth));
  return toDateString(target);
}

export function getRecurrenceDates(startDateStr, endDateStr, frequency, max = 200) {
  if (!startDateStr || !endDateStr || startDateStr > endDateStr) return [startDateStr].filter(Boolean);
  const dates = [];
  let cursor = startDateStr;
  let step = 0;
  while (cursor <= endDateStr && dates.length < max) {
    dates.push(cursor);
    step += 1;
    if (frequency === 'daily') cursor = addDays(startDateStr, step);
    else if (frequency === 'weekly') cursor = addDays(startDateStr, step * 7);
    else if (frequency === 'monthly') cursor = addMonthsClamped(startDateStr, step);
    else break;
  }
  return dates;
}
