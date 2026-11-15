import React from 'react';

export default function Step2ScopusTab({ onSync }) {
  return (
    <div className="document-summary" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4 style={{ color: 'var(--primary)', marginBottom: '4px' }}>Embedded Scopus Browser</h4>
          <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--muted)' }}>
            Log in via your institution. Downloads are routed to <strong>raw_scraped_files/scopus/</strong>.
          </p>
        </div>
        <button className="tool-btn" onClick={onSync || (() => alert("Syncing raw_scraped_files/scopus/..."))}>
          Sync Downloads
        </button>
      </div>

      <div style={{ width: '100%', height: '400px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: '#fff', position: 'relative' }}>
        <div style={{ background: '#e2e8f0', padding: '8px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fca5a5' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fde047' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#86efac' }}></div>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', color: 'var(--muted)' }}>
            https://www.scopus.com
          </div>
        </div>
        <iframe
          src="https://www.scopus.com"
          style={{ width: '100%', height: 'calc(100% - 35px)', border: 'none' }}
          title="Scopus Browser Placeholder"
        />
      </div>
    </div>
  );
}