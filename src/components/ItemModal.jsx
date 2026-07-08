import { useState, useEffect, useRef } from 'react';
import { getTimeSlotFromTime, getSpanCount, TIME_SLOTS, getRecurrenceDates } from '../utils/dateUtils';
import TimePicker from './TimePicker';

const TYPE_CONFIG = {
  schedule:  { label: '일정',   emoji: '🟢', color: 'green' },
  education: { label: '교육',   emoji: '🔵', color: 'blue' },
  todo:      { label: '할일',   emoji: '🟣', color: 'purple' },
};

const REPEAT_OPTIONS = [
  { key: 'none',    label: '반복 안함' },
  { key: 'daily',   label: '매일' },
  { key: 'weekly',  label: '매주' },
  { key: 'weekday', label: '요일 지정' },
  { key: 'monthly', label: '매월' },
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ItemModal({ item, defaultDate, onSave, onDelete, onClose }) {
  const isEdit = !!item;
  const overlayRef = useRef(null);

  const [form, setForm] = useState({
    type: item?.type ?? 'schedule',
    title: item?.title ?? '',
    description: item?.description ?? '',
    date: item?.date ?? defaultDate ?? '',
    time: item?.time ?? '',
    endTime: item?.endTime ?? '',
    endDate: item?.endDate ?? '',
    timeSlot: item?.timeSlot ?? 'morning',
    completed: item?.completed ?? false,
    repeat: 'none',
    repeatEndDate: '',
    repeatDays: [],
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
    const timeSlot = form.type === 'todo' ? 'all' : form.timeSlot;
    if (!isEdit && form.repeat !== 'none' && form.repeatEndDate) {
      const occurrenceDates = getRecurrenceDates(form.date, form.repeatEndDate, form.repeat, form.repeatDays);
      onSave({ ...form, timeSlot, occurrenceDates });
      return;
    }
    onSave({ ...form, timeSlot });
  };

  const occurrenceCount = !isEdit && form.repeat !== 'none' && form.repeatEndDate
    ? getRecurrenceDates(form.date, form.repeatEndDate, form.repeat, form.repeatDays).length
    : 0;

  const toggleRepeatDay = (dow) => {
    setForm(f => ({
      ...f,
      repeatDays: f.repeatDays.includes(dow)
        ? f.repeatDays.filter(d => d !== dow)
        : [...f.repeatDays, dow].sort(),
    }));
  };

  const handleRepeatChange = (val) => {
    setForm(f => {
      if (val === 'weekday' && f.repeatDays.length === 0 && f.date) {
        const [y, m, d] = f.date.split('-').map(Number);
        return { ...f, repeat: val, repeatDays: [new Date(y, m - 1, d).getDay()] };
      }
      return { ...f, repeat: val };
    });
  };

  const needsTime = true;
  const startSlot = TIME_SLOTS.find(s => s.key === form.timeSlot);
  const endSlot = form.endTime ? TIME_SLOTS.find(s => s.key === getTimeSlotFromTime(form.endTime)) : null;
  const span = form.time && form.endTime ? getSpanCount(form.timeSlot, getTimeSlotFromTime(form.endTime)) : 1;

  const slotHintText = () => {
    if (!startSlot) return null;
    if (form.type !== 'todo' && span > 1 && endSlot) {
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
          {/* 날짜 행: 시작날짜 + 종료날짜 */}
          <div className="field-row">
            <div className="field-group field-group--half">
              <label className="field-label" htmlFor="date">시작 날짜</label>
              <input id="date" className="field-input" type="date"
                value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
            <div className="field-group field-group--half">
              <label className="field-label">
                종료 날짜 <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(당일이면 비워두세요)</span>
              </label>
              <input className="field-input" type="date"
                min={form.date}
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)} />
            </div>
          </div>

          {/* 시간 행: 시작시간 + 종료시간 */}
          {needsTime && (
            <div className="field-row">
              <div className="field-group field-group--half">
                <label className="field-label">시작 시간</label>
                <TimePicker value={form.time} onChange={handleTimeChange} />
              </div>
              <div className="field-group field-group--half">
                <label className="field-label">종료 시간</label>
                <TimePicker value={form.endTime} onChange={handleEndTimeChange} />
              </div>
            </div>
          )}

          {/* 반복 (신규 추가 시에만) */}
          {!isEdit && (
            <div className="field-group">
              <label className="field-label">반복</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="field-input" style={{ width: 110, flex: 'none' }}
                  value={form.repeat} onChange={(e) => handleRepeatChange(e.target.value)}>
                  {REPEAT_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
                {form.repeat !== 'none' && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>종료일</span>
                    <input className="field-input" style={{ flex: 1, minWidth: 120 }} type="date"
                      min={form.date}
                      value={form.repeatEndDate}
                      onChange={(e) => set('repeatEndDate', e.target.value)}
                      required />
                  </>
                )}
              </div>
              {form.repeat === 'weekday' && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  {WEEKDAY_LABELS.map((label, dow) => (
                    <button key={dow} type="button"
                      onClick={() => toggleRepeatDay(dow)}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: form.repeatDays.includes(dow) ? 'var(--purple-mid, #8B5CF6)' : 'var(--bg)',
                        color: form.repeatDays.includes(dow) ? '#fff' : 'var(--text-muted)',
                        border: form.repeatDays.includes(dow) ? 'none' : '1.5px solid var(--border)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {form.repeat !== 'none' && form.repeatEndDate && (form.repeat !== 'weekday' || form.repeatDays.length > 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  총 {occurrenceCount}개 일정이 생성됩니다{occurrenceCount >= 200 ? ' (최대 200개까지 생성)' : ''}
                </div>
              )}
            </div>
          )}

          {/* 슬롯 힌트 */}
          {form.type === 'todo' && !form.time ? (
            <div className="slot-hint slot-hint--all">📋 시간 미설정 시 주간뷰 전체 행에 표시됩니다</div>
          ) : (
            <div className={`slot-hint ${form.type !== 'todo' && span > 1 ? 'slot-hint--span' : ''}`}>
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
