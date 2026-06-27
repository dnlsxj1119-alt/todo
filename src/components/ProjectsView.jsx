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

function ProjectCard({ project, onToggleTask, onCycleEmail, onEdit }) {
  const isEducation = project.type === 'education';
  const doneTasks = project.tasks.filter(t => t.status === 'done').length;

  return (
    <div className={`proj-card ${isEducation ? 'proj-card--edu' : 'proj-card--sponsor'}`}>
      {/* Card Header */}
      <div className="proj-card-header">
        <div className="proj-type-badge">
          {isEducation ? '🎓 교육 프로젝트' : '📁 프로젝트'}
        </div>
        <button className="proj-edit-btn" onClick={() => onEdit(project)} title="수정">⋯</button>
      </div>

      <h3 className="proj-title">{project.title}</h3>

      {/* Progress */}
      {isEducation && project.totalWeeks ? (
        <ProjectProgress current={project.currentWeek} total={project.totalWeeks} tasks={project.tasks} />
      ) : (
        <SponsorshipProgress tasks={project.tasks} />
      )}

      {/* Tasks */}
      <div className="proj-tasks">
        {project.tasks.map(task => {
          const s = TASK_STATUS[task.status];
          return (
            <div
              key={task.id}
              className={`proj-task ${s.cls}`}
              onClick={() => onToggleTask(project.id, task.id)}
            >
              <span className="task-emoji">{s.emoji}</span>
              <span className="task-label">{task.label}</span>
            </div>
          );
        })}
        <div className="proj-task-summary">{doneTasks}/{project.tasks.length} 완료</div>
      </div>

      {/* Notes */}
      {project.notes && (
        <div className="proj-notes">
          <span className="proj-notes-icon">📝</span>
          <span>{project.notes}</span>
        </div>
      )}

      {/* Next action */}
      {project.nextAction && (
        <div className="proj-next">
          <span className="proj-next-label">다음:</span>
          <span>{project.nextAction}</span>
        </div>
      )}

      {/* Email tracking (sponsorship) */}
      {project.emails && project.emails.length > 0 && (
        <div className="proj-emails">
          <div className="proj-emails-title">📧 메일 작성 상태</div>
          {project.emails.map(email => {
            const es = EMAIL_STATUS[email.status];
            return (
              <div
                key={email.id}
                className={`proj-email ${es.cls}`}
                onClick={() => onCycleEmail(project.id, email.id)}
                title="클릭으로 상태 변경"
              >
                <span className="email-status-badge">{es.label}</span>
                <span className="email-label">{email.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Contact */}
      {project.contact && (
        <div className="proj-contact">
          <span>📬</span>
          <span>{project.contact}</span>
        </div>
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
              onCycleEmail={onCycleEmail}
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
