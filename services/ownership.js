const store = require('./store');

const ALL_ROLES = ['owner', 'coauthor', 'reviewer'];
const WRITERS = ['owner', 'coauthor'];

const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

// Members are stored by email so a co-author or reviewer can be invited before they sign up.
function roleOf(user, project) {
  if (!user || !project) return null;
  if (project.ownerId === user.id) return 'owner';
  const member = (project.members || []).find((m) => m.email === normaliseEmail(user.email));
  return member ? member.role : null;
}

function accessibleProject(user, projectId, roles = ALL_ROLES) {
  const project = store.read('projects', []).find((p) => p.id === projectId);
  return project && roles.includes(roleOf(user, project)) ? project : null;
}

function accessibleProjectIds(user, roles = ALL_ROLES) {
  return new Set(
    store.read('projects', []).filter((p) => roles.includes(roleOf(user, p))).map((p) => p.id)
  );
}

module.exports = { ALL_ROLES, WRITERS, normaliseEmail, roleOf, accessibleProject, accessibleProjectIds };
