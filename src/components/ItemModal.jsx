import { useState, useEffect, useRef } from 'react';
import { TIME_SLOTS } from '../utils/dateUtils';

const TYPE_CONFIG = {
  todo:      { label: '할일',   emoji: '🟣', color: 'purple' },
  education: { label: '교육',   emoji: '🔵', color: 'blue' },
  schedule:  { label: '일정',   emoji: '🟢', color: 'green' },
};

const PRIORITY_CONFIG = {
  low:    { label: '낮음', emoji: '⚪' },
  medium: { label: '보통', emoji: '🟡' },
  high:   { label: '높음', emoji: '🔴' },
};

export default function ItemModal({ item, defaultDate, onSave, onDelete, onClose }) {
  const isEdit = !!item;
  const overlayRef = useRef(null);

  const [form, setForm] = useState({
    type: item?.type ?? 'todo',
    title: item?.title ?? '',
    description: item?.description ?? '',
    date: item?.date ?? defaultDate ?? '',
    time: item?.time ?? '',
    timeSlot: item?.timeSlot ?? 'morning',
    priority: item?.priority ?? 'medium',
    completed: item?.completed ?? false,
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  const needsTime = form.type === 'schedule' || form.type === 'education';

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{isEdit ? '항목 수정' : '새 항목 추가'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Type selector */}
          <div className="field-group">
            <label className="field-label">종류</label>
            <div className="type-tabs">
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  className={`type-tab type-tab--${cfg.color} ${form.type === key ? 'active' : ''}`}
                  onClick={() => set('type', key)}
                >
                  {cfg.emoji} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="field-group">
            <label className="field-label" htmlFor="title">제목 *</label>
            <input
              id="title"
              className="field-input"
              type="text"
              placeholder="무엇을 해야 하나요?"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className="field-group">
            <label className="field-label" htmlFor="desc">메모</label>
            <textarea
              id="desc"
              className="field-input field-textarea"
              placeholder="추가 설명 (선택)"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
            />
          </div>

          {/* Date + Time row */}
          <div className="field-row">
            <div className="field-group field-group--half">
              <label className="field-label" htmlFor="date">날짜</label>
              <input
                id="date"
                className="field-input"
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                required
              />
            </div>
            {needsTime && (
              <div className="field-group field-group--half">
                <label className="field-label" htmlFor="time">시간</label>
                <input
                  id="time"
                  className="field-input"
                  type="time"
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Time slot */}
          <div className="field-group">
            <label className="field-label">주간뷰 시간대</label>
            <div className="slot-grid">
              {TIME_SLOTS.map(slot => (
                <button
                  key={slot.key}
                  type="button"
                  className={`slot-btn ${form.timeSlot === slot.key ? 'active' : ''}`}
                  onClick={() => set('timeSlot', slot.key)}
                >
                  {slot.emoji} {slot.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div className="field-group">
            <label className="field-label">우선순위</label>
            <div className="priority-row">
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  className={`priority-btn ${form.priority === key ? 'active' : ''}`}
                  onClick={() => set('priority', key)}
                >
                  {cfg.emoji} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions">
            {isEdit && (
              <button type="button" className="btn btn--danger" onClick={() => onDelete(item.id)}>
                삭제
              </button>
            )}
            <div className="modal-actions-right">
              <button type="button" className="btn btn--ghost" onClick={onClose}>취소</button>
              <button type="submit" className="btn btn--primary">
                {isEdit ? '저장' : '추가'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
