import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import Step2MetadataTab from './Step2MetadataTab';
import Step2ScopusTab from './Step2ScopusTab';
import Step2PdfScrapingTab from './Step2PdfScrapingTab';

const DEFAULT_HEADERS = ["Title", "Abstract", "Year", "DOI"];

export default function Step2Acquisition({
  projectId, status, csvData, setCsvData, csvHeaders, setCsvHeaders,
  downloadedPdfs, setDownloadedPdfs, onComplete
}) {
  const [mode, setMode] = useState('meta');
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualAbstract, setManualAbstract] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualDoi, setManualDoi] = useState('');
  const fileInputRef = useRef(null);

  const ensureHeaders = (newHeaders = DEFAULT_HEADERS) => {
    if (csvHeaders.length === 0) setCsvHeaders(newHeaders);
  };

  const addRecordsToCorpus = (newRecords) => {
    ensureHeaders();
    setCsvData((prev) => {
      const combined = [...prev, ...newRecords];
      const seen = new Set();
      return combined.filter((r) => {
        if (!r.Title) return true;
        if (seen.has(r.Title)) return false;
        seen.add(r.Title);
        return true;
      });
    });
    if (status === 'Active' && onComplete) onComplete();
  };

  const handleManualAdd = () => {
    if (!manualTitle.trim()) return alert("Title is required for manual entry.");
    addRecordsToCorpus([{ Title: manualTitle.trim(), Abstract: manualAbstract.trim(), Year: manualYear.trim(), DOI: manualDoi.trim() }]);
    setManualTitle(''); setManualAbstract(''); setManualYear(''); setManualDoi(''); setShowManualForm(false);
  };

  const handleCorpusEdit = (rowIndex, columnHeader, newValue) => {
    const updated = [...csvData];
    updated[rowIndex] = { ...updated[rowIndex], [columnHeader]: newValue };
    setCsvData(updated);
  };

  const handleCorpusDelete = (rowIndex) => {
    setCsvData(csvData.filter((_, index) => index !== rowIndex));
  };

  const handleExportCsv = () => {
    if (csvData.length === 0) return alert("No data available to export.");
    const csvString = Papa.unparse(csvData);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `ResearchFlow_Corpus_${projectId || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCsv = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const uploadedHeaders = Object.keys(results.data[0]);
          setCsvHeaders(uploadedHeaders); setCsvData(results.data);
          if (status === 'Active' && onComplete) onComplete();
        } else alert("The uploaded CSV appears to be empty.");
        event.target.value = null;
      },
      error: (error) => alert("Error parsing CSV: " + error.message)
    });
  };

  const activeHeaders = csvHeaders.length > 0 ? csvHeaders : DEFAULT_HEADERS;

  return (
    <div>
      <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--primary)' }}>Acquire Literature</h3>

      <div className="comparison-tabs" style={{ padding: 0, marginBottom: '20px', background: 'transparent' }}>
        <button className={mode === 'meta' ? 'active' : ''} onClick={() => setMode('meta')}>Metadata Scraping</button>
        <button className={mode === 'pdf' ? 'active' : ''} onClick={() => setMode('pdf')}>PDF Scraping</button>
        <button className={mode === 'scopus' ? 'active' : ''} onClick={() => setMode('scopus')}>Scopus (Embedded Browser)</button>
      </div>

      {mode === 'meta' && <Step2MetadataTab projectId={projectId} onAddRecords={addRecordsToCorpus} />}
      {mode === 'scopus' && <Step2ScopusTab />}
      {mode === 'pdf' && <Step2PdfScrapingTab projectId={projectId} />}

      {mode === 'meta' && (
        <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '2px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h4 style={{ color: 'var(--primary-dark)', margin: 0 }}>Master Corpus</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportCsv} />
              <button type="button" className="tool-btn" onClick={() => fileInputRef.current.click()} title="Upload edited CSV"> Import CSV</button>
              <button type="button" className="tool-btn" onClick={handleExportCsv} disabled={csvData.length === 0} title="Download corpus to edit in Excel"> Export CSV</button>
              <button type="button" className="tool-btn" style={{ fontWeight: 'bold', color: 'var(--secondary)' }} onClick={() => setShowManualForm(!showManualForm)}>
                {showManualForm ? ' Cancel Manual Entry' : '+ Quick Add Record'}
              </button>
            </div>
          </div>

          {showManualForm && (
            <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
              <div className="form-grid">
                <div><label style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Title</label><input type="text" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Enter document title" /></div>
                <div><label style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>DOI / Reference</label><input type="text" value={manualDoi} onChange={(e) => setManualDoi(e.target.value)} placeholder="10.xxxx/xxxxx" /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Abstract</label><textarea value={manualAbstract} onChange={(e) => setManualAbstract(e.target.value)} rows="2" placeholder="Paste abstract here..."></textarea></div>
                <div><label style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Year</label><input type="text" value={manualYear} onChange={(e) => setManualYear(e.target.value)} placeholder="YYYY" /></div>
              </div>
              <div style={{ marginTop: '15px', textAlign: 'right' }}><button type="button" onClick={handleManualAdd} className="primary">Add to Corpus</button></div>
            </div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '10px 15px', background: '#f8fafc', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--muted)' }}>Data Table</span>
              <span className="badge progress" style={{ margin: 0 }}>{csvData.length} records</span>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>
              {csvData.length > 0 ? (
                <table className="data-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <tr>
                      {activeHeaders.map((h) => <th key={h} style={{ fontSize: '0.75rem', padding: '10px 15px', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
                      <th style={{ textAlign: 'center', fontSize: '0.75rem', width: '60px', padding: '10px 15px', borderBottom: '1px solid var(--border)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {activeHeaders.map((h) => (
                          <td key={h} style={{ maxWidth: '200px', padding: '0' }}>
                            <input type="text" value={row[h] || ''} onChange={(e) => handleCorpusEdit(idx, h, e.target.value)} style={{ border: '1px solid transparent', background: 'transparent', padding: '8px 12px', width: '100%', fontSize: '0.8rem', outline: 'none' }} title={row[h] || ''} onFocus={(e) => (e.target.style.background = '#f8fafc')} onBlur={(e) => (e.target.style.background = 'transparent')} />
                          </td>
                        ))}
                        <td style={{ textAlign: 'center', padding: '8px' }}>
                          <button type="button" className="tool-btn" style={{ color: '#ef4444', border: 'none', padding: '4px 8px', fontSize: '1.2rem', lineHeight: 1 }} onClick={() => handleCorpusDelete(idx)} title="Delete record">&times;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  The master corpus is empty. Execute an API scrape above, add records manually, or import a CSV.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}