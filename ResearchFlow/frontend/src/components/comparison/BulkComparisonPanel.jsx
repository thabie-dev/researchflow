import { useState } from 'react';
import { comparisonService } from '../../services/comparisonService';
import JournalSimilarityHeatmap from './JournalSimilarityHeatmap';
import TopicExtractionResults from './TopicExtractionResults';

const ACCEPTED_FILES = '.txt,.md,.csv,.pdf,.docx';
const MAX_DOCUMENTS = 30;

export default function BulkComparisonPanel() {
  const [documents, setDocuments] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isComparing, setIsComparing] = useState(false);

  const selectDocuments = (event) => {
    const selectedDocuments = Array.from(event.target.files || []);
    setDocuments(selectedDocuments);
    setResult(null);
    if (selectedDocuments.length > MAX_DOCUMENTS) {
      setError(`Choose no more than ${MAX_DOCUMENTS} journal documents.`);
    } else {
      setError('');
    }
  };

  const removeDocument = (indexToRemove) => {
    const remainingDocuments = [];
    for (let index = 0; index < documents.length; index += 1) {
      if (index !== indexToRemove) remainingDocuments.push(documents[index]);
    }
    setDocuments(remainingDocuments);
    setResult(null);
    setError('');
  };

  const compareJournals = async () => {
    if (documents.length < 2) {
      setError('Choose at least two journal documents.');
      return;
    }
    if (documents.length > MAX_DOCUMENTS) {
      setError(`Choose no more than ${MAX_DOCUMENTS} journal documents.`);
      return;
    }

    setIsComparing(true);
    setError('');
    try {
      setResult(await comparisonService.compareBulk(documents));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="bulk-comparison-panel">
      <label className="bulk-upload-zone" htmlFor="journal-documents">
        <span className="document-input-label">Bulk upload journal documents</span>
        <strong>{documents.length ? `${documents.length} selected` : 'Choose 2–30 files'}</strong>
        <span>TXT, Markdown, CSV, PDF, or DOCX · 10 MB each</span>
        <input
          id="journal-documents"
          type="file"
          accept={ACCEPTED_FILES}
          multiple
          onChange={selectDocuments}
        />
      </label>

      {documents.length > 0 && (
        <div className="selected-journals" aria-label="Selected journal documents">
          {documents.map((document, index) => (
            <div className="selected-journal" key={`${document.name}-${document.lastModified}-${index}`}>
              <span title={document.name}>{document.name}</span>
              <button type="button" onClick={() => removeDocument(index)} aria-label={`Remove ${document.name}`}>
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="comparison-error" role="alert">{error}</div>}
      <div className="comparison-action">
        <button className="primary" disabled={isComparing} onClick={compareJournals}>
          {isComparing ? `Cleaning and modeling ${documents.length} journals…` : 'Extract Topics and Compare'}
        </button>
      </div>

      {result && (
        <section className="bulk-result" aria-live="polite">
          <div className="heatmap-note">
            <strong>How to read it:</strong> red cells are more similar, blue cells are less similar.
            Hover for exact values, zoom with the toolbar, or download the plot as PNG.
          </div>
          <JournalSimilarityHeatmap result={result} />
          <TopicExtractionResults extraction={result.topic_extraction} />
          <div className="strongest-pairs">
            <h3>Strongest journal pairs</h3>
            <div className="pair-ranking">
              {result.strongest_pairs.map((pair, index) => (
                <article key={`${pair.first_filename}-${pair.second_filename}`}>
                  <span className="pair-rank">{index + 1}</span>
                  <div><strong>{pair.first_filename}</strong><small>compared with {pair.second_filename}</small></div>
                  <span className="pair-score">{Math.round(pair.similarity * 100)}%</span>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
