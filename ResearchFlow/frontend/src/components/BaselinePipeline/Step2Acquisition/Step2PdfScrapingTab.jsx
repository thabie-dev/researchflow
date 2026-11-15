import React, { useState, useEffect, useRef } from 'react';

export default function Step2PdfScrapingTab({ projectId }) {
  const [targetCount, setTargetCount] = useState(50);
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState({ found: 0, downloaded: 0, target: 0 });
  const [feed, setFeed] = useState([]);
  const [downloadedPdfs, setDownloadedPdfs] = useState([]);
  const [activePdf, setActivePdf] = useState(null);
  const terminalRef = useRef(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [feed]);

  const fetchPdfList = async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/pdfs`);
      if (!res.ok) throw new Error("Failed to fetch from backend");
      const data = await res.json();
      setDownloadedPdfs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch PDFs:", err);
      setDownloadedPdfs([]);
    }
  };

  useEffect(() => {
    fetchPdfList();
  }, [projectId]);

  useEffect(() => {
    let interval;
    if (isScraping && projectId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/state`);
          const data = await res.json();
          const step2Pdf = data.steps?.step_2_pdf;
          
          if (step2Pdf && step2Pdf.progress) {
            setProgress(step2Pdf.progress);
            
            if (step2Pdf.progress.logs) {
              const formattedLogs = step2Pdf.progress.logs.map((msg, index) => {
                let type = 'info';
                if (msg.includes('[SYSTEM]')) type = 'system';
                if (msg.includes('[ERROR]') || msg.includes('Failed')) type = 'error';
                if (msg.includes('[SUCCESS]') || msg.includes('Downloaded')) type = 'success';
                return { id: index, type, msg };
              });
              setFeed(formattedLogs);
            }
          }

          if (step2Pdf?.status === 'completed') {
            setIsScraping(false);
            fetchPdfList();
          }
        } catch (err) {
          console.error("Failed to fetch pipeline state:", err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isScraping, projectId]);

  const runPdfScraper = async () => {
    if (!projectId) return alert("Project ID missing.");
    setIsScraping(true);
    setProgress({ found: 0, downloaded: 0, target: targetCount });
    setFeed([{ id: 'init', type: 'system', msg: `Analyzing database for missing PDFs (Limit: ${targetCount})...` }]);

    try {
      await fetch(`/api/projects/${projectId}/scrape-pdfs`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_count: Number(targetCount) })
      });
    } catch (err) {
      console.error(err);
      setIsScraping(false);
      setFeed(prev => [...prev, { id: 'err', type: 'error', msg: `Connection error: ${err.message}` }]);
    }
  };

  const displayTarget = progress.target || targetCount;
  const progressPercent = displayTarget > 0 ? Math.round((progress.found / displayTarget) * 100) : 0;

  // Group PDFs by their source folder for the explorer
  const groupedPdfs = downloadedPdfs.reduce((acc, pdf) => {
    const src = pdf.source || 'unknown';
    if (!acc[src]) acc[src] = [];
    acc[src].push(pdf);
    return acc;
  }, {});

  return (
    <div>
      <style>
        {`
          @keyframes pulse-dot-green {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
          summary::marker { content: ''; }
          summary::-webkit-details-marker { display: none; }
        `}
      </style>

      {/* Control Header */}
      <div className="assistant-result" style={{ borderLeftColor: 'var(--secondary)', marginBottom: '15px', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h4 style={{ color: 'var(--primary)', marginBottom: '4px' }}>Automated PDF Extraction</h4>
            <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--muted)' }}>
              Scans your SQLite database and attempts to download Open-Access PDFs. Files are automatically tagged with their publication year.
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--muted)', textTransform: 'uppercase' }}>Target Limit</label>
              <input 
                type="number" min="10" max="1000" step="10"
                value={targetCount} 
                onChange={(e) => setTargetCount(e.target.value)}
                disabled={isScraping}
                style={{ width: '100px', padding: '6px 10px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid var(--border)' }}
              />
            </div>
            <button className="primary" onClick={runPdfScraper} disabled={isScraping} style={{ height: '36px', marginTop: '14px' }}>
              {isScraping ? 'Downloading PDFs...' : 'Start Extraction'}
            </button>
          </div>
        </div>
      </div>

      {/* Live Feed Terminal */}
      {(isScraping || feed.length > 0) && (
        <div style={{ marginBottom: '24px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: isScraping ? '#10b981' : '#cbd5e1', borderRadius: '50%', animation: isScraping ? 'pulse-dot-green 1.5s infinite' : 'none' }}></span>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '1px' }}>
              PDF Download Feed
            </h3>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.9rem' }}>
              <span style={{ color: '#1e293b', fontWeight: 'bold' }}>Progress: Checked {progress.found} / {displayTarget}</span>
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>Successfully Downloaded: {progress.downloaded}</span>
            </div>
            <div style={{ width: '100%', height: '12px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', background: '#10b981', transition: 'width 0.4s ease' }}></div>
            </div>
          </div>

          <div 
            ref={terminalRef}
            style={{ 
              height: '200px', background: '#000', border: '1px inset rgba(255,255,255,0.1)', 
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

      {/* File Explorer & Viewer */}
      <div style={{ display: 'flex', height: '400px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
        
        {/* Explorer Panel */}
        <div style={{ width: '33%', borderRight: '1px solid var(--border)', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e2e8f0' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>PDF Explorer</h3>
            <span className="badge">{downloadedPdfs.length} files</span>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', fontSize: '0.8rem' }}>
            {downloadedPdfs.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '20px' }}>No PDFs mapped to DB yet.</div>
            )}
            
            {Object.entries(groupedPdfs).map(([source, files]) => (
              <details key={source} open style={{ marginBottom: '8px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', padding: '6px 8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary-dark)' }}>
                  📁 {source.toUpperCase()} <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 'normal' }}>({files.length})</span>
                </summary>
                <ul style={{ listStyle: 'none', paddingLeft: '12px', margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {files.map((pdf, idx) => (
                    <li
                      key={idx}
                      onClick={() => setActivePdf(pdf)}
                      style={{
                        padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        background: activePdf?.path === pdf.path ? 'var(--light-blue)' : 'transparent',
                        color: activePdf?.path === pdf.path ? 'var(--primary)' : 'var(--dark)'
                      }}
                      title={pdf.title}
                    >
                      📄 <span style={{ color: 'var(--orange)', fontWeight: 'bold' }}>[{pdf.year}]</span> {pdf.title}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>

        {/* Preview Panel */}
        <div style={{ width: '67%', background: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: '40px', background: 'var(--primary)', display: 'flex', alignItems: 'center', padding: '0 15px', color: '#fff', fontSize: '0.75rem' }}>
            {activePdf ? activePdf.title : 'PDF Viewer Ready'}
          </div>
          <div style={{ flex: 1, background: '#525659', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activePdf ? (
              <iframe 
                src={`/api/projects/${projectId}/file?path=${encodeURIComponent(activePdf.path)}`} 
                style={{ width: '100%', height: '100%', border: 'none' }} 
                title="PDF Preview"
              />
            ) : (
              <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Select a PDF to preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}