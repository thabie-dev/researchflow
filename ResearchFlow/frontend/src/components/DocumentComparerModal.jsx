import { lazy, Suspense, useState } from 'react';
import PairComparisonPanel from './comparison/PairComparisonPanel';

const BulkComparisonPanel = lazy(() => import('./comparison/BulkComparisonPanel'));

export default function DocumentComparerModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('pair');
  if (!isOpen) return null;

  const closeOnOverlay = (event) => {
    if (event.target.classList.contains('modal-overlay')) onClose();
  };

  return (
    <div className="modal-overlay active" onClick={closeOnOverlay}>
      <div className="split-modal comparer-modal">
        <div className="modal-header">
          <div>
            <h2 style={{ textAlign: 'left' }}>Document Comparer</h2>
            <p>Compare two documents or map similarity across a collection of journals.</p>
          </div>
          <button className="close-modal" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="comparison-tabs" role="tablist" aria-label="Comparison mode">
          <button
            className={mode === 'pair' ? 'active' : ''}
            role="tab"
            aria-selected={mode === 'pair'}
            onClick={() => setMode('pair')}
          >
            Two Documents
          </button>
          <button
            className={mode === 'bulk' ? 'active' : ''}
            role="tab"
            aria-selected={mode === 'bulk'}
            onClick={() => setMode('bulk')}
          >
            Journal Heatmap
          </button>
        </div>

        <div className="comparer-content">
          {mode === 'pair' ? (
            <PairComparisonPanel />
          ) : (
            <Suspense fallback={<div className="app-message">Loading interactive heatmap…</div>}>
              <BulkComparisonPanel />
            </Suspense>
          )}
        </div>
        <div className="modal-footer"><button className="tool-btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
