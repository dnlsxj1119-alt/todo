import { useState, useMemo, useRef, Fragment } from 'react';
import {
  getWeekDays, getWeekStart, toDateString, isToday, formatWeekRange,
  TIME_SLOTS, TIME_SLOT_ORDER, DAY_NAMES_WEEK,
  getTimeSlotFromTime, getSpanCount, getCardStyle, getEndDayCardStyle,
} from '../utils/dateUtils';
import { habitAppliesToDate } from '../hooks/useHabits';
import { buildDeadlineMap } from '../utils/deadlines';

const TYPE_COLOR = {
  todo:      'week-card--purple',
  education: 'week-card--blue',
  schedule:  'week-card--green',
};

const BACKLOG_WIDTH_KEY = 'weekBacklogWidth';
const BACKLOG_WIDTH_MIN = 200;
const BACKLOG_WIDTH_MAX = 420;
const BACKLOG_WIDTH_DEFAULT = 260;
const BACKLOG_COLLAPSED_KEY = 'weekBacklogCollapsed';

function BacklogQuickAdd({ onAdd }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  };
  return (
    <form className="backlog-add" onSubmit={submit}>
      <input
        className="backlog-add-input"
        placeholder="+ 할일 추가"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </form>
  );
}

function WeekCard({ item, onItemClick, onToggle, onDragStart, cardStyle, isContinuation }) {
  return (
    <div
      className={`week-card ${TYPE_COLOR[item.type]} ${item.completed ? 'week-card--done' : ''} ${isContinuation ? 'week-card--continuation' : ''}`}
      style={cardStyle}
      draggable
      onDragStart={(e) => onDragStart(e, item.id, item.type)}
      onClick={() => onItemClick(item)}
    >
      <div className="week-card-top">
        <button className="card-check"
          onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
          aria-label={item.completed ? '완료 취소' : '완료'}>
          {item.completed ? '✓' : '○'}
        </button>
        <span className="card-title">{isContinuation ? `↩ ${item.title}` : item.title}</span>
      </div>
      {!isContinuation && (item.time || item.endTime) && (
        <div className="card-time">
          ⏰ {item.time}{item.endTime ? ` – ${item.endTime}` : ''}
          {item.endDate ? ` (~ ${item.endDate})` : ''}
        </div>
      )}
      {item.description && !isContinuation && <div className="card-desc">{item.description}</div>}
    </div>
  );
}

// 각 날짜×슬롯의 span 수와 covered 여부를 미리 계산.
// 같은 날 안에서 스패닝 이벤트 두 개가 맞닿아 있으면(예: 점심~저녁, 저녁~밤)
// 두 구간을 하나로 합쳐야 뒤 이벤트가 앞 이벤트의 칸 안에서 잘리지 않는다.
function useSpanData(items) {
  return useMemo(() => {
    const spanMap = {};
    const covered = new Set();
    const rangesByDate = {};

    items.forEach(item => {
      if (!item.time || item.type === 'todo') return;
      // 다일 이벤트: 시작일에서 밤(night)까지 span
      const endSlot = (item.endDate && item.endDate > item.date)
        ? 'night'
        : item.endTime ? getTimeSlotFromTime(item.endTime) : null;
      if (!endSlot) return;
      const span = getSpanCount(item.timeSlot, endSlot);
      if (span <= 1) return;

      const startIdx = TIME_SLOT_ORDER.indexOf(item.timeSlot);
      const endIdx = startIdx + span - 1;
      (rangesByDate[item.date] ??= []).push([startIdx, endIdx]);
    });

    const applyRun = (date, [start, end]) => {
      const key = `${date}-${TIME_SLOT_ORDER[start]}`;
      spanMap[key] = end - start + 1;
      for (let i = start + 1; i <= end; i++) {
        covered.add(`${date}-${TIME_SLOT_ORDER[i]}`);
      }
    };

    Object.entries(rangesByDate).forEach(([date, ranges]) => {
      ranges.sort((a, b) => a[0] - b[0]);
      let run = null;
      ranges.forEach(([start, end]) => {
        if (run && start <= run[1]) {
          run[1] = Math.max(run[1], end);
        } else {
          if (run) applyRun(date, run);
          run = [start, end];
        }
      });
      if (run) applyRun(date, run);
    });

    return { spanMap, covered };
  }, [items]);
}

