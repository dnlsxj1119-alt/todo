import { useMemo, useState, useRef, useEffect } from 'react';
import { toDateString } from '../utils/dateUtils';
import { getProjectType, getTaskProgressPct } from '../utils/projectTypes';

function catDone(p) {
  return !!p.forceCompleted || ((p.tasks?.length ?? 0) > 0 && getTaskProgressPct(p.tasks) === 100);
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
  return { id: p.id, name: p.title, color: getProjectType(p.type).border };
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
    const pt = getProjectType(p.type);
    (p.tasks ?? []).forEach(t => {
      rows.push({
        key: `p-${t.id}`,
        kind: 'task',
        raw: { project: p, task: t },
        title: t.label,
        cat: { id: p.id, name: p.title, color: pt.border },
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
  if (r.due && r.due < TODAY && r.status !== 'done') return 'overdue';
  if (r.expected === TODAY || r.due === TODAY) return 'today';
  if (!r.expected) return 'unplanned';
  if (r.expected < TODAY) return 'today';
  if (r.expected <= EOW) return 'week';
  return 'later';
}

const GROUPS = [
  { key: 'overdue', label: '지난 마감', warn: true, add: false },
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
          <span className="lv-menu-dot" style={{ background: getProjectType(c.type).border }} />
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
  onAddCategory, onCompleteCategory, onUncompleteCategory,
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
  // 방금 완료한 항목은 잠깐 그 자리에 남겨둠 (실수 취소용). 탭을 바꾸면 정리됨.
  const [justDone, setJustDone] = useState(() => new Set());

  const setFilter = f => { setFilterRaw(f); setJustDone(new Set()); };

  const rows = useMemo(() => buildRows(items, projects), [items, projects]);

  const doneCount = rows.filter(r => r.status === 'done').length;
  const catCounts = {};
  rows.forEach(r => { if (r.cat && r.status !== 'done') catCounts[r.cat.id] = (catCounts[r.cat.id] ?? 0) + 1; });

  const activeCats = projects.filter(p => !catDone(p));
  const doneCats = projects.filter(catDone);

  const viewingDone = filter === 'done';

  const doneRows = rows
    .filter(r => r.status === 'done')
    .sort((a, b) => {
      const da = a.expected || a.due || '0000';
      const db = b.expected || b.due || '0000';
      return da < db ? 1 : da > db ? -1 : 0; // 최근 완료가 위로
    });

  const passFilter = r => {
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
  const submitNewCat = () => {
    const t = newCatName.trim();
    setAddingCat(false);
    setNewCatName('');
    if (t) onAddCategory(t);
  };
  const setRowTitle = (r, title) => {
    if (r.kind === 'item') onUpdateItem(r.raw.id, { title });
    else patchTask(r, { label: title });
  };
  const deleteRow = r => {
    if (r.kind === 'item') onDeleteItem(r.raw.id);
    else {
      const p = r.raw.project;
      onSaveProject(p.id, { ...p, tasks: (p.tasks ?? []).filter(t => t.id !== r.raw.task.id) });
    }
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
                  onCreate={async name => { const id = await onAddCategory(name); if (id) setRowCategory(r, id); setCatPop(null); }}
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
                onDelete={() => deleteRow(r)}
                onClose={() => setRowMenu(null)}
              />
            )}
          </span>
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
          const pt = getProjectType(p.type);
          const on = filter === p.id;
          return (
            <button
              key={p.id}
              className={`lv-cat ${on ? 'lv-cat--on' : ''}`}
              style={on ? { background: pt.border, borderColor: pt.border, color: '#fff' } : undefined}
              onClick={() => setFilter(on ? null : p.id)}
              onDoubleClick={() => onEditProject(p)}
              title="더블클릭: 이름·색 수정 / 완료 처리"
            >
              <span className="lv-cat-dot" style={{ background: on ? '#fff' : pt.border }} />
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
              <span className="lv-cat-dot" style={{ background: getProjectType(p.type).border }} />
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
        <div className="lv-group">
          <div className="lv-group-h"><b>완료</b><span className="lv-group-ct">{doneRows.length}</span></div>
          {doneRows.length === 0
            ? <div className="lv-empty">완료한 항목이 없습니다</div>
            : doneRows.map(renderRow)}
        </div>
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
        </>
      )}
    </div>
  );
}
