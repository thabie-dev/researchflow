import React, { useState } from 'react';

// --- AST Tokenizer & Parser Helpers ---
function tokenizeQuery(str) {
  const tokens = [];
  let i = 0;
  const n = str.length;
  while (i < n) {
    const ch = str[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let val = '';
      while (j < n && str[j] !== quote) {
        val += str[j];
        j++;
      }
      tokens.push({ type: 'term', value: val.trim() });
      i = j + 1;
      continue;
    }
    const rem = str.slice(i);
    const andNotMatch = rem.match(/^AND\s+NOT\b/i);
    if (andNotMatch) {
      tokens.push({ type: 'operator', value: 'AND NOT' });
      i += andNotMatch[0].length;
      continue;
    }
    const opMatch = rem.match(/^(AND|OR|NOT)\b/i);
    if (opMatch) {
      const op = opMatch[1].toUpperCase();
      tokens.push({ type: 'operator', value: op === 'NOT' ? 'AND NOT' : op });
      i += opMatch[0].length;
      continue;
    }
    let j = i;
    while (j < n && !/[\s()]/.test(str[j])) {
      j++;
    }
    tokens.push({ type: 'term', value: str.slice(i, j) });
    i = j;
  }
  return tokens;
}

function isFullyEnclosed(tokens) {
  if (!tokens || tokens.length < 2) return false;
  if (tokens[0].value !== '(' || tokens[tokens.length - 1].value !== ')') return false;
  let depth = 0;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].value === '(') depth++;
    else if (tokens[i].value === ')') depth--;
    if (depth === 0) return false;
  }
  return depth === 1;
}

function parseTokensToGroup(tokens, depth = 0) {
  while (isFullyEnclosed(tokens)) {
    tokens = tokens.slice(1, -1);
  }
  if (!tokens.length) {
    return {
      id: depth === 0 ? 'root' : 'g_' + Math.random().toString(36).substr(2, 7),
      type: 'group',
      items: [{ id: 'b_' + Date.now(), type: 'block', internalOp: 'OR', terms: [''] }]
    };
  }

  const hasParens = tokens.some(t => t.type === 'paren');
  const allOps = tokens.filter(t => t.type === 'operator').map(t => t.value);
  const uniqueAllOps = [...new Set(allOps)];
  if (!hasParens && uniqueAllOps.length <= 1) {
    return {
      id: depth === 0 ? 'root' : 'g_' + Math.random().toString(36).substr(2, 7),
      type: 'group',
      items: [{
        id: 'b_' + Date.now(),
        type: 'block',
        internalOp: uniqueAllOps[0] || 'OR',
        terms: tokens.filter(t => t.type === 'term').map(t => t.value)
      }]
    };
  }

  const segments = [];
  let currentTokens = [];
  let currentConnector = null;
  let d = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.value === '(') {
      d++;
      currentTokens.push(tok);
    } else if (tok.value === ')') {
      d--;
      currentTokens.push(tok);
    } else if (d === 0 && tok.type === 'operator') {
      if (currentTokens.length > 0) {
        segments.push({ tokens: currentTokens, connector: currentConnector });
        currentTokens = [];
      }
      currentConnector = tok.value;
    } else {
      currentTokens.push(tok);
    }
  }
  if (currentTokens.length > 0) {
    segments.push({ tokens: currentTokens, connector: currentConnector });
  }

  const items = segments.map((seg, idx) => {
    let segTokens = seg.tokens;
    while (isFullyEnclosed(segTokens)) {
      segTokens = segTokens.slice(1, -1);
    }
    const hasInnerParens = segTokens.some(t => t.type === 'paren');
    const segOps = [...new Set(segTokens.filter(t => t.type === 'operator').map(t => t.value))];

    if (!hasInnerParens && segOps.length <= 1) {
      const terms = segTokens.filter(t => t.type === 'term').map(t => t.value);
      const block = {
        id: 'b_' + Math.random().toString(36).substr(2, 7),
        type: 'block',
        internalOp: segOps[0] || 'OR',
        terms: terms.length ? terms : ['']
      };
      if (idx > 0 && seg.connector) block.connector = seg.connector;
      return block;
    }

    const subGroup = parseTokensToGroup(segTokens, depth + 1);
    if (idx > 0 && seg.connector) subGroup.connector = seg.connector;
    return subGroup;
  });

  return {
    id: depth === 0 ? 'root' : 'g_' + Math.random().toString(36).substr(2, 7),
    type: 'group',
    items: items
  };
}

