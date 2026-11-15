import { apiRequest, jsonOptions } from './apiClient';

export class ProjectService {
  list() {
    return apiRequest('/projects');
  }

  create(name) {
    return apiRequest('/projects', jsonOptions('POST', { name }));
  }

  rename(projectId, name) {
    return apiRequest(`/projects/${projectId}`, jsonOptions('PATCH', { name }));
  }

  delete(projectId) {
    return apiRequest(`/projects/${projectId}`, { method: 'DELETE' });
  }

  saveStage(projectId, stageId, contentHTML) {
    const path = `/projects/${projectId}/stages/${stageId}`;
    return apiRequest(path, jsonOptions('PUT', { contentHTML }));
  }

  saveVersion(projectId, stageId, contentHTML) {
    const path = `/projects/${projectId}/stages/${stageId}/versions`;
    return apiRequest(path, jsonOptions('POST', { contentHTML }));
  }

  restoreVersion(projectId, stageId, versionId) {
    const path = `/projects/${projectId}/stages/${stageId}/versions/${versionId}/restore`;
    return apiRequest(path, { method: 'POST' });
  }
}

export const projectService = new ProjectService();
