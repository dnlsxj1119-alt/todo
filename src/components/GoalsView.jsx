import { useMemo, useState } from 'react';
import { toDateString, getMonthKey } from '../utils/dateUtils';
import { getProjectType } from '../utils/projectTypes';
import { habitAppliesToDate } from '../hooks/useHabits';

// '목표' 탭 — 왼쪽은 이번 달, 오른쪽은 언젠가 꼭.
// 핵심: 진행 숫자를 손으로 세지 않는다. 연결한 프로젝트(카테고리)의 태스크,
// 연결한 습관의 이번 달 체크 수에서 자동으로 채운다. 연결이 없으면 직접 입력.

function catColor(p) {
  return p?.color || getProjectType(p?.type).border;
}

function mdLabel(ds) {
  const [, m, d] = ds.split('-');
  return `${+m}/${+d}`;
}

// '언젠가 꼭' 의 기한은 자유 입력이라 ('올해', '내년', '2027', '2027년 3월', '2026-12', '5월')
// 정렬용으로 연·월만 뽑아 숫자 하나로 만든다. 읽을 수 없으면 맨 뒤로 보낸다 —
// 기한을 안 적은 것까지 앞에 끼어들면 '가까운 것부터' 라는 순서가 깨진다.
const HORIZON_FAR = 999913; // 연도 9999 = 맨 뒤
function horizonRank(raw, baseYear) {
  const s = String(raw ?? '').trim();
  if (!s) return HORIZON_FAR;

  let year = null;
  const y4 = s.match(/(?:19|20)\d{2}/);
  if (y4) year = Number(y4[0]);
  else if (/내후년/.test(s)) year = baseYear + 2;
  else if (/내년|다음\s*해/.test(s)) year = baseYear + 1;
  else if (/올해|금년|이번\s*해/.test(s)) year = baseYear;
  else {
    const rel = s.match(/(\d{1,2})\s*년\s*(?:뒤|후|안|내)/);
    if (rel) year = baseYear + Number(rel[1]);
  }

  let month = 0;
  const ym = s.match(/(?:19|20)\d{2}\s*[-./년]\s*(\d{1,2})/);
  if (ym) month = Number(ym[1]);
  else {
    const mo = s.match(/(\d{1,2})\s*월/);
    if (mo) month = Number(mo[1]);
  }
  if (month < 1 || month > 12) month = 0;

  if (year == null) {
    if (!month) return HORIZON_FAR; // 연도도 달도 없는 말 ('언젠가', '죽기 전에')
    year = baseYear;                // 달만 적었으면 올해로 본다
  }
  // 연도만 적힌 것은 그 해의 구체적인 달들보다 뒤 (13월 취급)
  return year * 100 + (month || 13);
}

// 이번 달의 1일과 말일
function monthBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = `${monthKey}-01`;
  const last = toDateString(new Date(y, m, 0));
  return { first, last };
}

