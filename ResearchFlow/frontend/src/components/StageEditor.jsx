import { useEffect, useRef } from 'react';
import { STAGES_DEF, TOOLS_BY_STAGE } from '../data/constants';
import VersionHistory from './VersionHistory';
import ToolScoutCard from './ToolScoutCard';

export default function StageEditor({
  stageId,
  project,
  onClose,
  onSaveCurrent,
  onSaveVersion,
  onRestoreVersion,
}) {
  const editorRef = useRef(null);

  const stageDef = STAGES_DEF.find(s => s.id === stageId);
  const stageData = project.stages.find(s => s.stageId === stageId);
  const tools = TOOLS_BY_STAGE[stageId] || [{ title: "Writing Accelerator", text: "Keep focus on clarity, evidence, and structured argument." }];
  
  const versions = stageData?.versions || [];

  // Load content into contentEditable element on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = stageData?.contentHTML || "<p>Start writing...</p>";
    }
  }, [stageId, stageData]);

  const execCommand = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) editorRef.current.focus();
  };

  const handleSaveCurrent = async () => {
    if (editorRef.current) {
      try {
        await onSaveCurrent(stageId, editorRef.current.innerHTML);
        alert("Stage content saved.");
      } catch (error) {
        alert(`Could not save stage: ${error.message}`);
      }
    }
  };

  const handleSaveVersion = async () => {
    if (editorRef.current) {
      try {
        await onSaveVersion(stageId, editorRef.current.innerHTML);
        alert("Version snapshot saved.");
      } catch (error) {
        alert(`Could not save version: ${error.message}`);
      }
    }
  };

  if (!stageId) return null;

  return (
    <div className="modal-overlay active" onClick={(e) => { if(e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className="split-modal">
        <div className="modal-header">
          <h2>{stageDef?.name || "Stage"}</h2>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>
        
        <div className="split-content">
          {/* Left: Editor */}
          <div className="editor-panel">
            <div className="rich-toolbar">
              <button className="tool-btn" onClick={() => execCommand('bold')}><b>B</b></button>
              <button className="tool-btn" onClick={() => execCommand('italic')}><i>I</i></button>
              <button className="tool-btn" onClick={() => execCommand('underline')}><u>U</u></button>
              <button className="tool-btn" onClick={() => execCommand('formatBlock', 'h2')}>H2</button>
              <button className="tool-btn" onClick={() => execCommand('formatBlock', 'h3')}>H3</button>
              <button className="tool-btn" onClick={() => execCommand('insertUnorderedList')}>List</button>
              <button className="tool-btn" onClick={() => execCommand('insertOrderedList')}>Order</button>
              <button className="tool-btn" onClick={() => execCommand('removeFormat')}>Clear</button>
            </div>
            
            <div 
              ref={editorRef}
              className="editor-content" 
              contentEditable="true"
              suppressContentEditableWarning={true}
            ></div>
            
            <div className="version-section">
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <button className="tool-btn" onClick={handleSaveVersion}>
                  <svg className="icon icon-sm" viewBox="0 0 24 24">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save Version
                </button>
                <button className="primary" style={{ padding: '6px 18px', fontSize: '0.8rem' }} onClick={handleSaveCurrent}>
                  <svg className="icon icon-sm" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Save Current
                </button>
              </div>
              <div className="version-heading">
                <strong>Version History</strong>
                <span>{versions.length}/25 saved</span>
              </div>
              <VersionHistory
                versions={versions}
                onRestore={(versionId) => onRestoreVersion(stageId, versionId)}
              />
            </div>
          </div>
          
          {/* Right: Tools */}
          <div className="tools-panel">
            
            <ToolScoutCard projectId={project} stageId={stageId} />
            <h3>Research Accelerators</h3>
            <div>
              {tools.map((t, idx) => (
                <div key={idx} className="tool-card">
                  <div className="tool-title">{t.title}</div>
                  <div className="tool-text" dangerouslySetInnerHTML={{ __html: t.text.replace(/\n/g, "<br>") }}></div>
                </div>
              ))}
            </div>
           
          </div>
        </div>
        
        <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="tool-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
