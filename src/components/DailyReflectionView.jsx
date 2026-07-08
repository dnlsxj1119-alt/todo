import { useMemo } from 'react';
import { getMonthGrid, toDateString, isToday, formatMonthYear, DAY_NAMES } from '../utils/dateUtils';

export default function DailyReflectionView({ currentMonth, setCurrentMonth, getReflection, weekStats, onOpenDate }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const todayStr = toDateString(today);

  return (
    <div className="reflection-view">
      <div className="cal-nav">
        <button className="nav-btn" onClick={prevMonth} aria-label="이전 달">‹</button>
        <div className="cal-title-group">
          <h2 className="cal-title">{formatMonthYear(currentMonth)} 회고</h2>
          {!isCurrentMonth && <button className="today-btn" onClick={goToday}>오늘</button>}
        </div>
        <button className="nav-btn" onClick={nextMonth} aria-label="다음 달">›</button>
      </div>

      <div className="refl-toolbar">
        <div className="refl-mini-stats">
          <span className="refl-mini-stat">🏆 이번 주 성과 <b>{weekStats.learningCount}</b></span>
          <span className="refl-mini-stat">🔥 연속 작성 <b>{weekStats.streak}일</b></span>
        </div>
        <button className="refl-add-btn" onClick={() => onOpenDate(todayStr)}>+ 추가하기</button>
      </div>

      <div className="cal-grid cal-grid--header">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className={`cal-day-header ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{d}</div>
        ))}
      </div>

      <div className="cal-grid cal-grid--body">
        {grid.map(({ date, isCurrentMonth: inMonth }) => {
          const ds = toDateString(date);
          const r = getReflection(ds);
          const dow = date.getDay();
          const todayCell = isToday(date);

          // 성과는 있는 만큼 다 보여주고(최대 3개 + 더보기), 없으면 잘한 선택으로 대체
          const VISIBLE_MAX = 3;
          const visibleLearnings = r.learnings.slice(0, VISIBLE_MAX);
          const hiddenCount = r.learnings.length - visibleLearnings.length;
          const showChoiceFallback = r.learnings.length === 0 && r.bestChoice.trim();
          const hasAnyContent = r.learnings.length > 0 || !!r.bestChoice.trim() || !!r.tomorrowPlan.trim();

          return (
            <div
              key={ds}
              className={`cal-cell refl-cell ${!inMonth ? 'cal-cell--other' : ''} ${todayCell ? 'cal-cell--today' : ''} ${dow === 0 ? 'cal-cell--sun' : dow === 6 ? 'cal-cell--sat' : ''}`}
              onClick={() => onOpenDate(ds)}
            >
              <span className={`cal-date-num ${todayCell ? 'today-num' : ''} ${hasAnyContent ? 'cal-date-num--has-reflection' : ''}`}>{date.getDate()}</span>
              {(visibleLearnings.length > 0 || showChoiceFallback) && (
                <div className="refl-cell-body">
                  {visibleLearnings.map(l => (
                    <div key={l.id} className="refl-cell-learn" title={l.text}>✅ {l.text}</div>
                  ))}
                  {hiddenCount > 0 && <div className="refl-cell-more">+{hiddenCount}개</div>}
                  {showChoiceFallback && (
                    <div className="refl-cell-choice" title={r.bestChoice}>⭐ {r.bestChoice}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
