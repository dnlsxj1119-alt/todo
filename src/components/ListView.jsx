import { useMemo, useState, useRef, useEffect } from 'react';
import { toDateString } from '../utils/dateUtils';
import { getProjectType, CATEGORY_PALETTE } from '../utils/projectTypes';

function catColor(p) {
  return p.color || getProjectType(p.type).border;
}

// 카테고리 완료는 '완료 처리' 버튼으로만 결정 (태스크 진행률과 무관)
function catDone(p) {
  return !!p.forceCompleted;
}

// 새 카테고리엔 팔레트에서 기존에 가장 적게 쓴 색을 배정
function pickNewCatColor(projects) {
  const count = {};
  projects.forEach(p => { const c = catColor(p); count[c] = (count[c] || 0) + 1; });
  let best = CATEGORY_PALETTE[0];
  let bestN = Infinity;
  CATEGORY_PALETTE.forEach(c => {
    const n = count[c] || 0;
    if (n < bestN) { bestN = n; best = c; }
  });
  return best;
}

/* 달력 항목(items)과 프로젝트 태스크를 하나의 목록으로 합쳐 보여주는 뷰.
   - 프로젝트 = 카테고리로 표시
   - 계획일 / 마감일 구분, 목록에서 바로 클릭해 수정
   - 중요도, 3단계 상태(안 함 / 하는 중 / 완료)
   - 지난 마감·오늘·미정(받은칸)·이번주·나중에 자동 그룹 */

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
const STATUS_OPTS = [
  { key: 'todo', label: '안 함', dot: 'var(--text-muted)' },
  { key: 'doing', label: '하는 중', dot: '#E0942A' },
  { key: 'done', label: '완료', dot: '#5C8F1E' },
];
const TASK_STATUS_MAP = { todo: 'upcoming', doing: 'in_progress', done: 'done' };
const PRIO = [
  null,
  { label: '낮음', color: '#8A94B8' },
  { label: '보통', color: '#E0942A' },
  { label: '높음', color: '#D9534F' },
];

function catOf(p) {
  return { id: p.id, name: p.title, color: catColor(p) };
}

function buildRows(items, projects) {
  const rows = [];
  const projById = {};
  projects.forEach(p => { projById[p.id] = p; });

  items
    .filter(it => it.type === 'todo' || it.type === 'education')
    .forEach(it => {
      const status = it.status || (it.completed ? 'done' : 'todo');
      const p = it.projectId ? projById[it.projectId] : null;
      rows.push({
        key: `i-${it.id}`,
        kind: 'item',
        raw: it,
        title: it.title,
        cat: p ? catOf(p) : null,
        expected: it.date || null,
        due: it.dueDate || null,
        time: it.time || null,
        status,
        priority: it.priority || 0,
      });
    });

  projects.forEach(p => {
    (p.tasks ?? []).forEach(t => {
      rows.push({
        key: `p-${t.id}`,
        kind: 'task',
        raw: { project: p, task: t },
        title: t.label,
        cat: catOf(p),
        expected: t.planned || null,
        due: t.deadline || null,
        time: null,
        status: t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'doing' : 'todo',
        priority: t.priority || 0,
      });
    });
  });

  return rows;
}

function dateBucket(r) {
  if (r.status !== 'done') {
    if (r.due && r.due < TODAY) return 'overdue';
    if (r.expected && r.expected < TODAY) return 'overdue';
  }
  if (r.expected === TODAY || r.due === TODAY) return 'today';
  if (!r.expected) return 'unplanned';
  if (r.expected <= EOW) return 'week';
  return 'later';
}

const GROUPS = [
  { key: 'overdue', label: '지난 (놓친 일정)', warn: true, add: false },
  { key: 'today', label: '오늘', add: true },
  { key: 'week', label: '이번 주', add: false },
  { key: 'later', label: '나중에', add: false },
  { key: 'unplanned', label: '미정', add: true },
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
          if (composing.current || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit();
        }}
      />
    </div>
  );
}

