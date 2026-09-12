import { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { toDateString, addDays } from '../utils/dateUtils';
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

// 오늘/어제/내일/주말 기준 날짜. 모듈 로드 시점에 한 번만 계산하면
// 앱을 켜둔 채 자정을 넘겼을 때 '오늘' 그룹이 어제 날짜로 남는다 → 매번 다시 계산한다.
function endOfWeekStr() {
  const d = new Date();
  const fromMon = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + (6 - fromMon));
  return toDateString(d);
}

function computeDayKeys() {
  const today = toDateString(new Date());
  return {
    today,
    tomorrow: addDays(today, 1),
    yesterday: addDays(today, -1),
    eow: endOfWeekStr(),
  };
}

// 자정을 넘기거나, 탭을 다시 열었을 때 날짜 기준을 갱신한다.
function useDayKeys() {
  const [keys, setKeys] = useState(computeDayKeys);
  useEffect(() => {
    const check = () => setKeys(prev => {
      const next = computeDayKeys();
      return prev.today === next.today ? prev : next;
    });
    const id = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return keys;
}

function mdLabel(s) {
  const [, m, d] = s.split('-');
  return `${+m}/${+d}`;
}
function tint(hex, aa) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + aa : hex;
}

const STATUS_CLASS = { todo: '', doing: 'lv-ck--doing', done: 'lv-ck--done', cancelled: 'lv-ck--cancelled' };
const STATUS_OPTS = [
  { key: 'todo', label: '안 함', dot: 'var(--text-muted)' },
  { key: 'doing', label: '하는 중', dot: '#E0942A' },
  { key: 'done', label: '완료', dot: '#5C8F1E' },
  // '안 하기로 함'. 지우면 기록이 사라지고 그냥 두면 목록이 지저분해져서 따로 뒀다.
  { key: 'cancelled', label: '취소', dot: '#5B6472' },
];
const TASK_STATUS_MAP = { todo: 'upcoming', doing: 'in_progress', done: 'done', cancelled: 'cancelled' };

// 완료·취소는 '끝난 것'이라 활성 목록에서 빠지고 보관 탭에서만 보인다.
// 둘의 차이는 완료만 '최근 완료'·통계에 들어간다는 점.
const isArchived = (status) => status === 'done' || status === 'cancelled';
const PRIO = [
  null,
  { label: '낮음', color: '#8A94B8' },
  { label: '보통', color: '#E0942A' },
  { label: '높음', color: '#D9534F' },
];

// 중요도는 1(낮음)/2(보통)/3(높음)만 유효하고 그 외는 '없음'.
// 옛 '우선순위' 시절의 다른 척도 값(4 이상 등)이 남아 있으면 PRIO[4] 가 undefined 라
// 막대가 투명해져 '중요도 없음'처럼 보이는데, 정렬에서는 높음(3)보다 위로 올라갔다.
// 화면·정렬에서만 정규화한다 (DB 값은 그대로 둠 — 사용자가 다시 고르면 정상 값으로 저장됨).
function normPrio(v) {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? n : 0;
}

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
        priority: normPrio(it.priority),
        sortOrder: it.sortOrder ?? null,
        completedAt: it.completedAt ?? null,
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
        status: t.status === 'done' ? 'done'
          : t.status === 'cancelled' ? 'cancelled'
          : t.status === 'in_progress' ? 'doing' : 'todo',
        priority: normPrio(t.priority),
        sortOrder: null,
        completedAt: t.completedAt ?? null,
      });
    });
  });

  return rows;
}

function dateBucket(r, { today, tomorrow, yesterday, eow }) {
  if (!isArchived(r.status)) {
    const past = [r.due, r.expected].filter(d => d && d < today).sort();
    if (past.length) return past[past.length - 1] === yesterday ? 'yesterday' : 'overdue';
  }
  if (r.expected === today || r.due === today) return 'today';
  if (r.expected === tomorrow || r.due === tomorrow) return 'tomorrow';
  // 계획일이 없어도 마감일이 있으면 '미정'이 아니다.
  // 예전엔 '자소서 14일 마감'처럼 마감일만 적은 항목이 맨 아래 미정에 묻혀서 기한을 못 봤다.
  if (!r.expected) {
    if (!r.due) return 'unplanned';
    return r.due <= eow ? 'week' : 'later';
  }
  if (r.expected <= eow) return 'week';
  return 'later';
}

