import { useState, useMemo } from 'react';
import { getMonthGrid, toDateString, isToday, formatMonthYear, DAY_NAMES } from '../utils/dateUtils';

const TYPE_COLOR = {
  todo:      'chip--purple',
  education: 'chip--blue',
  schedule:  'chip--green',
};

function ItemChip({ item, onClick, onToggle }) {
  return (
    <div
      className={`chip ${TYPE_COLOR[item.type]} ${item.completed ? 'chip--done' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
    >
      <span
        className="chip-check"
        onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
        role="checkbox"
        aria-checked={item.completed}
        tabIndex={0}
        onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), onToggle(item.id))}
      >
        {item.completed ? '✓' : '○'}
      </span>
      <span className="chip-title">{item.title}</span>
    </div>
  );
}

export default function CalendarView({ currentMonth, setCurrentMonth, getItemsForDate, onItemClick, onDayClick, onToggle, filterType }) {
  const [expanded, setExpanded] = useState({});

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const toggleExpand = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const VISIBLE_MAX = 3;

  return (
    <div className="calendar-view">
      {/* Header */}
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevMonth} aria-label="이전 달">‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatMonthYear(currentMonth)}</h2>
          <button className="today-btn" onClick={goToday}>오늘</button>
        </div>
        <button className="nav-btn" onClick={nextMonth} aria-label="다음 달">›</button>
      </div>

      {/* Day headers */}
      <div className="cal-grid cal-grid--header">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className={`cal-day-header ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{d}</div>
        ))}
      </div>

      {/* Date grid */}
      <div className="cal-grid cal-grid--body">
        {grid.map(({ date, isCurrentMonth }) => {
          const ds = toDateString(date);
          const allItems = getItemsForDate(ds).filter(item => !filterType || item.type === filterType);
          const today = isToday(date);
          const isExpanded = expanded[ds];
          const visible = isExpanded ? allItems : allItems.slice(0, VISIBLE_MAX);
          const hidden = allItems.length - VISIBLE_MAX;
          const dow = date.getDay();

          return (
            <div
              key={ds}
              className={`cal-cell ${!isCurrentMonth ? 'cal-cell--other' : ''} ${today ? 'cal-cell--today' : ''} ${dow === 0 ? 'cal-cell--sun' : dow === 6 ? 'cal-cell--sat' : ''}`}
              onClick={() => onDayClick(ds)}
            >
              <span className={`cal-date-num ${today ? 'today-num' : ''}`}>{date.getDate()}</span>
              <div className="chip-stack">
                {visible.map(item => (
                  <ItemChip
                    key={item.id}
                    item={item}
                    onClick={onItemClick}
                    onToggle={onToggle}
                  />
                ))}
                {!isExpanded && hidden > 0 && (
                  <button
                    className="show-more-btn"
                    onClick={(e) => { e.stopPropagation(); toggleExpand(ds); }}
                  >
                    +{hidden}개 더보기
                  </button>
                )}
                {isExpanded && allItems.length > VISIBLE_MAX && (
                  <button
                    className="show-more-btn"
                    onClick={(e) => { e.stopPropagation(); toggleExpand(ds); }}
                  >
                    접기
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
