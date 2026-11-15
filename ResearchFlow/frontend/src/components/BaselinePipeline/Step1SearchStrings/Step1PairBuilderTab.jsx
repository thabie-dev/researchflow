import React, { useState } from 'react';

export default function Step1PairBuilderTab({
  primary,
  setPrimary,
  secondaryTags,
  setSecondaryTags,
  pairs,
  setPairs,
  onSave
}) {
  const [secondaryInput, setSecondaryInput] = useState('');

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && secondaryInput.trim()) {
      e.preventDefault();
      const val = secondaryInput.trim();
      if (!secondaryTags.includes(val)) {
        const updated = [...secondaryTags, val];
        setSecondaryTags(updated);
        if (onSave) onSave({ secondary_keywords: updated });
      }
      setSecondaryInput('');
    }
  };

  const removeTag = (idx) => {
    const updated = secondaryTags.filter((_, i) => i !== idx);
    setSecondaryTags(updated);
    if (onSave) onSave({ secondary_keywords: updated });
  };

  const handleTagChange = (idx, value) => {
    const updated = [...secondaryTags];
    updated[idx] = value;
    setSecondaryTags(updated);
  };

  const handleGeneratePairs = () => {
    if (!primary || !secondaryTags.length) {
      return alert('Enter primary and secondary tags first.');
    }
    const generated = secondaryTags.map((sec) => ({ prim: primary, sec }));
    const newPairs = [...pairs, ...generated];
    setPairs(newPairs);
    if (onSave) onSave({ pairs: newPairs });
  };

  return (
    <div>
      <div className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>
            Primary Keyword
          </label>
          <input
            value={primary}
            onChange={(e) => {
              setPrimary(e.target.value);
              if (onSave) onSave({ primary_keyword: e.target.value });
            }}
            placeholder="e.g., algorithmic visibility"
            style={{ width: '100%', padding: '10px 14px', fontSize: '0.95rem', borderRadius: '6px', border: '1px solid var(--border)' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 'bold', marginBottom: '6px' }}>
            Secondary Keywords (Type and press Enter)
          </label>
          <div className="tag-input-container" style={{ minHeight: '48px', padding: '8px 12px', alignItems: 'center' }}>
            {secondaryTags.map((tag, idx) => (
              <span key={idx} className="tag-pill" style={{ padding: '4px 10px', fontSize: '0.9rem' }}>
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => handleTagChange(idx, e.target.value)}
                  onBlur={() => onSave && onSave({ secondary_keywords: secondaryTags })}
                  style={{ border: 'none', background: 'transparent', color: 'inherit', padding: 0, fontSize: '0.9rem', width: `${Math.max(tag.length, 3)}ch` }}
                />
                <button type="button" onClick={() => removeTag(idx)} style={{ marginLeft: '6px', fontSize: '1rem', cursor: 'pointer' }}>
                  &times;
                </button>
              </span>
            ))}
            <input
              value={secondaryInput}
              onChange={(e) => setSecondaryInput(e.target.value)}
              onKeyDown={handleAddTag}
              style={{ border: 'none', padding: '6px', fontSize: '0.95rem', width: 'auto', flex: 1, outline: 'none' }}
              placeholder="Add secondary keyword..."
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="tool-btn"
        style={{ marginTop: '15px', padding: '10px 20px', fontSize: '0.9rem' }}
        onClick={handleGeneratePairs}
      >
        Generate Pairs
      </button>

      {pairs.length > 0 && (
        <div className="document-summary" style={{ marginTop: '15px' }}>
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '8px' }}>Generated Pairs</h4>
          {pairs.map((p, i) => (
            <div key={i} style={{ fontSize: '0.9rem', padding: '4px 0' }}>
              <strong>"{p.prim}"</strong> AND <strong>"{p.sec}"</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}