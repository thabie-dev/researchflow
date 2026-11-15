import React, { useState, useEffect, useMemo } from 'react';

const Step3ExpertModel = ({ projectId, status, onComplete }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [subdomains, setSubdomains] = useState([]);
  const [dragAction, setDragAction] = useState('move');
  const topN = 15;
  const isLocked = status === 'Locked';

  const processedSubdomains = useMemo(() => {
    return subdomains.map(sub => {
      const sortedTerms = [...sub.terms].sort((a, b) => b.strength - a.strength);
      return { ...sub, visibleTerms: sortedTerms.slice(0, topN) };
    });
  }, [subdomains, topN]);

  const buildSubdomainQuery = (subdomain) => {
    const validTerms = subdomain.visibleTerms.filter(t => !t.term.includes("No terms found"));
    const termStrings = validTerms.map(t => `"${t.term}"`);
    const baseQuery = `("${subdomain.primaryKw}" AND "${subdomain.secondaryKw}")`;
    if (termStrings.length === 0) return baseQuery;
    return `${baseQuery} AND (${termStrings.join(' OR ')})`;
  };

  const handleRunModel = async () => {
    if (!projectId) return alert("Error: Project ID is missing!");
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/refine-network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSubdomains(data.subdomains);
        if (onComplete) onComplete();
      } else {
        alert("Extraction Error: " + (data.detail || data.message));
      }
    } catch (e) {
      console.error(e);
      alert("Failed to connect to backend for NLP extraction.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragStart = (e, termObj, sourceSubId) => e.dataTransfer.setData('dragData', JSON.stringify({ termObj, sourceSubId }));
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e, targetSubId) => {
    e.preventDefault();
    const { termObj, sourceSubId } = JSON.parse(e.dataTransfer.getData('dragData'));
    if (sourceSubId === targetSubId) return;
    setSubdomains(prev => prev.map(sub => {
      if (sub.id === sourceSubId && dragAction === 'move') {
        return { ...sub, terms: sub.terms.filter(t => t.term !== termObj.term) };
      }
      if (sub.id === targetSubId) {
        const alreadyExists = sub.terms.some(t => t.term === termObj.term);
        if (!alreadyExists) return { ...sub, terms: [...sub.terms, termObj] };
      }
      return sub;
    }));
  };

  const handleQueryEdit = (subId, newQuery) => {
    setSubdomains(prev => prev.map(s => s.id === subId ? { ...s, customQuery: newQuery } : s));
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--primary)' }}>Expert Model & Network Analysis</h3>
      
      <div className="assistant-result" style={{ borderLeftColor: 'var(--secondary)', marginBottom: '20px', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h4 style={{ color: 'var(--primary)', marginBottom: '4px' }}>Subdomain NLP Extraction</h4>
            <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--muted)' }}>Generates highly specific search queries by identifying statistically significant n-grams across your downloaded metadata.</p>
          </div>
          <button className="primary" onClick={handleRunModel} disabled={isAnalyzing || isLocked} style={{ height: '36px' }}>
            {isAnalyzing ? 'Analyzing Networks...' : 'Start Extraction'}
          </button>
        </div>
      </div>

      {processedSubdomains.length > 0 && (
        <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '2px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h4 style={{ color: 'var(--primary-dark)', margin: 0 }}>Refined Subdomain Queries</h4>
            <div style={{ display: 'flex', gap: '8px', background: 'var(--cream)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button onClick={() => setDragAction('move')} style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', background: dragAction === 'move' ? '#fff' : 'transparent', color: dragAction === 'move' ? 'var(--primary)' : 'var(--muted)', boxShadow: dragAction === 'move' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Move Terms</button>
              <button onClick={() => setDragAction('duplicate')} style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', background: dragAction === 'duplicate' ? '#fff' : 'transparent', color: dragAction === 'duplicate' ? 'var(--secondary)' : 'var(--muted)', boxShadow: dragAction === 'duplicate' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Copy Terms</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {processedSubdomains.map((sub) => (
              <div key={sub.id} onDrop={(e) => handleDrop(e, sub.id)} onDragOver={handleDragOver} style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: 'var(--dark)' }}>{sub.primaryKw} <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>+</span> {sub.secondaryKw}</h4>
                <textarea value={sub.customQuery !== undefined ? sub.customQuery : buildSubdomainQuery(sub)} onChange={(e) => handleQueryEdit(sub.id, e.target.value)} style={{ width: '100%', minHeight: '70px', background: '#0f172a', color: '#38bdf8', padding: '12px', borderRadius: '6px', fontFamily: '"Fira Code", monospace', fontSize: '0.85rem', marginBottom: '16px', border: 'none', outline: 'none', resize: 'vertical' }} title="Final boolean string" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '60px', padding: '12px', background: '#fff', border: '1px dashed var(--border)', borderRadius: '6px' }}>
                  {sub.visibleTerms.length === 0 && (<span style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Drop terms here...</span>)}
                  {sub.visibleTerms.map(t => (
                    <div key={t.term} draggable onDragStart={(e) => handleDragStart(e, t, sub.id)} style={{ background: t.term.includes('No terms') ? '#fee2e2' : 'var(--light-blue)', border: `1px solid ${t.term.includes('No terms') ? '#fca5a5' : '#bae6fd'}`, color: t.term.includes('No terms') ? '#ef4444' : 'var(--primary-dark)', padding: '4px 10px', borderRadius: '16px', fontSize: '0.8rem', cursor: 'grab', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {t.term} <span style={{ opacity: 0.5, fontSize: '0.65rem', fontWeight: 'bold' }}>{t.strength ? t.strength.toFixed(1) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Step3ExpertModel;