const GROUPS = [
  { key: 'overdue', label: '지난 (놓친 일정)', warn: true, add: false },
  { key: 'yesterday', label: '어제 (놓친 일정)', warn: true, add: false },
  { key: 'today', label: '오늘', add: true },
  { key: 'tomorrow', label: '내일', add: true },
  { key: 'week', label: '이번 주', add: false },
  { key: 'later', label: '나중에', add: false },
  { key: 'unplanned', label: '미정', add: false },
];

function QuickAdd({ placeholder, onAdd, withDates, categories = [], defaultProjectId = null, onCreateCategory }) {
  const [val, setVal] = useState('');
  const [expected, setExpected] = useState('');
  const [due, setDue] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [priority, setPriority] = useState(0);
  const [catOpen, setCatOpen] = useState(false);
  const [prioOpen, setPrioOpen] = useState(false);
  const composing = useRef(false);

  // 카테고리 칩으로 필터를 바꾸면 빠른추가의 기본 카테고리도 따라간다
  useEffect(() => { setProjectId(defaultProjectId); }, [defaultProjectId]);

  const selectedCat = categories.find(c => String(c.id) === String(projectId)) ?? null;
  const prio = PRIO[priority];

  const submit = () => {
    const t = val.trim();
    if (!t) return;
    onAdd(t, { expected, due, projectId, priority });
    setVal('');
    setExpected('');
    setDue('');
    // 중요도는 매번 초기화, 카테고리는 지금 보고 있는 카테고리로 되돌린다
    setPriority(0);
    setProjectId(defaultProjectId);
  };
  return (
    <div className={`lv-quick ${withDates ? 'lv-quick--dates' : ''}`}>
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
      <span className="lv-quick-meta">
        <span className="lv-quick-pick">
          <button
            type="button"
            className="lv-quick-prio"
            style={prio ? { color: prio.color, borderColor: prio.color } : undefined}
            onClick={() => { setPrioOpen(v => !v); setCatOpen(false); }}
            title={prio ? `중요도: ${prio.label}` : '중요도 설정'}
          >
            {prio ? prio.label : '중요도'}
          </button>
          {prioOpen && (
            <PrioMenu value={priority} onPick={setPriority} onClose={() => setPrioOpen(false)} />
          )}
        </span>
        <span className="lv-quick-pick">
          <button
            type="button"
            className={`lv-pill lv-pill--btn ${selectedCat ? '' : 'lv-pill--empty'}`}
            style={selectedCat ? { background: tint(catColor(selectedCat), '22'), color: catColor(selectedCat) } : undefined}
            onClick={() => { setCatOpen(v => !v); setPrioOpen(false); }}
            title="카테고리 설정"
          >
            {selectedCat ? selectedCat.title : '+ 카테고리'}
          </button>
          {catOpen && (
            <CategoryMenu
              current={projectId}
              categories={categories}
              onPick={setProjectId}
              onCreate={async name => {
                const id = await onCreateCategory?.(name);
                if (id) setProjectId(id);
                setCatOpen(false);
              }}
              onClose={() => setCatOpen(false)}
            />
          )}
        </span>
      </span>
      {withDates && (
        <span className="lv-quick-dates">
          <label className="lv-quick-date" title="계획일 (expected)">
            <span>🗓</span>
            <input type="date" value={expected} onChange={e => setExpected(e.target.value)} />
          </label>
          <label className="lv-quick-date" title="마감일 (due)">
            <span>📕</span>
            <input type="date" value={due} onChange={e => setDue(e.target.value)} />
          </label>
          <button type="button" className="lv-quick-go" onClick={submit}>추가</button>
        </span>
      )}
    </div>
  );
}

