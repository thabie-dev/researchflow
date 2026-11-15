import React, { useState } from 'react';

export default function Step4Vectorisation({ status, documentCount, onComplete }) {
  const [isVectorising, setIsVectorising] = useState(false);
  const [vecProgress, setVecProgress] = useState(0);
  const [vecCurrentFile, setVecCurrentFile] = useState('waiting...');

  const startVectorisation = () => {
    setIsVectorising(true);
    let current = 0;
    const total = documentCount > 0 ? documentCount : 42;
    
    const interval = setInterval(() => {
      current++;
      setVecCurrentFile(`processing_document_${String(current).padStart(3, '0')}`);
      setVecProgress(Math.round((current / total) * 100));
      if (current >= total) {
        clearInterval(interval);
        setVecCurrentFile('Vectorisation Complete');
        setTimeout(onComplete, 800);
      }
    }, 100);
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Vectorisation & Embedding</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 1.5rem 0' }}>Transform documents into structural vectors using Word2Vec.</p>
      
      {status === 'Active' && !isVectorising && (
        <button className="primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={startVectorisation}>
          Start Live Vectorisation
        </button>
      )}
      {(isVectorising || status === 'Completed') && (
        <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '12px' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 'bold' }}>Status: <span style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{vecCurrentFile}</span></span>
            <strong style={{ color: 'var(--primary)' }}>{vecProgress}%</strong>
          </div>
          <div style={{ height: '12px', background: 'var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--orange)', width: `${vecProgress}%`, transition: 'width 0.2s' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}