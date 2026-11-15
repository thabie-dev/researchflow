import { useMemo, useState } from 'react';
import { STAGES_DEF } from '../data/constants';
import BaselinePipeline from '../components/BaselinePipeline/BaselinePipeline';
import ProjectManagement from '../components/ProjectManagement';

function getStageStatus(stageData) {
  if (!stageData) return 'todo';
  const text = stageData.contentHTML.replace(/<[^>]+>/g, '').trim();
  const isDefault = text.includes('Start drafting your research');
  const wordCount = text.split(/\s+/).length;
  const versionCount = stageData.versions?.length || 0;

  if (isDefault && versionCount === 0) return 'todo';
  if (wordCount > 150 || versionCount >= 3) return 'done';
  return 'progress';
}

export default function ProjectPage({ project, onBack, onOpenStage, onExport, onOpenComparer }) {
  // Dial state: center on the first incomplete stage
  const [centerIndex, setCenterIndex] = useState(() => {
    if (!project) return 0;
    const firstActive = STAGES_DEF.findIndex((s) => {
      const stageData = project.stages.find((ps) => ps.stageId === s.id);
      return getStageStatus(stageData) !== 'done';
    });
    return firstActive !== -1 ? firstActive : 0;
  });

  if (!project) return <div>Project not found</div>;

  const percentage = useMemo(() => {
    let score = 0;
    STAGES_DEF.forEach((stageDef) => {
      const stageData = project.stages.find((s) => s.stageId === stageDef.id);
      const status = getStageStatus(stageData);
      
      if (status === 'done') score += 1;
      if (status === 'progress') score += 0.5;
    });
    return Math.round((score / STAGES_DEF.length) * 100);
  }, [project]);

  return (
    <div className="view active" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '3rem' }}>
      
      {/* Global Project Header */}
      <div className="workflow-header" style={{ marginBottom: 0 }}>
        <div>
          <button className="tool-btn" style={{ marginRight: '0.75rem' }} onClick={onBack}>
            <svg className="icon icon-sm" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <strong style={{ color: 'var(--primary)', fontSize: '2rem', fontWeight: 1000}}>
            {project.name}
          </strong>
        </div>
      </div>
      
      <ProjectManagement project={project} />

      {/* ROW 1 GROUP: Data Pipeline & Foundation */}
      <section className="glass-strong" style={{
        position: 'relative',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        overflow: 'hidden'
      }}>
        {/* Color anchor border */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', background: 'var(--secondary)' }} />
        


        {/* Row Header */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 750, color: 'var(--primary)', textAlign: 'left' }}>
            Baseline Data Pipeline  
          </h3>
        </div>

        {/* Top Overview Utilities (Sub-surface layer) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* Document Comparer Tile */}
          <div 
            className="stage-card" 
            onClick={onOpenComparer}
            style={{ 
              backgroundColor: 'var(--cream)', 
              border: '1px solid var(--border)',
              borderLeft: '5px solid var(--secondary)',
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              boxShadow: 'none'
            }}
          >
            <div className="stage-header">
              <span className="stage-name" style={{ color: 'var(--primary)' }}>Document Comparer</span>
              <svg className="icon icon-sm" viewBox="0 0 24 24" style={{ color: 'var(--secondary)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="12" y1="3" x2="12" y2="21"></line>
              </svg>
            </div>
            <div className="stage-desc" style={{ color: 'var(--muted)', margin: 0 }}>
              Open a side-by-side view to compare research documents or versions.
            </div>
          </div>
        </div>

        {/* Baseline Pipeline Enclosure (Sub-surface layer) */}
        <div style={{ 
          background: 'var(--cream)', 
          borderRadius: 'var(--radius)', 
          padding: '1.5rem', 
          border: '1px solid var(--border)' 
        }}>
          <BaselinePipeline project={project} />
        </div>
      </section>

      {/* ROW 2 GROUP: Research Execution Stages */}
      <section className="glass-strong" style={{
        position: 'relative',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        overflow: 'hidden'
      }}>
        {/* Color anchor border */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', background: 'var(--orange)' }} />
        
        {/* Row Header with Export Button */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
          <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 750, color: 'var(--primary)', textAlign: 'left' }}>
            Research Stages
          </h3>
          </div>
          <button className="tool-btn" onClick={onExport} style={{ flexShrink: 0 }}>
            <svg className="icon icon-sm" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Document
          </button>
        </div>


        {/* Dial Enclosure (Sub-surface layer) */}
        <div style={{ 
          background: 'var(--cream)', 
          borderRadius: 'var(--radius)', 
          padding: '2.5rem 1rem', 
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }}>
          
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '280px', width: '100%' }}>
            {STAGES_DEF.map((stageDef, i) => {
              const stageData = project.stages.find((s) => s.stageId === stageDef.id);
              const versionCount = stageData?.versions?.length || 0;
              const status = getStageStatus(stageData);

              let statusColor = 'var(--border)';
              let badgeClass = 'badge todo';
              let badgeText = '';

              if (status === 'todo') {
                statusColor = 'var(--orange)';
                badgeClass = 'badge todo';
              } else if (status === 'progress') {
                statusColor = 'var(--secondary)';
                badgeClass = 'badge progress';
                badgeText = 'Drafting';
              } else if (status === 'done') {
                statusColor = '#15803D';
                badgeClass = 'badge done';
                badgeText = 'Done';
              }

              // Dial positioning logic
              const offset = i - centerIndex;
              const absOffset = Math.abs(offset);
              const translateX = offset * 310; 
              const scale = Math.max(1 - absOffset * 0.2, 0.55);
              const opacity = Math.max(1 - absOffset * 0.35, 0);
              const zIndex = 20 - absOffset;
              const pointerEvents = opacity === 0 ? 'none' : 'auto';

              return (
                <div 
                  key={stageDef.id}
                  onClick={() => {
                    if (absOffset === 0) onOpenStage(stageDef.id);
                    else setCenterIndex(i);
                  }}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: '280px',
                    padding: '1.5rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border)',
                    borderTop: `5px solid ${statusColor}`,
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    boxShadow: absOffset === 0 ? '0 15px 35px rgba(0,0,0,0.1)' : 'var(--shadow)',
                    transform: `translate(-50%, -50%) translateX(${translateX}px) scale(${scale})`,
                    opacity,
                    zIndex,
                    pointerEvents
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.05rem' }}>{stageDef.name}</span>
                  </div>
                  
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', minHeight: '3rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                    {stageDef.desc}
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 'bold' }}>{versionCount} versions</span>
                    {absOffset === 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', fontWeight: 'bold' }}>Click to Open</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dial Controls */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
            <button className="tool-btn" onClick={() => setCenterIndex(Math.max(0, centerIndex - 1))} disabled={centerIndex === 0}>
              <svg className="icon icon-sm" viewBox="0 0 24 24" style={{ transform: 'rotate(180deg)' }}>
                <polyline points="9 18 15 12 9 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Previous Stage
            </button>
            <button className="tool-btn" onClick={() => setCenterIndex(Math.min(STAGES_DEF.length - 1, centerIndex + 1))} disabled={centerIndex === STAGES_DEF.length - 1}>
              Next Stage
              <svg className="icon icon-sm" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}