// 팝업 메뉴는 기본적으로 누른 버튼 아래로 열린다. 그런데 화면 아래쪽 행에서 열면
// 스크롤 컨테이너에 잘려서 '완료' 같은 항목을 아예 고를 수 없었다
// (세로 568px 짧은 휴대폰에서 목록 마지막 행들이 특히 그랬다).
// → 아래에 자리가 없고 위가 더 넓으면 위로 열고, 좌우로 삐져나가면 화면 안으로 당긴다.
function useKeepOnScreen(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 매 렌더마다 다시 재는 값이라 먼저 초기화한다 (안 그러면 이전 보정이 누적된다)
    el.style.top = '';
    el.style.bottom = '';
    el.style.transform = '';
    el.style.maxHeight = '';
    el.style.overflowY = '';
    const anchor = el.offsetParent ?? el.parentElement;
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    const h = el.getBoundingClientRect().height;
    const pad = 8;
    const below = window.innerHeight - a.bottom;
    const above = a.top;
    if (h + pad > below && above > below) {
      el.style.top = 'auto';
      el.style.bottom = 'calc(100% + 5px)';
    }
    // transform 은 left/right 어느 쪽으로 붙어 있어도 동작한다
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - pad) el.style.transform = `translateX(${Math.round(window.innerWidth - pad - r.right)}px)`;
    else if (r.left < pad) el.style.transform = `translateX(${Math.round(pad - r.left)}px)`;
    // 위아래 어느 쪽에도 다 안 들어가는 경우(휴대폰 가로 화면처럼 세로가 짧을 때)
    // 메뉴 자체를 화면 높이에 맞추고 안에서 스크롤하게 한다
    const room = Math.max(above, below) - pad * 2;
    if (h > room && room > 80) {
      el.style.maxHeight = `${Math.round(room)}px`;
      el.style.overflowY = 'auto';
    }
  });
}

