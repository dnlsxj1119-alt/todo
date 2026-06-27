import { useState } from 'react';
import ProjectModal from './ProjectModal';

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

function ProjectCard({ project, onToggleTask, onEdit }) {
  const [collapsed, setCollapsed] = useState(false);
  const isEducation = project.type === 'education';

  const activeTasks = project.tasks.filter(t => t.status !== 'done');
  const doneTasks   = project.tasks.filter(t => t.status === 'done');
  const pct = project.tasks.length
    ? Math.round((doneTasks.length / project.tasks.length) * 100)
    : 0;

  return (
    <div className={`proj-card ${isEducation ? 'proj-card--edu' : 'proj-card--sponsor'}`}>
      {/* Header */}
      <div className="proj-card-header">
        <div className="proj-type-badge">{isEducation ? '🎓 교육 프로젝트' : '📁 프로젝트'}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
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

      {/* Title + deadline */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="proj-title">{project.title}</h3>
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
          <div className={`proj-bar-fill ${!isEducation ? 'proj-bar-fill--green' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
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

export default function ProjectsView({ projects, onToggleTask, onCycleEmail, onAdd, onEdit, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState(null);

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

      {/* Cards */}
      {projects.length === 0 ? (
        <div className="proj-empty">
          <div className="empty-emoji">🗂️</div>
          <div className="empty-text">프로젝트가 없습니다</div>
          <button className="btn btn--primary" onClick={handleAdd}>첫 프로젝트 만들기</button>
        </div>
      ) : (
        <div className="proj-grid">
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onToggleTask={onToggleTask}
              onEdit={handleEdit}
            />
          ))}
        </div>
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
