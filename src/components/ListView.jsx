import { useMemo, useState, useRef, useEffect } from 'react';
import { toDateString } from '../utils/dateUtils';
import { getProjectType } from '../utils/projectTypes';

/* 달력 항목(items)과 프로젝트 태스크를 하나의 목록으로 합쳐 보여주는 뷰.
   DB 스키마는 그대로 두고, 표시/정리 레이어만 얹은 1차 버전.
   - 프로젝트 = 카테고리로 표시
   - 계획일(item.date) / 마감일(task.deadline) 구분
   - 지난 마감·오늘·미정(받은칸)·이번주·나중에로 자동 그룹
   - 날짜는 목록에서 바로 클릭해서 수정 */

const TODAY = toDateString(new Date());

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}
function endOfWeekStr() {
  const d = new Date();
  const fromMon = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + (6 - fromMon));
  return toDateString(d);
}
const EOW = endOfWeekStr();

function mdLabel(s) {
  const [, m, d] = s.split('-');
  return `${+m}/${+d}`;
}
function tint(hex, aa) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + aa : hex;
}

const STATUS_CLASS = { todo: '', doing: 'lv-ck--doing', done: 'lv-ck--done' };

/* 달력 항목 + 프로젝트 태스크 → 공통 형태로 정규화 */
function buildRows(items, projects) {
  const rows = [];

  items
    .filter(it => it.type === 'todo' || it.type === 'education')
    .forEach(it => {
      rows.push({
        key: `i-${it.id}`,
        kind: 'item',
        raw: it,
        title: it.title,
        cat: null,
        expected: it.date || null,
        due: null,
        time: it.time || null,
        status: it.completed ? 'done' : 'todo',
        dateField: 'expected',
      });
    });

  projects.forEach(p => {
    const pt = getProjectType(p.type);
    (p.tasks ?? []).forEach(t => {
      rows.push({
        key: `p-${t.id}`,
        kind: 'task',
        raw: { project: p, task: t },
        title: t.label,
        cat: { id: p.id, name: p.title, color: pt.border },
        expected: null,
        due: t.deadline || null,
        time: null,
        status: t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'doing' : 'todo',
        dateField: 'due',
      });
    });
  });

  return rows;
}

function bucketOf(r) {
  const overdue = r.due && r.status !== 'done' && r.due < TODAY;
  if (r.status === 'done') {
    const ref = r.expected || r.due;
    if (ref === TODAY || !ref) return 'today';
    if (ref > TODAY && ref <= EOW) return 'week';
    if (ref > EOW) return 'later';
    return 'today';
  }
  if (overdue) return 'overdue';
  if (r.expected === TODAY || r.due === TODAY) return 'today';
  if (!r.expected) return 'inbox';
  if (r.expected < TODAY) return 'today';
  if (r.expected <= EOW) return 'week';
  return 'later';
}

const GROUPS = [
  { key: 'overdue', label: '지난 마감', warn: true, add: false },
  { key: 'today', label: '오늘', add: true },
  { key: 'inbox', label: '미정 · 받은칸', add: true },
  { key: 'week', label: '이번 주', add: true },
  { key: 'later', label: '나중에', add: true },
];