// --- Compiler Helper ---
export const compileGroup = (group) => {
  if (!group || !group.items || group.items.length === 0) return '';
  const compiledParts = [];

  group.items.forEach((item) => {
    let partString = '';
    if (item.type === 'block') {
      const cleanTerms = (item.terms || [])
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => (t.includes(' ') && !t.startsWith('"') ? `"${t}"` : t));

      if (cleanTerms.length === 0) return;
      partString = cleanTerms.length === 1 ? cleanTerms[0] : `(${cleanTerms.join(` ${item.internalOp} `)})`;
    } else if (item.type === 'group') {
      const inner = compileGroup(item);
      if (inner) partString = `(${inner})`;
    }

    if (partString) {
      if (compiledParts.length === 0) {
        compiledParts.push(partString);
      } else {
        const conn = item.connector || 'AND';
        compiledParts.push(`${conn} ${partString}`);
      }
    }
  });

  return compiledParts.join(' ');
};

const cycleOp = (current) => {
  const ops = ['AND', 'OR', 'AND NOT'];
  return ops[(ops.indexOf(current) + 1) % ops.length];
};

function OperatorPill({ operator, onClick, title }) {
  const styles = {
    AND: { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
    OR: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
    'AND NOT': { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' }
  };
  const current = styles[operator] || styles.AND;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: current.bg,
        color: current.color,
        border: `1px solid ${current.border}`,
        borderRadius: '16px',
        padding: '3px 12px',
        fontSize: '0.75rem',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        transition: 'all 0.15s ease'
      }}
      title={title || "Click to toggle operator"}
    >
      {operator}
    </button>
  );
}

