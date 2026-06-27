import { useState, useMemo } from 'react';
import {
  getWeekDays, toDateString, isToday, formatWeekRange,
  TIME_SLOTS, TIME_SLOT_ORDER, DAY_NAMES_WEEK,
  getTimeSlotFromTime, getSpanCount, getCardStyle,
} from '../utils/dateUtils';

const TYPE_COLOR = {
  todo:      'week-card--purple',
  education: 'week-card--blue',
  schedule:  'week-card--green',
};

function WeekCard({ item, onItemClick, onToggle, onDragStart, cardStyle }) {
  return (
    <div
      className={`week-card ${TYPE_COLOR[item.type]} ${item.completed ? 'week-card--done' : ''}`}
      style={cardStyle}
      draggable
      onDragStart={(e) => onDragStart(e, item.id, item.type)}
      onClick={() => onItemClick(item)}
    >
      <div className="week-card-top">
        {item.type === 'todo' && (
          <button className="card-check"
            onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
            aria-label={item.completed ? '완료 취소' : '완료'}>
            {item.completed ? '✓' : '○'}
          </button>
        )}
        <span className="card-title">{item.title}</span>
      </div>
      {(item.time || item.endTime) && (
        <div className="card-time">
          ⏰ {item.time}{item.endTime ? ` – ${item.endTime}` : ''}
        </div>
      )}
      {item.description && <div className="card-desc">{item.description}</div>}
    </div>
  );
}

// 각 날짜×슬롯의 span 수와 covered 여부를 미리 계산
function useSpanData(items) {
  return useMemo(() => {
    const spanMap = {};
    const covered = new Set();

    items.forEach(item => {
      if (!item.endTime || !item.time || item.type === 'todo') return;
      const endSlot = getTimeSlotFromTime(item.endTime);
      const span = getSpanCount(item.timeSlot, endSlot);
      if (span <= 1) return;

      const key = `${item.date}-${item.timeSlot}`;
      spanMap[key] = Math.max(spanMap[key] || 1, span);

      const startIdx = TIME_SLOT_ORDER.indexOf(item.timeSlot);
      for (let i = 1; i < span; i++) {
        covered.add(`${item.date}-${TIME_SLOT_ORDER[startIdx + i]}`);
      }
    });

    return { spanMap, covered };
  }, [items]);
}

