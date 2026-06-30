import { useState, useEffect, useRef } from 'react';
import { PROJECT_TYPES } from '../utils/projectTypes';

const TASK_STATUSES = ['done', 'in_progress', 'upcoming'];

export default function ProjectModal({ project, onSave, onDelete, onClose }) {
  const isEdit = !!project;
  const overlayRef = useRef(null);

  const [form, setForm] = useState({
    type: project?.type ?? 'education',
    title: project?.title ?? '',
    deadline: project?.deadline ?? '',
    tasks: project?.tasks ?? [],
    goals: project?.goals ?? [],
    notes: project?.notes ?? '',
  });

  const [batchName, setBatchName] = useState('강의듣기');
  const [batchCount, setBatchCount] = useState(4);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleTaskDragStart = (id) => setDragTaskId(id);
  const handleTaskDragOver = (e, id) => { e.preventDefault(); if (id !== dragTaskId) setDragOverTaskId(id); };
  const handleTaskDrop = (e, id) => {
    e.preventDefault();
    if (!dragTaskId || dragTaskId === id) { setDragTaskId(null); setDragOverTaskId(null); return; }
    setForm(f => {
      const tasks = [...f.tasks];
      const from = tasks.findIndex(t => t.id === dragTaskId);
      const to   = tasks.findIndex(t => t.id === id);
      const [moved] = tasks.splice(from, 1);
      tasks.splice(to, 0, moved);
      return { ...f, tasks };
    });
    setDragTaskId(null); setDragOverTaskId(null);
  };
  const handleTaskDragEnd = () => { setDragTaskId(null); setDragOverTaskId(null); };

  const addGoal = () => {
    const nextWeek = form.goals.length > 0 ? Math.max(...form.goals.map(g => g.week)) + 1 : 1;
    setForm(f => ({ ...f, goals: [...f.goals, { id: Date.now(), week: nextWeek, text: '' }] }));
  };
  const updateGoal = (id, key, val) => {
    setForm(f => ({ ...f, goals: f.goals.map(g => g.id === id ? { ...g, [key]: val } : g) }));
  };
  const removeGoal = (id) => {
    setForm(f => ({ ...f, goals: f.goals.filter(g => g.id !== id) }));
  };

  const addTask = () => {
    setForm(f => ({ ...f, tasks: [...f.tasks, { id: Date.now(), label: '', status: 'upcoming' }] }));
  };
  const addBatch = () => {
    if (!batchName.trim() || batchCount < 1) return;
    const newTasks = Array.from({ length: batchCount }, (_, i) => ({
      id: Date.now() + i,
      label: `${batchName.trim()} ${i + 1}`,
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PROJECT_TYPES.map(t => (
                <button key={t.key} type="button"
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: form.type === t.key ? t.bg : 'var(--bg)',
                    color: form.type === t.key ? t.color : 'var(--text-muted)',
                    border: form.type === t.key ? `2px solid ${t.border}` : '1px solid var(--border)',
                  }}
                  onClick={() => set('type', t.key)}>
                  {t.emoji} {t.label}
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
                <div key={task.id}
                  draggable
                  onDragStart={() => handleTaskDragStart(task.id)}
                  onDragOver={(e) => handleTaskDragOver(e, task.id)}
                  onDrop={(e) => handleTaskDrop(e, task.id)}
                  onDragEnd={handleTaskDragEnd}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4,
                    padding: '6px 8px', background: 'var(--bg)', borderRadius: 8,
                    border: dragOverTaskId === task.id ? '2px dashed var(--accent)' : '1px solid var(--border)',
                    opacity: dragTaskId === task.id ? 0.4 : 1,
                    cursor: 'grab',
                  }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 14, cursor: 'grab', flexShrink: 0 }}>⠿</span>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📅 마감</span>
                    <input className="field-input" type="date"
                      style={{ fontSize: 12, padding: '2px 6px', width: 'auto', flex: 'none' }}
                      value={task.deadline ?? ''}
                      onChange={e => updateTask(task.id, 'deadline', e.target.value)} />
                    {task.deadline && (
                      <button type="button" style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 2px' }}
                        onClick={() => updateTask(task.id, 'deadline', '')}>지우기</button>
                    )}
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn--ghost" style={{ fontSize: 12 }} onClick={addTask}>+ 개별 추가</button>

              {/* 일괄 추가 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center',
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
            </div>
          </div>

          {/* Weekly Goals */}
          <div className="field-group">
            <label className="field-label">주차별 목표</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.goals.map(goal => (
                <div key={goal.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Week</span>
                    <input className="field-input"
                      style={{ width: 44, textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '4px 6px' }}
                      type="number" min={1}
                      value={goal.week}
                      onChange={e => updateGoal(goal.id, 'week', Number(e.target.value))} />
                  </div>
                  <input className="field-input" style={{ flex: 1 }} type="text"
                    value={goal.text}
                    onChange={e => updateGoal(goal.id, 'text', e.target.value)}
                    placeholder="이번 주 목표" />
                  <button type="button" style={{ color: '#B91C1C', padding: '0 4px', fontSize: 16 }}
                    onClick={() => removeGoal(goal.id)}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn--ghost" style={{ fontSize: 12 }} onClick={addGoal}>
                + 주차 목표 추가
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="field-group">
            <label className="field-label">메모</label>
            <textarea className="field-input field-textarea" rows={2}
              value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="학습 내용, 진행 상황 등" />
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
