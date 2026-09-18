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
      className={`chip ${TYPE_COLOR[item.type]} ${item.completed ? 'chip--done' : ''} ${item.status === 'cancelled' ? 'chip--cancelled' : ''} ${canDrag ? 'chip--draggable' : ''}`}
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

// 여러 날에 걸친 🟢일정(달력 전용). 할일은 해당 없음 — 할일엔 종료일 개념이 없다.
function isSpanItem(it) {
  return it.type !== 'todo' && !!it.date && !!it.endDate && it.endDate > it.date;
}

// 칸마다 '↩ 제목' 칩을 따로 그리는 대신, 하나의 막대처럼 이어 그린다.
// 제목은 시작일과 **주가 바뀐 첫 칸**에만 붙인다(안 붙이면 다음 주 줄이 이름 없는 막대가 된다).
function SpanChip({ slot, onClick, onToggle, onDragStart }) {
  const { item, isStart, isEnd, labeled } = slot;
  const canDrag = !!onDragStart && isStart;
  const cls = [
    'chip', TYPE_COLOR[item.type],
    item.completed ? 'chip--done' : '',
    item.status === 'cancelled' ? 'chip--cancelled' : '',
    'chip--span', isStart ? 'chip--span-start' : '', isEnd ? 'chip--span-end' : '',
    canDrag ? 'chip--draggable' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => {
        e.dataTransfer.setData('itemId', String(item.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(item);
      } : undefined}
      title={`${item.title} (${item.date}~${item.endDate})`}
    >
      {labeled ? (
        <>
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
          {item.time && <span className="chip-time">{item.time}</span>}
          <span className="chip-title">{item.title}</span>
        </>
      ) : (
        // 이어지는 칸은 글자 없이 막대만.
        // 높이가 제목 있는 칸과 정확히 같아야 이어져 보이므로,
        // 보이지 않는 체크 동그라미를 같이 넣어 같은 구조로 만든다.
        <>
          <span className="chip-check" style={{ visibility: 'hidden' }} aria-hidden="true">○</span>
          <span className="chip-title">&nbsp;</span>
        </>
      )}
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

// 마감 칩의 종류별 표시/클릭 대상: 카테고리 🏁 · 태스크 📌 · 할일 📕(목록의 마감일 칩과 같은 기호)
const DEADLINE_EMOJI = { task: '📌', item: '📕', project: '🏁' };

function DeadlineChip({ entry, onProjectClick, onItemClick }) {
  return (
    <div
      className={`chip chip--deadline${entry.done ? ' chip--done' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (entry.type === 'item') onItemClick?.(entry.item);
        else onProjectClick?.(entry.project);
      }}
      title={`마감: ${entry.title}`}
    >
      <span className="chip-check" style={{ opacity: 1 }}>{DEADLINE_EMOJI[entry.type] ?? '🏁'}</span>
      <span className="chip-title">{entry.title}</span>
    </div>
  );
}

export default function CalendarView({ currentMonth, setCurrentMonth, items = [], getItemsForDate, onItemClick, onDayClick, onDateNumClick, reflectionDates, onToggle, filterType, projects = [], onProjectClick, getGoogleEventsForDate, onToggleGoogleEvent, onMoveItem }) {
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

  const deadlineMap = useMemo(() => buildDeadlineMap(projects, items), [projects, items]);

  // 막대가 그 주의 모든 칸에서 **같은 높이**에 있어야 이어져 보인다.
  // 그래서 주(week)마다 줄(lane)을 배정하고, 그 줄이 비는 칸에는 같은 높이의 빈 자리를 넣는다.
  // (칸마다 칩 개수가 달라서, 그냥 섞어 두면 막대가 들쭉날쭉해진다)
  const spanLanes = useMemo(() => {
    const byDate = {};
    const spans = (items ?? [])
      .filter(isSpanItem)
      .filter(it => !filterType || it.type === filterType);
    const dayCount = (it) => Math.round((new Date(it.endDate) - new Date(it.date)) / 86400000);
    for (let w = 0; w * 7 < grid.length; w++) {
      const week = grid.slice(w * 7, w * 7 + 7).map(g => toDateString(g.date));
      if (!week.length) continue;
      const wStart = week[0];
      const wEnd = week[week.length - 1];
      const here = spans
        .filter(it => it.date <= wEnd && it.endDate >= wStart)
        // 먼저 시작한 것 · 긴 것이 위 줄로 (줄이 덜 갈라진다)
        .sort((a, b) => a.date.localeCompare(b.date)
          || dayCount(b) - dayCount(a)
          || String(a.id).localeCompare(String(b.id)));
      const lanes = [];
      here.forEach(it => {
        const from = it.date > wStart ? it.date : wStart;
        const to = it.endDate < wEnd ? it.endDate : wEnd;
        let li = lanes.findIndex(lane => lane.every(seg => seg.to < from || seg.from > to));
        if (li === -1) { lanes.push([]); li = lanes.length - 1; }
        lanes[li].push({ from, to, item: it });
      });
      week.forEach(ds => {
        const row = lanes.map(lane => {
          const seg = lane.find(x => x.from <= ds && x.to >= ds);
          if (!seg) return null;
          return {
            item: seg.item,
            isStart: seg.item.date === ds,
            isEnd: seg.item.endDate === ds,
            labeled: seg.from === ds,
          };
        });
        // 빈 자리는 '그 위의 막대 높이를 맞추기 위해서'만 필요하다.
        // 마지막 막대 뒤쪽의 빈 줄은 잘라내야, 막대가 없는 날의 칩이 괜히 밀려 내려가지 않는다.
        while (row.length && !row[row.length - 1]) row.pop();
        byDate[ds] = row;
      });
    }
    return byDate;
  }, [items, grid, filterType]);

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
          const laneRow = spanLanes[ds] ?? [];
          const allItems = getItemsForDate(ds)
            .filter(item => !filterType || item.type === filterType)
            // 여러 날 일정은 위쪽 막대 줄에서 따로 그린다
            .filter(item => !isSpanItem(item))
            .map(item => ({ ...item, _isCont: item.date !== ds }));
          const deadlines = filterType
            ? []
            : [...(deadlineMap[ds] ?? [])].sort((a, b) => (!!a.done - !!b.done));
          const googleEvents = filterType ? [] : (getGoogleEventsForDate?.(ds) ?? []);
          const combined = mergeByTime(allItems, googleEvents);
          const today = isToday(date);
          const isExpanded = expanded[ds];
          const totalCount = combined.length + deadlines.length;
          // 막대는 항상 보여야 이어짐이 끊기지 않으므로, 나머지 칩이 쓸 자리에서 뺀다
          const budget = Math.max(1, VISIBLE_MAX - laneRow.length);
          const visibleDeadlines = isExpanded ? deadlines : deadlines.slice(0, budget);
          const combinedBudget = Math.max(0, budget - visibleDeadlines.length);
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
                {laneRow.map((slot, i) => (slot
                  ? <SpanChip
                      key={`span-${slot.item.id}`}
                      slot={slot}
                      onClick={onItemClick}
                      onToggle={onToggle}
                      onDragStart={onMoveItem ? (it) => setDragInfo({ id: it.id, from: ds }) : undefined}
                    />
                  : <div key={`lane-${i}`} className="chip chip--span chip--span-gap" aria-hidden="true">&nbsp;</div>
                ))}
                {visibleDeadlines.map(entry => (
                  <DeadlineChip
                    key={entry.key}
                    entry={entry}
                    onProjectClick={onProjectClick}
                    onItemClick={onItemClick}
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
