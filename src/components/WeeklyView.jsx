import { useState } from 'react';
import { getWeekDays, toDateString, isToday, formatWeekRange, TIME_SLOTS, DAY_NAMES_WEEK } from '../utils/dateUtils';

const TYPE_COLOR = {
  todo:      'card--purple',
  education: 'card--blue',
  schedule:  'card--green',
};

const PRIORITY_ICON = { high: '🔴', medium: '🟡', low: '' };

function WeekCard({ item, onItemClick, onToggle, onDragStart }) {
  return (
    <div
      className={`week-card ${TYPE_COLOR[item.type]} ${item.completed ? 'week-card--done' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, item.id)}
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
        {PRIORITY_ICON[item.priority] && (
          <span className="card-priority">{PRIORITY_ICON[item.priority]}</span>
        )}
      </div>
      {item.time && <div className="card-time">⏰ {item.time}</div>}
      {item.description && <div className="card-desc">{item.description}</div>}
    </div>
  );
}

export default function WeeklyView({ currentWeek, setCurrentWeek, getItemsForCell, onItemClick, onDayClick, onToggle, moveItem, filterType }) {
  const [dragOverCell, setDragOverCell] = useState(null);

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

  // Drag handlers
  const handleDragStart = (e, itemId) => {
    e.dataTransfer.setData('itemId', String(itemId));
  };

  const handleDragOver = (e, dateStr, slotKey) => {
    e.preventDefault();
    setDragOverCell(`${dateStr}-${slotKey}`);
  };

  const handleDrop = (e, dateStr, slotKey) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('itemId'));
    moveItem(id, dateStr, slotKey);
    setDragOverCell(null);
  };

  const handleDragLeave = () => setDragOverCell(null);

  return (
    <div className="weekly-view">
      {/* Nav */}
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevWeek} aria-label="이전 주">‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatWeekRange(currentWeek)}</h2>
          <button className="today-btn" onClick={goThisWeek}>이번 주</button>
        </div>
        <button className="nav-btn" onClick={nextWeek} aria-label="다음 주">›</button>
      </div>

      {/* Grid wrapper */}
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

          {/* Rows: time slot × day */}
          {TIME_SLOTS.map(slot => (
            <>
              {/* Slot label */}
              <div key={`label-${slot.key}`} className="wg-slot-label">
                <span className="slot-emoji">{slot.emoji}</span>
                <span className="slot-name">{slot.label}</span>
                <span className="slot-range">{slot.range}</span>
              </div>

              {/* Cells */}
              {days.map((day) => {
                const ds = toDateString(day);
                const cellKey = `${ds}-${slot.key}`;
                const cellItems = getItemsForCell(ds, slot.key).filter(item => !filterType || item.type === filterType);
                const isDragOver = dragOverCell === cellKey;

                return (
                  <div
                    key={cellKey}
                    className={`wg-cell ${isDragOver ? 'wg-cell--drag-over' : ''}`}
                    onDragOver={(e) => handleDragOver(e, ds, slot.key)}
                    onDrop={(e) => handleDrop(e, ds, slot.key)}
                    onDragLeave={handleDragLeave}
                    onDoubleClick={() => onDayClick(ds, slot.key)}
                  >
                    {cellItems.length === 0 ? (
                      <div className="wg-cell-empty" title="더블클릭으로 추가" />
                    ) : (
                      cellItems.map(item => (
                        <WeekCard
                          key={item.id}
                          item={item}
                          onItemClick={onItemClick}
                          onToggle={onToggle}
                          onDragStart={handleDragStart}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