function QueryGroup({ group, onChange, onRemove, depth = 0 }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const addBlock = () => {
    const newBlock = {
      id: 'b_' + Date.now(),
      type: 'block',
      internalOp: 'OR',
      terms: ['new_term']
    };
    onChange({ ...group, items: [...group.items, newBlock] });
  };

  const addSubGroup = () => {
    const newGroup = {
      id: 'g_' + Date.now(),
      type: 'group',
      connector: 'AND',
      items: [
        { id: 'b_' + (Date.now() + 1), type: 'block', internalOp: 'OR', terms: ['term_a', 'term_b'] }
      ]
    };
    onChange({ ...group, items: [...group.items, newGroup] });
  };

  const updateItem = (index, updatedItem) => {
    const newItems = [...group.items];
    newItems[index] = updatedItem;
    onChange({ ...group, items: newItems });
  };

  const removeItem = (index) => {
    const newItems = group.items.filter((_, i) => i !== index);
    onChange({ ...group, items: newItems });
  };

  const cycleItemConnector = (index) => {
    const newItems = [...group.items];
    const current = newItems[index].connector || 'AND';
    newItems[index] = { ...newItems[index], connector: cycleOp(current) };
    onChange({ ...group, items: newItems });
  };

  return (
    <div style={{
      background: depth === 0 ? 'var(--cream)' : '#ffffff',
      border: depth === 0 ? '1px solid var(--border)' : '1px solid #cbd5e1',
      borderRadius: '8px',
      padding: '14px',
      margin: '6px 0',
      boxShadow: depth > 0 ? '0 2px 4px rgba(0,0,0,0.03)' : 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isCollapsed ? 0 : '12px' }}>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary)' }}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>

        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary-dark)', textTransform: 'uppercase' }}>
          {depth === 0 ? 'Root Query Container' : `Nested Group (L${depth})`}
        </span>

        {isCollapsed && (
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic', marginLeft: '6px' }}>
            ({group.items.length} elements)
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button type="button" className="tool-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={addBlock}>
            + Keyword Block
          </button>
          <button type="button" className="tool-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={addSubGroup}>
            + Nested Group
          </button>
          {depth > 0 && (
            <button
              type="button"
              onClick={onRemove}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              title="Delete group"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {group.items.map((item, index) => (
            <React.Fragment key={item.id || index}>
              {index > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0', position: 'relative' }}>
                  <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'var(--border)', zIndex: 0 }} />
                  <div style={{ position: 'relative', zIndex: 1, background: depth === 0 ? 'var(--cream)' : '#ffffff', padding: '0 8px' }}>
                    <OperatorPill
                      operator={item.connector || 'AND'}
                      onClick={() => cycleItemConnector(index)}
                      title="Click to toggle connector between concepts"
                    />
                  </div>
                </div>
              )}

              {item.type === 'block' ? (
                <div style={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--muted)' }}>Keywords</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>join with:</span>
                      <button
                        type="button"
                        onClick={() => updateItem(index, { ...item, internalOp: item.internalOp === 'OR' ? 'AND' : 'OR' })}
                        style={{
                          background: item.internalOp === 'OR' ? '#fef3c7' : '#e0f2fe',
                          color: item.internalOp === 'OR' ? '#b45309' : '#0369a1',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontSize: '0.7rem',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                        title="Click to switch internal keyword joiner"
                      >
                        {item.internalOp}
                      </button>
                    </div>

                    {group.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1.1rem', cursor: 'pointer', padding: 0 }}
                        title="Remove block"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    value={(item.terms || []).join(', ')}
                    onChange={(e) => {
                      const terms = e.target.value.split(',').map(t => t.trimStart());
                      updateItem(index, { ...item, terms });
                    }}
                    placeholder="e.g. platform, ecosystem, digital infrastructure"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '0.9rem',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      outline: 'none'
                    }}
                  />
                </div>
              ) : (
                <QueryGroup
                  group={item}
                  depth={depth + 1}
                  onChange={(updated) => updateItem(index, updated)}
                  onRemove={() => removeItem(index)}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main Tab Component ---
export default function Step1BooleanConstructorTab({
  rootGroup,
  setRootGroup,
  constructedString,
  setConstructedString,
  onSave
}) {
  const [rawInputString, setRawInputString] = useState(constructedString || '');
  const [parseError, setParseError] = useState('');

  const handleCompile = () => {
    const result = compileGroup(rootGroup);
    setConstructedString(result);
    setRawInputString(result);
    if (onSave) onSave({ compiled_boolean: result, query_tree: rootGroup });
  };

  const handleParseAndLoad = () => {
    if (!rawInputString.trim()) {
      setParseError('Please enter a query string to parse.');
      return;
    }
    setParseError('');
    try {
      const tokens = tokenizeQuery(rawInputString.trim());
      const parsedTree = parseTokensToGroup(tokens, 0);
      if (parsedTree && parsedTree.items.length) {
        setRootGroup(parsedTree);
        const recompiled = compileGroup(parsedTree);
        setConstructedString(recompiled);
        if (onSave) onSave({ compiled_boolean: recompiled, query_tree: parsedTree });
      } else {
        setParseError('Could not parse terms from query. Check parentheses and operators.');
      }
    } catch (e) {
      setParseError('Error parsing query: ' + e.message);
    }
  };

  return (
    <div>
      {/* Raw String Importer */}
      <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '6px' }}>
          Import or Paste Existing Boolean Search String
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
          <input
            type="text"
            value={rawInputString}
            onChange={(e) => setRawInputString(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleParseAndLoad()}
            placeholder='e.g. ("platform" OR "ecosystem") AND ("governance" OR "regulation")'
            style={{ flex: 1, padding: '9px 12px', fontSize: '0.88rem', borderRadius: '6px', border: '1px solid var(--border)' }}
          />
          <button
            type="button"
            className="tool-btn"
            style={{ background: 'var(--light-blue)', color: 'var(--primary)', borderColor: 'var(--secondary)', fontWeight: 'bold', whiteSpace: 'nowrap', padding: '0 16px' }}
            onClick={handleParseAndLoad}
          >
            Parse into UI Tree
          </button>
        </div>
        {parseError && (
          <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '6px', marginBottom: 0 }}>
            {parseError}
          </p>
        )}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
          Fine-tune the parsed expression below. Click operator badges to toggle operators, adjust keywords, or add/remove blocks.
        </p>

        <QueryGroup
          group={rootGroup}
          onChange={(updated) => {
            setRootGroup(updated);
            if (onSave) onSave({ query_tree: updated });
          }}
        />
      </div>

      <button
        type="button"
        className="primary"
        style={{ width: '100%', padding: '12px', fontSize: '1rem', marginBottom: '15px' }}
        onClick={handleCompile}
      >
        Recompile Boolean Query
      </button>

      {constructedString && (
        <div className="document-summary" style={{ background: 'var(--primary-dark)', color: 'white', position: 'relative', padding: '16px 20px', borderRadius: '8px' }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 'bold' }}>
            Generated Query Result
          </p>
          <code style={{ background: 'transparent', color: '#4ade80', padding: 0, wordBreak: 'break-all', fontSize: '0.95rem', display: 'block', paddingRight: '60px' }}>
            {constructedString}
          </code>
          <button
            type="button"
            className="tool-btn"
            style={{ position: 'absolute', top: '15px', right: '15px', padding: '6px 12px', fontSize: '0.75rem' }}
            onClick={() => {
              navigator.clipboard.writeText(constructedString);
              alert("Boolean query copied to clipboard!");
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}