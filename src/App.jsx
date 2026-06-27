import { useState, useCallback } from 'react';
import { useItems } from './hooks/useItems';
import { useProjects } from './hooks/useProjects';
import { getWeekStart, toDateString } from './utils/dateUtils';
import CalendarView from './components/CalendarView';
import WeeklyView from './components/WeeklyView';
import ProjectsView from './components/ProjectsView';
import ItemModal from './components/ItemModal';
import './App.css';

const FILTER_OPTIONS = [
  { key: null,        label: '전체',   emoji: '📋' },
  { key: 'todo',      label: '할일',   emoji: '🟣' },
  { key: 'education', label: '교육',   emoji: '🔵' },
  { key: 'schedule',  label: '일정',   emoji: '🟢' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => new Date(2026, 5, 1));
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date(2026, 5, 23)));
  const [filterType, setFilterType] = useState(null);

  const [modal, setModal] = useState(null);

  const { items, loading, addItem, updateItem, deleteItem, toggleComplete, moveItem, getItemsForDate, getItemsForCell } = useItems();
  const { projects, addProject, updateProject, deleteProject, toggleTask, cycleEmailStatus, reorderProjects } = useProjects();

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
      addItem({ ...data, timeSlot: data.timeSlot || modal?.defaultSlot || 'morning' });
    }
    closeModal();
  }, [modal, addItem, updateItem, closeModal]);

  const handleDelete = useCallback((id) => {
    deleteItem(id);
    closeModal();
  }, [deleteItem, closeModal]);

  const total = items.length;
  const done = items.filter(i => i.completed).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

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

        {/* Progress */}
        <div className="sidebar-progress">
          <div className="progress-header">
            <span className="progress-label">전체 진행률</span>
            <span className="progress-pct">{progress}%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="sidebar-stats">
            <div className="stat-item">
              <span className="stat-num">{total}</span>
              <span className="stat-label">전체</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-num stat-num--done">{done}</span>
              <span className="stat-label">완료</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-num">{total - done}</span>
              <span className="stat-label">진행 중</span>
            </div>
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
      </aside>

      {/* Main */}
      <main className="main-content">
        {activeTab === 'calendar' ? (
          <CalendarView
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            getItemsForDate={getItemsForDate}
            onItemClick={openEdit}
            onDayClick={(ds) => openAdd(ds)}
            onToggle={toggleComplete}
            filterType={filterType}
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
          />
        )}
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
