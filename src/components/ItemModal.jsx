import { useState, useEffect, useRef } from 'react';
import { getTimeSlotFromTime, getSpanCount, TIME_SLOTS, getRecurrenceDates } from '../utils/dateUtils';
import { getProjectType } from '../utils/projectTypes';
import TimePicker from './TimePicker';

// education('매우중요')는 새로 만들 때는 못 고르게 했지만(중요도로 대체),
// 이미 만들어 둔 항목을 그대로 보고 편집할 수 있어야 하므로 정의는 남겨 둔다.
const TYPE_CONFIG = {
  schedule:  { label: '일정',   emoji: '🟢', color: 'green' },
  education: { label: '매우중요', emoji: '🔴', color: 'red' },
  todo:      { label: '할일',   emoji: '🟣', color: 'purple' },
};

// 새로 만들 때 고를 수 있는 종류
const SELECTABLE_TYPES = ['schedule', 'todo'];

const REPEAT_OPTIONS = [
  { key: 'none',    label: '반복 안함' },
  { key: 'daily',   label: '매일' },
  { key: 'weekly',  label: '매주' },
  { key: 'weekday', label: '요일 지정' },
  { key: 'monthly', label: '매월' },
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ItemModal({ item, defaultDate, defaultSlot, defaultType, projects = [], onSave, onDelete, onClose }) {
  const isEdit = !!item;
  // 주간뷰에서 특정 시간대 칸을 더블클릭해 열었으면 그 시간대를 기본값으로 쓴다.
  // ('all'(전체 행)처럼 시간대가 아닌 값은 무시)
  const initialSlot = item?.timeSlot
    ?? (TIME_SLOTS.some(s => s.key === defaultSlot) ? defaultSlot : 'morning');
  const overlayRef = useRef(null);
  const titleRef = useRef(null);
  // 종료 날짜를 사용자가 직접 입력한 적이 있으면 시간 기반 자동 다음날 계산을 건너뜀
  const endDateManuallySet = useRef(!!item?.endDate);

  const [form, setForm] = useState({
    // 목록 탭의 '+ 새 할일' 처럼 여는 곳에 따라 기본 종류를 다르게 쓸 수 있게 한다
    type: item?.type ?? (SELECTABLE_TYPES.includes(defaultType) ? defaultType : 'schedule'),
    title: item?.title ?? '',
    description: item?.description ?? '',
    date: item?.date ?? defaultDate ?? '',
    time: item?.time ?? '',
    endTime: item?.endTime ?? '',
    endDate: item?.endDate ?? '',
    dueDate: item?.dueDate ?? '',
    priority: item?.priority ?? 0,
    status: item?.status ?? (item?.completed ? 'done' : 'todo'),
    projectId: item?.projectId ?? null,
    timeSlot: initialSlot,
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
    // 이미 선택된 종류를 다시 누르면 입력해둔 시간이 지워지던 문제 → 아무것도 하지 않음
    if (type === form.type) return;
    // 종류를 바꾸면 그 종류에 입력칸이 없는 값이 화면에서 사라진 채 남아서 저장됐다.
    // (일정의 '종료 날짜' 를 넣고 할일/매우중요로 바꾸면 며칠에 걸친 유령 항목이 생김)
    endDateManuallySet.current = false;
    setForm(f => ({
      ...f, type,
      time: '', endTime: '', timeSlot: initialSlot,
      endDate: '',
      dueDate: type === 'schedule' ? '' : f.dueDate,
    }));
  };

  const handleTimeChange = (val) => {
    const slot = val ? getTimeSlotFromTime(val) : 'morning';
    setForm(f => {
      // 종료시간은 처음 입력값을 유지하고, 다음날 여부만 다시 계산
      let endDate = f.endDate;
      if (!endDateManuallySet.current) {
        endDate = '';
        if (val && f.endTime && f.date && f.endTime <= val) {
          const next = new Date(f.date);
          next.setDate(next.getDate() + 1);
          endDate = next.toISOString().slice(0, 10);
        }
      }
      return { ...f, time: val, timeSlot: slot, endDate };
    });
  };

  const handleEndTimeChange = (val) => {
    setForm(f => {
      // 사용자가 종료 날짜를 직접 입력한 적이 있으면 자동 계산하지 않고 그대로 둠
      if (endDateManuallySet.current) return { ...f, endTime: val };
      // 종료시간이 시작시간보다 이르면 자동으로 다음날, 아니면 당일(빈값)로 매번 다시 계산
      let endDate = '';
      if (val && f.time && f.date && val <= f.time) {
        const next = new Date(f.date);
        next.setDate(next.getDate() + 1);
        endDate = next.toISOString().slice(0, 10);
      }
      return { ...f, endTime: val, endDate };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // 공백만 입력하면 required 검사는 통과하지만 저장이 조용히 무시돼 원인을 알 수 없었다
    // → 값을 비워 브라우저 기본 안내를 띄운다. 저장되는 제목도 앞뒤 공백을 없앤다.
    const title = form.title.trim();
    if (!title) {
      if (titleRef.current) { titleRef.current.value = ''; titleRef.current.reportValidity(); }
      setForm(f => ({ ...f, title: '' }));
      return;
    }
    const timeSlot = form.type === 'todo' ? 'all' : form.timeSlot;
    if (!isEdit && form.date && form.repeat !== 'none' && form.repeatEndDate) {
      const occurrenceDates = getRecurrenceDates(form.date, form.repeatEndDate, form.repeat, form.repeatDays);
      onSave({ ...form, title, timeSlot, occurrenceDates });
      return;
    }
    onSave({ ...form, title, timeSlot });
  };

  const occurrenceCount = !isEdit && form.date && form.repeat !== 'none' && form.repeatEndDate
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

  // 카테고리 선택 후보. 완료 처리한 카테고리는 목록에서 감춰지므로 후보에서 빼되,
  // 이미 그 카테고리로 지정된 항목을 편집할 때는 그대로 보이도록 남긴다.
  const catColor = (p) => p.color || getProjectType(p.type).border;
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const categoryOptions = projects.filter(p => !p.forceCompleted || sameId(p.id, form.projectId));
  const selectedCategory = projects.find(p => sameId(p.id, form.projectId)) ?? null;

  // 옛 종류('매우중요')로 저장된 항목을 편집할 때는 그 탭도 보여줘야
  // 지금 종류가 무엇인지 보이고, 할일로 바꿀 수도 있다.
  const typeTabs = (SELECTABLE_TYPES.includes(form.type) || !TYPE_CONFIG[form.type])
    ? SELECTABLE_TYPES
    : [...SELECTABLE_TYPES, form.type];

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
              {typeTabs.map(key => {
                const cfg = TYPE_CONFIG[key];
                if (!cfg) return null;
                return (
                  <button key={key} type="button"
                    className={`type-tab type-tab--${cfg.color} ${form.type === key ? 'active' : ''}`}
                    onClick={() => handleTypeChange(key)}>
                    {cfg.emoji} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="field-group">
            <label className="field-label" htmlFor="title">제목 *</label>
            <input id="title" ref={titleRef} className="field-input" type="text"
              placeholder="무엇을 해야 하나요?" value={form.title}
              onChange={(e) => set('title', e.target.value)} autoFocus required />
          </div>

          {/* Date + 시작/종료 시간 */}
          {form.type === 'schedule' ? (
            /* 일정: 시작 날짜 + 종료 날짜 (여러 날 이벤트) */
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
                  onChange={(e) => { endDateManuallySet.current = true; set('endDate', e.target.value); }} />
              </div>
            </div>
          ) : (
            /* 할일 / 매우중요: 계획일 + 마감일 */
            <div className="field-row">
              <div className="field-group field-group--half">
                <label className="field-label" htmlFor="date">
                  🗓 계획일 <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(비워두면 받은칸에 대기)</span>
                </label>
                <input id="date" className="field-input" type="date"
                  value={form.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="field-group field-group--half">
                <label className="field-label">
                  📕 마감일 <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(놓치면 안 되는 날)</span>
                </label>
                <input className="field-input" type="date"
                  value={form.dueDate}
                  onChange={(e) => set('dueDate', e.target.value)} />
              </div>
            </div>
          )}

          {/* 중요도 + 상태 (할일 / 매우중요) */}
          {form.type !== 'schedule' && (
            <div className="field-row">
              <div className="field-group field-group--half">
                <label className="field-label">중요도</label>
                <div className="seg">
                  {[[0, '없음'], [1, '낮음'], [2, '보통'], [3, '높음']].map(([v, l]) => (
                    <button key={v} type="button"
                      className={`seg-btn ${form.priority === v ? 'seg-btn--on' : ''}`}
                      data-prio={v}
                      onClick={() => set('priority', v)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="field-group field-group--half">
                <label className="field-label">상태</label>
                <div className="seg">
                  {[['todo', '안 함'], ['doing', '하는 중'], ['done', '완료']].map(([v, l]) => (
                    <button key={v} type="button"
                      className={`seg-btn ${form.status === v ? 'seg-btn--on' : ''}`}
                      data-status={v}
                      onClick={() => set('status', v)}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 카테고리 (할일 / 매우중요) — 새 카테고리 만들기는 목록 탭에서 */}
          {form.type !== 'schedule' && (
            <div className="field-group">
              <label className="field-label" htmlFor="item-category">카테고리</label>
              <div className="item-cat-row">
                <span
                  className="item-cat-dot"
                  style={{ background: selectedCategory ? catColor(selectedCategory) : 'var(--border)' }}
                />
                <select
                  id="item-category"
                  className="field-input"
                  value={form.projectId == null ? '' : String(form.projectId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    // 원래 id 값(bigint)을 그대로 쓰도록 목록에서 찾아 넣는다
                    set('projectId', v === '' ? null : (projects.find(p => String(p.id) === v)?.id ?? null));
                  }}
                >
                  <option value="">없음</option>
                  {categoryOptions.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.title}</option>
                  ))}
                </select>
              </div>
              {categoryOptions.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  카테고리는 목록 탭에서 만들 수 있어요
                </div>
              )}
            </div>
          )}

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
              {form.repeat !== 'none' && !form.date && (
                /* 날짜가 없으면 반복이 조용히 무시되고 1개만 생기던 문제 → 이유를 알려준다 */
                <div style={{ fontSize: 11, color: 'var(--red-mid, #D9534F)', marginTop: 4 }}>
                  {form.type === 'schedule' ? '시작 날짜' : '계획일'}을 정해야 반복 일정이 만들어집니다
                </div>
              )}
              {form.repeat === 'weekday' && form.date && form.repeatDays.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--red-mid, #D9534F)', marginTop: 4 }}>
                  요일을 하나 이상 선택해 주세요
                </div>
              )}
              {form.repeat !== 'none' && form.date && form.repeatEndDate && (form.repeat !== 'weekday' || form.repeatDays.length > 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  총 {occurrenceCount}개 일정이 생성됩니다{occurrenceCount >= 200 ? ' (최대 200개까지 생성)' : ''}
                </div>
              )}
            </div>
          )}

          {/* 슬롯 힌트 */}
          {form.type === 'todo' && !form.date ? (
            <div className="slot-hint slot-hint--all">📋 날짜 미설정 시 주간뷰 할일 백로그에 대기합니다</div>
          ) : form.type === 'todo' && !form.time ? (
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
