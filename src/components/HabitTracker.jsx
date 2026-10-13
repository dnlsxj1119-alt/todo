import { useState, useRef, useEffect } from 'react';
import { getWeekDays, toDateString, isToday, formatWeekRange, getWeekStart, DAY_NAMES_WEEK, addDays } from '../utils/dateUtils';
import { habitAppliesToDate, isHabitPausedOn, isWeeklyHabit, habitWeekStats } from '../utils/habitStats';

const FREQ_LABELS = { daily: '매일', weekday: '평일', weekend: '주말', weekly: '주 N회' };
// 배지용: 주 N회는 실제 횟수로 ('주 3회')
function freqLabel(habit) {
  if (isWeeklyHabit(habit)) return `주 ${Math.max(1, Number(habit.weeklyTarget) || 1)}회`;
  return FREQ_LABELS[habit.frequency] ?? habit.frequency;
}
function mdLabel(ds) {
  const [, m, d] = ds.split('-');
  return `${Number(m)}/${Number(d)}`;
}
// 잠깐 쉬기 — 기간 보기. 오늘부터 세서 '1주' 는 오늘 포함 7일.
const PAUSE_PRESETS = [
  { label: '1주', days: 7 },
  { label: '2주', days: 14 },
  { label: '한 달', days: 30 },
];