function usePopClose(ref, onClose) {
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onClose]);
}

function StatusMenu({ value, onPick, onClose }) {
  const ref = useRef(null);
  usePopClose(ref, onClose);
  return (
    <div className="lv-menu lv-menu--left" ref={ref} onClick={e => e.stopPropagation()}>
      {STATUS_OPTS.map(o => (
        <button
          key={o.key}
          className={`lv-menu-opt ${value === o.key ? 'lv-menu-opt--on' : ''}`}
          onClick={() => { onPick(o.key); onClose(); }}
        >
          <span className="lv-menu-dot" style={{ background: o.dot }} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PrioMenu({ value, onPick, onClose }) {
  const ref = useRef(null);
  usePopClose(ref, onClose);
  return (
    <div className="lv-menu lv-menu--left" ref={ref} onClick={e => e.stopPropagation()}>
      {[0, 1, 2, 3].map(v => (
        <button
          key={v}
          className={`lv-menu-opt ${value === v ? 'lv-menu-opt--on' : ''}`}
          onClick={() => { onPick(v); onClose(); }}
        >
          <span className="lv-menu-dot" style={{ background: PRIO[v] ? PRIO[v].color : 'var(--border)' }} />
          {v === 0 ? '없음' : PRIO[v].label}
        </button>
      ))}
    </div>
  );
}

function CategoryMenu({ current, categories, onPick, onCreate, onClose }) {
  const ref = useRef(null);
  usePopClose(ref, onClose);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const composing = useRef(false);
  const submit = () => {
    const t = name.trim();
    if (t) { onCreate(t); onClose(); }
  };
  return (
    <div className="lv-menu lv-menu--left lv-menu--cat" ref={ref} onClick={e => e.stopPropagation()}>
      <button
        className={`lv-menu-opt ${!current ? 'lv-menu-opt--on' : ''}`}
        onClick={() => { onPick(null); onClose(); }}
      >
        <span className="lv-menu-dot" style={{ background: 'var(--border)' }} />없음
      </button>
      {categories.map(c => (
        <button
          key={c.id}
          className={`lv-menu-opt ${current === c.id ? 'lv-menu-opt--on' : ''}`}
          onClick={() => { onPick(c.id); onClose(); }}
        >
          <span className="lv-menu-dot" style={{ background: catColor(c) }} />
          {c.title}
        </button>
      ))}
      <div className="lv-menu-sep" />
      {adding ? (
        <input
          className="lv-menu-input"
          value={name}
          autoFocus
          placeholder="카테고리 이름"
          onChange={e => setName(e.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={e => {
            if (e.key === 'Escape') setAdding(false);
            else if (e.key === 'Enter' && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
          onBlur={submit}
        />
      ) : (
        <button className="lv-menu-opt lv-menu-opt--add" onClick={() => setAdding(true)}>+ 새 카테고리</button>
      )}
    </div>
  );
}

function RowMenu({ kind, status, onStatus, onDetail, onDelete, onClose }) {
  const ref = useRef(null);
  usePopClose(ref, onClose);
  return (
    <div className="lv-menu lv-menu--right" ref={ref} onClick={e => e.stopPropagation()}>
      <div className="lv-menu-label">상태</div>
      {STATUS_OPTS.map(o => (
        <button
          key={o.key}
          className={`lv-menu-opt ${status === o.key ? 'lv-menu-opt--on' : ''}`}
          onClick={() => { onStatus(o.key); onClose(); }}
        >
          <span className="lv-menu-dot" style={{ background: o.dot }} />
          {o.label}
        </button>
      ))}
      <div className="lv-menu-sep" />
      <button className="lv-menu-opt" onClick={() => { onDetail(); onClose(); }}>
        {kind === 'item' ? '자세히 편집' : '프로젝트 열기'}
      </button>
      <button className="lv-menu-opt lv-menu-opt--danger" onClick={() => { onDelete(); onClose(); }}>삭제</button>
    </div>
  );
}

function InlineTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== value) onSave(t);
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        className="lv-name-input"
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onClick={e => e.stopPropagation()}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          else if (e.key === 'Enter' && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
        }}
        onBlur={commit}
      />
    );
  }
  return (
    <span className="lv-name" onClick={e => { e.stopPropagation(); setEditing(true); }} title="클릭해서 제목 수정">
      {value}
    </span>
  );
}

function DatePop({ value, label, onChange, onClose }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  usePopClose(ref, onClose);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* 사용자 제스처 밖이면 무시 */ }
  }, []);
  return (
    <div className="lv-date-pop" ref={ref} onClick={e => e.stopPropagation()}>
      <label>{label}</label>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={e => { onChange(e.target.value || null); onClose(); }}
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
  onItemClick, onSetItemStatus, onSetItemPriority, onSetItemProject,
  onAddItem, onUpdateItem, onDeleteItem,
  onEditProject, onSaveProject,
  onAddCategory, onCompleteCategory, onUncompleteCategory, onDeleteCategory, onReorderCategories,
}) {
  const [filter, setFilterRaw] = useState(null); // null(전체) | 'done' | projectId
  const [datePop, setDatePop] = useState(null); // `${rowKey}:${field}`
  const [statusPop, setStatusPop] = useState(null); // rowKey
  const [prioPop, setPrioPop] = useState(null); // rowKey
  const [catPop, setCatPop] = useState(null); // rowKey
  const [rowMenu, setRowMenu] = useState(null); // rowKey
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showDoneCats, setShowDoneCats] = useState(false);
  const [openDoneGroups, setOpenDoneGroups] = useState(() => new Set());
  const [dragCat, setDragCat] = useState(null);
  const [dragOverCat, setDragOverCat] = useState(null);
  const [pendingDel, setPendingDel] = useState({}); // rowKey -> row (되돌리기 대기)
  const delTimers = useRef({});
  useEffect(() => () => { Object.values(delTimers.current).forEach(clearTimeout); }, []);
  // 방금 완료한 항목은 잠깐 그 자리에 남겨둠 (실수 취소용). 탭을 바꾸면 정리됨.
  const [justDone, setJustDone] = useState(() => new Set());

  const setFilter = f => { setFilterRaw(f); setJustDone(new Set()); };

  const rows = useMemo(() => buildRows(items, projects), [items, projects]);

  const activeCats = projects.filter(p => !catDone(p));
  const doneCats = projects.filter(catDone);
  const doneCatIds = new Set(doneCats.map(p => p.id));
  // 완료된 카테고리에 속한 항목은 '완료' 탭에서 제외 (카테고리와 함께 아카이브됨)
  const inDoneCat = r => r.cat && doneCatIds.has(r.cat.id);

  const doneCount = rows.filter(r => r.status === 'done' && !inDoneCat(r)).length;
  const catCounts = {};
  rows.forEach(r => { if (r.cat && r.status !== 'done') catCounts[r.cat.id] = (catCounts[r.cat.id] ?? 0) + 1; });

  const viewingDone = filter === 'done';

  const doneRows = rows
    .filter(r => r.status === 'done' && !inDoneCat(r))
    .sort((a, b) => {
      const da = a.expected || a.due || '0000';
      const db = b.expected || b.due || '0000';
      return da < db ? 1 : da > db ? -1 : 0; // 최근 완료가 위로
    });

  // 완료 목록은 카테고리별로 묶어서 표시
  const doneByCategory = [];
  {
    const map = new Map();
    doneRows.forEach(r => {
      const key = r.cat ? String(r.cat.id) : '__none';
      if (!map.has(key)) {
        const g = { key, label: r.cat ? r.cat.name : '카테고리 없음', color: r.cat ? r.cat.color : null, rows: [] };
        map.set(key, g);
        doneByCategory.push(g);
      }
      map.get(key).rows.push(r);
    });
    doneByCategory.sort((a, b) => (a.key === '__none' ? 1 : b.key === '__none' ? -1 : 0));
  }

  const filteredCat = filter ? projects.find(p => p.id === filter) : null;
  const filteredCatIsDone = !!(filteredCat && catDone(filteredCat));
  // 완료된 카테고리를 보고 있으면 그 카테고리의 완료 항목도 아래에 같이 보여줌
  const catDoneRows = filteredCatIsDone
    ? rows
        .filter(r => r.status === 'done' && r.cat && r.cat.id === filter)
        .sort((a, b) => {
          const da = a.expected || a.due || '0';
          const db = b.expected || b.due || '0';
          return da < db ? 1 : da > db ? -1 : 0;
        })
    : [];

  const passFilter = r => {
    // 완료된 카테고리 항목은 그 카테고리를 직접 선택했을 때만 보임
    if (inDoneCat(r) && filter !== r.cat.id) return false;
    if (r.status === 'done' && !justDone.has(r.key)) return false;
    if (filter === null) return true;
    return r.cat && r.cat.id === filter;
  };

  const grouped = { overdue: [], today: [], week: [], later: [], unplanned: [] };
  rows.filter(passFilter).forEach(r => {
    const b = dateBucket(r);
    if (grouped[b]) grouped[b].push(r);
  });
  Object.values(grouped).forEach(list => {
    list.sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const da = a.expected || a.due || '9999-99-99';
      const db = b.expected || b.due || '9999-99-99';
      return da < db ? -1 : da > db ? 1 : 0;
    });
  });

  const setRowStatus = (r, status) => {
    if (r.kind === 'item') onSetItemStatus(r.raw.id, status);
    else patchTask(r, { status: TASK_STATUS_MAP[status] });
  };
  const changeStatus = (r, status) => {
    setRowStatus(r, status);
    setJustDone(prev => {
      const n = new Set(prev);
      if (status === 'done') n.add(r.key); else n.delete(r.key);
      return n;
    });
  };
  const openRow = r => {
    if (r.kind === 'item') onItemClick(r.raw);
    else onEditProject(r.raw.project);
  };

  const patchTask = (r, patch) => {
    const p = r.raw.project;
    const tasks = (p.tasks ?? []).map(t => t.id === r.raw.task.id ? { ...t, ...patch } : t);
    onSaveProject(p.id, { ...p, tasks });
  };

  const setRowDate = (r, field, val) => {
    if (r.kind === 'item') {
      onUpdateItem(r.raw.id, field === 'expected' ? { date: val || '' } : { dueDate: val || '' });
    } else {
      patchTask(r, field === 'expected' ? { planned: val || '' } : { deadline: val || '' });
    }
  };

  const setRowPriority = (r, v) => {
    if (r.kind === 'item') onSetItemPriority(r.raw.id, v);
    else patchTask(r, { priority: v });
  };
  const setRowCategory = (r, projectId) => {
    if (r.kind === 'item') onSetItemProject(r.raw.id, projectId);
  };
  const reorderCats = (toId) => {
    const fromId = dragCat;
    setDragCat(null);
    setDragOverCat(null);
    if (!fromId || fromId === toId || !onReorderCategories) return;
    const arr = [...activeCats];
    const fi = arr.findIndex(p => p.id === fromId);
    const ti = arr.findIndex(p => p.id === toId);
    if (fi < 0 || ti < 0) return;
    const [m] = arr.splice(fi, 1);
    arr.splice(ti, 0, m);
    onReorderCategories([...arr, ...doneCats].map((p, i) => ({ ...p, sortOrder: i })));
  };

  const submitNewCat = () => {
    const t = newCatName.trim();
    setAddingCat(false);
    setNewCatName('');
    if (t) onAddCategory(t, pickNewCatColor(projects));
  };
  const setRowTitle = (r, title) => {
    if (r.kind === 'item') onUpdateItem(r.raw.id, { title });
    else patchTask(r, { label: title });
  };
  const clearOverdue = (list) => {
    if (!list.length) return;
    if (!window.confirm(`지난 항목 ${list.length}개의 날짜를 지우고 '미정'으로 보낼까요?\n(항목은 그대로 남아요)`)) return;
    list.forEach(r => {
      if (r.kind === 'item') onUpdateItem(r.raw.id, { date: '', dueDate: '' });
      else patchTask(r, { planned: '', deadline: '' });
    });
  };
  const deleteRow = r => {
    if (r.kind === 'item') onDeleteItem(r.raw.id);
    else {
      const p = r.raw.project;
      onSaveProject(p.id, { ...p, tasks: (p.tasks ?? []).filter(t => t.id !== r.raw.task.id) });
    }
  };
  // X 클릭 = 바로 삭제하되 4.5초간 '되돌리기' 가능
  const softDelete = r => {
    setPendingDel(p => ({ ...p, [r.key]: r }));
    delTimers.current[r.key] = setTimeout(() => {
      deleteRow(r);
      delete delTimers.current[r.key];
      setPendingDel(p => { const n = { ...p }; delete n[r.key]; return n; });
    }, 4500);
  };
  const undoDelete = key => {
    clearTimeout(delTimers.current[key]);
    delete delTimers.current[key];
    setPendingDel(p => { const n = { ...p }; delete n[key]; return n; });
  };

  const quickAdd = (groupKey, title) => {
    const projectId = filter && projects.some(p => p.id === filter) ? filter : null;
    const date = groupKey === 'today' ? TODAY : '';
    onAddItem({ type: 'todo', title, date, timeSlot: 'all', projectId });
  };

  const dueOnly = rows
    .filter(r => r.due && !r.expected && r.status !== 'done')
    .sort((a, b) => (a.due < b.due ? -1 : 1));

  const datePill = (r, field) => {
    const isExpected = field === 'expected';
    const val = isExpected ? r.expected : r.due;
    const label = isExpected ? '계획일' : '마감일';
    const icon = isExpected ? '🗓' : '📕';
    const soon = !isExpected && val && val <= addDays(TODAY, 1) && r.status !== 'done';
    const popKey = `${r.key}:${field}`;
    return (
      <span className="lv-date-edit" key={field}>
        <button
          className={`lv-d ${soon ? 'lv-d--soon' : ''} ${val ? '' : 'lv-d--empty'}`}
          onClick={e => { e.stopPropagation(); setDatePop(datePop === popKey ? null : popKey); }}
        >
          {icon} {val ? mdLabel(val) + (isExpected && r.time ? ` ${r.time}` : '') : label}
        </button>
        {datePop === popKey && (
          <DatePop
            value={val}
            label={label}
            onChange={v => setRowDate(r, field, v)}
            onClose={() => setDatePop(null)}
          />
        )}
      </span>
    );
  };

  const renderRow = r => {
    if (pendingDel[r.key]) {
      return (
        <div className="lv-row lv-row--deleting" key={r.key}>
          <span className="lv-del-msg">🗑 삭제됨 — <b>{r.title}</b></span>
          <button className="lv-del-undo" onClick={() => undoDelete(r.key)}>되돌리기</button>
        </div>
      );
    }
    const prio = PRIO[r.priority];
    return (
      <div className={`lv-row ${r.status === 'done' ? 'lv-row--done' : ''}`} key={r.key}>
        <span className="lv-prio-wrap">
          <button
            className="lv-prio-btn"
            style={{ borderLeftColor: prio ? prio.color : 'transparent' }}
            onClick={e => { e.stopPropagation(); setPrioPop(prioPop === r.key ? null : r.key); }}
            title={prio ? `중요도: ${prio.label}` : '중요도 설정'}
            aria-haspopup="true"
          />
          {prioPop === r.key && (
            <PrioMenu value={r.priority} onPick={v => setRowPriority(r, v)} onClose={() => setPrioPop(null)} />
          )}
        </span>
        <span className="lv-ck-wrap">
          <button
            className="lv-ck-btn"
            onClick={e => { e.stopPropagation(); setStatusPop(statusPop === r.key ? null : r.key); }}
            aria-label="상태 변경"
            aria-haspopup="true"
          >
            <span className={`lv-ck ${STATUS_CLASS[r.status]}`} />
          </button>
          {statusPop === r.key && (
            <StatusMenu value={r.status} onPick={s => changeStatus(r, s)} onClose={() => setStatusPop(null)} />
          )}
        </span>
        <InlineTitle value={r.title} onSave={t => setRowTitle(r, t)} />
        <span className="lv-meta">
          {r.kind === 'item' ? (
            <span className="lv-cat-edit">
              <button
                className={`lv-pill lv-pill--btn ${r.cat ? '' : 'lv-pill--empty'}`}
                style={r.cat ? { background: tint(r.cat.color, '22'), color: r.cat.color } : undefined}
                onClick={e => { e.stopPropagation(); setCatPop(catPop === r.key ? null : r.key); }}
              >
                {r.cat ? r.cat.name : '+ 카테고리'}
              </button>
              {catPop === r.key && (
                <CategoryMenu
                  current={r.cat ? r.cat.id : null}
                  categories={activeCats}
                  onPick={id => setRowCategory(r, id)}
                  onCreate={async name => { const id = await onAddCategory(name, pickNewCatColor(projects)); if (id) setRowCategory(r, id); setCatPop(null); }}
                  onClose={() => setCatPop(null)}
                />
              )}
            </span>
          ) : r.cat && (
            <span className="lv-pill" style={{ background: tint(r.cat.color, '22'), color: r.cat.color }}>
              {r.cat.name}
            </span>
          )}
          {datePill(r, 'expected')}
          {datePill(r, 'due')}
          <span className="lv-row-menu-wrap">
            <button
              className="lv-row-more"
              onClick={e => { e.stopPropagation(); setRowMenu(rowMenu === r.key ? null : r.key); }}
              aria-label="더보기"
            >⋯</button>
            {rowMenu === r.key && (
              <RowMenu
                kind={r.kind}
                status={r.status}
                onStatus={s => changeStatus(r, s)}
                onDetail={() => openRow(r)}
                onDelete={() => softDelete(r)}
                onClose={() => setRowMenu(null)}
              />
            )}
          </span>
          <button
            className="lv-row-x"
            onClick={e => { e.stopPropagation(); softDelete(r); }}
            aria-label="삭제"
          >✕</button>
        </span>
      </div>
    );
  };

  return (
    <div className="listview">
      <div className="lv-head">
        <div>
          <h2 className="lv-title">목록</h2>
          <p className="lv-sub">달력 할일 + 프로젝트 태스크 · 날짜·중요도·상태를 목록에서 바로 수정</p>
        </div>
        <button className="btn btn--primary" onClick={() => onItemClick(null)}>+ 새 할일</button>
      </div>

      <div className="lv-cats">
        <button className={`lv-cat ${filter === null ? 'lv-cat--on' : ''}`} onClick={() => setFilter(null)}>전체</button>
        <button
          className={`lv-cat ${viewingDone ? 'lv-cat--on' : ''}`}
          onClick={() => setFilter(viewingDone ? null : 'done')}
        >✓ 완료 <span className="lv-cat-ct">{doneCount}</span></button>
        {activeCats.map(p => {
          const cc = catColor(p);
          const on = filter === p.id;
          return (
            <button
              key={p.id}
              className={`lv-cat ${on ? 'lv-cat--on' : ''} ${dragCat === p.id ? 'lv-cat--dragging' : ''} ${dragOverCat === p.id ? 'lv-cat--dragover' : ''}`}
              style={on ? { background: cc, borderColor: cc, color: '#fff' } : undefined}
              onClick={() => setFilter(on ? null : p.id)}
              onDoubleClick={() => onEditProject(p)}
              title="드래그: 순서 변경 · 더블클릭: 이름·색 수정"
              draggable
              onDragStart={() => setDragCat(p.id)}
              onDragOver={e => { e.preventDefault(); if (dragCat && dragCat !== p.id) setDragOverCat(p.id); }}
              onDragLeave={() => setDragOverCat(o => (o === p.id ? null : o))}
              onDrop={e => { e.preventDefault(); reorderCats(p.id); }}
              onDragEnd={() => { setDragCat(null); setDragOverCat(null); }}
            >
              <span className="lv-cat-dot" style={{ background: on ? '#fff' : cc }} />
              {p.title} <span className="lv-cat-ct">{catCounts[p.id] ?? 0}</span>
            </button>
          );
        })}

        {addingCat ? (
          <input
            className="lv-cat-input"
            value={newCatName}
            autoFocus
            placeholder="카테고리 이름 (Enter)"
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); }
              else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submitNewCat(); }
            }}
            onBlur={submitNewCat}
          />
        ) : (
          <button className="lv-cat lv-cat--add" onClick={() => setAddingCat(true)}>+ 카테고리</button>
        )}

        {doneCats.length > 0 && (
          <button className="lv-cat lv-cat--muted" onClick={() => setShowDoneCats(v => !v)}>
            완료된 카테고리 {doneCats.length} {showDoneCats ? '▾' : '▸'}
          </button>
        )}
      </div>

      {(() => {
        const sel = filter && activeCats.find(p => p.id === filter);
        if (!sel) return null;
        return (
          <div className="lv-cat-actions">
            <span>카테고리: <b>{sel.title}</b></span>
            <button onClick={() => onEditProject(sel)}>✏️ 이름·색</button>
            <button onClick={() => { onCompleteCategory(sel.id); setFilter(null); }}>✅ 완료 처리</button>
            <button
              className="lv-cat-actions--danger"
              onClick={() => {
                if (window.confirm(`'${sel.title}' 카테고리를 삭제할까요?\n(이 카테고리의 할일은 지워지지 않고 '카테고리 없음'이 됩니다)`)) {
                  onDeleteCategory(sel.id);
                  setFilter(null);
                }
              }}
            >🗑 삭제</button>
          </div>
        );
      })()}

      {showDoneCats && doneCats.length > 0 && (
        <div className="lv-cats lv-cats--done">
          {doneCats.map(p => (
            <button
              key={p.id}
              className={`lv-cat ${filter === p.id ? 'lv-cat--on' : ''}`}
              onClick={() => setFilter(filter === p.id ? null : p.id)}
              onDoubleClick={() => onEditProject(p)}
            >
              <span className="lv-cat-dot" style={{ background: catColor(p) }} />
              {p.title}
              <span
                className="lv-cat-restore"
                onClick={e => { e.stopPropagation(); onUncompleteCategory(p.id); }}
                title="완료 취소"
              >↩</span>
            </button>
          ))}
        </div>
      )}

      {viewingDone ? (
        doneRows.length === 0
          ? <div className="lv-empty">완료한 항목이 없습니다</div>
          : doneByCategory.map(g => {
              const open = openDoneGroups.has(g.key);
              return (
                <div className="lv-group" key={g.key}>
                  <button
                    className="lv-group-h lv-group-h--toggle"
                    onClick={() => setOpenDoneGroups(s => {
                      const n = new Set(s);
                      if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                      return n;
                    })}
                  >
                    {g.color && <span className="lv-cat-dot" style={{ background: g.color }} />}
                    <b>{g.label}</b><span className="lv-group-ct">{g.rows.length}</span>
                    <span className="lv-group-caret">{open ? '▾' : '▸'}</span>
                  </button>
                  {open && g.rows.map(renderRow)}
                </div>
              );
            })
      ) : (
        <>
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
                  {g.key === 'overdue' && list.length > 0 && (
                    <button className="lv-group-action" onClick={() => clearOverdue(list)}>
                      전부 미정으로
                    </button>
                  )}
                </div>
                {list.map(renderRow)}
                {list.length === 0 && g.key !== 'unplanned' && <div className="lv-empty">비어 있음</div>}
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

          {filteredCatIsDone && catDoneRows.length > 0 && (
            <div className="lv-group">
              <div className="lv-group-h"><b>완료</b><span className="lv-group-ct">{catDoneRows.length}</span></div>
              {catDoneRows.map(renderRow)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
