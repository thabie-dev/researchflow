const ACCEPTED_FILES = '.txt,.md,.csv,.pdf,.docx';

export default function DocumentInput({ id, label, file, onChange }) {
  return (
    <label className="document-input" htmlFor={id}>
      <span className="document-input-label">{label}</span>
      <span className="document-input-name">
        {file ? file.name : 'Choose a document'}
      </span>
      <span className="document-input-help">
        TXT, Markdown, CSV, PDF, or DOCX · 10 MB max
      </span>
      <input id={id} type="file" accept={ACCEPTED_FILES} onChange={onChange} />
    </label>
  );
}
