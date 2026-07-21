import { useState } from 'react';
import { getWeekDays, toDateString, isToday, formatWeekRange, getWeekStart, DAY_NAMES_WEEK } from '../utils/dateUtils';
import { habitAppliesToDate } from '../hooks/useHabits';

const FREQ_LABELS = { daily: '매일', weekday: '평일', weekend: '주말' };
const PRESET_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6', '#14B8A6'];

function HabitModal({ habit, onSave, onDelete, onArchive, onClose }) {
  const isEdit = !!habit;
  const [form, setForm] = useState({
    title: habit?.title ?? '',
    frequency: habit?.frequency ?? 'daily',
    color: habit?.color ?? PRESET_COLORS[0],
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal-panel" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2>{isEdit ? '습관 수정' : '새 습관'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) onSave(form); }} className="modal-form">
          <div className="field-group">
            <label className="field-label">습관 이름</label>
            <input className="field-input" type="text" value={form.title}
              onChange={e => set('title', e.target.value)} placeholder="매일 30분 운동" autoFocus required />
          </div>

          <div className="field-group">
            <label className="field-label">반복</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['daily', 'weekday', 'weekend'].map(f => (
                <button key={f} type="button"
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: form.frequency === f ? form.color : 'var(--bg)',
                    color: form.frequency === f ? '#fff' : 'var(--text-muted)',
                    border: form.frequency === f ? `2px solid ${form.color}` : '1.5px solid var(--border)',
                  }}
                  onClick={() => set('frequency', f)}>
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">색상</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} type="button"
                  style={{
                    width: 30, height: 30, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                    outline: form.color === c ? `3px solid ${c}` : '3px solid transparent',
                    outlineOffset: 2,
                  }}
                  onClick={() => set('color', c)} />
              ))}
            </div>
          </div>

          <div className="modal-actions">
            {isEdit && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn--danger" onClick={() => onDelete(habit.id)}>삭제</button>
                <button type="button" className="btn btn--ghost" onClick={() => onArchive(habit.id)}>보관</button>
              </div>
            )}
            <div className="modal-actions-right">
              <button type="button" className="btn btn--ghost" onClick={onClose}>취소</button>
              <button type="submit" className="btn btn--primary">{isEdit ? '저장' : '추가'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ArchiveModal({ habits, onRestore, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal-panel" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2>보관함</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
          {habits.length === 0 ? (
            <div className="proj-empty" style={{ padding: '24px 0' }}>
              <div className="empty-text">보관된 습관이 없습니다</div>
            </div>
          ) : habits.map(habit => (
            <div key={habit.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              border: '1px solid var(--border)', borderRadius: 8,
            }}>
              <span className="habit-dot" style={{ background: habit.color }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{habit.title}</span>
              <span className="habit-freq-badge" style={{ color: habit.color, background: habit.color + '22' }}>
                {FREQ_LABELS[habit.frequency]}
              </span>
              <button type="button" className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => onRestore(habit.id)}>복원</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HabitTracker({ habits, archivedHabits = [], onAdd, onUpdate, onDelete, onToggle, onReorder, onArchive, onRestore }) {
  const [showModal, setShowModal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editHabit, setEditHabit] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const days = getWeekDays(currentWeek);

  const prevWeek = () => { const d = new Date(currentWeek); d.setDate(d.getDate() - 7); setCurrentWeek(d); };
  const nextWeek = () => { const d = new Date(currentWeek); d.setDate(d.getDate() + 7); setCurrentWeek(d); };
  const goThisWeek = () => setCurrentWeek(getWeekStart(new Date()));

  const handleSave = (data) => {
    if (editHabit) onUpdate(editHabit.id, data);
    else onAdd(data);
    setShowModal(false);
  };

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => { e.preventDefault(); if (id !== dragId) setDragOverId(id); };
  const handleDrop = (e, id) => {
    e.preventDefault();
    if (!dragId || dragId === id) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...habits];
    const from = reordered.findIndex(h => h.id === dragId);
    const to   = reordered.findIndex(h => h.id === id);
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onReorder(reordered.map((h, i) => ({ ...h, sortOrder: i })));
    setDragId(null); setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  return (
    <div className="habit-view">
      <div className="proj-header">
        <div>
          <h2 className="proj-header-title">습관 트래커</h2>
          <p className="proj-header-sub">매일의 루틴을 관리하고 추적하세요</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost" onClick={() => setShowArchive(true)}>
            보관함{archivedHabits.length > 0 ? ` (${archivedHabits.length})` : ''}
          </button>
          <button className="btn btn--primary" onClick={() => { setEditHabit(null); setShowModal(true); }}>+ 습관 추가</button>
        </div>
      </div>

      {/* Week nav */}
      <div className="cal-nav" style={{ marginBottom: 16 }}>
        <button className="nav-btn" onClick={prevWeek}>‹</button>
        <div className="cal-title-group">
          <span className="cal-title" style={{ fontSize: 16 }}>{formatWeekRange(currentWeek)}</span>
          <button className="today-btn" onClick={goThisWeek}>이번 주</button>
        </div>
        <button className="nav-btn" onClick={nextWeek}>›</button>
      </div>

      {habits.length === 0 ? (
        <div className="proj-empty">
          <div className="empty-emoji">🎯</div>
          <div className="empty-text">아직 습관이 없습니다</div>
          <button className="btn btn--primary" onClick={() => { setEditHabit(null); setShowModal(true); }}>첫 습관 만들기</button>
        </div>
      ) : (
        <div className="habit-table">
          {/* Header */}
          <div className="habit-row habit-row--header">
            <div className="habit-name-col" />
            {days.map((day, i) => {
              const today = isToday(day);
              return (
                <div key={i} className={`habit-day-col habit-day-col--header ${today ? 'habit-day-col--today' : ''}`}>
                  <div className="habit-day-name">{DAY_NAMES_WEEK[i]}</div>
                  <div className={`habit-day-num ${today ? 'today-num' : ''}`}>{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Habit rows */}
          {habits.map(habit => {
            const weekApply = days.filter(day => habitAppliesToDate(habit, toDateString(day))).length;
            const weekDone = days.filter(day => {
              const ds = toDateString(day);
              return habitAppliesToDate(habit, ds) && habit.completedDates.includes(ds);
            }).length;

            return (
              <div key={habit.id}
                className="habit-row"
                draggable
                onDragStart={() => handleDragStart(habit.id)}
                onDragOver={(e) => handleDragOver(e, habit.id)}
                onDrop={(e) => handleDrop(e, habit.id)}
                onDragEnd={handleDragEnd}
                style={{
                  opacity: dragId === habit.id ? 0.4 : 1,
                  outline: dragOverId === habit.id ? '2px dashed var(--accent)' : 'none',
                  transition: 'opacity 0.15s',
                }}
              >
                <div className="habit-name-col habit-name-cell"
                  onClick={() => { setEditHabit(habit); setShowModal(true); }}>
                  <span style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 15, flexShrink: 0 }}>⠿</span>
                  <span className="habit-dot" style={{ background: habit.color }} />
                  <div className="habit-name-info">
                    <span className="habit-name-text">{habit.title}</span>
                    <span className="habit-freq-badge" style={{ color: habit.color, background: habit.color + '22' }}>
                      {FREQ_LABELS[habit.frequency]}
                    </span>
                  </div>
                  <span className="habit-week-count" style={{ color: habit.color }}>{weekDone}/{weekApply}</span>
                </div>
                {days.map(day => {
                  const ds = toDateString(day);
                  const applies = habitAppliesToDate(habit, ds);
                  const done = habit.completedDates.includes(ds);
                  const today = isToday(day);
                  return (
                    <div key={ds} className={`habit-day-col ${today ? 'habit-day-col--today' : ''}`}>
                      <button
                        className={`habit-check-btn ${done ? 'habit-check-btn--done' : ''} ${!applies ? 'habit-check-btn--na' : ''}`}
                        style={applies ? { '--habit-color': habit.color } : {}}
                        onClick={() => applies && onToggle(habit.id, ds)}
                      >
                        {!applies ? '—' : done ? '✓' : ''}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <HabitModal
          habit={editHabit}
          onSave={handleSave}
          onDelete={(id) => { onDelete(id); setShowModal(false); }}
          onArchive={(id) => { onArchive(id); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {showArchive && (
        <ArchiveModal
          habits={archivedHabits}
          onRestore={onRestore}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  );
}
