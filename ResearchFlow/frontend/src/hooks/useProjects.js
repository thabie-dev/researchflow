import { useCallback, useEffect, useState } from 'react';
import { projectService } from '../services/projectService';

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setProjects(await projectService.list());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    projectService.list()
      .then((loadedProjects) => {
        if (isActive) setProjects(loadedProjects);
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.message);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const createProject = async (name) => {
    const project = await projectService.create(name);
    setProjects((current) => [project, ...current]);
    return project;
  };

  const renameProject = async (projectId, name) => {
    const updated = await projectService.rename(projectId, name);
    replaceProject(updated);
  };

  const deleteProject = async (projectId) => {
    await projectService.delete(projectId);
    setProjects((current) => current.filter((project) => project.id !== projectId));
  };

  const saveStage = async (projectId, stageId, contentHTML) => {
    const updated = await projectService.saveStage(projectId, stageId, contentHTML);
    replaceProject(updated);
  };

  const saveVersion = async (projectId, stageId, contentHTML) => {
    const updated = await projectService.saveVersion(projectId, stageId, contentHTML);
    replaceProject(updated);
  };

  const restoreVersion = async (projectId, stageId, versionId) => {
    const updated = await projectService.restoreVersion(projectId, stageId, versionId);
    replaceProject(updated);
  };

  const replaceProject = (updatedProject) => {
    setProjects((current) => {
      const nextProjects = [];
      for (const project of current) {
        nextProjects.push(project.id === updatedProject.id ? updatedProject : project);
      }
      return nextProjects;
    });
  };

  return {
    projects,
    isLoading,
    error,
    reload: loadProjects,
    createProject,
    renameProject,
    deleteProject,
    saveStage,
    saveVersion,
    restoreVersion,
  };
}
