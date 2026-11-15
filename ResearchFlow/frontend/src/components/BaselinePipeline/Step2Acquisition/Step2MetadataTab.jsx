import React, { useState, useEffect, useRef } from 'react';

export default function Step2MetadataTab({ projectId, onAddRecords }) {
  const [targetCount, setTargetCount] = useState(50);
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState({ found: 0, target: 0 });
  const [feed, setFeed] = useState([]);
  const terminalRef = useRef(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [feed]);

  // Poll Backend State
  useEffect(() => {
    let interval;
    if (isScraping && projectId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/state`);
          const data = await res.json();
          const step2 = data.steps?.step_2;
          
          if (step2 && step2.progress) {
            setProgress(step2.progress);
            
            if (step2.progress.logs) {
              const formattedLogs = step2.progress.logs.map((msg, index) => {
                let type = 'info';
                if (msg.includes('[SYSTEM]')) type = 'system';
                if (msg.includes('Error')) type = 'error';
                if (msg.includes('[SUCCESS]') || msg.includes('Found:')) type = 'success';
                
                return { id: index, type, msg };
              });
              setFeed(formattedLogs);
            }

            // FIX: Pipe the FULL collected data array. 
            // onAddRecords automatically deduplicates by Title, so passing the full array repeatedly is perfectly safe.
            if (step2.progress.collected_data) {
              onAddRecords(step2.progress.collected_data);
            }
          }

          if (step2?.status === 'completed') {
            setIsScraping(false);
          }
        } catch (err) {
          console.error("Failed to fetch pipeline state:", err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isScraping, projectId, onAddRecords]);

  const runMetadataScraper = async () => {
    if (!projectId) return alert("Project ID missing. Please save the project first.");
    setIsScraping(true);
    setProgress({ found: 0, target: targetCount });
    setFeed([{ id: 'init', type: 'system', msg: 'Connecting to backend harvester...' }]);

    try {
      const strRes = await fetch(`/api/projects/${projectId}/search-strings`);
      const strData = await strRes.json();
      const query = strData.compiled_boolean || "";

      if (!query) {
        alert("No Boolean string found. Please complete Step 1 first.");
        setIsScraping(false);
        return;
      }

      await fetch(`/api/projects/${projectId}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          target_count: Number(targetCount)
        })
      });
    } catch (err) {
      console.error(err);
      setIsScraping(false);
      setFeed(prev => [...prev, { id: 'err', type: 'error', msg: `Connection error: ${err.message}` }]);
    }
  };

  const displayTarget = progress.target || targetCount;
  const displayFound = Math.min(progress.found, displayTarget);
  const progressPercent = displayTarget > 0 ? Math.round((displayFound / displayTarget) * 100) : 0;

  return (
    <div style={{ marginBottom: '20px' }}>
      <style>
        {`
          @keyframes pulse-dot {
            0% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(6, 182, 212, 0); }
            100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0); }
          }
        `}
      </style>

      <div className="assistant-result" style={{ borderLeftColor: 'var(--orange)', marginBottom: '15px', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h4 style={{ color: 'var(--primary)', marginBottom: '4px' }}>API Harvester Config</h4>
            <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--muted)' }}>
              Targeting arXiv, CrossRef, and Semantic Scholar. PDFs will not be downloaded yet.
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--muted)', textTransform: 'uppercase' }}>Target Records</label>
              <input 
                type="number" min="10" max="1000" step="10"
                value={targetCount} 
                onChange={(e) => setTargetCount(e.target.value)}
                disabled={isScraping}
                style={{ width: '100px', padding: '6px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid var(--border)' }}
              />
            </div>
            <button className="primary" onClick={runMetadataScraper} disabled={isScraping} style={{ height: '36px', marginTop: '14px' }}>
              {isScraping ? 'Harvester Running...' : 'Execute Scrape'}
            </button>
          </div>
        </div>
      </div>

      {(isScraping || feed.length > 0) && (
        <div style={{ marginTop: '24px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: isScraping ? '#06b6d4' : '#10b981', borderRadius: '50%', animation: isScraping ? 'pulse-dot 1.5s infinite' : 'none' }}></span>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Live Metadata Feed
            </h3>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
              <span style={{ color: '#1e293b', fontWeight: 'bold' }}>Extraction Progress</span>
              <span style={{ color: '#64748b', fontWeight: '500' }}>Record {displayFound} of {displayTarget}</span>
            </div>
            <div style={{ width: '100%', height: '12px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', background: '#4f46e5', transition: 'width 0.4s ease' }}></div>
            </div>
          </div>

          <div 
            ref={terminalRef}
            style={{ 
              height: '250px', background: '#000', border: '1px inset rgba(255,255,255,0.1)', 
              borderRadius: '8px', padding: '12px', overflowY: 'auto', 
              fontFamily: '"Fira Code", "Courier New", Courier, monospace', fontSize: '0.85rem' 
            }}
          >
            {feed.map((log) => (
              <div key={log.id} style={{ marginBottom: '4px', lineHeight: '1.4', display: 'flex', gap: '12px' }}>
                <span style={{ color: '#64748b', flexShrink: 0 }}>&gt;</span>
                <span style={{ 
                  color: log.type === 'system' ? '#06b6d4' : log.type === 'success' ? '#10b981' : log.type === 'error' ? '#ef4444' : '#e2e8f0', 
                  fontWeight: (log.type === 'system' || log.type === 'error') ? 'bold' : 'normal',
                  flex: 1, wordBreak: 'break-word' 
                }}>
                  {log.msg}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}