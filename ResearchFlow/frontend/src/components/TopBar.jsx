export default function TopBar({ onCreateProject }) {
  return (
    <div className="top-bar">
      <div className="logo-area">
        <h1 style={{ textAlign: 'left', fontSize: '3rem',fontWeight: 1500 }}>Research<span style={{ color: '#F26A2E' }}>Flow</span></h1>
        <p>Project management-based research workflow · Iterative stages · Version control</p>
      </div>
      <div className="global-actions">
        <button className="primary" onClick={onCreateProject}>
          <svg className="icon" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Project
        </button>
      </div>
    </div>
  );
}
