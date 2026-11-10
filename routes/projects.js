const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();
const store = require('../services/store');
const conferences = require('../services/conferences');
const mailer = require('../services/mailer');
const { roleOf, accessibleProject, normaliseEmail, WRITERS } = require('../services/ownership');

const COLLECTION = 'projects';

const STAGE_KEYS = [
  'problemStatement', 'literatureReview', 'frameworks',
  'methodology', 'ethics', 'dataCollection', 'dataAnalysis', 'writing', 'submission',
];

const PUBLICATION_TYPES = ['journal', 'conference', 'thesis'];

// Paper and thesis sections, the optional concept note, and legacy keys from earlier versions.
// Sections from an uploaded conference template are stored as t1, t2, ...
const MANUSCRIPT_KEYS = [
  'abstract', 'keywords', 'introduction', 'problemStatement', 'objectives', 'literatureReview',
  'frameworks', 'methodology', 'dataCollection', 'dataAnalysis', 'results', 'discussion',
  'conclusion', 'references', 'conceptNote',
  'ethics', 'dataCleaning', 'writing', 'submission',
];
const TEMPLATE_KEY = /^t\d{1,4}$/;
const MAX_TEMPLATE_SECTIONS = 40;
const MAX_TITLE_LENGTH = 120;
const MAX_SECTION_LENGTH = 200000;

function newProject({ ownerId, title, field, deadline, publicationType, conference, targetJournal, problemStatement }) {
  const progress = Object.fromEntries(STAGE_KEYS.map((k) => [k, 0]));
  return {
    id: uuid(),
    ownerId,
    title,
    field: field || 'Not specified',
    deadline: deadline || null,
    publicationType,
    conference: conference || null,
    targetJournal: targetJournal || null,
    problemStatement: problemStatement || null,
    manuscript: problemStatement ? { problemStatement } : {},
    createdAt: new Date().toISOString(),
    progress,
    overallProgress: 0,
  };
}

