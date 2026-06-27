import { useState, useEffect, useRef } from 'react';

const TASK_STATUSES = ['done', 'in_progress', 'upcoming'];
const EMAIL_STATUSES = ['draft', 'sent', 'planned'];

export default function ProjectModal({ project, onSave, onDelete, onClose }) {
  const isEdit = !!project;
  const overlayRef = useRef(null);

  const [form, setForm] = useState({
    type: project?.type ?? 'education',
    title: project?.title ?? '',
    totalWeeks: project?.totalWeeks ?? 12,
    currentWeek: project?.currentWeek ?? 1,
    tasks: project?.tasks ?? [{ id: Date.now(), label: '', status: 'upcoming' }],
    notes: project?.notes ?? '',
    nextAction: project?.nextAction ?? '',
    contact: project?.contact ?? '',
    emails: project?.emails ?? [],
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addTask = () => {
    setForm(f => ({
      ...f,
      tasks: [...f.tasks, { id: Date.now(), label: '', status: 'upcoming' }],
    }));
  };
  const updateTask = (id, key, val) => {
    setForm(f => ({ ...f, tasks: f.tasks.map(t => t.id === id ? { ...t, [key]: val } : t) }));
  };
  const removeTask = (id) => {
    setForm(f => ({ ...f, tasks: f.tasks.filter(t => t.id !== id) }));
  };

  const addEmail = () => {
    setForm(f => ({ ...f, emails: [...f.emails, { id: Date.now(), label: '', status: 'planned' }] }));
  };
  const updateEmail = (id, key, val) => {
    setForm(f => ({ ...f, emails: f.emails.map(e => e.id === id ? { ...e, [key]: val } : e) }));
  };
  const removeEmail = (id) => {
    setForm(f => ({ ...f, emails: f.emails.filter(e => e.id !== id) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="modal-panel" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2>{isEdit ? '프로젝트 수정' : '새 프로젝트'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Type */}
          <div className="field-group">
            <label className="field-label">종류</label>
            <div className="type-tabs">
              {[
                { key: 'education',   label: '🎓 교육 프로젝트' },
                { key: 'sponsorship', label: '📁 프로젝트' },
              ].map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={`type-tab type-tab--${t.key === 'education' ? 'blue' : 'green'} ${form.type === t.key ? 'active' : ''}`}
                  onClick={() => set('type', t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="field-group">
            <label className="field-label">프로젝트 이름 *</label>
            <input
              className="field-input"
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="프로젝트 이름"
              autoFocus
              required
            />
          </div>

          {/* Education-specific */}
          {form.type === 'education' && (
            <div className="field-row">
              <div className="field-group field-group--half">
                <label className="field-label">전체 주차</label>
                <input className="field-input" type="number" min={1} max={52}
                  value={form.totalWeeks}
                  onChange={e => {
                    const weeks = Number(e.target.value);
                    setForm(f => {
                      const cur = f.tasks;
                      let tasks;
                      if (weeks > cur.length) {
                        tasks = [...cur, ...Array.from({ length: weeks - cur.length }, (_, i) => ({
                          id: Date.now() + i, label: `강의듣기${cur.length + i + 1}`, status: 'upcoming',
                        }))];
                      } else {
                        tasks = cur.slice(0, weeks);
                      }
                      return { ...f, totalWeeks: weeks, tasks };
                    });
                  }} />
              </div>
              <div className="field-group field-group--half">
                <label className="field-label">현재 주차</label>
                <input className="field-input" type="number" min={1} max={form.totalWeeks}
                  value={form.currentWeek} onChange={e => set('currentWeek', Number(e.target.value))} />
              </div>
            </div>
          )}

          {/* Tasks */}
          <div className="field-group">
            <label className="field-label">할일 목록</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.tasks.map(task => (
                <div key={task.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="field-input"
                    style={{ width: 100, flex: 'none', fontSize: 12 }}
                    value={task.status}
                    onChange={e => updateTask(task.id, 'status', e.target.value)}
                  >
                    {TASK_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {s === 'done' ? '✅ 완료' : s === 'in_progress' ? '⏳ 진행중' : '⏱️ 예정'}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field-input"
                    style={{ flex: 1 }}
                    type="text"
                    value={task.label}
                    onChange={e => updateTask(task.id, 'label', e.target.value)}
                    placeholder="할일 내용"
                  />
                  <button type="button" style={{ color: '#B91C1C', padding: '0 4px', fontSize: 16 }} onClick={() => removeTask(task.id)}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn--ghost" style={{ fontSize: 12 }} onClick={addTask}>+ 할일 추가</button>
            </div>
          </div>

          {/* Notes */}
          <div className="field-group">
            <label className="field-label">메모</label>
            <textarea className="field-input field-textarea" rows={2}
              value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="학습 내용, 진행 상황 등" />
          </div>

          {/* Next action */}
          <div className="field-group">
            <label className="field-label">다음 할 일</label>
            <input className="field-input" type="text" value={form.nextAction}
              onChange={e => set('nextAction', e.target.value)} placeholder="다음 액션 아이템" />
          </div>

          {/* Contact */}
          <div className="field-group">
            <label className="field-label">담당자 / 이메일</label>
            <input className="field-input" type="text" value={form.contact}
              onChange={e => set('contact', e.target.value)} placeholder="연락처 또는 이메일" />
          </div>

          {/* Emails (sponsorship) */}
          <div className="field-group">
            <label className="field-label">메일 추적</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.emails.map(email => (
                <div key={email.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="field-input"
                    style={{ width: 100, flex: 'none', fontSize: 12 }}
                    value={email.status}
                    onChange={e => updateEmail(email.id, 'status', e.target.value)}
                  >
                    {EMAIL_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {s === 'draft' ? '임시저장' : s === 'sent' ? '발송함' : '작성예정'}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field-input"
                    style={{ flex: 1 }}
                    type="text"
                    value={email.label}
                    onChange={e => updateEmail(email.id, 'label', e.target.value)}
                    placeholder="메일 이름"
                  />
                  <button type="button" style={{ color: '#B91C1C', padding: '0 4px', fontSize: 16 }} onClick={() => removeEmail(email.id)}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn--ghost" style={{ fontSize: 12 }} onClick={addEmail}>+ 메일 추가</button>
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions">
            {isEdit && (
              <button type="button" className="btn btn--danger" onClick={() => onDelete(project.id)}>삭제</button>
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
