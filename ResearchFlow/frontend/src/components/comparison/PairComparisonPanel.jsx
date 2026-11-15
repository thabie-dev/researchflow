import { useState } from 'react';
import { comparisonService } from '../../services/comparisonService';
import DocumentInput from './DocumentInput';

function DocumentSummary({ summary }) {
  return (
    <article className="document-summary">
      <h4>{summary.filename}</h4>
      <p>{summary.word_count} words · {summary.unique_word_count} unique terms</p>
      <blockquote>{summary.preview || 'No preview available.'}</blockquote>
    </article>
  );
}

export default function PairComparisonPanel() {
  const [firstFile, setFirstFile] = useState(null);
  const [secondFile, setSecondFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isComparing, setIsComparing] = useState(false);

  const selectFirstFile = (event) => {
    setFirstFile(event.target.files[0] || null);
    setResult(null);
  };

  const selectSecondFile = (event) => {
    setSecondFile(event.target.files[0] || null);
    setResult(null);
  };

  const compare = async () => {
    if (!firstFile || !secondFile) {
      setError('Choose both documents before comparing.');
      return;
    }
    setIsComparing(true);
    setError('');
    try {
      setResult(await comparisonService.compare(firstFile, secondFile));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsComparing(false);
    }
  };

  const similarityPercent = result ? Math.round(result.similarity * 100) : 0;
  return (
    <div>
      <div className="document-input-grid">
        <DocumentInput id="first-document" label="Document A" file={firstFile} onChange={selectFirstFile} />
        <DocumentInput id="second-document" label="Document B" file={secondFile} onChange={selectSecondFile} />
      </div>
      {error && <div className="comparison-error" role="alert">{error}</div>}
      <div className="comparison-action">
        <button className="primary" disabled={isComparing} onClick={compare}>
          {isComparing ? 'Reading and comparing…' : 'Compare Documents'}
        </button>
      </div>
      {result && (
        <section className="comparison-result" aria-live="polite">
          <div className="similarity-score"><span>{similarityPercent}%</span><p>cosine similarity</p></div>
          <div className="common-terms">
            <h3>Most frequent shared terms</h3>
            <div className="term-list">
              {result.common_terms.length
                ? result.common_terms.map((term) => <span key={term}>{term}</span>)
                : <em>No shared terms found.</em>}
            </div>
          </div>
          <div className="document-summary-grid">
            <DocumentSummary summary={result.first} />
            <DocumentSummary summary={result.second} />
          </div>
        </section>
      )}
    </div>
  );
}