// 목표 하나의 진행률과 '쌓인 것'을 계산한다.
// 출처 우선순위: 연결한 프로젝트 → 연결한 습관 → 직접 입력.
function computeProgress(goal, projects, habits, items, monthKey) {
  const { first, last } = monthBounds(monthKey);

  if (goal.projectId != null) {
    const p = projects.find(x => String(x.id) === String(goal.projectId));
    if (p) {
      const tasks = p.tasks ?? [];
      const done = tasks.filter(t => t.status === 'done').length;
      // 그 카테고리에 속한 완료 항목도 '쌓인 것' 에 함께 보여준다
      const doneItems = (items ?? [])
        .filter(it => String(it.projectId ?? '') === String(p.id)
          && (it.status === 'done' || it.completed) && it.completedAt)
        .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
      const evidence = [
        ...tasks.filter(t => t.status === 'done' && t.completedAt)
          .map(t => ({ key: `t-${t.id}`, at: t.completedAt, text: t.label })),
        ...doneItems.map(it => ({ key: `i-${it.id}`, at: it.completedAt, text: it.title })),
      ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return {
        source: 'project',
        color: catColor(p),
        label: p.title,
        done,
        total: tasks.length,
        evidence,
      };
    }
  }

  if (goal.habitId != null) {
    const h = (habits ?? []).find(x => String(x.id) === String(goal.habitId));
    if (h) {
      const dates = (h.completedDates ?? [])
        .filter(d => d >= first && d <= last)
        .sort((a, b) => b.localeCompare(a));
      // 분모: 직접 정한 목표치가 있으면 그것, 없으면 이번 달에 그 습관이 해당되는 날 수
      let total = goal.target ?? 0;
      if (!total) {
        total = 0;
        const [y, m] = monthKey.split('-').map(Number);
        const end = new Date(y, m, 0).getDate();
        for (let d = 1; d <= end; d++) {
          const ds = `${monthKey}-${String(d).padStart(2, '0')}`;
          if (habitAppliesToDate(h, ds)) total += 1;
        }
      }
      return {
        source: 'habit',
        color: h.color || '#639922',
        label: h.title,
        done: dates.length,
        total,
        evidence: dates.map(d => ({ key: `h-${d}`, at: d, text: h.title })),
      };
    }
  }

  return {
    source: 'manual',
    color: null,
    label: '',
    done: goal.current ?? 0,
    total: goal.target ?? 0,
    evidence: [],
  };
}

// 쌓인 것의 날짜 표시 — completedAt 은 UTC ISO 라서 앞 10자를 자르면 새벽에 하루 밀린다
function evDate(at) {
  if (!at) return '';
  return at.length === 10 ? mdLabel(at) : mdLabel(toDateString(new Date(at)));
}

function AddForm({ kind, onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('');
  const [horizon, setHorizon] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    onAdd(kind === 'someday'
      ? { title: t, kind, area: area.trim(), horizon: horizon.trim() }
      : { title: t, kind });
    setTitle('');
    setArea('');
    setHorizon('');
  };
  return (
    <form className="gv-add-form" onSubmit={submit}>
      <input
        className="gv-add-input"
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={kind === 'someday' ? '언젠가 꼭 하고 싶은 것' : '이번 달에 이루고 싶은 것'}
      />
      {kind === 'someday' && (
        <div className="gv-add-row">
          <input className="gv-add-input gv-add-input--sm" value={area}
            onChange={e => setArea(e.target.value)} placeholder="분류 (여행·커리어…)" />
          <input className="gv-add-input gv-add-input--sm" value={horizon}
            onChange={e => setHorizon(e.target.value)} placeholder="기한 (올해·2027…)" />
        </div>
      )}
      <div className="gv-add-actions">
        <button type="submit" className="btn btn--primary">추가</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>취소</button>
      </div>
    </form>
  );
}

function GoalRow({ goal, prog, projects, habits, expanded, onToggleExpand, onUpdate, onDelete, onDone, onSendToTodo }) {
  const pct = prog.total > 0 ? Math.min(100, Math.round((prog.done / prog.total) * 100)) : 0;
  const done = !!goal.completedAt;
  return (
    <div className={`gv-goal ${done ? 'gv-goal--done' : ''}`} style={prog.color ? { '--goal-color': prog.color } : undefined}>
      <button className="gv-goal-top" onClick={onToggleExpand} aria-expanded={expanded}>
        <span className="gv-goal-name">{goal.title}</span>
        <span className="gv-goal-n">{prog.total > 0 ? `${prog.done}/${prog.total}` : '—'}</span>
      </button>
      <div className="gv-bar"><i style={{ width: `${pct}%` }} /></div>
      <div className="gv-goal-foot">
        {prog.source !== 'manual' && (
          <span className="gv-proj"><i />{prog.label}</span>
        )}
      </div>

      {expanded && (
        <div className="gv-detail">
          <input
            className="gv-detail-input"
            value={goal.why}
            onChange={e => onUpdate(goal.id, { why: e.target.value })}
            placeholder="왜 하고 싶은지 한 줄 (선택)"
          />

          <div className="gv-detail-row">
            <label className="gv-detail-label" htmlFor={`gv-proj-${goal.id}`}>프로젝트 연결</label>
            <select
              id={`gv-proj-${goal.id}`}
              className="gv-detail-select"
              value={goal.projectId == null ? '' : String(goal.projectId)}
              onChange={e => {
                const v = e.target.value;
                onUpdate(goal.id, {
                  projectId: v === '' ? null : (projects.find(p => String(p.id) === v)?.id ?? null),
                  habitId: v === '' ? goal.habitId : null,
                });
              }}
            >
              <option value="">없음 (직접 입력)</option>
              {projects.map(p => <option key={p.id} value={String(p.id)}>{p.title}</option>)}
            </select>
          </div>

          <div className="gv-detail-row">
            <label className="gv-detail-label" htmlFor={`gv-habit-${goal.id}`}>습관 연결</label>
            <select
              id={`gv-habit-${goal.id}`}
              className="gv-detail-select"
              value={goal.habitId == null ? '' : String(goal.habitId)}
              onChange={e => {
                const v = e.target.value;
                onUpdate(goal.id, { habitId: v === '' ? null : v, projectId: v === '' ? goal.projectId : null });
              }}
            >
              <option value="">없음</option>
              {(habits ?? []).map(h => <option key={h.id} value={String(h.id)}>{h.title}</option>)}
            </select>
          </div>

          {/* 프로젝트 연결이면 분모가 태스크 수라 정할 게 없다.
              습관 연결이면 분자는 체크 수에서 오고 분모(예: 주 3회 → 12)만 정한다.
              연결이 없으면 분자·분모 둘 다 직접 적는다. */}
          {prog.source === 'manual' && (
            <div className="gv-detail-row">
              <label className="gv-detail-label">직접 입력</label>
              <div className="gv-nums">
                <input type="number" min="0" className="gv-num" value={goal.current}
                  onChange={e => onUpdate(goal.id, { current: Number(e.target.value) || 0 })} />
                <span className="gv-num-sep">/</span>
                <input type="number" min="0" className="gv-num" value={goal.target ?? ''}
                  placeholder="목표치"
                  onChange={e => onUpdate(goal.id, { target: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
            </div>
          )}

          {prog.source === 'habit' && (
            <div className="gv-detail-row">
              <label className="gv-detail-label" htmlFor={`gv-target-${goal.id}`}>이번 달 목표치</label>
              <div className="gv-nums">
                <input id={`gv-target-${goal.id}`} type="number" min="0" className="gv-num"
                  value={goal.target ?? ''}
                  placeholder="12"
                  onChange={e => onUpdate(goal.id, { target: e.target.value === '' ? null : Number(e.target.value) })} />
                <span className="gv-num-hint">회 · 비우면 이번 달에 그 습관이 해당되는 날 수</span>
              </div>
            </div>
          )}

          {prog.evidence.length > 0 && (
            <div className="gv-ev">
              <div className="gv-ev-label">
                쌓인 것 · {prog.source === 'habit' ? '습관에서 자동' : `${prog.label}에서 자동`}
              </div>
              {prog.evidence.slice(0, 6).map(e => (
                <div className="gv-ev-row" key={e.key}>
                  <span className="gv-ev-check">✓</span>
                  <time>{evDate(e.at)}</time>
                  <span>{e.text}</span>
                </div>
              ))}
              {prog.evidence.length > 6 && (
                <div className="gv-ev-more">그 밖에 {prog.evidence.length - 6}개</div>
              )}
            </div>
          )}

          <div className="gv-detail-foot">
            {/* 입력은 글자마다 바로 저장되지만, 다 고쳤을 때 닫을 곳이 없어서 따로 뒀다 */}
            <button className="gv-mini gv-mini--close" onClick={onToggleExpand}>✓ 수정 완료</button>
            <button className="gv-mini gv-mini--go" onClick={() => onSendToTodo(goal)}>＋ 할일로 보내기</button>
            <button className="gv-mini" onClick={() => onDone(goal.id, !done)}>
              {done ? '되돌리기' : '이룸'}
            </button>
            <button className="gv-mini" onClick={() => onUpdate(goal.id, {
              kind: goal.kind === 'someday' ? 'month' : 'someday',
              month: goal.kind === 'someday' ? getMonthKey(new Date()) : '',
            })}>
              {goal.kind === 'someday' ? '이번 달로 올리기' : '언젠가로 내리기'}
            </button>
            <button className="gv-mini gv-mini--danger" onClick={() => onDelete(goal.id)}>삭제</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SomedayRow({ goal, expanded, onToggleExpand, onUpdate, onDelete, onDone, onSendToTodo }) {
  const done = !!goal.completedAt;
  return (
    <div className={`gv-some ${done ? 'gv-some--done' : ''}`}>
      <button className="gv-some-top" onClick={onToggleExpand} aria-expanded={expanded}>
        <span className="gv-some-mark">{done ? '✓' : '🔖'}</span>
        <span className="gv-some-body">
          <span className="gv-some-t">{goal.title}</span>
          {(goal.area || goal.horizon) && (
            <span className="gv-some-s">
              {goal.area}
              {goal.area && goal.horizon && <span className="gv-sep">·</span>}
              {goal.horizon}
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="gv-detail">
          <input className="gv-detail-input" value={goal.why}
            onChange={e => onUpdate(goal.id, { why: e.target.value })}
            placeholder="왜 하고 싶은지 한 줄 (선택)" />
          <div className="gv-detail-row">
            <label className="gv-detail-label" htmlFor={`gv-area-${goal.id}`}>분류 / 기한</label>
            <div className="gv-nums">
              <input id={`gv-area-${goal.id}`} className="gv-detail-select" value={goal.area}
                onChange={e => onUpdate(goal.id, { area: e.target.value })} placeholder="여행·커리어…" />
              <input className="gv-detail-select" value={goal.horizon}
                onChange={e => onUpdate(goal.id, { horizon: e.target.value })} placeholder="올해·2027…" />
            </div>
          </div>
          <div className="gv-detail-foot">
            {/* 입력은 글자마다 바로 저장되지만, 다 고쳤을 때 닫을 곳이 없어서 따로 뒀다 */}
            <button className="gv-mini gv-mini--close" onClick={onToggleExpand}>✓ 수정 완료</button>
            <button className="gv-mini gv-mini--go" onClick={() => onSendToTodo(goal)}>＋ 할일로 보내기</button>
            <button className="gv-mini" onClick={() => onDone(goal.id, !done)}>{done ? '되돌리기' : '이룸'}</button>
            <button className="gv-mini" onClick={() => onUpdate(goal.id, { kind: 'month', month: getMonthKey(new Date()) })}>
              이번 달로 올리기
            </button>
            <button className="gv-mini gv-mini--danger" onClick={() => onDelete(goal.id)}>삭제</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GoalsView({
  goals, ready, projects = [], habits = [], items = [],
  onAddGoal, onUpdateGoal, onDeleteGoal, onSetGoalDone, onSendToTodo, onOpenLegacy,
}) {
  const monthKey = getMonthKey(new Date());
  const [adding, setAdding] = useState(null); // 'month' | 'someday' | null
  const [expanded, setExpanded] = useState(null); // goal id
  const [showDoneSomeday, setShowDoneSomeday] = useState(false);

  const monthGoals = useMemo(
    () => goals.filter(g => g.kind !== 'someday' && (!g.month || g.month === monthKey))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [goals, monthKey]);
  // 언젠가 꼭은 손으로 옮긴 순서보다 '언제까지' 가 먼저다 → 기한이 가까운 것부터,
  // 같은 기한이면 넣은 순서대로. 기한을 안 적은 것은 맨 아래.
  const somedayAll = useMemo(() => {
    const baseYear = Number(monthKey.split('-')[0]);
    return goals.filter(g => g.kind === 'someday').sort((a, b) => {
      const ra = horizonRank(a.horizon, baseYear);
      const rb = horizonRank(b.horizon, baseYear);
      if (ra !== rb) return ra - rb;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }, [goals, monthKey]);
  const someday = showDoneSomeday ? somedayAll : somedayAll.filter(g => !g.completedAt);
  const somedayDoneCt = somedayAll.length - somedayAll.filter(g => !g.completedAt).length;

  const progOf = (g) => computeProgress(g, projects, habits, items, monthKey);
  const toggle = (id) => setExpanded(prev => (prev === id ? null : id));

  const monthLabel = `${Number(monthKey.split('-')[1])}월 목표`;

  return (
    <div className="goalsview">
      <div className="gv-head">
        <div className="gv-head-t">
          <h1 className="gv-h1">오늘도 방향을 잃지 않게</h1>
          <p className="gv-h2">할 일 위에 이번 달의 방향과 오래 품은 꿈을 함께 보여줘요.</p>
        </div>
        <button className="btn btn--primary gv-add-btn" onClick={() => setAdding(adding ? null : 'month')}>
          ＋ 추가
        </button>
      </div>

      {!ready && (
        <div className="gv-notready">
          목표 테이블이 아직 없어요. <code>supabase/migrations/20260919_goals.sql</code> 을
          Supabase 대시보드 &gt; SQL Editor 에서 실행하면 바로 쓸 수 있어요.
        </div>
      )}

      <div className="gv-cols">
        {/* 이번 달 */}
        <section className="gv-card">
          <div className="gv-card-head">
            <span className="gv-card-t">{monthLabel}</span>
            <span className="gv-card-meta">{monthGoals.length}개</span>
          </div>

          {adding === 'month' && (
            <AddForm kind="month"
              onAdd={(d) => { onAddGoal({ ...d, month: monthKey }); setAdding(null); }}
              onCancel={() => setAdding(null)} />
          )}

          {monthGoals.length === 0 && adding !== 'month' ? (
            <button className="gv-empty" onClick={() => setAdding('month')}>
              이번 달에 이루고 싶은 것을 하나 적어보세요
            </button>
          ) : monthGoals.map(g => (
            <GoalRow
              key={g.id}
              goal={g}
              prog={progOf(g)}
              projects={projects}
              habits={habits}
              expanded={expanded === g.id}
              onToggleExpand={() => toggle(g.id)}
              onUpdate={onUpdateGoal}
              onDelete={onDeleteGoal}
              onDone={onSetGoalDone}
              onSendToTodo={onSendToTodo}
            />
          ))}

          {monthGoals.length > 0 && adding !== 'month' && (
            <button className="gv-add-more" onClick={() => setAdding('month')}>＋ 이번 달 목표 추가</button>
          )}
        </section>

        {/* 언젠가 꼭 */}
        <section className="gv-card">
          <div className="gv-card-head">
            <span className="gv-card-t">언젠가 꼭 ✦</span>
            {somedayDoneCt > 0 && (
              <button className="gv-card-link" onClick={() => setShowDoneSomeday(v => !v)}>
                {showDoneSomeday ? '진행 중만' : `이룬 것 ${somedayDoneCt}개 보기`}
              </button>
            )}
          </div>

          {adding === 'someday' && (
            <AddForm kind="someday"
              onAdd={(d) => { onAddGoal(d); setAdding(null); }}
              onCancel={() => setAdding(null)} />
          )}

          {someday.length === 0 && adding !== 'someday' ? (
            <button className="gv-empty" onClick={() => setAdding('someday')}>
              기한 없이 오래 품은 것을 적어두세요
            </button>
          ) : someday.map(g => (
            <SomedayRow
              key={g.id}
              goal={g}
              expanded={expanded === g.id}
              onToggleExpand={() => toggle(g.id)}
              onUpdate={onUpdateGoal}
              onDelete={onDeleteGoal}
              onDone={onSetGoalDone}
              onSendToTodo={onSendToTodo}
            />
          ))}

          {adding !== 'someday' && (
            <button className="gv-add-more" onClick={() => setAdding('someday')}>＋ 언젠가 꼭 추가</button>
          )}
        </section>
      </div>

      {/* 예전 데이터는 지우지 않았다 — 언제든 볼 수 있게 남겨 둔다 */}
      <button className="gv-legacy" onClick={onOpenLegacy}>
        예전 &lsquo;이번달 목표&rsquo; 보기 (주차별로 적어둔 것)
      </button>
    </div>
  );
}