function recalcOverall(project) {
  const values = STAGE_KEYS.map((k) => project.progress[k] || 0);
  project.overallProgress = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return project;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MEMBER_ROLES = ['coauthor', 'reviewer'];
const MAX_MEMBERS = 20;
const MAX_ACTIVITY = 60;
const MAX_COMMENTS = 500;
const MAX_COMMENT_LENGTH = 4000;
const COALESCE_MS = 10 * 60 * 1000;

function validSection(section) {
  return section === 'general' || MANUSCRIPT_KEYS.includes(section) || TEMPLATE_KEY.test(section);
}

// What a signed-in user sees: the project plus their role, the owner and who has joined.
function present(project, user) {
  const users = store.read('users', []);
  const owner = users.find((u) => u.id === project.ownerId);
  return {
    ...project,
    myRole: roleOf(user, project),
    ownerName: owner ? owner.name : null,
    ownerEmail: owner ? owner.email : null,
    members: (project.members || []).map((m) => {
      const account = users.find((u) => u.email === m.email);
      return { ...m, name: account ? account.name : null, joined: Boolean(account) };
    }),
    comments: project.comments || [],
    activity: project.activity || [],
    lastEdit: project.lastEdit || {},
  };
}

function withActivity(project, user, kind, section, detail) {
  const now = new Date().toISOString();
  const log = [...(project.activity || [])];
  const last = log[0];
  const coalesce = kind === 'edit' && last && last.kind === 'edit' && last.userId === user.id
    && last.section === section && Date.now() - Date.parse(last.at) < COALESCE_MS;
  if (coalesce) log[0] = { ...last, at: now };
  else log.unshift({ id: uuid(), kind, userId: user.id, name: user.name, section: section || null, detail: detail || null, at: now });
  return { ...project, activity: log.slice(0, MAX_ACTIVITY) };
}

function cleanEmails(list) {
  return [...new Set((Array.isArray(list) ? list : String(list || '').split(/[,;\s]+/))
    .map((e) => normaliseEmail(e)).filter(Boolean))];
}

// Runs `change` on a project the user may modify; returns the updated project, or an error code.
async function modifyProject(req, roles, change) {
  let outcome = { error: 404 };
  await store.update(COLLECTION, [], (all) =>
    all.map((p) => {
      if (p.id !== req.params.id) return p;
      const role = roleOf(req.user, p);
      if (!role) return p;
      if (!roles.includes(role)) { outcome = { error: 403 }; return p; }
      const result = change(p, role);
      if (result && result.error) { outcome = result; return p; }
      outcome = { project: result };
      return result;
    })
  );
  return outcome;
}

function sendOutcome(req, res, outcome, status = 200) {
  if (outcome.error === 404) return res.status(404).json({ error: 'Project not found' });
  if (outcome.error === 403) return res.status(403).json({ error: 'You do not have permission to do that on this project' });
  if (outcome.error) return res.status(outcome.error).json({ error: outcome.message });
  return res.status(status).json(present(outcome.project, req.user));
}

router.get('/', (req, res) => {
  res.json(store.read(COLLECTION, []).filter((p) => roleOf(req.user, p)).map((p) => present(p, req.user)));
});

router.get('/:id', (req, res) => {
  const project = accessibleProject(req.user, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(present(project, req.user));
});

router.post('/', async (req, res) => {
  const { title, field, deadline, publicationType, conferenceId, targetJournal, problemStatement, coauthors, reviewers } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (!PUBLICATION_TYPES.includes(publicationType)) {
    return res.status(400).json({ error: `publicationType must be one of: ${PUBLICATION_TYPES.join(', ')}` });
  }

  const members = [];
  const me = normaliseEmail(req.user.email);
  for (const [role, list] of [['coauthor', coauthors], ['reviewer', reviewers]]) {
    for (const email of cleanEmails(list)) {
      if (!EMAIL_PATTERN.test(email) || email.length > 200) return res.status(400).json({ error: `"${email}" is not a valid email address` });
      if (email === me || members.some((m) => m.email === email)) continue;
      members.push({ email, role, addedAt: new Date().toISOString() });
    }
  }
  if (members.length > MAX_MEMBERS) return res.status(400).json({ error: `A project can have at most ${MAX_MEMBERS} collaborators` });

  const details = { publicationType, problemStatement: (problemStatement || '').trim() };

  if (publicationType === 'conference') {
    const conference = conferences.get(conferenceId);
    if (!conference) return res.status(400).json({ error: 'conferenceId must be a conference from /api/conferences' });
    details.conference = conference;
  } else if (publicationType === 'journal') {
    details.targetJournal = (targetJournal || '').trim();
    if (details.targetJournal && !details.problemStatement) {
      return res.status(400).json({ error: 'problemStatement is required when a target journal is suggested' });
    }
  }

  const project = newProject({ title, field, deadline, ownerId: req.user.id, ...details });
  project.members = members;
  await store.update(COLLECTION, [], (all) => [...all, project]);
  const invites = await Promise.all(members.map(async (m) => ({ email: m.email, role: m.role, ...(await mailer.sendInvite({ to: m.email, inviter: req.user.name, projectTitle: project.title, role: m.role })) })));
  res.status(201).json({ ...present(project, req.user), invites });
});

router.put('/:id/manuscript/:section', async (req, res) => {
  const { section } = req.params;
  const { text } = req.body || {};
  if (!MANUSCRIPT_KEYS.includes(section) && !TEMPLATE_KEY.test(section)) {
    return res.status(400).json({ error: `section must be one of: ${MANUSCRIPT_KEYS.join(', ')} or a template section (t1, t2, ...)` });
  }
  if (typeof text !== 'string') return res.status(400).json({ error: 'text must be a string' });
  if (text.length > MAX_SECTION_LENGTH) {
    return res.status(413).json({ error: `text is too long (max ${MAX_SECTION_LENGTH} characters)` });
  }

  const outcome = await modifyProject(req, WRITERS, (p) => withActivity({
    ...p,
    manuscript: { ...(p.manuscript || {}), [section]: text },
    lastEdit: { ...(p.lastEdit || {}), [section]: { by: req.user.name, userId: req.user.id, at: new Date().toISOString() } },
  }, req.user, 'edit', section));
  sendOutcome(req, res, outcome);
});

router.put('/:id/template', async (req, res) => {
  const { sections, fileName } = req.body || {};
  if (!Array.isArray(sections) || sections.length > MAX_TEMPLATE_SECTIONS) {
    return res.status(400).json({ error: `sections must be an array of at most ${MAX_TEMPLATE_SECTIONS} headings` });
  }
  const titles = [];
  for (const s of sections) {
    const title = typeof s === 'string' ? s.trim() : '';
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return res.status(400).json({ error: `each heading must be 1-${MAX_TITLE_LENGTH} characters` });
    }
    if (!titles.some((t) => t.toLowerCase() === title.toLowerCase())) titles.push(title);
  }

  const outcome = await modifyProject(req, WRITERS, (p) => {
    if (p.publicationType !== 'conference') return { error: 400, message: 'Templates can only be set on conference projects' };
    let counter = p.templateCounter || 0;
    const old = p.templateSections || [];
    // Keep the key (and so the written text) for headings that survive a re-upload.
    const next = titles.map((title) => {
      const kept = old.find((o) => o.title.toLowerCase() === title.toLowerCase());
      return kept ? { key: kept.key, title } : { key: `t${++counter}`, title };
    });
    return withActivity({
      ...p,
      templateSections: next,
      templateCounter: counter,
      templateFileName: next.length ? String(fileName || '').slice(0, 200) || null : null,
    }, req.user, 'template', null, next.length ? `${next.length} sections` : 'standard stages');
  });
  sendOutcome(req, res, outcome);
});

router.patch('/:id/progress', async (req, res) => {
  const { stageKey, value } = req.body || {};
  if (!STAGE_KEYS.includes(stageKey)) {
    return res.status(400).json({ error: `stageKey must be one of: ${STAGE_KEYS.join(', ')}` });
  }
  if (typeof value !== 'number' || value < 0 || value > 100) {
    return res.status(400).json({ error: 'value must be a number between 0 and 100' });
  }

  const outcome = await modifyProject(req, WRITERS, (p) => recalcOverall({ ...p, progress: { ...p.progress, [stageKey]: value } }));
  sendOutcome(req, res, outcome);
});

router.post('/:id/members', async (req, res) => {
  const email = normaliseEmail((req.body || {}).email);
  const role = (req.body || {}).role;
  if (!EMAIL_PATTERN.test(email) || email.length > 200) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (!MEMBER_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${MEMBER_ROLES.join(', ')}` });
  if (email === normaliseEmail(req.user.email)) return res.status(400).json({ error: 'You already own this project' });

  const outcome = await modifyProject(req, ['owner'], (p) => {
    const members = [...(p.members || [])];
    const idx = members.findIndex((m) => m.email === email);
    if (idx === -1 && members.length >= MAX_MEMBERS) return { error: 400, message: `A project can have at most ${MAX_MEMBERS} collaborators` };
    if (idx === -1) members.push({ email, role, addedAt: new Date().toISOString() });
    else members[idx] = { ...members[idx], role };
    return withActivity({ ...p, members }, req.user, 'member', null, `${email} as ${role}`);
  });
  if (!outcome.project) return sendOutcome(req, res, outcome);
  const invite = { email, role, ...(await mailer.sendInvite({ to: email, inviter: req.user.name, projectTitle: outcome.project.title, role })) };
  res.status(201).json({ ...present(outcome.project, req.user), invites: [invite] });
});

router.delete('/:id/members/:email', async (req, res) => {
  const email = normaliseEmail(req.params.email);
  const outcome = await modifyProject(req, ['owner'], (p) =>
    withActivity({ ...p, members: (p.members || []).filter((m) => m.email !== email) }, req.user, 'member', null, `removed ${email}`));
  sendOutcome(req, res, outcome);
});

router.post('/:id/comments', async (req, res) => {
  const { section = 'general' } = req.body || {};
  const text = String((req.body || {}).text || '').trim();
  if (!validSection(section)) return res.status(400).json({ error: 'Unknown section' });
  if (!text) return res.status(400).json({ error: 'Write a comment first' });
  if (text.length > MAX_COMMENT_LENGTH) return res.status(413).json({ error: `Comments can be at most ${MAX_COMMENT_LENGTH} characters` });

  const outcome = await modifyProject(req, ['owner', 'coauthor', 'reviewer'], (p, role) => {
    const comments = p.comments || [];
    if (comments.length >= MAX_COMMENTS) return { error: 400, message: 'This project has reached its comment limit' };
    const comment = {
      id: uuid(), section, userId: req.user.id, name: req.user.name, role, text,
      createdAt: new Date().toISOString(), resolved: false,
    };
    return withActivity({ ...p, comments: [...comments, comment] }, req.user, 'comment', section);
  });
  sendOutcome(req, res, outcome, 201);
});

router.patch('/:id/comments/:commentId', async (req, res) => {
  const { resolved } = req.body || {};
  if (typeof resolved !== 'boolean') return res.status(400).json({ error: 'resolved must be true or false' });
  const outcome = await modifyProject(req, WRITERS, (p) => {
    if (!(p.comments || []).some((c) => c.id === req.params.commentId)) return { error: 404 };
    return { ...p, comments: p.comments.map((c) => (c.id === req.params.commentId ? { ...c, resolved } : c)) };
  });
  sendOutcome(req, res, outcome);
});

router.delete('/:id/comments/:commentId', async (req, res) => {
  const outcome = await modifyProject(req, ['owner', 'coauthor', 'reviewer'], (p, role) => {
    const comment = (p.comments || []).find((c) => c.id === req.params.commentId);
    if (!comment) return { error: 404 };
    if (role !== 'owner' && comment.userId !== req.user.id) return { error: 403 };
    return { ...p, comments: p.comments.filter((c) => c.id !== req.params.commentId) };
  });
  sendOutcome(req, res, outcome);
});

router.delete('/:id', async (req, res) => {
  let existed = false;
  await store.update(COLLECTION, [], (all) => {
    const mine = (p) => p.id === req.params.id && p.ownerId === req.user.id;
    existed = all.some(mine);
    return all.filter((p) => !mine(p));
  });
  if (!existed) return res.status(404).json({ error: 'Project not found' });
  res.status(204).send();
});

module.exports = router;
