import { useMemo, useRef, useState } from 'react';
import { buildRows, dateBucket, compareRows, catDone, mdLabel, moveOverdueRowsToToday } from '../utils/todoRows';
import { useDayKeys } from '../hooks/useDayKeys';
import { readStored, writeStored } from '../utils/safeStorage';

/* 월간 달력·주간 일정 왼쪽에 똑같이 붙는 할일 패널.
   달력 격자에는 '그 날짜'의 할일만 보여서, 놓친 할일과 날짜 없는 할일은 목록 탭에 가야만 보였다
   (주간엔 '백로그'가 있었지만 날짜 없는 것만, 월간엔 아예 없었다) → 같은 할일인데 화면마다 흩어져 보였다.
   그래서 목록 탭과 **같은 기준**(utils/todoRows)으로 '지난(놓친) / 미정' 두 묶음을 어느 화면에서나 보여 준다.
   - 행을 날짜 칸으로 끌어다 놓으면 그 날짜로 잡힌다. 격자의 할일을 패널로 끌어오면 날짜가 지워져 미정이 된다.
   - 카테고리 태스크(projects.tasks)도 목록과 개수가 맞게 같이 보여 준다. 다만 태스크는 items 가 아니라
     끌어 옮길 수 없고, 누르면 목록 탭으로 간다. */

// 폭·접힘은 예전 주간 백로그가 쓰던 키를 그대로 쓴다 (맞춰 둔 폭이 유지되게)
const WIDTH_KEY = 'weekBacklogWidth';
const WIDTH_MIN = 200;
const WIDTH_MAX = 420;
const WIDTH_DEFAULT = 260;
const COLLAPSED_KEY = 'weekBacklogCollapsed';
// 휴대폰은 패널이 달력 위에 얹혀 자리를 먹으므로 접힌 채로 시작한다 (접힌 줄에도 개수는 보인다)
const COLLAPSED_KEY_MOBILE = 'todoPanelCollapsedMobile';

const isNarrowScreen = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 600px)').matches;

function QuickAdd({ onAdd }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  };
  return (
    <form className="todo-panel-add" onSubmit={submit}>
      <input
        className="todo-panel-add-input"
        placeholder="+ 할일 추가 (날짜 미정)"
        aria-label="날짜 미정 할일 추가"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </form>
  );
}

function PanelRow({ r, today, onItemClick, onToggle, onOpenList, onDragStart }) {
  const isItem = r.kind === 'item';
  // 놓친 이유가 된 날짜: 계획일이 지났으면 계획일, 마감일만 지났으면 📕 마감일
  const dateLabel = r.expected && r.expected < today ? mdLabel(r.expected)
    : r.due && r.due < today ? `📕 ${mdLabel(r.due)}`
    : null;
  const color = isItem && r.raw.type === 'education' ? 'week-card--red' : 'week-card--purple';
  return (
    <div
      className={`week-card ${color} tp-row ${isItem ? '' : 'tp-row--task'}`}
      style={r.cat ? { borderLeftColor: r.cat.color } : undefined}
      draggable={isItem}
      onDragStart={isItem ? (e) => onDragStart?.(e, r.raw) : undefined}
      onClick={() => (isItem ? onItemClick(r.raw) : onOpenList?.())}
      title={[r.title, r.cat?.name, isItem ? '날짜 칸으로 끌어다 놓으면 그 날로 잡혀요' : '카테고리 태스크 — 누르면 목록에서 열려요']
        .filter(Boolean).join(' · ')}
    >
      <div className="week-card-top">
        {isItem ? (
          <button className="card-check"
            onClick={(e) => { e.stopPropagation(); onToggle(r.raw.id); }}
            aria-label="완료">
            ○
          </button>
        ) : (
          <span className="card-check" aria-hidden="true">📌</span>
        )}
        <span className="card-title">{r.title}</span>
        {dateLabel && <span className="tp-date">{dateLabel}</span>}
      </div>
    </div>
  );
}

