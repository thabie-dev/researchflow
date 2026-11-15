// Derives Kanban status and percentage based on content length and version history
export function getStageMetrics(stage) {
  if (!stage) return { status: 'todo', percent: 0, label: 'To Do' };
  
  const textLength = (stage.contentHTML || '').replace(/<[^>]+>/g, '').trim().length;
  const versionCount = stage.versions?.length || 0;
  
  if (versionCount >= 3 || (versionCount >= 1 && textLength > 1000)) {
    return { status: 'done', percent: 100, label: 'Done' };
  }
  if (versionCount >= 1) {
    return { status: 'review', percent: 80, label: 'Review' };
  }
  if (textLength > 150) {
    return { status: 'progress', percent: 45, label: 'In Progress' };
  }
  if (textLength > 30) {
    return { status: 'progress', percent: 15, label: 'In Progress' };
  }
  
  return { status: 'todo', percent: 0, label: 'To Do' };
}

export function getProjectProgress(project) {
  if (!project || !project.stages || project.stages.length === 0) return 0;
  const total = project.stages.reduce((acc, stage) => acc + getStageMetrics(stage).percent, 0);
  return Math.round(total / project.stages.length);
}