function usePopClose(ref, onClose) {
  useKeepOnScreen(ref);
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

function CategoryMenu({ current, categories, onPick, onCreate, onClose, hideNone }) {
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
    <div className="lv-menu lv-menu--right lv-menu--cat" ref={ref} onClick={e => e.stopPropagation()}>
      {!hideNone && (
        <button
          className={`lv-menu-opt ${!current ? 'lv-menu-opt--on' : ''}`}
          onClick={() => { onPick(null); onClose(); }}
        >
          <span className="lv-menu-dot" style={{ background: 'var(--border)' }} />없음
        </button>
      )}
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

function DatePop({ value, label, today, onChange, onClose }) {
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
        <button onClick={() => { onChange(today); onClose(); }}>오늘</button>
        <button onClick={() => { onChange(addDays(today, 1)); onClose(); }}>내일</button>
        <button onClick={() => { onChange(null); onClose(); }}>지우기</button>
      </div>
    </div>
  );
}

// 🟢일정은 목록 뷰에 안 나오지만(달력/주간뷰 담당), 계획을 세울 땐
// 이미 시간이 잡힌 약속을 알아야 하므로 오늘~모레 3일치만 따로 붙인다.
// **완료한 일정은 여기서 뺀다** — 이 섹션은 '앞으로 해야 할/비어 있는 시간'을 보는 곳이고,
// 끝낸 일은 아래 [✅ 최근 완료] 에만 모아 둔다 (할일도 완료되면 그룹에서 빠지는 것과 같은 규칙).
function buildScheduleLines(items, today) {
  const days = [today, addDays(today, 1), addDays(today, 2)];
  const dayLabel = ['오늘', '내일', '모레'];
  const lines = [];
  let any = false;
  days.forEach((ds, i) => {
    const onDay = (items ?? [])
      .filter(it => it.type === 'schedule'
        && it.status !== 'done' && !it.completed
        && (it.date === ds || (it.endDate && it.date < ds && it.endDate >= ds)))
      // 시간 없는(종일) 일정을 먼저, 그 다음 시간순
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (!onDay.length) return;
    any = true;
    lines.push(`  ${ds} (${dayLabel[i]})`);
    onDay.forEach(it => {
      const span = it.endDate && it.endDate > it.date ? ` (${it.date}~${it.endDate})` : '';
      if (it.date !== ds) {
        // 이어지는 날은 시작 시각이 그 날의 정보가 아니므로 시간을 붙이지 않는다
        lines.push(`    - ↩ ${it.title}${span}`);
        return;
      }
      const time = it.time ? (it.endTime ? `${it.time}–${it.endTime} ` : `${it.time} `) : '';
      lines.push(`    - ${time}${it.title}${span}`);
    });
  });
  return any ? lines : null;
}

// 카테고리(프로젝트) 자체의 마감 기한. 달력의 🏁 칩으로만 쓰여서 공유 텍스트엔 빠져 있었다.
// 큰 일의 마감은 계획을 세울 때 가장 중요한 정보라 따로 싣는다.
function buildCategoryDeadlineLines(categories, today) {
  const list = (categories ?? [])
    .filter(c => c.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  if (!list.length) return null;
  return list.map(c => {
    const days = Math.round((new Date(c.deadline) - new Date(today)) / 86400000);
    const when = days < 0 ? `${-days}일 지남` : days === 0 ? '오늘' : `${days}일 남음`;
    return `  - ${c.title} · ${mdLabel(c.deadline)} (${when})`;
  });
}

// 🟢일정은 목록(rows)에 안 들어가서, 완료해도 '최근 완료'에 한 번도 잡히지 않았다.
// 한 일을 돌아볼 때 약속·일정도 같이 봐야 하므로 할일·태스크와 같은 모양으로 바꿔 합친다.
// (완료한 일정은 [🟢 일정] 섹션에서 빠지므로, 여기가 유일하게 보이는 자리다)
function doneScheduleRows(items) {
  return (items ?? [])
    .filter(it => it.type === 'schedule' && (it.status === 'done' || it.completed))
    .map(it => ({
      title: it.title,
      cat: null,
      completedAt: it.completedAt ?? null,
      time: it.time || null,
      isSchedule: true,
    }));
}

function buildSummaryText(rows, items, categories, dayKeys) {
  const { today } = dayKeys;
  const LABEL = { overdue: '🔴 지난 (놓친 일정)', yesterday: '🟠 어제 (놓친 일정)', today: '📌 오늘', tomorrow: '📅 내일', week: '📆 이번 주', later: '⏳ 나중에', unplanned: '📥 미정' };
  const STATUS_LABEL = { todo: '안 함', doing: '하는 중', done: '완료' };
  const PRIO_LABEL = ['', '낮음', '보통', '높음'];
  const grouped = { overdue: [], yesterday: [], today: [], tomorrow: [], week: [], later: [], unplanned: [] };
  rows
    // 취소한 일은 '안 하기로 한 것'이라 앞으로의 계획에도, 최근 완료에도 넣지 않는다
    .filter(r => !isArchived(r.status))
    .forEach(r => {
      const b = dateBucket(r, dayKeys);
      if (grouped[b]) grouped[b].push(r);
    });
  // 완료를 누른 시각(completedAt) 기준으로 최근 3일(그제·어제·오늘)만 추린다.
  // 시각이 없는 항목은 이 기능이 생기기 전에 완료된 것이라 판단할 수 없어 제외한다.
  const [ry, rm, rd] = addDays(today, -2).split('-').map(Number);
  const recentFrom = new Date(ry, rm - 1, rd).toISOString(); // 그제 자정(로컬) 기준
  const doneAll = [...rows.filter(r => r.status === 'done'), ...doneScheduleRows(items)];
  const doneRows = doneAll
    .filter(r => r.completedAt && r.completedAt >= recentFrom)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const doneOmitted = doneAll.length - doneRows.length;
  const lines = [];
  lines.push(`=== 일정·할일 현황 (${today}) ===`);
  const scheduleLines = buildScheduleLines(items, today);
  lines.push('\n[🟢 일정] (오늘~모레)');
  if (scheduleLines) lines.push(...scheduleLines);
  else lines.push('  (없음)');
  const catDeadlineLines = buildCategoryDeadlineLines(categories, today);
  if (catDeadlineLines) {
    lines.push('\n[🏁 카테고리 마감]');
    lines.push(...catDeadlineLines);
  }
  Object.entries(grouped).forEach(([key, list]) => {
    if (!list.length && key !== 'today') return;
    lines.push(`\n[${LABEL[key]}] (${list.length}개)`);
    if (!list.length) { lines.push('  (비어 있음)'); return; }
    list.forEach(r => {
      const prio = r.priority ? ` [중요도:${PRIO_LABEL[r.priority]}]` : '';
      const cat = r.cat ? ` #${r.cat.name}` : '';
      const exp = r.expected ? ` 계획:${r.expected}` : '';
      const due = r.due ? ` 마감:${r.due}` : '';
      lines.push(`  - [${STATUS_LABEL[r.status]}] ${r.title}${cat}${prio}${exp}${due}`);
    });
  });
  if (doneRows.length) {
    lines.push(`\n[✅ 최근 완료] (최근 3일, ${doneRows.length}개)`);
    doneRows.forEach(r => {
      const cat = r.cat ? ` #${r.cat.name}` : '';
      // 일정은 할일과 성격이 달라서(약속·행사) 구분해 두면 읽는 쪽이 헷갈리지 않는다
      const mark = r.isSchedule ? '🟢 ' : '';
      const time = r.isSchedule && r.time ? ` (${r.time})` : '';
      // completedAt 은 UTC ISO 라서 앞 10자를 그냥 자르면 새벽 시간대에 날짜가 하루 밀린다
      const when = mdLabel(toDateString(new Date(r.completedAt)));
      lines.push(`  - ${when} ${mark}${r.title}${cat}${time}`);
    });
  } else {
    lines.push('\n[✅ 최근 완료] (최근 3일, 0개)');
  }
  if (doneOmitted > 0) {
    lines.push(`  (그 밖의 완료 ${doneOmitted}개는 3일 밖이거나 완료 시각이 기록되기 전 항목이라 생략)`);
  }
  return lines.join('\n');
}

export default function ListView({
  items, projects,
  onItemClick, onSetItemStatus, onSetItemPriority, onSetItemProject,
  onAddItem, onUpdateItem, onDeleteItem,
  onEditProject, onSaveProject,
  onAddCategory, onCompleteCategory, onUncompleteCategory, onDeleteCategory, onReorderCategories,
}) {
  const dayKeys = useDayKeys();
  const [copied, setCopied] = useState(false);

  // 4.5초 뒤 실행되는 삭제 타이머처럼, 나중에 실행되는 코드가
  // 그 사이 바뀐 최신 카테고리를 읽을 수 있게 미러를 둔다.
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const { today: TODAY, tomorrow: TOMORROW } = dayKeys;
  const [filter, setFilterRaw] = useState(null); // null(전체) | 'done' | 'cancelled' | projectId
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

  const copySummary = () => {
    // 완료 처리한 카테고리는 아카이브 취급이라 화면에서도 숨기므로 공유에서도 제외한다
    // (할일·태스크뿐 아니라 일정과 카테고리 마감도 같은 기준으로 뺀다)
    const liveItems = items.filter(i => !i.projectId || !doneCatIds.has(i.projectId));
    const text = buildSummaryText(rows.filter(r => !inDoneCat(r)), liveItems, activeCats, dayKeys);
    // 클립보드는 보안 컨텍스트(https/localhost)와 권한이 필요해서 실패할 수 있다.
    // 조용히 넘어가면 눌러도 아무 일도 없는 것처럼 보이므로 알려준다.
    navigator.clipboard?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error('[copySummary]', err);
        window.alert('클립보드 복사에 실패했어요. 브라우저의 클립보드 권한을 확인해 주세요.');
      });
  };

  const doneCount = rows.filter(r => r.status === 'done' && !inDoneCat(r)).length;
  const cancelledCount = rows.filter(r => r.status === 'cancelled' && !inDoneCat(r)).length;
  const catCounts = {};
  rows.forEach(r => { if (r.cat && !isArchived(r.status)) catCounts[r.cat.id] = (catCounts[r.cat.id] ?? 0) + 1; });

  const viewingDone = filter === 'done';
  const viewingCancelled = filter === 'cancelled';
  const viewingArchive = viewingDone || viewingCancelled;

  // 최근 것이 위로. 완료 시각이 있으면 그걸 쓰고, 없는(옛·취소) 항목은 날짜로 폴백한다.
  const doneSortKey = (r) => r.completedAt || r.expected || r.due || '0000';
  const archiveRows = rows
    .filter(r => r.status === (viewingCancelled ? 'cancelled' : 'done') && !inDoneCat(r))
    .sort((a, b) => doneSortKey(b).localeCompare(doneSortKey(a)));

  // 보관 목록은 카테고리별로 묶어서 표시
  const doneByCategory = [];
  {
    const map = new Map();
    archiveRows.forEach(r => {
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
        .filter(r => isArchived(r.status) && r.cat && r.cat.id === filter)
        .sort((a, b) => {
          const da = a.expected || a.due || '0';
          const db = b.expected || b.due || '0';
          return da < db ? 1 : da > db ? -1 : 0;
        })
    : [];

  const passFilter = r => {
    // 완료된 카테고리 항목은 그 카테고리를 직접 선택했을 때만 보임
    if (inDoneCat(r) && filter !== r.cat.id) return false;
    // 방금 완료·취소로 바꾼 행은 잘못 눌렀을 때 되돌릴 수 있게 잠시 제자리에 남긴다
    if (isArchived(r.status) && !justDone.has(r.key)) return false;
    if (filter === null) return true;
    return r.cat && r.cat.id === filter;
  };

  const grouped = { overdue: [], yesterday: [], today: [], tomorrow: [], week: [], later: [], unplanned: [] };
  rows.filter(passFilter).forEach(r => {
    const b = dateBucket(r, dayKeys);
    if (grouped[b]) grouped[b].push(r);
  });
  // 항상 자동정렬: 중요도(높음→낮음) → 날짜(빠른 것 먼저).
  // 예전엔 드래그로 지정한 수동 순서(sortOrder)가 중간에 끼어 같은 중요도끼리 고정됐는데,
  // 자동정렬이 안 되는 것처럼 느껴져서 정렬에서 뺐다. (DB 의 sort_order 값은 그대로 둠)
  // 완전히 같은 조건이면 Array.sort 가 안정 정렬이라 만든 순서가 유지된다.
  Object.values(grouped).forEach(list => {
    list.sort((a, b) => {
      if (isArchived(a.status) !== isArchived(b.status)) return isArchived(a.status) ? 1 : -1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const da = a.expected || a.due || '9999-99-99';
      const db = b.expected || b.due || '9999-99-99';
      return da < db ? -1 : da > db ? 1 : 0;
    });
  });

  const setRowStatus = (r, status) => {
    if (r.kind === 'item') { onSetItemStatus(r.raw.id, status); return; }
    // 태스크는 projects.tasks JSON 안에 있으므로 컬럼 추가 없이 완료 시각을 같이 담는다
    const done = status === 'done';
    const keep = done && r.raw.task.status === 'done' && r.raw.task.completedAt;
    patchTask(r, {
      status: TASK_STATUS_MAP[status],
      completedAt: keep ? r.raw.task.completedAt : (done ? new Date().toISOString() : null),
    });
  };
  const changeStatus = (r, status) => {
    setRowStatus(r, status);
    setJustDone(prev => {
      const n = new Set(prev);
      if (isArchived(status)) n.add(r.key); else n.delete(r.key);
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
    if (r.kind === 'item') { onSetItemProject(r.raw.id, projectId); return; }
    // 프로젝트 태스크: 다른 카테고리(프로젝트)로 이동
    const from = r.raw.project;
    const task = r.raw.task;
    if (!projectId || String(projectId) === String(from.id)) return;
    const to = projects.find(p => String(p.id) === String(projectId));
    if (!to) return;
    onSaveProject(from.id, { ...from, tasks: (from.tasks ?? []).filter(t => t.id !== task.id) });
    onSaveProject(to.id, { ...to, tasks: [...(to.tasks ?? []), task] });
  };
  const reorderCats = (toId, fromIdArg) => {
    const fromId = fromIdArg ?? dragCat;
    setDragCat(null);
    setDragOverCat(null);
    if (fromId == null || !onReorderCategories) return;
    const arr = [...activeCats];
    const fi = arr.findIndex(p => String(p.id) === String(fromId));
    const ti = arr.findIndex(p => String(p.id) === String(toId));
    if (fi < 0 || ti < 0 || fi === ti) return;
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
  // 프로젝트 태스크를 하나씩 저장하면 저장할 때마다 태스크 배열 전체를 같은(낡은) 값으로
  // 덮어써서 마지막 하나만 반영된다 → 카테고리별로 모아 한 번에 반영한다.
  const patchTasksBulk = (taskRows, patchOf) => {
    const byProject = new Map();
    taskRows.forEach(r => {
      const p = r.raw.project;
      if (!byProject.has(p.id)) byProject.set(p.id, { project: p, ids: new Set() });
      byProject.get(p.id).ids.add(r.raw.task.id);
    });
    byProject.forEach(({ project, ids }) => {
      const tasks = (project.tasks ?? []).map(t => (ids.has(t.id) ? { ...t, ...patchOf(t) } : t));
      onSaveProject(project.id, { ...project, tasks });
    });
  };

  // 계획일을 지워 '미정'으로 보낸다.
  // 마감일은 이미 지난 것만 지운다 — 아직 안 지난 마감일(예: 자소서 14일 마감)까지 지우면
  // 사용자가 적어 둔 기한이 조용히 사라진다. 그런 항목은 마감일 기준 그룹으로 옮겨 간다.
  const clearOverdue = (list) => {
    if (!list.length) return;
    const keepDue = list.filter(r => r.due && r.due >= TODAY).length;
    const note = keepDue > 0
      ? `\n(아직 안 지난 마감일 ${keepDue}개는 그대로 둬서, 그 항목은 마감일 그룹으로 옮겨져요)`
      : '\n(항목은 그대로 남아요)';
    if (!window.confirm(`지난 항목 ${list.length}개의 계획일을 지울까요?${note}`)) return;
    list.filter(r => r.kind === 'item').forEach(r => {
      const patch = { date: '' };
      if (r.due && r.due < TODAY) patch.dueDate = '';
      onUpdateItem(r.raw.id, patch);
    });
    patchTasksBulk(list.filter(r => r.kind === 'task'), t => (
      t.deadline && t.deadline < TODAY ? { planned: '', deadline: '' } : { planned: '' }
    ));
  };

  // 지난/어제 항목을 오늘로 다시 잡기.
  // 마감일이 지난 채로 남으면 그룹 분류상 계속 '지난'에 남으므로,
  // 이미 지나간 마감일만 오늘로 맞춘다 (아직 안 지난 마감일은 그대로 둔다).
  const moveOverdueToToday = (list) => {
    if (!list.length) return;
    const pastDue = list.filter(r => r.due && r.due < TODAY).length;
    const note = pastDue > 0
      ? `\n(계획일을 오늘로 옮기고, 이미 지난 마감일 ${pastDue}개도 오늘로 맞춥니다)`
      : '\n(계획일만 오늘로 옮기고 마감일은 그대로 둡니다)';
    if (!window.confirm(`지난 항목 ${list.length}개를 오늘로 옮길까요?${note}`)) return;
    list.filter(r => r.kind === 'item').forEach(r => {
      const patch = { date: TODAY };
      if (r.due && r.due < TODAY) patch.dueDate = TODAY;
      onUpdateItem(r.raw.id, patch);
    });
    patchTasksBulk(list.filter(r => r.kind === 'task'), t => (
      t.deadline && t.deadline < TODAY
        ? { planned: TODAY, deadline: TODAY }
        : { planned: TODAY }
    ));
  };
  const deleteRow = r => {
    if (r.kind === 'item') { onDeleteItem(r.raw.id); return; }
    // 되돌리기 대기(4.5초) 뒤에 실행되므로, 클릭 당시 스냅샷이 아니라 지금의 카테고리를 기준으로
    // 태스크를 지운다. (같은 카테고리 태스크를 연달아 지우면 먼저 지운 게 되살아났다)
    const snapshot = r.raw.project;
    const current = projectsRef.current.find(p => String(p.id) === String(snapshot.id)) ?? snapshot;
    onSaveProject(current.id, { ...current, tasks: (current.tasks ?? []).filter(t => t.id !== r.raw.task.id) });
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

  // 빠른추가가 카테고리를 안 고르면 지금 보고 있는 카테고리를 기본으로 쓴다
  const quickAddDefaultCat = filter && projects.some(p => p.id === filter) ? filter : null;
  const quickAddCreateCat = async (name) => onAddCategory(name, pickNewCatColor(projects));

  const quickAdd = (groupKey, title, extra) => {
    const projectId = extra && 'projectId' in extra ? extra.projectId : quickAddDefaultCat;
    const priority = extra?.priority ?? 0;
    // 날짜를 직접 고르면 그 값 사용, 안 고르면 그룹 기본 날짜(오늘/내일), 그 외엔 미정('')
    const groupDate = groupKey === 'today' ? TODAY : groupKey === 'tomorrow' ? TOMORROW : '';
    const date = (extra && extra.expected) || groupDate;
    const dueDate = (extra && extra.due) || '';
    onAddItem({ type: 'todo', title, date, dueDate, timeSlot: 'all', projectId, priority });
  };

  // 완료 처리한 카테고리의 항목은 아카이브 취급이므로 마감 안내 줄에서도 제외한다
  const dueOnly = rows
    .filter(r => r.due && !r.expected && !isArchived(r.status) && !inDoneCat(r))
    .sort((a, b) => (a.due < b.due ? -1 : 1));

  const datePill = (r, field) => {
    const isExpected = field === 'expected';
    const val = isExpected ? r.expected : r.due;
    const label = isExpected ? '계획일' : '마감일';
    const icon = isExpected ? '🗓' : '📕';
    const soon = !isExpected && val && val <= addDays(TODAY, 1) && !isArchived(r.status);
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
            today={TODAY}
            onChange={v => setRowDate(r, field, v)}
            onClose={() => setDatePop(null)}
          />
        )}
      </span>
    );
  };

  const renderRow = (r) => {
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
      <div
        className={`lv-row ${r.status === 'done' ? 'lv-row--done' : ''} ${r.status === 'cancelled' ? 'lv-row--cancelled' : ''}`}
        key={r.key}
      >
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
                hideNone={r.kind === 'task'}
                onPick={id => setRowCategory(r, id)}
                onCreate={async name => { const id = await onAddCategory(name, pickNewCatColor(projects)); if (id) setRowCategory(r, id); setCatPop(null); }}
                onClose={() => setCatPop(null)}
              />
            )}
          </span>
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="btn btn--ghost"
            onClick={copySummary}
            title="지금 상황(일정·할일·마감·최근 완료)을 텍스트로 정리해 클립보드에 복사"
            style={{ fontSize: '13px' }}
          >
            {copied ? '✅ 복사됨!' : '📋 현황 복사'}
          </button>
          <button className="btn btn--primary" onClick={() => onItemClick(null)}>+ 새 할일</button>
        </div>
      </div>

      <div className="lv-cats">
        <button className={`lv-cat ${filter === null ? 'lv-cat--on' : ''}`} onClick={() => setFilter(null)}>전체</button>
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
              onDragStart={e => {
                setDragCat(p.id);
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', String(p.id)); } catch { /* noop */ }
              }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragCat && dragCat !== p.id) setDragOverCat(p.id); }}
              onDragLeave={() => setDragOverCat(o => (o === p.id ? null : o))}
              onDrop={e => {
                e.preventDefault();
                const fromId = dragCat ?? e.dataTransfer.getData('text/plain');
                reorderCats(p.id, fromId);
              }}
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

        <button
          className={`lv-cat lv-cat--muted ${viewingDone ? 'lv-cat--on' : ''}`}
          onClick={() => setFilter(viewingDone ? null : 'done')}
        >✓ 완료 <span className="lv-cat-ct">{doneCount}</span></button>

        {(cancelledCount > 0 || viewingCancelled) && (
          <button
            className={`lv-cat lv-cat--muted ${viewingCancelled ? 'lv-cat--on' : ''}`}
            onClick={() => setFilter(viewingCancelled ? null : 'cancelled')}
          >✕ 취소 <span className="lv-cat-ct">{cancelledCount}</span></button>
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

      {viewingArchive ? (
        archiveRows.length === 0
          ? <div className="lv-empty">{viewingCancelled ? '취소한 항목이 없습니다' : '완료한 항목이 없습니다'}</div>
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
          <div className="lv-quicktop">
            <QuickAdd
              withDates
              placeholder="할 일 추가 — 날짜 안 고르면 미정으로…"
              onAdd={(t, extra) => quickAdd('unplanned', t, extra)}
              categories={activeCats}
              defaultProjectId={quickAddDefaultCat}
              onCreateCategory={quickAddCreateCat}
            />
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
            if ((g.key === 'overdue' || g.key === 'yesterday') && list.length === 0) return null;
            return (
              <div className="lv-group" key={g.key}>
                <div className={`lv-group-h ${g.warn ? 'lv-group-h--warn' : ''}`}>
                  <b>{g.label}</b><span className="lv-group-ct">{list.length}</span>
                  {(g.key === 'overdue' || g.key === 'yesterday') && list.length > 0 && (
                    <>
                      <button className="lv-group-action" onClick={() => moveOverdueToToday(list)}>
                        전부 오늘로
                      </button>
                      <button className="lv-group-action lv-group-action--next" onClick={() => clearOverdue(list)}>
                        전부 미정으로
                      </button>
                    </>
                  )}
                </div>
                {list.map(r => renderRow(r))}
                {list.length === 0 && g.key !== 'unplanned' && <div className="lv-empty">비어 있음</div>}
                {g.add && (
                  <QuickAdd
                    placeholder={
                      g.key === 'today' ? '오늘 할 일 한 줄로 추가…' :
                      g.key === 'tomorrow' ? '내일 할 일 한 줄로 추가…' :
                      g.key === 'week' ? '이번 주 안에 할 일…' :
                      g.key === 'later' ? '나중에 할 일…' :
                      '제목만 적어두기 (날짜는 나중에)…'
                    }
                    onAdd={(t, extra) => quickAdd(g.key, t, extra)}
                    categories={activeCats}
                    defaultProjectId={quickAddDefaultCat}
                    onCreateCategory={quickAddCreateCat}
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