export default function WeeklyView({
  currentWeek, setCurrentWeek, items, getItemsForCell,
  onItemClick, onDayClick, onToggle, moveItem, filterType,
  habits, onToggleHabit, projects, onProjectClick,
  backlogItems, onAddBacklogItem,
}) {
  const [dragOverCell, setDragOverCell] = useState(null);
  const [dragItemType, setDragItemType] = useState(null);
  const [dragOverBacklog, setDragOverBacklog] = useState(false);
  const [backlogCollapsed, setBacklogCollapsed] = useState(
    () => localStorage.getItem(BACKLOG_COLLAPSED_KEY) === '1'
  );
  const [backlogWidth, setBacklogWidth] = useState(() => {
    const saved = Number(localStorage.getItem(BACKLOG_WIDTH_KEY));
    return saved >= BACKLOG_WIDTH_MIN && saved <= BACKLOG_WIDTH_MAX ? saved : BACKLOG_WIDTH_DEFAULT;
  });
  const weekBodyRef = useRef(null);
  const backlogResizeRef = useRef(null);

  const toggleBacklog = () => {
    setBacklogCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(BACKLOG_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  const startBacklogResize = (e) => {
    e.preventDefault();
    backlogResizeRef.current = { startX: e.clientX, startWidth: backlogWidth, current: backlogWidth };
    const onMove = (moveEvent) => {
      const next = Math.min(
        BACKLOG_WIDTH_MAX,
        Math.max(BACKLOG_WIDTH_MIN, backlogResizeRef.current.startWidth + (moveEvent.clientX - backlogResizeRef.current.startX))
      );
      backlogResizeRef.current.current = next;
      weekBodyRef.current?.style.setProperty('--week-backlog-width', `${next}px`);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalWidth = backlogResizeRef.current.current;
      setBacklogWidth(finalWidth);
      localStorage.setItem(BACKLOG_WIDTH_KEY, String(finalWidth));
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleBacklogDragOver = (e) => {
    if (dragItemType !== 'todo') return;
    e.preventDefault();
    setDragOverBacklog(true);
  };

  const handleBacklogDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('itemType');
    const id = Number(e.dataTransfer.getData('itemId'));
    if (type === 'todo') moveItem(id, null, 'all');
    setDragOverBacklog(false); setDragItemType(null);
  };

  const days = getWeekDays(currentWeek);
  const { spanMap, covered } = useSpanData(items);
  const deadlineMap = useMemo(() => buildDeadlineMap(projects), [projects]);

  const prevWeek = () => { const d = new Date(currentWeek); d.setDate(d.getDate() - 7); setCurrentWeek(d); };
  const nextWeek = () => { const d = new Date(currentWeek); d.setDate(d.getDate() + 7); setCurrentWeek(d); };
  const goThisWeek = () => setCurrentWeek(getWeekStart(new Date()));

  const thisWeekStart = getWeekStart(new Date());
  const isCurrentWeek = toDateString(currentWeek) === toDateString(thisWeekStart);

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

  const handleDragEnd = () => { setDragOverCell(null); setDragItemType(null); setDragOverBacklog(false); };

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
        {/* 마감일 칩 (전체 행만) */}
        {slotKey === 'all' && (deadlineMap[ds] ?? []).map(entry => (
          <div key={entry.key}
            className={`chip chip--deadline${entry.done ? ' chip--done' : ''}`}
            onClick={(e) => { e.stopPropagation(); onProjectClick?.(entry.project); }}
            title={`마감: ${entry.title}`}>
            <span className="chip-check" style={{ opacity: 1 }}>{entry.type === 'task' ? '📌' : '🏁'}</span>
            <span className="chip-title">{entry.title}</span>
          </div>
        ))}

        {allItems.length === 0
          ? <div className="wg-cell-empty" title="더블클릭으로 추가" />
          : allItems.map(item => {
              // 종료일 (item.date < ds, item.endDate === ds)
              const isEndDayCont = slotKey !== 'all' && item.endDate === ds && item.date < ds;
              // 중간일 (item.date < ds < item.endDate)
              const isContSlot = !isEndDayCont && slotKey !== 'all'
                && item.endDate && item.date < ds && item.endDate > ds;
              const isContinuation = isEndDayCont || isContSlot;
              let cardStyle;
              if (isEndDayCont) {
                cardStyle = getEndDayCardStyle(item, slotKey);
              } else if (isContSlot) {
                cardStyle = { position: 'absolute', top: 0, left: 4, right: 4, bottom: 0, opacity: 0.75 };
              } else {
                cardStyle = slotKey !== 'all' ? getCardStyle(item, span, slotKey) : {};
              }
              return (
                <WeekCard key={`${item.id}-${slotKey}`} item={item}
                  onItemClick={onItemClick} onToggle={onToggle}
                  onDragStart={handleDragStart}
                  isContinuation={isContinuation}
                  cardStyle={cardStyle} />
              );
            })
        }
      </div>
    );
  };

  // 그리드 행 번호: 1=헤더, 2=전체, 3=아침, 4=점심, 5=저녁, 6=밤, 7=습관
  const SLOT_ROW = { all: 2, morning: 3, lunch: 4, evening: 5, night: 6 };
  const HABIT_ROW = 7;

  const renderHabitCell = (ds, colNum) => (
    <div
      key={`habit-${ds}`}
      className="wg-cell wg-cell--habit"
      style={{ gridRow: HABIT_ROW, gridColumn: colNum }}
      onDoubleClick={() => onDayClick(ds, 'all')}
    >
      {habits?.filter(h => habitAppliesToDate(h, ds)).map(habit => {
        const done = habit.completedDates.includes(ds);
        return (
          <div key={`habit-${habit.id}`}
            className={`habit-chip ${done ? 'habit-chip--done' : ''}`}
            style={done
              ? { background: habit.color, borderColor: habit.color, color: '#fff' }
              : { borderColor: habit.color, color: habit.color, background: habit.color + '14' }
            }
            onClick={(e) => { e.stopPropagation(); onToggleHabit?.(habit.id, ds); }}>
            {done ? '✓' : '○'} {habit.title}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="weekly-view" onDragEnd={handleDragEnd}>
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevWeek}>‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatWeekRange(currentWeek)}</h2>
          {!isCurrentWeek && <button className="today-btn" onClick={goThisWeek}>이번 주</button>}
        </div>
        <button className="nav-btn" onClick={nextWeek}>›</button>
      </div>

      <div className="week-body" ref={weekBodyRef} style={{ '--week-backlog-width': `${backlogWidth}px` }}>
        {backlogCollapsed ? (
          <button className="week-backlog-expand-btn" onClick={toggleBacklog} aria-label="백로그 펼치기">
            <span>📋</span><span>›</span>
          </button>
        ) : (
          <>
            <div
              className={`week-backlog-pane ${dragOverBacklog ? 'week-backlog-pane--drag-over' : ''}`}
              onDragOver={handleBacklogDragOver}
              onDragLeave={() => setDragOverBacklog(false)}
              onDrop={handleBacklogDrop}
            >
              <div className="week-backlog-header">
                <span className="week-backlog-title">📋 할일 백로그</span>
                <button className="week-backlog-collapse-btn" onClick={toggleBacklog} aria-label="백로그 접기">‹</button>
              </div>
              <div className="week-backlog-list">
                {backlogItems.filter(i => !filterType || i.type === filterType).length === 0
                  ? <div className="week-backlog-empty">이번 주 할일을 적어두고<br />날짜별로 드래그해 보세요</div>
                  : backlogItems.filter(i => !filterType || i.type === filterType).map(item => (
                      <WeekCard key={item.id} item={item}
                        onItemClick={onItemClick} onToggle={onToggle}
                        onDragStart={handleDragStart}
                        isContinuation={false} cardStyle={{}} />
                    ))
                }
              </div>
              <BacklogQuickAdd onAdd={onAddBacklogItem} />
            </div>
            <div className="week-backlog-resizer" onMouseDown={startBacklogResize} />
          </>
        )}

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
              <Fragment key={slot.key}>
                <div className="wg-slot-label"
                  style={{ gridRow: rowNum, gridColumn: 1 }}>
                  <span className="slot-emoji">{slot.emoji}</span>
                  <span className="slot-name">{slot.label}</span>
                  <span className="slot-range">{slot.range}</span>
                </div>
                {days.map((day, i) => renderCell(toDateString(day), slot.key, rowNum, i + 2))}
              </Fragment>
            );
          })}

          {/* 습관 행 */}
          <div className="wg-slot-label wg-slot-label--habit" style={{ gridRow: HABIT_ROW, gridColumn: 1 }}>
            <span className="slot-emoji">🔥</span>
            <span className="slot-name">습관</span>
          </div>
          {days.map((day, i) => renderHabitCell(toDateString(day), i + 2))}
        </div>
      </div>
      </div>
    </div>
  );
}
