import React, { useState, useEffect } from 'react';
import Step1BooleanConstructorTab, { compileGroup } from './Step1BooleanConstructorTab';
import Step1PairBuilderTab from './Step1PairBuilderTab';

export default function Step1SearchStrings({ projectId, status, onComplete }) {
  const [mode, setMode] = useState('constructor');
  const [isSaving, setIsSaving] = useState(false);
  const [primary, setPrimary] = useState('');
  const [secondaryTags, setSecondaryTags] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [rootGroup, setRootGroup] = useState({
    id: 'root', type: 'group', items: [
      { id: 'b_1', type: 'block', internalOp: 'OR', terms: ['platform', 'ecosystem'] },
      { id: 'b_2', type: 'block', connector: 'AND', internalOp: 'OR', terms: ['governance', 'regulation'] }
    ]
  });
  const [constructedString, setConstructedString] = useState('');

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/search-strings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.primary_keyword) setPrimary(data.primary_keyword);
        if (data.secondary_keywords) setSecondaryTags(data.secondary_keywords);
        if (data.pairs) setPairs(data.pairs);
        if (data.query_tree && data.query_tree.items) setRootGroup(data.query_tree);
        if (data.compiled_boolean) setConstructedString(data.compiled_boolean);
      })
      .catch((err) => console.error("Error loading search strings:", err));
  }, [projectId]);

  const persistState = async (overrides = {}) => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/search-strings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_keyword: overrides.primary_keyword !== undefined ? overrides.primary_keyword : primary,
          secondary_keywords: overrides.secondary_keywords !== undefined ? overrides.secondary_keywords : secondaryTags,
          pairs: overrides.pairs !== undefined ? overrides.pairs : pairs,
          query_tree: overrides.query_tree !== undefined ? overrides.query_tree : rootGroup,
          compiled_boolean: overrides.compiled_boolean !== undefined ? overrides.compiled_boolean : constructedString
        })
      });
    } catch (err) {
      console.error("Failed to save search strings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleProceed = async () => {
    const finalQuery = constructedString || compileGroup(rootGroup);
    await persistState({ compiled_boolean: finalQuery });
    if (onComplete) onComplete(finalQuery);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, color: 'var(--primary)' }}>Construct Search Query</h3>
        {isSaving && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Saving to database...</span>}
      </div>

      <div className="comparison-tabs" style={{ padding: 0, marginBottom: '20px', background: 'transparent' }}>
        <button className={mode === 'constructor' ? 'active' : ''} onClick={() => setMode('constructor')}>Boolean Constructor & Grouping</button>
        <button className={mode === 'builder' ? 'active' : ''} onClick={() => setMode('builder')}>Primary-Secondary Pair Builder</button>
      </div>
      
      {mode === 'constructor' ? (
        <Step1BooleanConstructorTab rootGroup={rootGroup} setRootGroup={setRootGroup} constructedString={constructedString} setConstructedString={setConstructedString} onSave={persistState} />
      ) : (
        <Step1PairBuilderTab primary={primary} setPrimary={setPrimary} secondaryTags={secondaryTags} setSecondaryTags={setSecondaryTags} pairs={pairs} setPairs={setPairs} onSave={persistState} />
      )}
      
      {status === 'Active' && (
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button className="primary" style={{ padding: '12px 24px', fontSize: '1rem' }} onClick={handleProceed}>Proceed to Scraping</button>
        </div>
      )}
    </div>
  );
}