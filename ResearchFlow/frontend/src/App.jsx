import { useState } from 'react';
import './App.css';
import DocumentComparerModal from './components/DocumentComparerModal';
import ExportModal from './components/ExportModal';
import StageEditor from './components/StageEditor';
import TopBar from './components/TopBar';
import NewProjectWizard from './components/NewProjectWizard';
import { useProjects } from './hooks/useProjects';
import HomePage from './pages/HomePage';
import ProjectPage from './pages/ProjectPage';

export default function App() {
  const store = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [openStageId, setOpenStageId] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isComparerOpen, setIsComparerOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false); // New state

  const activeProject = store.projects.find((project) => project.id === selectedProjectId);

  const handleCreateProject = async (config) => {
    try {
      // In a real app, you would pass the full 'config' object to the backend to store
      // targetJournal, budget, researchType, and qualitativeSubtype for the LLM pipeline.
      const project = await store.createProject(config.name);
      setSelectedProjectId(project.id);
      setIsWizardOpen(false);
    } catch (error) {
      window.alert(`Could not create project: ${error.message}`);
    }
  };

  const deleteProject = async (projectId) => {
    if (!window.confirm('Delete this project permanently?')) return;
    try {
      await store.deleteProject(projectId);
      if (selectedProjectId === projectId) setSelectedProjectId(null);
    } catch (error) {
      window.alert(`Could not delete project: ${error.message}`);
    }
  };

  const renameProject = async (projectId, oldName) => {
    const name = window.prompt('Rename project:', oldName);
    if (!name || !name.trim()) return;
    try {
      await store.renameProject(projectId, name);
    } catch (error) {
      window.alert(`Could not rename project: ${error.message}`);
    }
  };

  if (store.isLoading) return <div className="app-message">Loading your research workspace...</div>;

  return (
    <div className="app-container">
      {store.error && (
        <div className="error-banner" role="alert">
          <span>{store.error}</span>
          <button onClick={store.reload}>Try again</button>
        </div>
      )}
      
      {!selectedProjectId || !activeProject ? (
        <>
          <TopBar onCreateProject={() => setIsWizardOpen(true)} />
          <HomePage 
            projects={store.projects} 
            onOpenProject={setSelectedProjectId} 
            onCreateProject={() => setIsWizardOpen(true)} 
            onDeleteProject={deleteProject} 
            onRenameProject={renameProject} 
          />
        </>
      ) : (
        <ProjectPage 
          project={activeProject} 
          onBack={() => setSelectedProjectId(null)} 
          onOpenStage={setOpenStageId} 
          onExport={() => setIsExportOpen(true)} 
          onOpenComparer={() => setIsComparerOpen(true)} 
        />
      )}

      {openStageId && activeProject && (
        <StageEditor
          stageId={openStageId}
          project={activeProject}
          onClose={() => setOpenStageId(null)}
          onSaveCurrent={(stageId, html) => store.saveStage(selectedProjectId, stageId, html)}
          onSaveVersion={(stageId, html) => store.saveVersion(selectedProjectId, stageId, html)}
          onRestoreVersion={(stageId, versionId) => (
            store.restoreVersion(selectedProjectId, stageId, versionId)
          )}
        />
      )}

      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} project={activeProject} />
      <DocumentComparerModal isOpen={isComparerOpen} onClose={() => setIsComparerOpen(false)} />
      
      <NewProjectWizard 
        isOpen={isWizardOpen} 
        onClose={() => setIsWizardOpen(false)} 
        onCreate={handleCreateProject} 
      />
    </div>
  );
}