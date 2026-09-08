import { useState, useRef, useEffect } from 'react';
import { toDateString, addDays } from '../utils/dateUtils';

const LEARNING_PLACEHOLDERS = [
  '반도체 산업에서 HBM4의 변화 이해',
  '새로운 영어 표현 익힘',
  'Cursor에서 MCP 사용법 익힘',
  '산업스터디 자료 완성',
  '운동 완료',
  '영어회화 30분',
  '자기소개 수정 완료',
];

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function ReflectionList({ items, placeholders, onAdd, onEdit, onDelete }) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const placeholder = `+ ${placeholders[items.length % placeholders.length]}`;

  // 입력 중에 blur 없이 모달이 닫히거나 날짜가 바뀌면(Escape 등) 적어둔 성과가 사라졌다.
  // blur 저장과 같은 규칙으로, 사라질 때 한 번 저장한다.
  const textRef = useRef(text);
  textRef.current = text;
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  useEffect(() => () => {
    const pending = textRef.current.trim();
    if (pending) onAddRef.current(pending);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };

  const startEdit = (item) => { setEditingId(item.id); setEditText(item.text); };
  const saveEdit = (id) => {
    const trimmed = editText.trim();
    setEditingId(null);
    if (trimmed) onEdit(id, trimmed);
    else onDelete(id);
  };

  return (
    <div className="refl-list">
      {items.map(item => (
        <div key={item.id} className="refl-item">
          <span className="refl-item-bullet" aria-hidden="true">•</span>
          {editingId === item.id ? (
            <input
              className="refl-item-edit-input"
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => saveEdit(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveEdit(item.id); }
                if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
              }}
            />
          ) : (
            <span className="refl-item-text" onClick={() => startEdit(item)}>{item.text}</span>
          )}
          <button className="refl-item-del" onClick={() => onDelete(item.id)} aria-label="삭제">✕</button>
        </div>
      ))}
      <form className="refl-add" onSubmit={submit}>
        <input
          className="refl-add-input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (!text.trim()) return;
            onAdd(text.trim());
            setText('');
          }}
        />
      </form>
    </div>
  );
}

export default function ReflectionEditorModal({
  date, setDate,
  reflection,
  onAddLearning, onEditLearning, onDeleteLearning,
  onUpdateBestChoice, onUpdateTomorrowPlan,
  onClose,
}) {
  const overlayRef = useRef(null);
  const todayStr = toDateString(new Date());
  const isToday = date === todayStr;

  const [bestChoice, setBestChoice] = useState(reflection.bestChoice);
  const [tomorrowPlan, setTomorrowPlan] = useState(reflection.tomorrowPlan);
  const [dateLoaded, setDateLoaded] = useState(date);

  // 날짜가 바뀌면 입력창 내용을 새 날짜의 값으로 다시 맞춘다
  if (date !== dateLoaded) {
    setBestChoice(reflection.bestChoice);
    setTomorrowPlan(reflection.tomorrowPlan);
    setDateLoaded(date);
  }

  // 날짜 전환/닫기 전에 아직 blur되지 않은 한 줄 입력값을 저장한다
  const flush = () => {
    if (bestChoice !== reflection.bestChoice) onUpdateBestChoice(date, bestChoice);
    if (tomorrowPlan !== reflection.tomorrowPlan) onUpdateTomorrowPlan(date, tomorrowPlan);
  };

  const changeDate = (newDate) => { flush(); setDate(newDate); };
  const confirmAndClose = () => { flush(); onClose(); };

  // 모달을 열면 포커스가 body 에 남아 오버레이의 onKeyDown 이 안 걸린다
  // → 다른 모달들과 같이 window 에서 Escape 를 받는다 (닫기 전 입력값 저장 포함)
  const closeRef = useRef(confirmAndClose);
  closeRef.current = confirmAndClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) confirmAndClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') confirmAndClose(); }}
    >
      <div className="modal-panel refl-modal-panel" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{formatDateLabel(date)}</h2>
          <button className="modal-close" onClick={confirmAndClose} aria-label="닫기">✕</button>
        </div>

        <div className="refl-modal-body">
          <div className="refl-modal-datenav">
            <button className="nav-btn" onClick={() => changeDate(addDays(date, -1))} aria-label="이전 날">‹</button>
            {!isToday && <button className="today-btn" onClick={() => changeDate(todayStr)}>오늘</button>}
            <input
              type="date"
              className="refl-date-input"
              value={date}
              max={todayStr}
              onChange={(e) => e.target.value && changeDate(e.target.value)}
            />
            <button className="nav-btn" onClick={() => changeDate(addDays(date, 1))} aria-label="다음 날">›</button>
          </div>

          <div className="refl-section">
            <div className="refl-section-title">오늘의 성과</div>
            <ReflectionList
              key={date}
              items={reflection.learnings}
              placeholders={LEARNING_PLACEHOLDERS}
              onAdd={(text) => onAddLearning(date, text)}
              onEdit={(id, text) => onEditLearning(date, id, text)}
              onDelete={(id) => onDeleteLearning(date, id)}
            />
          </div>

          <div className="refl-row">
            <div className="refl-section refl-section--half">
              <div className="refl-section-title">오늘 가장 잘한 선택</div>
              <input
                className="refl-line-input"
                placeholder="예: SNS 대신 독서를 선택했다."
                value={bestChoice}
                onChange={(e) => setBestChoice(e.target.value)}
                onBlur={() => onUpdateBestChoice(date, bestChoice)}
              />
            </div>
            <div className="refl-section refl-section--half">
              <div className="refl-section-title">내일 이어갈 것</div>
              <input
                className="refl-line-input"
                placeholder="예: DTU 프로젝트 영어 정리 계속하기."
                value={tomorrowPlan}
                onChange={(e) => setTomorrowPlan(e.target.value)}
                onBlur={() => onUpdateTomorrowPlan(date, tomorrowPlan)}
              />
            </div>
          </div>
        </div>

        <div className="refl-modal-actions">
          <button className="btn btn--primary" onClick={confirmAndClose}>확인</button>
        </div>
      </div>
    </div>
  );
}
