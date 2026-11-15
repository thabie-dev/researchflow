import { useState } from 'react';
import { exportService } from '../services/exportService';

export default function ExportModal({ isOpen, onClose, project }) {
  const [format, setFormat] = useState('pdf');
  const [font, setFont] = useState('times');
  const [fontSize, setFontSize] = useState(12);
  const [lineHeight, setLineHeight] = useState(1.5);
  const [citationStyle, setCitationStyle] = useState('apa');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleExport = async () => {
    if (!project) {
      setError('Select a project before generating an export.');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const result = await exportService.generate(project.id, {
        font,
        font_size: Number(fontSize),
        line_height: Number(lineHeight),
        citation_style: citationStyle,
      }, format);

      downloadBlob(result.blob, result.filename);
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadBlob = (blob, filename) => {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="simple-modal active">
      <div className="export-card">
        <h3 style={{ fontFamily: '"Poppins", sans-serif', marginBottom: '0.5rem', color: '#0f172a' }}>
          Document Export Settings
        </h3>
        
        {error && <div className="comparison-error" role="alert">{error}</div>}

        <label>Format</label>
        <select value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="pdf">PDF Document (.pdf)</option>
          <option value="word">Word Document (.docx)</option>
        </select>

        <label>Font Family</label>
        <select value={font} onChange={(event) => setFont(event.target.value)}>
          <option value="times">Times New Roman</option>
          <option value="georgia">Georgia</option>
          <option value="arial">Arial</option>
        </select>
        
        <label>Font Size (pt)</label>
        <input
          type="number"
          min="8"
          max="24"
          value={fontSize}
          onChange={(event) => setFontSize(event.target.value)}
          step="1"
        />
        
        {/* Line spacing is only widely supported via ReportLab in our PDF engine, 
            but we leave the UI intact so it applies when PDF is selected. */}
        <label>Line Spacing</label>
        <select value={lineHeight} onChange={(event) => setLineHeight(event.target.value)}>
          <option value="1.2">Single (1.2)</option>
          <option value="1.5">1.5 lines</option>
          <option value="2">Double (2)</option>
        </select>
        
        <label>Citation Style</label>
        <select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value)}>
          <option value="apa">APA 7th</option>
          <option value="mla">MLA 9th</option>
          <option value="chicago">Chicago</option>
        </select>
        
        <hr />
        <div className="flex-btns">
          <button onClick={onClose} disabled={isGenerating}>Cancel</button>
          <button className="primary" onClick={handleExport} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : `Download ${format === 'word' ? 'Word' : 'PDF'}`}
          </button>
        </div>
      </div>
    </div>
  );
}