export default function TodoPanel({
  items = [], projects = [], filterType,
  onItemClick, onToggle, onAddItem, onUpdateItem, onSaveProject, onOpenList,
  onRowDragStart, canDrop, onDropItem,
}) {
  const dayKeys = useDayKeys();
  const [narrow] = useState(isNarrowScreen);
  const collapsedKey = narrow ? COLLAPSED_KEY_MOBILE : COLLAPSED_KEY;
  const [collapsed, setCollapsed] = useState(() => {
    const saved = readStored(collapsedKey);
    return saved == null ? narrow : saved === '1';
  });
  const [width, setWidth] = useState(() => {
    const saved = Number(readStored(WIDTH_KEY));
    return saved >= WIDTH_MIN && saved <= WIDTH_MAX ? saved : WIDTH_DEFAULT;
  });
  const [dragOver, setDragOver] = useState(false);
  const paneRef = useRef(null);
  const resizeRef = useRef(null);

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      writeStored(collapsedKey, next ? '1' : '0');
      return next;
    });
  };

  const startResize = (e) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: width, current: width };
    const onMove = (moveEvent) => {
      const next = Math.min(
        WIDTH_MAX,
        Math.max(WIDTH_MIN, resizeRef.current.startWidth + (moveEvent.clientX - resizeRef.current.startX))
      );
      resizeRef.current.current = next;
      if (paneRef.current) paneRef.current.style.width = `${next}px`;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalWidth = resizeRef.current.current;
      setWidth(finalWidth);
      writeStored(WIDTH_KEY, String(finalWidth));
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // 목록 탭과 같은 묶음. '어제'와 '지난'은 패널이 좁아 한 묶음으로 합친다.
  const { missed, unplanned } = useMemo(() => {
    const doneCatIds = new Set(projects.filter(catDone).map(p => p.id));
    const out = { missed: [], unplanned: [] };
    // 패널엔 할일만 있다 — 사이드바 필터가 '일정'이면 보여 줄 게 없다
    if (filterType === 'schedule') return out;
    buildRows(items, projects).forEach(r => {
      if (r.status === 'done' || r.status === 'cancelled') return;
      // 완료 처리한 카테고리의 항목은 카테고리와 함께 보관된 것 (목록과 같은 규칙)
      if (r.cat && doneCatIds.has(r.cat.id)) return;
      const b = dateBucket(r, dayKeys);
      if (b === 'overdue' || b === 'yesterday') out.missed.push(r);
      else if (b === 'unplanned') out.unplanned.push(r);
    });
    out.missed.sort(compareRows);
    out.unplanned.sort(compareRows);
    return out;
  }, [items, projects, filterType, dayKeys]);

  if (collapsed) {
    return (
      <button className="todo-panel-expand-btn" onClick={toggle} aria-label="할일 패널 펼치기">
        <span>📋</span>
        <span className="tp-expand-label">할일</span>
        {missed.length > 0 && (
          <span className="tp-badge tp-badge--warn" title={`놓친 할일 ${missed.length}개`}>
            <span className="tp-badge-text">놓친 </span>{missed.length}
          </span>
        )}
        {unplanned.length > 0 && (
          <span className="tp-badge" title={`날짜 미정 ${unplanned.length}개`}>
            <span className="tp-badge-text">미정 </span>{unplanned.length}
          </span>
        )}
        <span className="tp-expand-arrow">›</span>
      </button>
    );
  }

  const rowProps = { today: dayKeys.today, onItemClick, onToggle, onOpenList, onDragStart: onRowDragStart };

  return (
    <>
      <div
        ref={paneRef}
        className={`todo-panel-pane ${dragOver ? 'todo-panel-pane--drag-over' : ''}`}
        style={{ width }}
        onDragOver={(e) => {
          if (!canDrop) return;
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const id = e.dataTransfer.getData('itemId');
          if (canDrop && id) onDropItem?.(id);
        }}
      >
        <div className="todo-panel-header">
          <span className="todo-panel-title">📋 할일</span>
          <button className="todo-panel-collapse-btn" onClick={toggle} aria-label="할일 패널 접기">‹</button>
        </div>
        <div className="todo-panel-list">
          {missed.length > 0 && (
            <section className="tp-section">
              <div className="tp-section-h tp-section-h--warn">
                <b>지난 (놓친 일정)</b>
                <span className="tp-ct">{missed.length}</span>
                <button
                  className="tp-action"
                  onClick={() => moveOverdueRowsToToday(missed, dayKeys.today, { onUpdateItem, onSaveProject })}
                >
                  전부 오늘로
                </button>
              </div>
              {missed.map(r => <PanelRow key={r.key} r={r} {...rowProps} />)}
            </section>
          )}
          <section className="tp-section">
            <div className="tp-section-h">
              <b>미정</b>
              <span className="tp-ct">{unplanned.length}</span>
            </div>
            {unplanned.length === 0
              ? <div className="todo-panel-empty">날짜를 안 정한 할일이 여기 모여요.<br />날짜 칸으로 끌어다 놓으면 그 날로 잡혀요</div>
              : unplanned.map(r => <PanelRow key={r.key} r={r} {...rowProps} />)}
          </section>
        </div>
        <QuickAdd onAdd={onAddItem} />
      </div>
      <div className="todo-panel-resizer" onMouseDown={startResize} />
    </>
  );
}