export default function WeeklyView({
  currentWeek, setCurrentWeek, items, getItemsForCell,
  onItemClick, onDayClick, onToggle, moveItem, filterType,
}) {
  const [dragOverCell, setDragOverCell] = useState(null);
  const [dragItemType, setDragItemType] = useState(null);

  const days = getWeekDays(currentWeek);
  const { spanMap, covered } = useSpanData(items);

  const prevWeek = () => { const d = new Date(currentWeek); d.setDate(d.getDate() - 7); setCurrentWeek(d); };
  const nextWeek = () => { const d = new Date(currentWeek); d.setDate(d.getDate() + 7); setCurrentWeek(d); };
  const goThisWeek = () => {
    const t = new Date(); const dow = t.getDay();
    setCurrentWeek(new Date(t.setDate(t.getDate() - dow + (dow === 0 ? -6 : 1))));
  };

  const handleDragStart = (e, itemId, itemType) => {
    e.dataTransfer.setData('itemId', String(itemId));
    e.dataTransfer.setData('itemType', itemType);
    setDragItemType(itemType);
  };

  const handleDragOver = (e, ds, slotKey) => {
    const isTodo = dragItemType === 'todo';
    if (isTodo && slotKey !== 'all') return;
    if (!isTodo && slotKey === 'all') return;
    e.preventDefault();
    setDragOverCell(`${ds}-${slotKey}`);
  };

  const handleDrop = (e, ds, slotKey) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('itemId'));
    const type = e.dataTransfer.getData('itemType');
    if (type === 'todo' && slotKey !== 'all') return;
    if (type !== 'todo' && slotKey === 'all') return;
    moveItem(id, ds, slotKey);
    setDragOverCell(null); setDragItemType(null);
  };

  const handleDragEnd = () => { setDragOverCell(null); setDragItemType(null); };

  // 셀 렌더링 (슬롯 row 인덱스 포함)
  const renderCell = (ds, slotKey, rowNum, colNum) => {
    const cellKey = `${ds}-${slotKey}`;

    // 위 셀의 span에 가려진 경우 렌더링 스킵
    if (covered.has(cellKey)) return null;

    const span = spanMap[cellKey] || 1;

    // 기본 항목 + 스패닝으로 가려진 슬롯의 항목도 포함
    let allItems = getItemsForCell(ds, slotKey).filter(i => !filterType || i.type === filterType);
    if (span > 1) {
      const startIdx = TIME_SLOT_ORDER.indexOf(slotKey);
      for (let i = 1; i < span; i++) {
        const nextSlot = TIME_SLOT_ORDER[startIdx + i];
        const extra = getItemsForCell(ds, nextSlot).filter(i => !filterType || i.type === filterType);
        allItems = [...allItems, ...extra];
      }
    }

    const isDragOver = dragOverCell === cellKey;

    return (
      <div
        key={cellKey}
        className={`wg-cell ${isDragOver ? 'wg-cell--drag-over' : ''} ${slotKey === 'all' ? 'wg-cell--all' : ''}`}
        style={{ gridRow: span > 1 ? `${rowNum} / span ${span}` : rowNum, gridColumn: colNum }}
        onDragOver={(e) => handleDragOver(e, ds, slotKey)}
        onDrop={(e) => handleDrop(e, ds, slotKey)}
        onDragLeave={() => setDragOverCell(null)}
        onDoubleClick={() => onDayClick(ds, slotKey)}
      >
        {allItems.length === 0
          ? <div className="wg-cell-empty" title="더블클릭으로 추가" />
          : allItems.map(item => (
              <WeekCard key={item.id} item={item}
                onItemClick={onItemClick} onToggle={onToggle}
                onDragStart={handleDragStart}
                cardStyle={slotKey !== 'all' ? getCardStyle(item, span, slotKey) : {}} />
            ))
        }
      </div>
    );
  };

  // 그리드 행 번호: 1=헤더, 2=전체, 3=아침, 4=점심, 5=저녁, 6=밤
  const SLOT_ROW = { all: 2, morning: 3, lunch: 4, evening: 5, night: 6 };

  return (
    <div className="weekly-view" onDragEnd={handleDragEnd}>
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevWeek}>‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatWeekRange(currentWeek)}</h2>
          <button className="today-btn" onClick={goThisWeek}>이번 주</button>
        </div>
        <button className="nav-btn" onClick={nextWeek}>›</button>
      </div>

      <div className="week-grid-wrapper">
        <div className="week-grid">
          {/* 코너 */}
          <div className="wg-corner" style={{ gridRow: 1, gridColumn: 1 }} />

          {/* 요일 헤더 */}
          {days.map((day, i) => {
            const ds = toDateString(day); const today = isToday(day);
            return (
              <div key={ds} style={{ gridRow: 1, gridColumn: i + 2 }}
                className={`wg-day-header ${today ? 'wg-day-header--today' : ''}`}
                onClick={() => onDayClick(ds)}>
                <span className="wg-day-name">{DAY_NAMES_WEEK[i]}</span>
                <span className={`wg-day-num ${today ? 'today-num' : ''}`}>{day.getDate()}</span>
              </div>
            );
          })}

          {/* 전체 행 (할일) */}
          <div className="wg-slot-label wg-slot-label--all" style={{ gridRow: 2, gridColumn: 1 }}>
            <span className="slot-emoji">📋</span>
            <span className="slot-name">전체</span>
            <span className="slot-range">할일</span>
          </div>
          {days.map((day, i) => renderCell(toDateString(day), 'all', 2, i + 2))}

          {/* 시간대 행 */}
          {TIME_SLOTS.map((slot) => {
            const rowNum = SLOT_ROW[slot.key];
            return (
              <>
                <div key={`lbl-${slot.key}`} className="wg-slot-label"
                  style={{ gridRow: rowNum, gridColumn: 1 }}>
                  <span className="slot-emoji">{slot.emoji}</span>
                  <span className="slot-name">{slot.label}</span>
                  <span className="slot-range">{slot.range}</span>
                </div>
                {days.map((day, i) => renderCell(toDateString(day), slot.key, rowNum, i + 2))}
              </>
            );
          })}
        </div>
      </div>
    </div>
  );
}
