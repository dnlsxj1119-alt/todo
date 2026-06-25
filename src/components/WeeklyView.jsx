import { useState } from 'react';
import { getWeekDays, toDateString, isToday, formatWeekRange, TIME_SLOTS, DAY_NAMES_WEEK } from '../utils/dateUtils';

const TYPE_COLOR = {
  todo:      'card--purple',
  education: 'card--blue',
  schedule:  'card--green',
};

function WeekCard({ item, onItemClick, onToggle, onDragStart }) {
  return (
    <div
      className={`week-card ${TYPE_COLOR[item.type]} ${item.completed ? 'week-card--done' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, item.id, item.type)}
      onClick={() => onItemClick(item)}
    >
      <div className="week-card-top">
        {item.type === 'todo' && (
          <button
            className="card-check"
            onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
            aria-label={item.completed ? '완료 취소' : '완료'}
          >
            {item.completed ? '✓' : '○'}
          </button>
        )}
        <span className="card-title">{item.title}</span>
      </div>
      {item.time && <div className="card-time">⏰ {item.time}</div>}
      {item.description && <div className="card-desc">{item.description}</div>}
    </div>
  );
}

export default function WeeklyView({ currentWeek, setCurrentWeek, getItemsForCell, onItemClick, onDayClick, onToggle, moveItem, filterType }) {
  const [dragOverCell, setDragOverCell] = useState(null);
  const [dragItemType, setDragItemType] = useState(null);

  const days = getWeekDays(currentWeek);

  const prevWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(d);
  };
  const nextWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(d);
  };
  const goThisWeek = () => {
    const today = new Date();
    const dow = today.getDay();
    const diff = today.getDate() - dow + (dow === 0 ? -6 : 1);
    setCurrentWeek(new Date(today.setDate(diff)));
  };

  const handleDragStart = (e, itemId, itemType) => {
    e.dataTransfer.setData('itemId', String(itemId));
    e.dataTransfer.setData('itemType', itemType);
    setDragItemType(itemType);
  };

  const handleDragOver = (e, dateStr, slotKey) => {
    // 할일은 'all' 행에만, 교육/일정은 시간 행에만 드롭 허용
    const isTodo = dragItemType === 'todo';
    if (isTodo && slotKey !== 'all') return;
    if (!isTodo && slotKey === 'all') return;
    e.preventDefault();
    setDragOverCell(`${dateStr}-${slotKey}`);
  };

  const handleDrop = (e, dateStr, slotKey) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('itemId'));
    const type = e.dataTransfer.getData('itemType');
    if (type === 'todo' && slotKey !== 'all') return;
    if (type !== 'todo' && slotKey === 'all') return;
    moveItem(id, dateStr, slotKey);
    setDragOverCell(null);
    setDragItemType(null);
  };

  const handleDragLeave = () => setDragOverCell(null);
  const handleDragEnd = () => { setDragOverCell(null); setDragItemType(null); };

  const renderCell = (ds, slotKey) => {
    const cellKey = `${ds}-${slotKey}`;
    const cellItems = getItemsForCell(ds, slotKey).filter(item => !filterType || item.type === filterType);
    const isDragOver = dragOverCell === cellKey;

    return (
      <div
        key={cellKey}
        className={`wg-cell ${isDragOver ? 'wg-cell--drag-over' : ''} ${slotKey === 'all' ? 'wg-cell--all' : ''}`}
        onDragOver={(e) => handleDragOver(e, ds, slotKey)}
        onDrop={(e) => handleDrop(e, ds, slotKey)}
        onDragLeave={handleDragLeave}
        onDoubleClick={() => onDayClick(ds, slotKey)}
      >
        {cellItems.length === 0
          ? <div className="wg-cell-empty" title="더블클릭으로 추가" />
          : cellItems.map(item => (
              <WeekCard
                key={item.id}
                item={item}
                onItemClick={onItemClick}
                onToggle={onToggle}
                onDragStart={handleDragStart}
              />
            ))
        }
      </div>
    );
  };

  return (
    <div className="weekly-view" onDragEnd={handleDragEnd}>
      {/* Nav */}
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevWeek} aria-label="이전 주">‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatWeekRange(currentWeek)}</h2>
          <button className="today-btn" onClick={goThisWeek}>이번 주</button>
        </div>
        <button className="nav-btn" onClick={nextWeek} aria-label="다음 주">›</button>
      </div>

      <div className="week-grid-wrapper">
        <div className="week-grid">
          {/* Corner */}
          <div className="wg-corner" />

          {/* Day headers */}
          {days.map((day, i) => {
            const ds = toDateString(day);
            const today = isToday(day);
            return (
              <div
                key={ds}
                className={`wg-day-header ${today ? 'wg-day-header--today' : ''}`}
                onClick={() => onDayClick(ds)}
              >
                <span className="wg-day-name">{DAY_NAMES_WEEK[i]}</span>
                <span className={`wg-day-num ${today ? 'today-num' : ''}`}>{day.getDate()}</span>
              </div>
            );
          })}

          {/* 전체 행 (할일) */}
          <div className="wg-slot-label wg-slot-label--all">
            <span className="slot-emoji">📋</span>
            <span className="slot-name">전체</span>
            <span className="slot-range">할일</span>
          </div>
          {days.map(day => renderCell(toDateString(day), 'all'))}

          {/* 시간대 행 (교육/일정) */}
          {TIME_SLOTS.map(slot => (
            <>
              <div key={`label-${slot.key}`} className="wg-slot-label">
                <span className="slot-emoji">{slot.emoji}</span>
                <span className="slot-name">{slot.label}</span>
                <span className="slot-range">{slot.range}</span>
              </div>
              {days.map(day => renderCell(toDateString(day), slot.key))}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
