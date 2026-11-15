import React, { useState, useEffect, useRef } from 'react';

const formatStars = (num) => {
  if (!num) return '0';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
};

const extractPropStage = (props) => {
  const raw = props.stageId || props.stageName || props.stageTitle || props.title || props.stage || props.activeStage;
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object') {
    return (raw.id || raw.name || raw.title || raw.stage_name || raw.key || '').toString().trim();
  }
  return String(raw);
};

export default function ToolScoutCard(props) {
  const { projectId } = props;
  const cardRef = useRef(null);

  const [detectedStage, setDetectedStage] = useState(() => extractPropStage(props));
  const [isExpanded, setIsExpanded] = useState(true);
  const [tools, setTools] = useState([]);
  const [stageLabel, setStageLabel] = useState('');
  // Default to 'duckduckgo' (Web) so Elicit, Scite, Consensus, etc. show up immediately
  const [sourceFilter, setSourceFilter] = useState('duckduckgo');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState('');

  // Auto-detect stage from props OR from the parent modal heading (e.g. "Discussion")
  useEffect(() => {
    let stageFromProps = extractPropStage(props);
    if (stageFromProps) {
      setDetectedStage(stageFromProps);
      return;
    }

    // DOM Fallback: Read the modal header if the parent component forgot to pass stageId
    if (cardRef.current) {
      const dialogContainer =
        cardRef.current.closest('[role="dialog"]') ||
        cardRef.current.closest('.modal') ||
        cardRef.current.parentElement?.parentElement?.parentElement;

      if (dialogContainer) {
        const headingEl = dialogContainer.querySelector('h1, h2, h3');
        if (headingEl && headingEl.textContent) {
          const text = headingEl.textContent.trim();
          if (text && !text.toLowerCase().includes('tool scout')) {
            setDetectedStage(text);
            return;
          }
        }
      }
    }

    setDetectedStage('literature_review');
  }, [props.stageId, props.stageName, props.stageTitle, props.title, props.stage, props.activeStage]);

  const fetchTools = async (stageToFetch, forceRefresh = false) => {
    const safeProject = projectId || 'default';
    const safeStage = stageToFetch || 'literature_review';

    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const encodedStage = encodeURIComponent(safeStage);
      const url = `/api/projects/${safeProject}/stages/${encodedStage}/tool-scout${forceRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.status === 'success' && Array.isArray(data.tools)) {
        setTools(data.tools);
        if (data.stage_label) setStageLabel(data.stage_label);
        if (forceRefresh) {
          const count = data.new_discoveries || 0;
          setLastScanMessage(
            count > 0
              ? `+${count} new "${data.stage_label || safeStage}" tool${count > 1 ? 's' : ''} discovered!`
              : 'Up to date — all latest tools loaded.'
          );
          setTimeout(() => setLastScanMessage(''), 4000);
        }
      }
    } catch (error) {
      console.error("Failed to fetch Tool Scout data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch automatically whenever the detected stage changes
  useEffect(() => {
    if (!detectedStage) return;
    const pretty = detectedStage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    setStageLabel(pretty);
    fetchTools(detectedStage, false);
  }, [detectedStage]);

  const githubTools = tools.filter(t => (t.source || 'github') === 'github');
  const ddgTools = tools.filter(t => t.source === 'duckduckgo');
  const activeTools = sourceFilter === 'duckduckgo' ? ddgTools : githubTools;

  return (
    <div
      ref={cardRef}
      style={{
        background: '#ffffff',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        marginBottom: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          background: isExpanded ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#ffffff',
          color: isExpanded ? '#ffffff' : '#0f172a',
          padding: '14px 16px',
          borderBottom: isExpanded ? '1px solid #334155' : 'none',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <h4 style={{
              margin: '0 0 4px 0',
              fontSize: '0.95rem',
              fontWeight: 700,
              color: isExpanded ? '#ffffff' : '#0f172a',
              lineHeight: 1.3
            }}>
              Tool Scout — {stageLabel}
            </h4>
            <p style={{
              margin: 0,
              fontSize: '0.75rem',
              color: isExpanded ? '#cbd5e1' : '#64748b',
              lineHeight: 1.35
            }}>
              Digital tools to help with <strong>{stageLabel}</strong>
            </p>
          </div>

          <span style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
            color: isExpanded ? '#cbd5e1' : '#94a3b8',
            fontSize: '0.75rem',
            flexShrink: 0,
            marginTop: '4px'
          }}>
            ▼
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
          <span style={{
            fontSize: '0.68rem',
            padding: '3px 8px',
            borderRadius: '6px',
            background: isExpanded ? '#f26a2e' : '#e0f2fe',
            color: isExpanded ? '#ffffff' : '#0369a1',
            fontWeight: 700,
            whiteSpace: 'nowrap'
          }}>
            GitHub + DuckDuckGo
          </span>

          <span style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            background: isExpanded ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
            color: isExpanded ? '#ffffff' : '#475569',
            padding: '3px 8px',
            borderRadius: '6px',
            whiteSpace: 'nowrap'
          }}>
            {ddgTools.length} Web · {githubTools.length} GitHub
          </span>
        </div>
      </div>

      {/* Expandable Body */}
      {isExpanded && (
        <div style={{ padding: '14px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Separated Source Tabs: Web (Elicit/Scite) First, GitHub Second */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            background: '#e2e8f0',
            padding: '4px',
            borderRadius: '8px'
          }}>
            <button
              type="button"
              onClick={() => setSourceFilter('duckduckgo')}
              style={{
                background: sourceFilter === 'duckduckgo' ? '#ffffff' : 'transparent',
                color: sourceFilter === 'duckduckgo' ? '#c2410c' : '#475569',
                border: 'none',
                padding: '7px 8px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: sourceFilter === 'duckduckgo' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            > Web ({ddgTools.length})
            </button>

            <button
              type="button"
              onClick={() => setSourceFilter('github')}
              style={{
                background: sourceFilter === 'github' ? '#ffffff' : 'transparent',
                color: sourceFilter === 'github' ? '#0f172a' : '#475569',
                border: 'none',
                padding: '7px 8px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: sourceFilter === 'github' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >GitHub ({githubTools.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchTools(detectedStage, true)}
            disabled={isLoading || isRefreshing}
            style={{
              background: '#0f4c81',
              color: '#ffffff',
              border: 'none',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: (isLoading || isRefreshing) ? 'not-allowed' : 'pointer',
              width: '100%'
            }}
          >
            {isRefreshing ? '🔄 Scanning for New Tools...' : '🔄 Check for New Tools'}
          </button>

          {lastScanMessage && (
            <div style={{
              background: '#dcfce7',
              border: '1px solid #86efac',
              color: '#166534',
              padding: '7px 10px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 600
            }}>
              ✨ {lastScanMessage}
            </div>
          )}

          {/* Tool Cards List */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '22px 0', color: '#64748b' }}>
              <span style={{ fontSize: '1.4rem', display: 'block', marginBottom: '6px' }}>🛰️</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                Scouting {sourceFilter === 'duckduckgo' ? 'Web tools' : 'GitHub'} for {stageLabel}...
              </span>
            </div>
          ) : activeTools.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '2px' }}>
              {activeTools.map((tool, idx) => (
                <a
                  key={tool.id || idx}
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    color: 'inherit',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    borderLeft: tool.source === 'github' ? '4px solid #0f172a' : '4px solid #de5833',
                    background: '#ffffff',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <h5 style={{ margin: 0, fontSize: '0.86rem', color: '#0366d6', fontWeight: 700, wordBreak: 'break-word' }}>
                        {tool.name}
                      </h5>
                      {tool.is_curated && (
                        <span style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          padding: '1px 6px',
                          borderRadius: '6px',
                          fontSize: '0.62rem',
                          fontWeight: 700
                        }}>
                          TOP PICK
                        </span>
                      )}
                    </div>

                    {tool.source === 'github' && (
                      <span style={{
                        background: '#fef9c3',
                        border: '1px solid #fde047',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: '#854d0e',
                        flexShrink: 0
                      }}>
                        ★ {formatStars(tool.stars)}
                      </span>
                    )}
                  </div>

                  <p style={{
                    margin: '0 0 8px 0',
                    fontSize: '0.78rem',
                    color: '#475569',
                    lineHeight: 1.4
                  }}>
                    {tool.description}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                    <span style={{ color: '#94a3b8' }}>
                      {tool.topics && tool.topics[0] ? tool.topics[0] : (tool.first_seen_at || 'Verified')}
                    </span>
                    <span style={{ fontWeight: 700, color: '#0366d6' }}>
                      Open Tool ↗
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}