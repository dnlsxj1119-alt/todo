import { useState, useEffect, useRef } from 'react';

const TASK_STATUSES = ['done', 'in_progress', 'upcoming'];
const EMAIL_STATUSES = ['draft', 'sent', 'planned'];

export default function ProjectModal({ project, onSave, onDelete, onClose }) {
  const isEdit = !!project;
  const overlayRef = useRef(null);

  const [form, setForm] = useState({
    type: project?.type ?? 'education',
    title: project?.title ?? '',
    deadline: project?.deadline ?? '',
    tasks: project?.tasks ?? [],
    notes: project?.notes ?? '',
    nextAction: project?.nextAction ?? '',
    contact: project?.contact ?? '',
    emails: project?.emails ?? [],
  });

  const [batchName, setBatchName] = useState('강의듣기');
  const [batchCount, setBatchCount] = useState(4);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addTask = () => {
    setForm(f => ({ ...f, tasks: [...f.tasks, { id: Date.now(), label: '', status: 'upcoming' }] }));
  };
  const addBatch = () => {
    if (!batchName.trim() || batchCount < 1) return;
    const newTasks = Array.from({ length: batchCount }, (_, i) => ({
      id: Date.now() + i,
      label: `${batchName.trim()} ${i + 1}차`,
      status: 'upcoming',
    }));
    setForm(f => ({ ...f, tasks: [...f.tasks, ...newTasks] }));
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
                <button key={t.key} type="button"
                  className={`type-tab type-tab--${t.key === 'education' ? 'blue' : 'green'} ${form.type === t.key ? 'active' : ''}`}
                  onClick={() => set('type', t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title + Deadline */}
          <div className="field-row">
            <div className="field-group" style={{ flex: 2 }}>
              <label className="field-label">프로젝트 이름 *</label>
              <input className="field-input" type="text" value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="프로젝트 이름" autoFocus required />
            </div>
            <div className="field-group field-group--half">
              <label className="field-label">마감 기한</label>
              <input className="field-input" type="date" value={form.deadline}
                onChange={e => set('deadline', e.target.value)} />
            </div>
          </div>

          {/* Tasks */}
          <div className="field-group">
            <label className="field-label">할일 목록</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.tasks.map(task => (
                <div key={task.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="field-input" style={{ width: 100, flex: 'none', fontSize: 12 }}
                    value={task.status} onChange={e => updateTask(task.id, 'status', e.target.value)}>
                    {TASK_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {s === 'done' ? '✅ 완료' : s === 'in_progress' ? '⏳ 진행중' : '⏱️ 예정'}
                      </option>
                    ))}
                  </select>
                  <input className="field-input" style={{ flex: 1 }} type="text"
                    value={task.label} onChange={e => updateTask(task.id, 'label', e.target.value)}
                    placeholder="할일 내용" />
                  <button type="button" style={{ color: '#B91C1C', padding: '0 4px', fontSize: 16 }}
                    onClick={() => removeTask(task.id)}>×</button>
                </div>
              ))}

              {/* 일괄 추가 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2,
                padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                <input
                  className="field-input"
                  style={{ flex: 1, fontSize: 12 }}
                  type="text"
                  value={batchName}
                  onChange={e => setBatchName(e.target.value)}
                  placeholder="기본 이름 (예: 강의듣기)"
                />
                <input
                  className="field-input"
                  style={{ width: 52, flex: 'none', fontSize: 12, textAlign: 'center' }}
                  type="number" min={1} max={30}
                  value={batchCount}
                  onChange={e => setBatchCount(Number(e.target.value))}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>개</span>
                <button type="button" className="btn btn--ghost" style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                  onClick={addBatch}>일괄 추가</button>
              </div>
              <button type="button" className="btn btn--ghost" style={{ fontSize: 12 }} onClick={addTask}>+ 개별 추가</button>
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

          {/* Emails */}
          <div className="field-group">
            <label className="field-label">메일 추적</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.emails.map(email => (
                <div key={email.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="field-input" style={{ width: 100, flex: 'none', fontSize: 12 }}
                    value={email.status} onChange={e => updateEmail(email.id, 'status', e.target.value)}>
                    {EMAIL_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {s === 'draft' ? '임시저장' : s === 'sent' ? '발송함' : '작성예정'}
                      </option>
                    ))}
                  </select>
                  <input className="field-input" style={{ flex: 1 }} type="text"
                    value={email.label} onChange={e => updateEmail(email.id, 'label', e.target.value)}
                    placeholder="메일 이름" />
                  <button type="button" style={{ color: '#B91C1C', padding: '0 4px', fontSize: 16 }}
                    onClick={() => removeEmail(email.id)}>×</button>
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
