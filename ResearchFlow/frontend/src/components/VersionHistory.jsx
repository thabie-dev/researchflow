import { useState } from 'react';

function htmlPreview(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const text = container.textContent || '';
  return text.trim().slice(0, 110) || 'Empty version';
}

export default function VersionHistory({ versions, onRestore }) {
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const selectedVersion = versions.find((version) => version.id === selectedVersionId);

  const restoreSelectedVersion = async () => {
    if (!selectedVersion) return;
    const timestamp = new Date(selectedVersion.timestamp).toLocaleString();
    const confirmed = window.confirm(
      `Roll back to the version saved on ${timestamp}?\n\nYour current content will be saved as a safety version first.`,
    );
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      await onRestore(selectedVersion.id);
      setSelectedVersionId(null);
      window.alert('Rollback complete. Your previous current text was saved in version history.');
    } catch (error) {
      window.alert(`Could not restore version: ${error.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  if (versions.length === 0) {
    return <p className="empty-versions">No saved versions. Select “Save Version” to create one.</p>;
  }

  const newestFirst = [...versions].reverse();
  return (
    <div className="version-history">
      <div className="version-picker" role="radiogroup" aria-label="Saved versions">
        {newestFirst.map((version, index) => {
          const isSelected = selectedVersionId === version.id;
          return (
            <button
              type="button"
              className={`version-choice${isSelected ? ' selected' : ''}`}
              role="radio"
              aria-checked={isSelected}
              key={version.id}
              onClick={() => setSelectedVersionId(version.id)}
            >
              <span className="version-number">Version {versions.length - index}</span>
              <strong>{new Date(version.timestamp).toLocaleString()}</strong>
              <small>{htmlPreview(version.html)}</small>
            </button>
          );
        })}
      </div>
      <div className="rollback-actions">
        <span>{selectedVersion ? 'Selected version ready to restore' : 'Select a version above'}</span>
        <button
          type="button"
          className="rollback-button"
          disabled={!selectedVersion || isRestoring}
          onClick={restoreSelectedVersion}
        >
          {isRestoring ? 'Rolling back…' : 'Roll Back to Selected'}
        </button>
      </div>
    </div>
  );
}
