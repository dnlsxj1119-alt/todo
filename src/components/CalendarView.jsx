import { useState, useMemo } from 'react';
import { getMonthGrid, toDateString, isToday, formatMonthYear, DAY_NAMES } from '../utils/dateUtils';
import { buildDeadlineMap } from '../utils/deadlines';

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
      <span className="chip-title">{item._isCont ? `↩ ${item.title}` : item.title}</span>
    </div>
  );
}

function DeadlineChip({ entry, onClick }) {
  return (
    <div
      className={`chip chip--deadline${entry.done ? ' chip--done' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(entry.project); }}
      title={`마감: ${entry.title}`}
    >
      <span className="chip-check" style={{ opacity: 1 }}>{entry.type === 'task' ? '📌' : '🏁'}</span>
      <span className="chip-title">{entry.title}</span>
    </div>
  );
}

export default function CalendarView({ currentMonth, setCurrentMonth, getItemsForDate, onItemClick, onDayClick, onToggle, filterType, projects = [], onProjectClick }) {
  const [expanded, setExpanded] = useState({});

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const toggleExpand = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const VISIBLE_MAX = 3;

  const deadlineMap = useMemo(() => buildDeadlineMap(projects), [projects]);

  return (
    <div className="calendar-view">
      {/* Header */}
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevMonth} aria-label="이전 달">‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatMonthYear(currentMonth)}</h2>
          {!isCurrentMonth && <button className="today-btn" onClick={goToday}>오늘</button>}
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
          const allItems = getItemsForDate(ds)
            .filter(item => !filterType || item.type === filterType)
            .map(item => ({ ...item, _isCont: item.date !== ds }));
          const deadlines = filterType ? [] : (deadlineMap[ds] ?? []);
          const today = isToday(date);
          const isExpanded = expanded[ds];
          const totalCount = allItems.length + deadlines.length;
          const visibleItems = isExpanded ? allItems : allItems.slice(0, Math.max(0, VISIBLE_MAX - deadlines.length));
          const visibleDeadlines = isExpanded ? deadlines : deadlines.slice(0, VISIBLE_MAX);
          const hidden = totalCount - visibleItems.length - visibleDeadlines.length;
          const dow = date.getDay();

          return (
            <div
              key={ds}
              className={`cal-cell ${!isCurrentMonth ? 'cal-cell--other' : ''} ${today ? 'cal-cell--today' : ''} ${dow === 0 ? 'cal-cell--sun' : dow === 6 ? 'cal-cell--sat' : ''}`}
              onClick={() => onDayClick(ds)}
            >
              <span className={`cal-date-num ${today ? 'today-num' : ''}`}>{date.getDate()}</span>
              <div className="chip-stack">
                {visibleDeadlines.map(entry => (
                  <DeadlineChip
                    key={entry.key}
                    entry={entry}
                    onClick={onProjectClick}
                  />
                ))}
                {visibleItems.map(item => (
                  <ItemChip
                    key={`${item.id}-${ds}`}
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
                {isExpanded && totalCount > VISIBLE_MAX && (
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
