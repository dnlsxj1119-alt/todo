import { useState, useEffect } from 'react';
import { CATEGORY_PALETTE } from '../utils/projectTypes';

export default function CategoryModal({ category, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    title: category?.title ?? '',
    color: category?.color || CATEGORY_PALETTE[0],
    startDate: category?.startDate ?? '',
    deadline: category?.deadline ?? '',
    notes: category?.notes ?? '',
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{category ? '카테고리 수정' : '새 카테고리'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <form onSubmit={submit} className="modal-form">
          <div className="field-group">
            <label className="field-label" htmlFor="cat-title">이름 *</label>
            <input id="cat-title" className="field-input" type="text" value={form.title} autoFocus
              placeholder="카테고리 이름" onChange={(e) => set('title', e.target.value)} required />
          </div>

          <div className="field-group">
            <label className="field-label">색</label>
            <div className="color-grid">
              {CATEGORY_PALETTE.map(c => (
                <button key={c} type="button"
                  className={`color-sw ${form.color === c ? 'color-sw--on' : ''}`}
                  style={{ background: c }} onClick={() => set('color', c)} aria-label={`색 ${c}`} />
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field-group field-group--half">
              <label className="field-label">시작일 (선택)</label>
              <input className="field-input" type="date" value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="field-group field-group--half">
              <label className="field-label">마감 기한 (선택)</label>
              <input className="field-input" type="date" value={form.deadline}
                onChange={(e) => set('deadline', e.target.value)} />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="cat-notes">메모 (선택)</label>
            <textarea id="cat-notes" className="field-input field-textarea" rows={2} value={form.notes}
              placeholder="메모" onChange={(e) => set('notes', e.target.value)} />
          </div>

          <div className="modal-actions">
            {category && (
              <button type="button" className="btn btn--danger" onClick={() => onDelete(category.id)}>삭제</button>
            )}
            <div className="modal-actions-right">
              <button type="button" className="btn btn--ghost" onClick={onClose}>취소</button>
              <button type="submit" className="btn btn--primary">저장</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
