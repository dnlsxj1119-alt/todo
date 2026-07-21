import { useState, useCallback, Component } from 'react';
import { useAuth } from './hooks/useAuth';
import { useItems } from './hooks/useItems';
import LoginPage from './components/LoginPage';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#B91C1C' }}>
          <b>오류 발생:</b> {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
import { useProjects } from './hooks/useProjects';
import { useHabits } from './hooks/useHabits';
import { useMonthlyGoals } from './hooks/useMonthlyGoals';
import { useDailyReflections } from './hooks/useDailyReflections';
import { getWeekStart, toDateString, getMonthKey } from './utils/dateUtils';
import CalendarView from './components/CalendarView';
import WeeklyView from './components/WeeklyView';
import ProjectsView from './components/ProjectsView';
import HabitTracker from './components/HabitTracker';
import MonthlyGoalsView from './components/MonthlyGoalsView';
import DailyReflectionView from './components/DailyReflectionView';
import ReflectionEditorModal from './components/ReflectionEditorModal';
import ItemModal from './components/ItemModal';
import './App.css';

const FILTER_OPTIONS = [
  { key: null,        label: '전체',   emoji: '📋' },
  { key: 'todo',      label: '할일',   emoji: '🟣' },
  { key: 'education', label: '교육',   emoji: '🔵' },
  { key: 'schedule',  label: '일정',   emoji: '🟢' },
];

function SidebarToggleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

export default function App() {
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [goalsMonth, setGoalsMonth] = useState(() => new Date());
  const [reflectionMonth, setReflectionMonth] = useState(() => new Date());
  const [reflectionModalDate, setReflectionModalDate] = useState(null);
  const [filterType, setFilterType] = useState(null);
  const [modal, setModal] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === '1'
  );

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', next ? '1' : '0');
      return next;
    });
  };

  const userId = user?.id;
  const { items, loading, addItem, addRecurringItems, updateItem, deleteItem, toggleComplete, moveItem, getItemsForDate, getItemsForCell, getBacklogItems } = useItems(userId);
  const { projects, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus, reorderProjects, togglePin } = useProjects(userId);
  const { habits, archivedHabits, addHabit, updateHabit, deleteHabit, toggleHabitDate, reorderHabits, archiveHabit, restoreHabit } = useHabits(userId);
  const { getForMonth: getMonthlyGoal, updateNotes: updateGoalNotes, addItem: addGoalItem, toggleItem: toggleGoalItem, deleteItem: deleteGoalItem, editItem: editGoalItem, reorderItems: reorderGoalItems } = useMonthlyGoals(userId);
  const {
    getForDate: getReflection,
    addLearning, editLearning, deleteLearning,
    updateBestChoice, updateTomorrowPlan,
    getWeekStats,
    reflectionDates,
  } = useDailyReflections(userId);

  const openReflection = useCallback((ds) => setReflectionModalDate(ds), []);
  const closeReflection = useCallback(() => setReflectionModalDate(null), []);

  const openAdd = useCallback((defaultDate, defaultSlot) => {
    setModal({ mode: 'add', defaultDate, defaultSlot });
  }, []);

  const openEdit = useCallback((item) => {
    setModal({ mode: 'edit', item });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const handleSave = useCallback((data) => {
    if (modal?.mode === 'edit') {
      updateItem(modal.item.id, data);
    } else {
      const merged = { ...data, timeSlot: data.timeSlot || modal?.defaultSlot || 'morning' };
      if (merged.occurrenceDates) {
        addRecurringItems(merged, merged.occurrenceDates);
      } else {
        addItem(merged);
      }
    }
    closeModal();
  }, [modal, addItem, addRecurringItems, updateItem, closeModal]);

  const handleDelete = useCallback((id) => {
    deleteItem(id);
    closeModal();
  }, [deleteItem, closeModal]);

  const addBacklogItem = useCallback((title) => {
    addItem({ type: 'todo', title, date: '', timeSlot: 'all' });
  }, [addItem]);

  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <span>불러오는 중...</span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onGoogleLogin={signInWithGoogle} onEmailLogin={signInWithEmail} onEmailSignup={signUpWithEmail} />;
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <span>데이터 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon"
            onClick={sidebarCollapsed ? toggleSidebar : undefined}
            role={sidebarCollapsed ? 'button' : undefined}
            title={sidebarCollapsed ? '사이드바 펼치기' : undefined}>
            📅
          </div>
          <div>
            <div className="brand-title">플로우</div>
            <div className="brand-sub">일정 &amp; 할일 관리</div>
          </div>
          <button className="sidebar-toggle-btn" onClick={toggleSidebar}
            title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}>
            <SidebarToggleIcon />
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'calendar' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('calendar')}
            title="월간 달력"
          >
            <span className="nav-icon">🗓️</span>
            <span className="nav-label">월간 달력</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'week' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('week')}
            title="주간 일정"
          >
            <span className="nav-icon">📆</span>
            <span className="nav-label">주간 일정</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'projects' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('projects')}
            title="프로젝트"
          >
            <span className="nav-icon">🗂️</span>
            <span className="nav-label">프로젝트</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'habits' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('habits')}
            title="습관 트래커"
          >
            <span className="nav-icon">🎯</span>
            <span className="nav-label">습관 트래커</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'goals' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('goals')}
            title="이번달 목표"
          >
            <span className="nav-icon">📝</span>
            <span className="nav-label">이번달 목표</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'reflection' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('reflection')}
            title="오늘의 회고"
          >
            <span className="nav-icon">💭</span>
            <span className="nav-label">오늘의 회고</span>
          </button>
        </nav>

        {/* Filter */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">필터</div>
          {FILTER_OPTIONS.map(f => (
            <button
              key={String(f.key)}
              className={`filter-btn ${filterType === f.key ? 'filter-btn--active' : ''}`}
              onClick={() => setFilterType(f.key)}
              title={f.label}
            >
              <span>{f.emoji}</span>
              <span className="filter-label">{f.label}</span>
            </button>
          ))}
        </div>

        {/* Add button */}
        <button
          className="sidebar-add-btn"
          onClick={() => openAdd(toDateString(new Date()))}
          title="새 항목 추가"
        >
          <span className="sidebar-add-icon">+</span>
          <span className="sidebar-add-label"> 새 항목 추가</span>
        </button>

        {/* User profile */}
        <div className="sidebar-user">
          {user.user_metadata?.avatar_url && (
            <img className="user-avatar" src={user.user_metadata.avatar_url} alt="프로필" />
          )}
          <div className="user-info">
            <div className="user-name">{user.user_metadata?.name ?? user.email?.replace('@todo-app.local', '')}</div>
          </div>
          <button className="user-signout" onClick={signOut} title="로그아웃">↩</button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <ErrorBoundary key={activeTab}>
        {activeTab === 'calendar' ? (
          <CalendarView
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            getItemsForDate={getItemsForDate}
            onItemClick={openEdit}
            onDayClick={(ds) => openAdd(ds)}
            onDateNumClick={openReflection}
            reflectionDates={reflectionDates}
            onToggle={toggleComplete}
            filterType={filterType}
            projects={projects}
            onProjectClick={() => setActiveTab('projects')}
          />
        ) : activeTab === 'week' ? (
          <WeeklyView
            currentWeek={currentWeek}
            setCurrentWeek={setCurrentWeek}
            items={items}
            getItemsForCell={getItemsForCell}
            onItemClick={openEdit}
            onDayClick={(ds, slot) => openAdd(ds, slot)}
            onToggle={toggleComplete}
            moveItem={moveItem}
            filterType={filterType}
            habits={habits}
            onToggleHabit={toggleHabitDate}
            projects={projects}
            onProjectClick={() => setActiveTab('projects')}
            backlogItems={getBacklogItems()}
            onAddBacklogItem={addBacklogItem}
          />
        ) : activeTab === 'habits' ? (
          <HabitTracker
            habits={habits}
            archivedHabits={archivedHabits}
            onAdd={addHabit}
            onUpdate={updateHabit}
            onDelete={deleteHabit}
            onToggle={toggleHabitDate}
            onReorder={reorderHabits}
            onArchive={archiveHabit}
            onRestore={restoreHabit}
          />
        ) : activeTab === 'goals' ? (
          <MonthlyGoalsView
            currentMonth={goalsMonth}
            setCurrentMonth={setGoalsMonth}
            goal={getMonthlyGoal(getMonthKey(goalsMonth))}
            onUpdateNotes={updateGoalNotes}
            onAddItem={addGoalItem}
            onToggleItem={toggleGoalItem}
            onDeleteItem={deleteGoalItem}
            onEditItem={editGoalItem}
            onReorderItems={reorderGoalItems}
          />
        ) : activeTab === 'reflection' ? (
          <DailyReflectionView
            currentMonth={reflectionMonth}
            setCurrentMonth={setReflectionMonth}
            getReflection={getReflection}
            weekStats={getWeekStats(toDateString(new Date()))}
            onOpenDate={openReflection}
          />
        ) : (
          <ProjectsView
            projects={projects}
            onToggleTask={toggleTask}
            onCycleEmail={cycleEmailStatus}
            onAdd={addProject}
            onEdit={updateProject}
            onDelete={deleteProject}
            onReorder={reorderProjects}
            onTogglePin={togglePin}
          />
        )}
        </ErrorBoundary>
      </main>

      {/* Modal */}
      {modal && (
        <ItemModal
          item={modal.item}
          defaultDate={modal.defaultDate}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={closeModal}
        />
      )}

      {reflectionModalDate && (
        <ReflectionEditorModal
          date={reflectionModalDate}
          setDate={setReflectionModalDate}
          reflection={getReflection(reflectionModalDate)}
          onAddLearning={addLearning}
          onEditLearning={editLearning}
          onDeleteLearning={deleteLearning}
          onUpdateBestChoice={updateBestChoice}
          onUpdateTomorrowPlan={updateTomorrowPlan}
          onClose={closeReflection}
        />
      )}
    </div>
  );
}
