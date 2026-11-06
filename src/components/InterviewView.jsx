import { useEffect, useMemo, useRef, useState } from 'react';
import { INTERVIEW_DATE, INTERVIEW_TITLE, SECTION_NOTES } from '../data/interviewChecklistSeed';
import { readStored, writeStored } from '../utils/safeStorage';
import { toDateString } from '../utils/dateUtils';

// 💼 면접 준비 탭 — 섹션 > 소제목 > 항목 체크리스트.
// 섹션 접힘·완료 숨기기는 기기별(localStorage), 체크 상태는 Supabase(모든 기기 공통).

const COLLAPSED_KEY = 'interviewCollapsed';
const HIDE_DONE_KEY = 'interviewHideDone';
const LONG_PRESS_MS = 450;

function readCollapsed() {
  try { return new Set(JSON.parse(readStored(COLLAPSED_KEY) ?? '[]')); } catch { return new Set(); }
}

// 면접일까지: D-14 / D-Day / D+3. 자정을 넘겨도 맞게 하루 단위(날짜 문자열)로 센다.
function dDayLabel(todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number);
  const [ty, tm, td] = INTERVIEW_DATE.split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff === 0) return 'D-Day';
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

function sectionNo(name) {
  const n = parseInt(name, 10);
  return Number.isNaN(n) ? 999 : n;
}

