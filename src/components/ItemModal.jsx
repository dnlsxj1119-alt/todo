import { useState, useEffect, useRef } from 'react';
import { getTimeSlotFromTime, getSpanCount, TIME_SLOTS } from '../utils/dateUtils';
import TimePicker from './TimePicker';

const TYPE_CONFIG = {
  todo:      { label: '할일',   emoji: '🟣', color: 'purple' },
  education: { label: '교육',   emoji: '🔵', color: 'blue' },
  schedule:  { label: '일정',   emoji: '🟢', color: 'green' },
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
    endTime: item?.endTime ?? '',
    endDate: item?.endDate ?? '',
    timeSlot: item?.timeSlot ?? 'morning',
    completed: item?.completed ?? false,
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleTypeChange = (type) => {
    setForm(f => ({ ...f, type, time: '', endTime: '', timeSlot: 'morning' }));
  };

  const handleTimeChange = (val) => {
    const slot = val ? getTimeSlotFromTime(val) : 'morning';
    setForm(f => ({ ...f, time: val, endTime: '', endDate: '', timeSlot: slot }));
  };

  const handleEndTimeChange = (val) => {
    setForm(f => {
      // 종료시간이 시작시간보다 이르고 종료날짜 미설정 → 자동으로 다음날
      let endDate = f.endDate;
      if (val && f.time && val <= f.time && !f.endDate) {
        const next = new Date(f.date);
        next.setDate(next.getDate() + 1);
        endDate = next.toISOString().slice(0, 10);
      }
      if (!val) endDate = '';
      return { ...f, endTime: val, endDate };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...form, timeSlot: form.type === 'todo' ? 'all' : form.timeSlot });
  };

  const needsTime = form.type === 'schedule' || form.type === 'education';
  const startSlot = TIME_SLOTS.find(s => s.key === form.timeSlot);
  const endSlot = form.endTime ? TIME_SLOTS.find(s => s.key === getTimeSlotFromTime(form.endTime)) : null;
  const span = form.time && form.endTime ? getSpanCount(form.timeSlot, getTimeSlotFromTime(form.endTime)) : 1;

  const slotHintText = () => {
    if (form.type === 'todo') return null;
    if (!startSlot) return null;
    if (span > 1 && endSlot) {
      return `${startSlot.emoji} ${startSlot.label} → ${endSlot.emoji} ${endSlot.label} (${span}개 행에 걸쳐 표시)`;
    }
    return `${startSlot.emoji} ${startSlot.label} (${startSlot.range}) 행에 표시${!form.time ? ' — 시간 입력 시 자동 설정' : ''}`;
  };

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{isEdit ? '항목 수정' : '새 항목 추가'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Type */}
          <div className="field-group">
            <label className="field-label">종류</label>
            <div className="type-tabs">
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <button key={key} type="button"
                  className={`type-tab type-tab--${cfg.color} ${form.type === key ? 'active' : ''}`}
                  onClick={() => handleTypeChange(key)}>
                  {cfg.emoji} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="field-group">
            <label className="field-label" htmlFor="title">제목 *</label>
            <input id="title" className="field-input" type="text"
              placeholder="무엇을 해야 하나요?" value={form.title}
              onChange={(e) => set('title', e.target.value)} autoFocus required />
          </div>

          {/* Description */}
          <div className="field-group">
            <label className="field-label" htmlFor="desc">메모</label>
            <textarea id="desc" className="field-input field-textarea" rows={2}
              placeholder="추가 설명 (선택)" value={form.description}
              onChange={(e) => set('description', e.target.value)} />
          </div>

          {/* Date + 시작/종료 시간 */}
          <div className="field-row">
            <div className="field-group field-group--third">
              <label className="field-label" htmlFor="date">날짜</label>
              <input id="date" className="field-input" type="date"
                value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
            {needsTime && (
              <div className="field-group field-group--third">
                <label className="field-label">시작 시간</label>
                <TimePicker value={form.time} onChange={handleTimeChange} />
              </div>
            )}
            {needsTime && form.time && (
              <div className="field-group field-group--third">
                <label className="field-label">종료 시간</label>
                <TimePicker value={form.endTime} onChange={handleEndTimeChange} />
              </div>
            )}
          </div>

          {/* 종료 날짜 (다일 일정) */}
          {needsTime && form.endTime && (
            <div className="field-group">
              <label className="field-label">
                종료 날짜 <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                  (당일이면 비워두세요)
                </span>
              </label>
              <input className="field-input" type="date"
                min={form.date}
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)} />
            </div>
          )}

          {/* 슬롯 힌트 */}
          {form.type === 'todo' ? (
            <div className="slot-hint slot-hint--all">📋 주간뷰 전체 행에 표시됩니다</div>
          ) : (
            <div className={`slot-hint ${span > 1 ? 'slot-hint--span' : ''}`}>
              {slotHintText()}
            </div>
          )}

          {/* Actions */}
          <div className="modal-actions">
            {isEdit && (
              <button type="button" className="btn btn--danger" onClick={() => onDelete(item.id)}>삭제</button>
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
