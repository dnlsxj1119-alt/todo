import { useState, useMemo } from 'react';
import { getMonthGrid, toDateString, isToday, formatMonthYear, DAY_NAMES } from '../utils/dateUtils';
import { buildDeadlineMap } from '../utils/deadlines';

const TYPE_COLOR = {
  todo:      'chip--purple',
  education: 'chip--red',
  schedule:  'chip--green',
};

function ItemChip({ item, onClick, onToggle, onDragStart }) {
  const timeEl = !item._isCont && item.time && <span className="chip-time">{item.time}</span>;
  const titleEl = <span className="chip-title">{item._isCont ? `↩ ${item.title}` : item.title}</span>;
  // 이어짐(↩) 칩은 시작일 칩을 끌어야 하므로 드래그 대상이 아니다
  const canDrag = !!onDragStart && !item._isCont;
  return (
    <div
      className={`chip ${TYPE_COLOR[item.type]} ${item.completed ? 'chip--done' : ''} ${canDrag ? 'chip--draggable' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => {
        e.dataTransfer.setData('itemId', String(item.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(item);
      } : undefined}
      title={canDrag ? '드래그해서 날짜 옮기기' : undefined}
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

// 앱 항목과 구글 이벤트를 한 줄에 섞어서 정렬
// 완료한 항목은 뒤로, 그 안에서 시간순 (시간 없는 항목은 뒤로)
function mergeByTime(items, googleEvents) {
  const tagged = [
    ...items.map(item => ({ kind: 'item', time: timeMinutes(item.time), done: !!item.completed, data: item })),
    ...googleEvents.map(event => ({ kind: 'google', time: timeMinutes(event.time), done: !!event.completed, data: event })),
  ];
  return tagged
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => (a.done - b.done) || (a.time - b.time) || (a.index - b.index));
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

export default function CalendarView({ currentMonth, setCurrentMonth, getItemsForDate, onItemClick, onDayClick, onDateNumClick, reflectionDates, onToggle, filterType, projects = [], onProjectClick, getGoogleEventsForDate, onToggleGoogleEvent, onMoveItem }) {
  const [expanded, setExpanded] = useState({});
  // 항목을 다른 날짜 칸으로 끌어다 옮기기 (데스크톱 전용 — 터치에선 HTML5 드래그가 동작하지 않음)
  const [dragInfo, setDragInfo] = useState(null); // { id, from }
  const [dragOverDate, setDragOverDate] = useState(null);
  const endDrag = () => { setDragInfo(null); setDragOverDate(null); };

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
    <div className="calendar-view" onDragEnd={endDrag}>
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
          const deadlines = filterType
            ? []
            : [...(deadlineMap[ds] ?? [])].sort((a, b) => (!!a.done - !!b.done));
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

          const isDragOver = dragOverDate === ds;

          return (
            <div
              key={ds}
              className={`cal-cell ${!isCurrentMonth ? 'cal-cell--other' : ''} ${today ? 'cal-cell--today' : ''} ${dow === 0 ? 'cal-cell--sun' : dow === 6 ? 'cal-cell--sat' : ''} ${isDragOver ? 'cal-cell--drag-over' : ''}`}
              onClick={() => onDayClick(ds)}
              onDragOver={onMoveItem ? (e) => {
                // 앱 항목을 끌고 있는 경우에만 드롭을 허용한다 (외부 드래그는 무시)
                if (!dragInfo || dragInfo.from === ds) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverDate !== ds) setDragOverDate(ds);
              } : undefined}
              onDragLeave={onMoveItem ? () => setDragOverDate(prev => (prev === ds ? null : prev)) : undefined}
              onDrop={onMoveItem ? (e) => {
                e.preventDefault();
                const rawId = e.dataTransfer.getData('itemId') || (dragInfo ? String(dragInfo.id) : '');
                const from = dragInfo?.from;
                endDrag();
                if (rawId && from !== ds) onMoveItem(rawId, ds);
              } : undefined}
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
                        onDragStart={onMoveItem ? (it) => setDragInfo({ id: it.id, from: ds }) : undefined}
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
