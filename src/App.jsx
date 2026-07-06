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
import { getWeekStart, toDateString, getMonthKey } from './utils/dateUtils';
import CalendarView from './components/CalendarView';
import WeeklyView from './components/WeeklyView';
import ProjectsView from './components/ProjectsView';
import HabitTracker from './components/HabitTracker';
import MonthlyGoalsView from './components/MonthlyGoalsView';
import ItemModal from './components/ItemModal';
import './App.css';

const FILTER_OPTIONS = [
  { key: null,        label: '전체',   emoji: '📋' },
  { key: 'todo',      label: '할일',   emoji: '🟣' },
  { key: 'education', label: '교육',   emoji: '🔵' },
  { key: 'schedule',  label: '일정',   emoji: '🟢' },
];

export default function App() {
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [goalsMonth, setGoalsMonth] = useState(() => new Date());
  const [filterType, setFilterType] = useState(null);
  const [modal, setModal] = useState(null);

  const userId = user?.id;
  const { items, loading, addItem, addRecurringItems, updateItem, deleteItem, toggleComplete, moveItem, getItemsForDate, getItemsForCell } = useItems(userId);
  const { projects, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus, reorderProjects, togglePin } = useProjects(userId);
  const { habits, addHabit, updateHabit, deleteHabit, toggleHabitDate, reorderHabits } = useHabits(userId);
  const { getForMonth: getMonthlyGoal, updateNotes: updateGoalNotes, addItem: addGoalItem, toggleItem: toggleGoalItem, deleteItem: deleteGoalItem, editItem: editGoalItem, reorderItems: reorderGoalItems } = useMonthlyGoals(userId);

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
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">📅</div>
          <div>
            <div className="brand-title">플로우</div>
            <div className="brand-sub">일정 &amp; 할일 관리</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'calendar' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            <span className="nav-icon">🗓️</span>
            <span>월간 달력</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'week' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('week')}
          >
            <span className="nav-icon">📆</span>
            <span>주간 일정</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'projects' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            <span className="nav-icon">🗂️</span>
            <span>프로젝트</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'habits' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('habits')}
          >
            <span className="nav-icon">🎯</span>
            <span>습관 트래커</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'goals' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveTab('goals')}
          >
            <span className="nav-icon">📝</span>
            <span>이번달 목표</span>
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
            >
              <span>{f.emoji}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Add button */}
        <button
          className="sidebar-add-btn"
          onClick={() => openAdd(toDateString(new Date()))}
        >
          + 새 항목 추가
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
          />
        ) : activeTab === 'habits' ? (
          <HabitTracker
            habits={habits}
            onAdd={addHabit}
            onUpdate={updateHabit}
            onDelete={deleteHabit}
            onToggle={toggleHabitDate}
            onReorder={reorderHabits}
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
    </div>
  );
}