// 다른 모달들과 동작을 맞춘다 (습관/보관함 모달은 Escape 로 닫히지 않았다)
function useEscapeClose(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
const PRESET_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6', '#14B8A6'];

function HabitModal({ habit, onSave, onDelete, onArchive, onPause, onResume, onClose }) {
  const isEdit = !!habit;
  const [form, setForm] = useState({
    title: habit?.title ?? '',
    frequency: habit?.frequency ?? 'daily',
    color: habit?.color ?? PRESET_COLORS[0],
    weeklyTarget: habit?.weeklyTarget ?? 3,
  });
  const [pauseDate, setPauseDate] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const titleRef = useRef(null);
  useEscapeClose(onClose);
  const today = toDateString(new Date());
  const pausedNow = isEdit && isHabitPausedOn(habit, today);

  // 공백만 입력했을 때 조용히 무시되지 않도록 안내 + 이름은 앞뒤 공백 제거해 저장
  const submit = (e) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      if (titleRef.current) { titleRef.current.value = ''; titleRef.current.reportValidity(); }
      setForm(f => ({ ...f, title: '' }));
      return;
    }
    onSave({ ...form, title });
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal-panel" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2>{isEdit ? '습관 수정' : '새 습관'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field-group">
            <label className="field-label">습관 이름</label>
            <input className="field-input" ref={titleRef} type="text" value={form.title}
              onChange={e => set('title', e.target.value)} placeholder="매일 30분 운동" autoFocus required />
          </div>

          <div className="field-group">
            <label className="field-label">반복</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['daily', 'weekday', 'weekend', 'weekly'].map(f => (
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
            {form.frequency === 'weekly' && (
              <div className="habit-weekly-target">
                <label htmlFor="habit-weekly-target">일주일에</label>
                <input
                  id="habit-weekly-target"
                  className="field-input"
                  type="number" min={1} max={7} step={1}
                  value={form.weeklyTarget}
                  onChange={e => set('weeklyTarget', Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
                />
                <span>번 — 요일은 자유, 월~일 안에 채우면 됩니다</span>
              </div>
            )}
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

          {/* 잠깐 쉬기 — 보관과 달리 기간이 끝나면 저절로 돌아오고, 쉬는 날은 🔥연속이 끊기지 않는다.
              '글쓰기 한 달만 쉬기' 같은 용도. 시작은 항상 오늘. */}
          {isEdit && (
            <div className="field-group habit-pause">
              <label className="field-label">잠깐 쉬기</label>
              {pausedNow ? (
                <div className="habit-pause-now">
                  <span>💤 {mdLabel(habit.pausedUntil)}까지 쉬는 중 — 그동안 목록·달력에서 빠지고 연속도 안 끊깁니다.</span>
                  <button type="button" className="btn btn--ghost" onClick={() => onResume(habit.id)}>다시 시작</button>
                </div>
              ) : (
                <div className="habit-pause-pick">
                  {PAUSE_PRESETS.map(p => (
                    <button key={p.label} type="button" className="btn btn--ghost"
                      onClick={() => onPause(habit.id, addDays(today, p.days - 1))}>
                      {p.label}
                    </button>
                  ))}
                  <input className="field-input" type="date" min={today} value={pauseDate}
                    onChange={e => setPauseDate(e.target.value)} aria-label="쉬기 끝나는 날" />
                  <button type="button" className="btn btn--ghost" disabled={!pauseDate || pauseDate < today}
                    onClick={() => onPause(habit.id, pauseDate)}>
                    그날까지
                  </button>
                </div>
              )}
            </div>
          )}

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
  useEscapeClose(onClose);
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
                {freqLabel(habit)}
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

export default function HabitTracker({ habits, archivedHabits = [], onAdd, onUpdate, onDelete, onToggle, onReorder, onArchive, onRestore, onPause, onResume }) {
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
        <div className="habit-table habit-table--desktop">
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
            const weekly = isWeeklyHabit(habit);
            // 주 N회는 분모가 '해당 날 수'가 아니라 목표 횟수
            const weekApply = weekly
              ? habitWeekStats(habit, toDateString(days[0])).target
              : days.filter(day => habitAppliesToDate(habit, toDateString(day))).length;
            const weekDone = days.filter(day => {
              const ds = toDateString(day);
              return habitAppliesToDate(habit, ds) && habit.completedDates.includes(ds);
            }).length;
            const pausedNow = isHabitPausedOn(habit, toDateString(new Date()));

            return (
              <div key={habit.id}
                className={`habit-row ${pausedNow ? 'habit-row--paused' : ''}`}
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
                      {freqLabel(habit)}{pausedNow ? ` · 💤 ${mdLabel(habit.pausedUntil)}까지 쉼` : ''}
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

      {habits.length > 0 && (
        <div className="habit-table-mobile-wrap">
          <div className="habit-table habit-table--mobile">
            {/* Header: habit columns */}
            <div className="habit-row habit-row--header">
              <div className="habit-name-col habit-name-col--day" />
              {habits.map(habit => {
                const pausedNow = isHabitPausedOn(habit, toDateString(new Date()));
                return (
                  // 휴대폰 표는 전치돼 있어 습관이 열 머리글이다. 여기서도 눌러서 수정·쉬기를 열 수 있어야 한다
                  // (PC 는 이름 칸을 누르지만, 휴대폰엔 그 칸이 없었다).
                  <div key={habit.id} className="habit-day-col habit-day-col--header habit-col-head--btn"
                    role="button" tabIndex={0}
                    onClick={() => { setEditHabit(habit); setShowModal(true); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditHabit(habit); setShowModal(true); } }}
                    title={pausedNow ? `${mdLabel(habit.pausedUntil)}까지 쉬는 중 — 누르면 수정` : '누르면 수정'}
                  >
                    <span className="habit-dot" style={{ background: habit.color }} />
                    <span className="habit-col-title">{pausedNow ? '💤 ' : ''}{habit.title}</span>
                  </div>
                );
              })}
            </div>

            {/* Day rows */}
            {days.map((day, i) => {
              const ds = toDateString(day);
              const today = isToday(day);
              return (
                <div key={ds} className="habit-row">
                  <div className="habit-name-col habit-name-col--day">
                    <span className="habit-day-name">{DAY_NAMES_WEEK[i]}</span>
                    <span className={`habit-day-num ${today ? 'today-num' : ''}`}>{day.getDate()}</span>
                  </div>
                  {habits.map(habit => {
                    const applies = habitAppliesToDate(habit, ds);
                    const done = habit.completedDates.includes(ds);
                    return (
                      <div key={habit.id} className="habit-day-col">
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
        </div>
      )}

      {showModal && (
        <HabitModal
          habit={editHabit}
          onSave={handleSave}
          onDelete={(id) => { onDelete(id); setShowModal(false); }}
          onArchive={(id) => { onArchive(id); setShowModal(false); }}
          onPause={(id, until) => { onPause?.(id, until); setShowModal(false); }}
          onResume={(id) => { onResume?.(id); setShowModal(false); }}
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
