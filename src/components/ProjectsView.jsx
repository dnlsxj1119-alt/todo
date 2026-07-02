import { useState } from 'react';
import ProjectModal from './ProjectModal';
import { PROJECT_TYPES, getProjectType } from '../utils/projectTypes';
import { toDateString } from '../utils/dateUtils';

const TASK_STATUS = {
  done:        { emoji: '✅', label: '완료',   cls: 'task--done' },
  in_progress: { emoji: '⏳', label: '진행중', cls: 'task--progress' },
  upcoming:    { emoji: '⏱️', label: '예정',   cls: 'task--upcoming' },
};

const EMAIL_STATUS = {
  draft:   { label: '임시저장', cls: 'email--draft' },
  sent:    { label: '발송함',   cls: 'email--sent' },
  planned: { label: '작성예정', cls: 'email--planned' },
};

function ProjectProgress({ current, total, tasks }) {
  const done = tasks.filter(t => t.status === 'done').length;
  const taskTotal = tasks.length || 1;
  const pct = Math.round((done / taskTotal) * 100);
  return (
    <div className="proj-progress">
      <div className="proj-progress-header">
        <span className="proj-week-label">Week {current}/{total}</span>
        <span className="proj-pct">{pct}%</span>
      </div>
      <div className="proj-bar-bg">
        <div className="proj-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SponsorshipProgress({ tasks }) {
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = Math.round((done / tasks.length) * 100);
  return (
    <div className="proj-progress">
      <div className="proj-progress-header">
        <span className="proj-week-label">진행중</span>
        <span className="proj-pct">{pct}%</span>
      </div>
      <div className="proj-bar-bg">
        <div className="proj-bar-fill proj-bar-fill--green" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function isDeadlineSoon(deadline) {
  if (!deadline) return false;
  const diff = (new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24);
  return diff <= 7;
}

function TaskRow({ task, projectId, onToggleTask }) {
  const s = TASK_STATUS[task.status];
  return (
    <div className={`proj-task ${s.cls}`} onClick={() => onToggleTask(projectId, task.id)}>
      <span className="task-emoji">{s.emoji}</span>
      <span className="task-label">{task.label}</span>
      {task.deadline && (
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 600, padding: '1px 6px',
          borderRadius: 10, flexShrink: 0,
          background: isDeadlineSoon(task.deadline) ? '#FEE2E2' : 'var(--border-light)',
          color: isDeadlineSoon(task.deadline) ? '#B91C1C' : 'var(--text-muted)',
        }}>
          {task.deadline}
        </span>
      )}
    </div>
  );
}

function ProjectCard({ project, onToggleTask, onEdit, onTogglePin, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver }) {
  const [collapsed, setCollapsed] = useState(true);
  const pt = getProjectType(project.type);

  const activeTasks = project.tasks.filter(t => t.status !== 'done');
  const doneTasks   = project.tasks.filter(t => t.status === 'done');
  const pct = project.tasks.length
    ? Math.round((doneTasks.length / project.tasks.length) * 100)
    : 0;

  return (
    <div
      className="proj-card"
      style={{ opacity: isDragOver ? 0.6 : 1, outline: isDragOver ? `2px dashed ${pt.border}` : 'none',
        borderTop: `3px solid ${pt.border}`, transition: 'opacity 0.15s' }}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Header */}
      <div className="proj-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }} title="드래그로 순서 변경">⠿</span>
          {(() => { const t = getProjectType(project.type); return (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
              {t.emoji} {t.label}
            </span>
          ); })()}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            style={{ fontSize: 15, padding: '0 4px', background: 'none', border: 'none', cursor: 'pointer',
              filter: project.pinned ? 'none' : 'grayscale(1) opacity(0.4)' }}
            onClick={() => onTogglePin(project.id)}
            title={project.pinned ? '고정 해제' : '고정'}
          >
            📌
          </button>
          <button
            style={{ fontSize: 14, padding: '0 6px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? '펼치기' : '접기'}
          >
            {collapsed ? '▼' : '▲'}
          </button>
          <button className="proj-edit-btn" onClick={() => onEdit(project)} title="수정">⋯</button>
        </div>
      </div>

      {/* Title + start date + deadline */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="proj-title">{project.title}</h3>
        {project.startDate && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: 'var(--border-light)', color: 'var(--text-muted)',
          }}>🚩 {project.startDate}</span>
        )}
        {project.deadline && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: isDeadlineSoon(project.deadline) ? '#FEE2E2' : 'var(--border-light)',
            color: isDeadlineSoon(project.deadline) ? '#B91C1C' : 'var(--text-muted)',
          }}>📅 {project.deadline}</span>
        )}
      </div>

      {/* Progress bar (항상 표시) */}
      <div className="proj-progress">
        <div className="proj-progress-header">
          <span className="proj-week-label">{activeTasks.length}개 남음</span>
          <span className="proj-pct">{pct}%</span>
        </div>
        <div className="proj-bar-bg">
          <div className="proj-bar-fill" style={{ width: `${pct}%`, background: pt.border }} />
        </div>
      </div>

      {/* Collapsible body */}
      {collapsed ? (
        activeTasks.length > 0 && (
          <div className="proj-tasks">
            {activeTasks.slice(0, 3).map(task => (
              <TaskRow key={task.id} task={task} projectId={project.id} onToggleTask={onToggleTask} />
            ))}
            {activeTasks.length > 3 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>
                +{activeTasks.length - 3}개 더 있음
              </div>
            )}
          </div>
        )
      ) : (
        <>
          {/* 미완료 태스크 */}
          {activeTasks.length > 0 && (
            <div className="proj-tasks">
              {activeTasks.map(task => (
                <TaskRow key={task.id} task={task} projectId={project.id} onToggleTask={onToggleTask} />
              ))}
            </div>
          )}

          {/* 완료 태스크 */}
          {doneTasks.length > 0 && (
            <div className="proj-tasks" style={{ marginTop: activeTasks.length > 0 ? 6 : 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '2px 0 4px',
                borderTop: activeTasks.length > 0 ? '1px solid var(--border)' : 'none', marginTop: activeTasks.length > 0 ? 2 : 0 }}>
                완료 ({doneTasks.length})
              </div>
              {doneTasks.map(task => (
                <TaskRow key={task.id} task={task} projectId={project.id} onToggleTask={onToggleTask} />
              ))}
            </div>
          )}

          {project.tasks.length > 0 && (
            <div className="proj-task-summary">{doneTasks.length}/{project.tasks.length} 완료</div>
          )}

          {/* 주차별 목표 */}
          {project.goals && project.goals.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>🎯 주차별 목표</div>
              {[...project.goals].sort((a, b) => a.week - b.week).map(goal => (
                <div key={goal.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: 'var(--blue-dark)', background: 'var(--blue-light)',
                    borderRadius: 4, padding: '1px 6px', fontSize: 11, flexShrink: 0 }}>W{goal.week}</span>
                  <span style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{goal.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* 메모 */}
          {project.notes && (
            <div className="proj-notes">
              <span className="proj-notes-icon">📝</span>
              <span>{project.notes}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ProjectsView({ projects, onToggleTask, onCycleEmail, onAdd, onEdit, onDelete, onReorder, onTogglePin }) {
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [filterType, setFilterType] = useState(null);

  const handleEdit = (p) => {
    setEditProject(p);
    setShowModal(true);
  };
  const handleAdd = () => {
    setEditProject(null);
    setShowModal(true);
  };
  const handleSave = (data) => {
    if (editProject) {
      onEdit(editProject.id, data);
    } else {
      onAdd(data);
    }
    setShowModal(false);
  };
  const handleDelete = (id) => {
    onDelete(id);
    setShowModal(false);
  };

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => { e.preventDefault(); if (id !== dragId) setDragOverId(id); };
  const handleDrop = (e, id) => {
    e.preventDefault();
    if (!dragId || dragId === id) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...projects];
    const from = reordered.findIndex(p => p.id === dragId);
    const to   = reordered.findIndex(p => p.id === id);
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onReorder(reordered.map((p, i) => ({ ...p, sortOrder: i })));
    setDragId(null); setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  const getPct = (p) => p.tasks.length ? Math.round(p.tasks.filter(t => t.status === 'done').length / p.tasks.length * 100) : 0;

  const todayStr = toDateString(new Date());
  const sortByPin = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.sortOrder - b.sortOrder;

  const typeFiltered = filterType ? projects.filter(p => p.type === filterType) : projects;
  const completedProjects = typeFiltered.filter(p => getPct(p) === 100).sort(sortByPin);
  const notStartedProjects = typeFiltered
    .filter(p => getPct(p) !== 100 && p.startDate && p.startDate > todayStr)
    .sort(sortByPin);
  const inProgressProjects = typeFiltered
    .filter(p => getPct(p) !== 100 && !(p.startDate && p.startDate > todayStr))
    .sort(sortByPin);

  const renderGrid = (list) => (
    <div className="proj-grid">
      {list.map(p => (
        <ProjectCard
          key={p.id}
          project={p}
          onToggleTask={onToggleTask}
          onEdit={handleEdit}
          onTogglePin={onTogglePin}
          onDragStart={() => handleDragStart(p.id)}
          onDragOver={(e) => handleDragOver(e, p.id)}
          onDrop={(e) => handleDrop(e, p.id)}
          onDragEnd={handleDragEnd}
          isDragOver={dragOverId === p.id}
        />
      ))}
    </div>
  );

  return (
    <div className="projects-view">
      {/* Header */}
      <div className="proj-header">
        <div>
          <h2 className="proj-header-title">프로젝트</h2>
          <p className="proj-header-sub">진행 중인 프로젝트를 추적하고 관리하세요</p>
        </div>
        <button className="btn btn--primary" onClick={handleAdd}>+ 프로젝트 추가</button>
      </div>

      {/* Category filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          onClick={() => setFilterType(null)}
          style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: filterType === null ? 'var(--accent)' : 'var(--bg)',
            color: filterType === null ? '#fff' : 'var(--text-muted)',
            border: filterType === null ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
          }}>전체</button>
        {PROJECT_TYPES.map(t => (
          <button key={t.key}
            onClick={() => setFilterType(filterType === t.key ? null : t.key)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: filterType === t.key ? t.bg : 'var(--bg)',
              color: filterType === t.key ? t.color : 'var(--text-muted)',
              border: filterType === t.key ? `1.5px solid ${t.border}` : '1.5px solid var(--border)',
            }}>{t.emoji} {t.label}</button>
        ))}
      </div>

      {/* Cards */}
      {typeFiltered.length === 0 ? (
        <div className="proj-empty">
          <div className="empty-emoji">🗂️</div>
          <div className="empty-text">{filterType ? '해당 카테고리의 프로젝트가 없습니다' : '프로젝트가 없습니다'}</div>
          {!filterType && <button className="btn btn--primary" onClick={handleAdd}>첫 프로젝트 만들기</button>}
        </div>
      ) : (
        <>
          {inProgressProjects.length > 0 && (
            <div className="proj-section">
              <h3 className="proj-section-title">🚀 진행중 ({inProgressProjects.length})</h3>
              {renderGrid(inProgressProjects)}
            </div>
          )}
          {notStartedProjects.length > 0 && (
            <div className="proj-section">
              <h3 className="proj-section-title">⏱️ 아직 시작 안함 ({notStartedProjects.length})</h3>
              {renderGrid(notStartedProjects)}
            </div>
          )}
          {completedProjects.length > 0 && (
            <div className="proj-section">
              <h3 className="proj-section-title">✅ 완료 ({completedProjects.length})</h3>
              {renderGrid(completedProjects)}
            </div>
          )}
        </>
      )}

      {showModal && (
        <ProjectModal
          project={editProject}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