function pct(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

export default function InterviewView({ items, loading, ready, onToggle, onAdd, onEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [hideDone, setHideDone] = useState(() => readStored(HIDE_DONE_KEY) === '1');
  const [editingId, setEditingId] = useState(null);
  const [openId, setOpenId] = useState(null); // 휴대폰: 길게 눌러 수정/삭제 버튼을 연 항목
  const [addingSection, setAddingSection] = useState(null);

  // 오늘 날짜는 매번 다시 계산 (앱을 켜둔 채 자정을 넘겨도 D-day 가 맞게)
  const [todayStr, setTodayStr] = useState(() => toDateString(new Date()));
  useEffect(() => {
    const tick = () => setTodayStr(toDateString(new Date()));
    const id = setInterval(tick, 60 * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const toggleCollapsed = (section) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      writeStored(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  };
  const toggleHideDone = () => {
    setHideDone(v => { writeStored(HIDE_DONE_KEY, v ? '0' : '1'); return !v; });
  };

  // 섹션(앞 번호순) > 소제목(처음 나온 순) > 항목(sort_order)
  const sections = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const map = new Map();
    for (const it of sorted) {
      if (!map.has(it.section)) map.set(it.section, { name: it.section, groups: new Map(), done: 0, total: 0 });
      const s = map.get(it.section);
      if (!s.groups.has(it.grp)) s.groups.set(it.grp, []);
      s.groups.get(it.grp).push(it);
      s.total += 1;
      if (it.done) s.done += 1;
    }
    return [...map.values()]
      .sort((a, b) => sectionNo(a.name) - sectionNo(b.name) || a.name.localeCompare(b.name))
      .map(s => ({ ...s, groups: [...s.groups.entries()].map(([grp, list]) => ({ grp, list })) }));
  }, [items]);

  const total = items.length;
  const doneCount = items.filter(i => i.done).length;

  // 바깥을 누르면 길게 눌러 연 버튼을 닫는다
  useEffect(() => {
    if (openId == null) return;
    const close = (e) => { if (!e.target.closest?.('.iv-item--open')) setOpenId(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openId]);

  return (
    <div className="interview-view">
      <div className="iv-inner">
      <div className="iv-head">
        <div className="iv-head-t">
          <h1 className="iv-h1">{INTERVIEW_TITLE}</h1>
          <div className="iv-h2">면접일 {INTERVIEW_DATE.replace(/-/g, '.')}</div>
        </div>
        <div className={`iv-dday ${dDayLabel(todayStr) === 'D-Day' ? 'iv-dday--today' : ''}`}>{dDayLabel(todayStr)}</div>
      </div>

      {!ready && (
        <div className="gv-notready">
          면접 준비 테이블이 아직 없어요. Supabase 대시보드 &gt; SQL Editor 에서
          <code>supabase/migrations/20261106_interview_checklist.sql</code> 을 실행한 뒤 새로고침해 주세요.
        </div>
      )}

      <div className="iv-summary">
        <div className="iv-summary-row">
          <span className="iv-summary-n">
            <b>{doneCount}</b> / {total} 완료 · {pct(doneCount, total)}%
          </span>
          <button className={`iv-toggle ${hideDone ? 'iv-toggle--on' : ''}`} onClick={toggleHideDone}
            aria-pressed={hideDone}>
            {hideDone ? '✓ 완료 숨김' : '완료 숨기기'}
          </button>
        </div>
        <div className="iv-bar iv-bar--big"><i style={{ width: `${pct(doneCount, total)}%` }} /></div>
      </div>

      {loading && ready && <div className="iv-loading">불러오는 중…</div>}

      {!loading && ready && sections.length === 0 && (
        <div className="iv-loading">항목이 없어요.</div>
      )}

      {sections.map(s => {
        const isCollapsed = collapsed.has(s.name);
        const note = SECTION_NOTES[s.name];
        const allDone = s.total > 0 && s.done === s.total;
        return (
          <section key={s.name} className={`iv-card ${isCollapsed ? 'iv-card--collapsed' : ''} ${allDone ? 'iv-card--done' : ''}`}>
            <button className="iv-card-head" onClick={() => toggleCollapsed(s.name)} aria-expanded={!isCollapsed}>
              <span className="iv-chev">{isCollapsed ? '▸' : '▾'}</span>
              <span className="iv-card-t">{s.name}</span>
              <span className="iv-card-n">{s.done}/{s.total}</span>
              <span className="iv-bar iv-bar--sm"><i style={{ width: `${pct(s.done, s.total)}%` }} /></span>
            </button>

            {!isCollapsed && (
              <div className="iv-card-body">
                {note && <div className="iv-note">{note}</div>}
                {s.groups.map(g => {
                  const visible = hideDone ? g.list.filter(i => !i.done) : g.list;
                  if (visible.length === 0 && hideDone) {
                    return g.grp ? (
                      <div key={g.grp || '_'} className="iv-group iv-group--empty">
                        <div className="iv-group-t">{g.grp} <span className="iv-group-done">모두 완료</span></div>
                      </div>
                    ) : null;
                  }
                  return (
                    <div key={g.grp || '_'} className="iv-group">
                      {g.grp && <div className="iv-group-t">{g.grp}</div>}
                      <ul className="iv-list">
                        {visible.map(it => (
                          <ChecklistItem
                            key={it.id}
                            item={it}
                            editing={editingId === it.id}
                            open={openId === it.id}
                            onToggle={() => onToggle(it.id)}
                            onStartEdit={() => { setEditingId(it.id); setOpenId(null); }}
                            onCancelEdit={() => setEditingId(null)}
                            onSaveEdit={(text) => { onEdit(it.id, text); setEditingId(null); }}
                            onDelete={() => { if (window.confirm(`삭제할까요?\n${it.label}`)) onDelete(it.id); }}
                            onLongPress={() => setOpenId(it.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {hideDone && allDone && (
                  <div className="iv-all-done">🎉 이 섹션은 모두 끝냈어요</div>
                )}

                {addingSection === s.name ? (
                  <AddForm
                    groups={s.groups.map(g => g.grp).filter(Boolean)}
                    onSubmit={(label, grp) => { onAdd({ section: s.name, grp, label, optional: /^\(선택\)/.test(label) }); setAddingSection(null); }}
                    onCancel={() => setAddingSection(null)}
                  />
                ) : (
                  <button className="iv-add-more" onClick={() => setAddingSection(s.name)}>＋ 항목 추가</button>
                )}
              </div>
            )}
          </section>
        );
      })}
      </div>
    </div>
  );
}

function ChecklistItem({ item, editing, open, onToggle, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onLongPress }) {
  const timer = useRef(null);
  const pressed = useRef(false);

  // 휴대폰: 길게 누르면 수정/삭제 버튼이 나타난다 (PC 는 hover)
  const startPress = (e) => {
    if (e.pointerType === 'mouse') return;
    pressed.current = false;
    timer.current = setTimeout(() => { pressed.current = true; onLongPress(); }, LONG_PRESS_MS);
  };
  const endPress = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  if (editing) {
    return (
      <li className="iv-item iv-item--editing">
        <EditForm initial={item.label} onSave={onSaveEdit} onCancel={onCancelEdit} />
      </li>
    );
  }

  return (
    <li
      className={`iv-item ${item.done ? 'iv-item--done' : ''} ${item.optional ? 'iv-item--optional' : ''} ${open ? 'iv-item--open' : ''}`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()} // 길게 누를 때 브라우저 메뉴가 끼어들지 않게
    >
      <label className="iv-check-wrap">
        <input
          type="checkbox"
          className="iv-check"
          checked={item.done}
          onChange={() => { if (pressed.current) { pressed.current = false; return; } onToggle(); }}
          onClick={(e) => { if (pressed.current) e.preventDefault(); }}
        />
        <span className="iv-label">{item.label}</span>
      </label>
      <span className="iv-actions">
        <button className="iv-act" onClick={onStartEdit} title="수정" aria-label="수정">✎</button>
        <button className="iv-act iv-act--danger" onClick={onDelete} title="삭제" aria-label="삭제">✕</button>
      </span>
    </li>
  );
}

function EditForm({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || t === initial) { onCancel(); return; }
    onSave(t);
  };
  return (
    <form className="iv-form" onSubmit={submit}>
      <input ref={ref} className="iv-input" value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }} />
      <div className="iv-form-actions">
        <button type="submit" className="gv-mini gv-mini--go">저장</button>
        <button type="button" className="gv-mini" onClick={onCancel}>취소</button>
      </div>
    </form>
  );
}

function AddForm({ groups, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  const [grp, setGrp] = useState(groups.length ? groups[groups.length - 1] : '');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) { onCancel(); return; }
    onSubmit(t, grp);
  };
  return (
    <form className="iv-form iv-form--add" onSubmit={submit}>
      <input ref={ref} className="iv-input" value={text} placeholder="새 항목 (앞에 (선택) 을 붙이면 흐리게)"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }} />
      <div className="iv-form-actions">
        {groups.length > 0 && (
          <select className="iv-select" value={grp} onChange={e => setGrp(e.target.value)} aria-label="소제목">
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="">(소제목 없음)</option>
          </select>
        )}
        <button type="submit" className="gv-mini gv-mini--go">추가</button>
        <button type="button" className="gv-mini" onClick={onCancel}>취소</button>
      </div>
    </form>
  );
}
