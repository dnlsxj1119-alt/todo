import { useState } from 'react';
import { getMonthWeekRanges, toDateString, formatMonthYear } from '../utils/dateUtils';

const COL_COUNT = 3;

function GoalColumn({
  items, weekIdx, col, onAdd, onToggle, onDelete,
  editingId, editText, onEditTextChange, onEditStart, onEditSave, onEditCancel,
  dragId, dragOverId, onDragStart, onDragOverItem, onDropItem, onDragOverColumn, onDropColumn, onDragEnd,
}) {
  const [text, setText] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };

  return (
    <div
      className="goal-col"
      onDragOver={onDragOverColumn}
      onDrop={(e) => onDropColumn(e, weekIdx, col)}
    >
      <div className="goal-col-items">
        {items.map(item => (
          <div
            key={item.id}
            className={`goal-item ${item.completed ? 'goal-item--done' : ''}`}
            draggable
            onDragStart={() => onDragStart(item.id)}
            onDragOver={(e) => onDragOverItem(e, item.id)}
            onDrop={(e) => onDropItem(e, weekIdx, col, item.id)}
            onDragEnd={onDragEnd}
            style={{
              opacity: dragId === item.id ? 0.4 : 1,
              outline: dragOverId === item.id ? '2px dashed var(--accent)' : 'none',
            }}
          >
            <span className="goal-item-drag" aria-hidden="true">⠿</span>
            <span className="goal-item-check" onClick={() => onToggle(item.id)} role="checkbox" aria-checked={item.completed}>
              {item.completed ? '✓' : '○'}
            </span>
            {editingId === item.id ? (
              <input
                className="goal-item-edit-input"
                autoFocus
                value={editText}
                onChange={(e) => onEditTextChange(e.target.value)}
                onBlur={() => onEditSave(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); onEditSave(item.id); }
                  if (e.key === 'Escape') { e.preventDefault(); onEditCancel(); }
                }}
              />
            ) : (
              <span className="goal-item-text" onClick={() => onToggle(item.id)}>{item.text}</span>
            )}
            <button className="goal-item-edit" onClick={() => onEditStart(item)} aria-label="수정">✎</button>
            <button className="goal-item-del" onClick={() => onDelete(item.id)} aria-label="삭제">✕</button>
          </div>
        ))}
      </div>
      <form className="goal-week-add" onSubmit={submit}>
        <input
          className="goal-week-input"
          placeholder="+ 항목 추가"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
    </div>
  );
}

function WeekRow({ range, items, isCurrentWeek, onAdd, onToggle, onDelete, dragHandlers, editHandlers }) {
  const total = items.length;
  const done = items.filter(i => i.completed).length;

  return (
    <div className={`goal-week-row ${isCurrentWeek ? 'goal-week-row--current' : ''}`}>
      <div className="goal-week-row-head">
        <span className="goal-week-name">
          {range.week + 1}주차
          {isCurrentWeek && <span className="goal-week-badge">이번 주</span>}
        </span>
        <span className="goal-week-range">{range.label}</span>
        {total > 0 && <span className="goal-week-summary">{done}/{total} 완료</span>}
      </div>
      <div className="goal-week-cols">
        {Array.from({ length: COL_COUNT }, (_, col) => (
          <GoalColumn
            key={col}
            weekIdx={range.week}
            col={col}
            items={items.filter(i => i.col === col)}
            onAdd={(text) => onAdd(col, text)}
            onToggle={onToggle}
            onDelete={onDelete}
            {...dragHandlers}
            {...editHandlers}
          />
        ))}
      </div>
    </div>
  );
}

export default function MonthlyGoalsView({ currentMonth, setCurrentMonth, goal, onUpdateNotes, onAddItem, onToggleItem, onDeleteItem, onEditItem, onReorderItems }) {
  const [notes, setNotes] = useState(goal.notes);
  const [monthKeyLoaded, setMonthKeyLoaded] = useState(goal.month);

  // 월이 바뀌면 textarea 내용을 새 달의 노트로 다시 맞춘다
  if (goal.month !== monthKeyLoaded) {
    setNotes(goal.notes);
    setMonthKeyLoaded(goal.month);
  }

  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const today = new Date();
  const isCurrentMonth = currentMonth.getFullYear() === today.getFullYear() && currentMonth.getMonth() === today.getMonth();
  const todayStr = toDateString(today);

  const weekRanges = getMonthWeekRanges(currentMonth);

  const moveItem = (targetWeek, targetCol, targetItemId) => {
    if (!dragId) return;
    const list = [...goal.items];
    const fromIdx = list.findIndex(i => i.id === dragId);
    if (fromIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    const updatedMoved = { ...moved, week: targetWeek, col: targetCol };

    if (targetItemId == null || targetItemId === dragId) {
      let insertAt = list.length;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].week === targetWeek && list[i].col === targetCol) { insertAt = i + 1; break; }
      }
      list.splice(insertAt, 0, updatedMoved);
    } else {
      const targetIdx = list.findIndex(i => i.id === targetItemId);
      list.splice(targetIdx === -1 ? list.length : targetIdx, 0, updatedMoved);
    }

    onReorderItems(goal.month, list);
    setDragId(null);
    setDragOverId(null);
  };

  const dragHandlers = {
    dragId,
    dragOverId,
    onDragStart: (id) => setDragId(id),
    onDragOverItem: (e, id) => { e.preventDefault(); if (id !== dragId) setDragOverId(id); },
    onDropItem: (e, weekIdx, col, itemId) => { e.preventDefault(); moveItem(weekIdx, col, itemId); },
    onDragOverColumn: (e) => e.preventDefault(),
    onDropColumn: (e, weekIdx, col) => { e.preventDefault(); moveItem(weekIdx, col, null); },
    onDragEnd: () => { setDragId(null); setDragOverId(null); },
  };

  const editHandlers = {
    editingId,
    editText,
    onEditTextChange: (v) => setEditText(v),
    onEditStart: (item) => { setEditingId(item.id); setEditText(item.text); },
    onEditSave: (id) => {
      const trimmed = editText.trim();
      setEditingId(null);
      if (trimmed) onEditItem(goal.month, id, trimmed);
    },
    onEditCancel: () => setEditingId(null),
  };

  return (
    <div className="goals-view">
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevMonth} aria-label="이전 달">‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatMonthYear(currentMonth)} 목표</h2>
          {!isCurrentMonth && <button className="today-btn" onClick={goToday}>오늘</button>}
        </div>
        <button className="nav-btn" onClick={nextMonth} aria-label="다음 달">›</button>
      </div>

      <div className="goals-body">
        <div className="goals-notes-pane">
          <div className="goals-pane-title">이번달 목표</div>
          <textarea
            className="goals-notes-textarea"
            placeholder="이번 달에 이루고 싶은 것들을 자유롭게 적어보세요"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onUpdateNotes(goal.month, notes)}
          />
        </div>

        <div className="goals-week-list">
          {weekRanges.map(range => (
            <WeekRow
              key={range.week}
              range={range}
              items={goal.items.filter(i => i.week === range.week)}
              isCurrentWeek={isCurrentMonth && todayStr >= range.startDate && todayStr <= range.endDate}
              onAdd={(col, text) => onAddItem(goal.month, range.week, col, text)}
              onToggle={(id) => onToggleItem(goal.month, id)}
              onDelete={(id) => onDeleteItem(goal.month, id)}
              dragHandlers={dragHandlers}
              editHandlers={editHandlers}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
