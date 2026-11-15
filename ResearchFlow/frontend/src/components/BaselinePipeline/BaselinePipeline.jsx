import React, { useState } from 'react';
import Step1SearchStrings from './Step1SearchStrings/Step1SearchStrings';
import Step2Acquisition from './Step2Acquisition/Step2Acquisition';
import Step3ExpertModel from './Step3ExpertModel';
import Step4Vectorisation from './Step4Vectorisation/Step4Vectorisation';
import Step5TemporalAnalysis from './Step5TemporalAnalysis';
import Step6Chatbot from './Step6Chatbot/Step6Chatbot';

export default function BaselinePipeline({ project }) {
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [downloadedPdfs, setDownloadedPdfs] = useState([]);
  
  // Tab state - default to null (all collapsed)
  const [expandedStep, setExpandedStep] = useState(null);

  const [statuses, setStatuses] = useState({
    1: 'Active',
    2: 'Locked',
    3: 'Locked',
    4: 'Locked',
    5: 'Locked',
    6: 'Locked'
  });

  const updateStatus = (step, status) => {
    setStatuses(prev => ({ ...prev, [step]: status }));
  };

  const advanceStep = (currentStep) => {
    updateStatus(currentStep, 'Completed');
    if (currentStep < 6) {
      updateStatus(currentStep + 1, 'Active');
      setExpandedStep(currentStep + 1); // Auto-switch to next tab
    } else {
      setExpandedStep(null); // Collapse when finished
    }
  };

  const tabs = [
    { 
      id: 1, 
      title: 'Search Strings', 
      icon: <svg className="icon" style={{ width: '1.5rem', height: '1.5rem' }} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> 
    },
    { 
      id: 2, 
      title: 'Acquisition', 
      icon: <svg className="icon" style={{ width: '1.5rem', height: '1.5rem' }} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> 
    },
    { 
      id: 3, 
      title: 'Expert Model', 
      icon: <svg className="icon" style={{ width: '1.5rem', height: '1.5rem' }} viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> 
    },
    { 
      id: 4, 
      title: 'Vectorisation', 
      icon: <svg className="icon" style={{ width: '1.5rem', height: '1.5rem' }} viewBox="0 0 24 24"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg> 
    },
    { 
      id: 5, 
      title: 'Temporal', 
      icon: <svg className="icon" style={{ width: '1.5rem', height: '1.5rem' }} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> 
    },
    { 
      id: 6, 
      title: 'Chatbot', 
      icon: <svg className="icon" style={{ width: '1.5rem', height: '1.5rem' }} viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> 
    }
  ];

  return (
    <div style={{ marginTop: '0' }}>

      {/* HORIZONTAL TAB SQUARES */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', 
        gap: '0.5rem', 
        width: '100%', 
        // Only pull down to overlap if a tab is open
        marginBottom: expandedStep !== null ? '-1px' : '0', 
        position: 'relative',
        zIndex: 2
      }}>
        {tabs.map(tab => {
          const isActive = expandedStep === tab.id;
          const isLocked = statuses[tab.id] === 'Locked';

          return (
            <div
              key={tab.id}
              onClick={() => {
                if (!isLocked) {
                  // Toggle off if clicking the active tab, otherwise switch to this tab
                  setExpandedStep(prev => prev === tab.id ? null : tab.id);
                }
              }}
              style={{
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                textAlign: 'center',
                aspectRatio: '1 / 1',
                maxHeight: '125px', 
                padding: '0.75rem',
                background: isActive ? '#ffffff' : 'var(--cream)',
                border: '1px solid var(--border)',
                borderBottom: isActive ? '1px solid #ffffff' : '1px solid var(--border)', 
                borderTop: isActive ? '4px solid var(--secondary)' : '1px solid var(--border)',
                // Rounded completely when collapsed, flattened on the bottom when expanded
                borderRadius: expandedStep !== null ? '12px 12px 0 0' : '12px',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ marginBottom: '0.5rem', color: isActive ? 'var(--primary)' : 'var(--muted)' }}>
                {tab.icon}
              </div>
              <span style={{ 
                fontSize: '0.8rem', 
                fontWeight: 700, 
                color: isActive ? 'var(--primary)' : 'var(--dark)', 
                marginBottom: '0.5rem', 
                lineHeight: 1.2 
              }}>
                {tab.title}
              </span>
              <span className={`badge ${statuses[tab.id].toLowerCase()}`} style={{ fontSize: '0.65rem', margin: 0 }}>
                {statuses[tab.id]}
              </span>
            </div>
          );
        })}
      </div>

      {/* MASTER CONTENT PANE - Only visible if a step is expanded */}
      {expandedStep !== null && (
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '0 0 12px 12px', 
          padding: '2rem',
          minHeight: '400px', // Height for the content area
          boxShadow: 'var(--shadow)',
          position: 'relative',
          zIndex: 1,
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          
          {/* Step 1 Content */}
          <div style={{ display: expandedStep === 1 ? 'block' : 'none' }}>
            <Step1SearchStrings projectId={project?.id} status={statuses[1]} onComplete={() => advanceStep(1)} />
          </div>

          {/* Step 2 Content */}
          <div style={{ display: expandedStep === 2 ? 'block' : 'none' }}>
            <Step2Acquisition projectId={project?.id} status={statuses[2]} csvData={csvData} setCsvData={setCsvData} csvHeaders={csvHeaders} setCsvHeaders={setCsvHeaders} downloadedPdfs={downloadedPdfs} setDownloadedPdfs={setDownloadedPdfs} onComplete={() => advanceStep(2)} />
          </div>

          {/* Step 3 Content */}
          <div style={{ display: expandedStep === 3 ? 'block' : 'none' }}>
            <Step3ExpertModel projectId={project?.id} status={statuses[3]} onComplete={() => advanceStep(3)} />
          </div>

          {/* Step 4 Content */}
          <div style={{ display: expandedStep === 4 ? 'block' : 'none' }}>
            <Step4Vectorisation status={statuses[4]} documentCount={csvData.length + downloadedPdfs.length} onComplete={() => advanceStep(4)} />
          </div>

          {/* Step 5 Content */}
          <div style={{ display: expandedStep === 5 ? 'block' : 'none' }}>
            <Step5TemporalAnalysis status={statuses[5]} onComplete={() => advanceStep(5)} />
          </div>

          {/* Step 6 Content */}
          <div style={{ display: expandedStep === 6 ? 'block' : 'none' }}>
            <Step6Chatbot status={statuses[6]} />
          </div>

        </div>
      )}
    </div>
  );
}