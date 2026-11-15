import { getProjectProgress } from '../utils/progress';

export default function HomePage({ projects, onOpenProject, onCreateProject, onDeleteProject, onRenameProject }) {
  if (!projects.length) {
    return (
      <div className="view active">
        <div className="empty-projects">
          No projects yet. Click "New Project" to start your research journey.<br/>
          <button className="primary" style={{ marginTop: '1.25rem' }} onClick={onCreateProject}>
            Create First Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="view active">
      <h2 style={{ marginBottom: '0.5rem', fontWeight: 700, color: 'var(--primary)' }}>
        Your Projects
      </h2>
      <div className="projects-grid">
        {projects.map((proj) => {
          const progressPercent = getProjectProgress(proj);
          
          return (
            <div key={proj.id} className="project-card">
              <div className="project-title">{proj.name}</div>
              
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px' }}>
                  <span>Overall Progress</span>
                  <strong>{progressPercent}%</strong>
                </div>
                <div className="mini-progress">
                  <div className="mini-progress-bar" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>

              <div className="project-meta">
                {proj.stages.length} stages • Created {new Date(proj.createdAt).toLocaleDateString()}
              </div>
              
              <div className="project-actions">
                <button className="primary" onClick={() => onOpenProject(proj.id)}>
                  Open
                </button>
                <button onClick={() => onRenameProject(proj.id, proj.name)}>
                  Rename
                </button>
                <button className="danger" onClick={() => onDeleteProject(proj.id)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}