function QuickAdd({ placeholder, onAdd }) {
  const [val, setVal] = useState('');
  const composing = useRef(false);
  const submit = () => {
    const t = val.trim();
    if (!t) return;
    onAdd(t);
    setVal('');
  };
  return (
    <div className="lv-quick">
      <span className="lv-quick-plus">+</span>
      <input
        value={val}
        placeholder={placeholder}
        onChange={e => setVal(e.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          if (composing.current || e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 무시
          e.preventDefault();
          submit();
        }}
      />
    </div>
  );
}

function DatePop({ value, label, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="lv-date-pop" ref={ref} onClick={e => e.stopPropagation()}>
      <label>{label}</label>
      <input
        type="date"
        value={value || ''}
        autoFocus
        onChange={e => { onChange(e.target.value || null); }}
      />
      <div className="lv-date-pop-row">
        <button onClick={() => { onChange(TODAY); onClose(); }}>오늘</button>
        <button onClick={() => { onChange(addDays(TODAY, 1)); onClose(); }}>내일</button>
        <button onClick={() => { onChange(null); onClose(); }}>지우기</button>
      </div>
    </div>
  );
}

export default function ListView({
  items, projects,
  onItemClick, onToggleItem, onAddItem, onUpdateItem,
  onToggleTask, onEditProject, onSaveProject,
}) {
  const [filter, setFilter] = useState(null); // null | 'inbox' | projectId
  const [datePopKey, setDatePopKey] = useState(null);

  const rows = useMemo(() => buildRows(items, projects), [items, projects]);

  const inboxCount = rows.filter(r => !r.expected && !r.due && r.status !== 'done').length;
  const catCounts = {};
  rows.forEach(r => { if (r.cat) catCounts[r.cat.id] = (catCounts[r.cat.id] ?? 0) + 1; });

  const passFilter = r => {
    if (filter === null) return true;
    if (filter === 'inbox') return !r.expected && !r.due;
    return r.cat && r.cat.id === filter;
  };

  const grouped = { overdue: [], today: [], inbox: [], week: [], later: [] };
  rows.filter(passFilter).forEach(r => { grouped[bucketOf(r)].push(r); });
  Object.values(grouped).forEach(list => {
    list.sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
      const da = a.expected || a.due || '9999-99-99';
      const db = b.expected || b.due || '9999-99-99';
      return da < db ? -1 : da > db ? 1 : 0;
    });
  });

  const cycleStatus = r => {
    if (r.kind === 'item') onToggleItem(r.raw.id);
    else onToggleTask(r.raw.project.id, r.raw.task.id);
  };
  const openRow = r => {
    if (r.kind === 'item') onItemClick(r.raw);
    else onEditProject(r.raw.project);
  };

  const setRowDate = (r, val) => {
    if (r.kind === 'item') {
      onUpdateItem(r.raw.id, { date: val || '' });
    } else {
      const p = r.raw.project;
      const tasks = (p.tasks ?? []).map(t => t.id === r.raw.task.id ? { ...t, deadline: val || '' } : t);
      onSaveProject(p.id, { ...p, tasks });
    }
  };

  const quickAdd = (groupKey, title) => {
    const activeProject = filter && filter !== 'inbox'
      ? projects.find(p => p.id === filter)
      : null;
    if (activeProject) {
      const newTask = { id: Date.now(), label: title, status: 'upcoming' };
      onSaveProject(activeProject.id, { ...activeProject, tasks: [...(activeProject.tasks ?? []), newTask] });
      return;
    }
    const date =
      groupKey === 'today' ? TODAY :
      groupKey === 'week' ? addDays(TODAY, 2) :
      groupKey === 'later' ? addDays(TODAY, 9) :
      '';
    onAddItem({ type: 'todo', title, date, timeSlot: 'all' });
  };

  const dueOnly = rows
    .filter(r => r.due && !r.expected && r.status !== 'done')
    .sort((a, b) => (a.due < b.due ? -1 : 1));

  return (
    <div className="listview">
      <div className="lv-head">
        <div>
          <h2 className="lv-title">목록</h2>
          <p className="lv-sub">달력 할일 + 프로젝트 태스크 · 계획일 / 마감일 기준 자동 정리 · 날짜는 바로 클릭해서 수정</p>
        </div>
        <button className="btn btn--primary" onClick={() => onItemClick(null)}>+ 새 할일</button>
      </div>

      <div className="lv-cats">
        <button className={`lv-cat ${filter === null ? 'lv-cat--on' : ''}`} onClick={() => setFilter(null)}>전체</button>
        <button
          className={`lv-cat ${filter === 'inbox' ? 'lv-cat--on' : ''}`}
          onClick={() => setFilter('inbox')}
        >📥 받은칸 <span className="lv-cat-ct">{inboxCount}</span></button>
        {projects.map(p => {
          const pt = getProjectType(p.type);
          const on = filter === p.id;
          return (
            <button
              key={p.id}
              className={`lv-cat ${on ? 'lv-cat--on' : ''}`}
              style={on ? { background: pt.border, borderColor: pt.border, color: '#fff' } : undefined}
              onClick={() => setFilter(on ? null : p.id)}
            >
              <span className="lv-cat-dot" style={{ background: on ? '#fff' : pt.border }} />
              {p.title} <span className="lv-cat-ct">{catCounts[p.id] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {filter === null && dueOnly.length > 0 && (
        <div className="lv-duestrip">
          📕 마감만 잡히고 계획일 미정 {dueOnly.length}
          <div className="lv-duestrip-chips">
            {dueOnly.slice(0, 6).map(r => (
              <span key={r.key} onClick={() => openRow(r)}>{r.title} · {mdLabel(r.due)}</span>
            ))}
          </div>
        </div>
      )}

      {GROUPS.map(g => {
        const list = grouped[g.key];
        if (g.key === 'overdue' && list.length === 0) return null;
        return (
          <div className="lv-group" key={g.key}>
            <div className={`lv-group-h ${g.warn ? 'lv-group-h--warn' : ''}`}>
              <b>{g.label}</b><span className="lv-group-ct">{list.length}</span>
            </div>
            {list.map(r => {
              const isItem = r.kind === 'item';
              const dateVal = isItem ? r.expected : r.due;
              const dateLabel = isItem ? '계획일' : '마감일';
              const dateIcon = isItem ? '🗓' : '📕';
              const soon = !isItem && r.due && r.due <= addDays(TODAY, 1);
              return (
                <div className={`lv-row ${r.status === 'done' ? 'lv-row--done' : ''}`} key={r.key} onClick={() => openRow(r)}>
                  <button
                    className={`lv-ck ${STATUS_CLASS[r.status]}`}
                    onClick={e => { e.stopPropagation(); cycleStatus(r); }}
                    aria-label="상태 변경"
                  />
                  <span className="lv-name">{r.title}</span>
                  <span className="lv-meta">
                    {r.cat && (
                      <span className="lv-pill" style={{ background: tint(r.cat.color, '22'), color: r.cat.color }}>
                        {r.cat.name}
                      </span>
                    )}
                    <span className="lv-date-edit">
                      <button
                        className={`lv-d ${soon ? 'lv-d--soon' : ''} ${dateVal ? '' : 'lv-d--empty'}`}
                        onClick={e => { e.stopPropagation(); setDatePopKey(datePopKey === r.key ? null : r.key); }}
                      >
                        {dateIcon} {dateVal ? mdLabel(dateVal) + (isItem && r.time ? ` ${r.time}` : '') : dateLabel}
                      </button>
                      {datePopKey === r.key && (
                        <DatePop
                          value={dateVal}
                          label={dateLabel}
                          onChange={val => setRowDate(r, val)}
                          onClose={() => setDatePopKey(null)}
                        />
                      )}
                    </span>
                  </span>
                </div>
              );
            })}
            {list.length === 0 && g.key !== 'inbox' && <div className="lv-empty">비어 있음</div>}
            {g.add && (
              <QuickAdd
                placeholder={
                  g.key === 'today' ? '오늘 할 일 한 줄로 추가…' :
                  g.key === 'week' ? '이번 주 안에 할 일…' :
                  g.key === 'later' ? '나중에 할 일…' :
                  '제목만 적어두기 (날짜는 나중에)…'
                }
                onAdd={t => quickAdd(g.key, t)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
