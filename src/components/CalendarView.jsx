import { useState, useMemo } from 'react';
import { getMonthGrid, toDateString, isToday, formatMonthYear, DAY_NAMES } from '../utils/dateUtils';
import { buildDeadlineMap } from '../utils/deadlines';

const TYPE_COLOR = {
  todo:      'chip--purple',
  education: 'chip--blue',
  schedule:  'chip--green',
};

function ItemChip({ item, onClick, onToggle }) {
  const timeEl = !item._isCont && item.time && <span className="chip-time">{item.time}</span>;
  const titleEl = <span className="chip-title">{item._isCont ? `↩ ${item.title}` : item.title}</span>;
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
      {/* 완료된 항목은 좁은 화면에서 잘려도 제목이 먼저 보이도록 시간을 뒤로 보낸다 */}
      {item.completed ? <>{titleEl}{timeEl}</> : <>{timeEl}{titleEl}</>}
    </div>
  );
}

function GoogleEventChip({ event, onToggle }) {
  const timeEl = event.time && <span className="chip-time">{event.time}</span>;
  const titleEl = <span className="chip-title">{event.title}</span>;
  return (
    <div
      className={`chip chip--google ${event.completed ? 'chip--done' : ''}`}
      onClick={(e) => { e.stopPropagation(); if (event.htmlLink) window.open(event.htmlLink, '_blank', 'noopener'); }}
      title={`${event.calendarSummary ?? 'Google 캘린더'}: ${event.title}`}
    >
      <span
        className="chip-check"
        style={{ opacity: 1 }}
        onClick={(e) => { e.stopPropagation(); onToggle?.(event.id); }}
        role="checkbox"
        aria-checked={event.completed}
        tabIndex={0}
        onKeyDown={(e) => e.key === ' ' && (e.preventDefault(), onToggle?.(event.id))}
      >
        {event.completed ? '✓' : '📆'}
      </span>
      {event.completed ? <>{titleEl}{timeEl}</> : <>{timeEl}{titleEl}</>}
    </div>
  );
}

function timeMinutes(time) {
  if (!time) return Infinity;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// 앱 항목과 구글 이벤트를 시간순으로 한 줄에 섞어서 정렬 (시간 없는 항목은 뒤로)
function mergeByTime(items, googleEvents) {
  const tagged = [
    ...items.map(item => ({ kind: 'item', time: timeMinutes(item.time), data: item })),
    ...googleEvents.map(event => ({ kind: 'google', time: timeMinutes(event.time), data: event })),
  ];
  return tagged
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.time - b.time || a.index - b.index);
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

export default function CalendarView({ currentMonth, setCurrentMonth, getItemsForDate, onItemClick, onDayClick, onDateNumClick, reflectionDates, onToggle, filterType, projects = [], onProjectClick, getGoogleEventsForDate, onToggleGoogleEvent }) {
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
          const googleEvents = filterType ? [] : (getGoogleEventsForDate?.(ds) ?? []);
          const combined = mergeByTime(allItems, googleEvents);
          const today = isToday(date);
          const isExpanded = expanded[ds];
          const totalCount = combined.length + deadlines.length;
          const visibleDeadlines = isExpanded ? deadlines : deadlines.slice(0, VISIBLE_MAX);
          const combinedBudget = Math.max(0, VISIBLE_MAX - visibleDeadlines.length);
          const visibleCombined = isExpanded ? combined : combined.slice(0, combinedBudget);
          const hidden = totalCount - visibleCombined.length - visibleDeadlines.length;
          const dow = date.getDay();

          return (
            <div
              key={ds}
              className={`cal-cell ${!isCurrentMonth ? 'cal-cell--other' : ''} ${today ? 'cal-cell--today' : ''} ${dow === 0 ? 'cal-cell--sun' : dow === 6 ? 'cal-cell--sat' : ''}`}
              onClick={() => onDayClick(ds)}
            >
              <span
                className={`cal-date-num ${today ? 'today-num' : ''} ${reflectionDates?.has(ds) ? 'cal-date-num--has-reflection' : ''}`}
                onClick={(e) => { e.stopPropagation(); onDateNumClick?.(ds); }}
                title="오늘의 회고 보기/작성"
              >
                {date.getDate()}
              </span>
              <div className="chip-stack">
                {visibleDeadlines.map(entry => (
                  <DeadlineChip
                    key={entry.key}
                    entry={entry}
                    onClick={onProjectClick}
                  />
                ))}
                {visibleCombined.map(entry => (
                  entry.kind === 'google'
                    ? <GoogleEventChip key={`${entry.data.id}-${ds}`} event={entry.data} onToggle={onToggleGoogleEvent} />
                    : <ItemChip
                        key={`${entry.data.id}-${ds}`}
                        item={entry.data}
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
