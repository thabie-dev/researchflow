const express = require('express');
const store = require('../services/store');
const { accessibleProject, WRITERS } = require('../services/ownership');
const { buildSearchString, searchPapers } = require('../services/paperSearch');

const router = express.Router();
const COLLECTION = 'knowledgeBase';
const MAX_PAPERS = 400;
const MAX_HISTORY = 30;
const MAX_QUERY = 500;

const empty = (projectId) => ({ projectId, searches: [], papers: [], updatedAt: null });
const load = (projectId) => store.read(COLLECTION, []).find((k) => k.projectId === projectId) || empty(projectId);

function project(req, res, roles) {
  const found = accessibleProject(req.user, req.params.projectId, roles);
  if (!found) res.status(404).json({ error: 'Project not found' });
  return found;
}

router.get('/:projectId', (req, res) => {
  if (!project(req, res)) return;
  res.json(load(req.params.projectId));
});

router.post('/:projectId/suggest', (req, res) => {
  const p = project(req, res);
  if (!p) return;
  const manuscript = p.manuscript || {};
  const text = [p.problemStatement, manuscript.problemStatement, manuscript.introduction, manuscript.abstract, manuscript.keywords, p.title, p.field]
    .filter(Boolean).join(' ');
  const searchString = buildSearchString(text);
  if (!searchString) return res.status(400).json({ error: 'Write a problem statement or introduction first, so there is something to build the search from.' });
  res.json({ searchString });
});

router.post('/:projectId/search', async (req, res) => {
  const p = project(req, res, WRITERS);
  if (!p) return;
  const searchString = String((req.body || {}).searchString || '').trim();
  const fromYear = Number((req.body || {}).fromYear) || null;
  if (!searchString) return res.status(400).json({ error: 'Enter a search string' });
  if (searchString.length > MAX_QUERY) return res.status(400).json({ error: `The search string can be at most ${MAX_QUERY} characters` });

  let found;
  try {
    found = await searchPapers(searchString, { fromYear });
  } catch (err) {
    return res.status(502).json({ error: `The paper search service could not be reached (${err.message}). Try again shortly.` });
  }

  let result;
  await store.update(COLLECTION, [], (all) => {
    const current = all.find((k) => k.projectId === p.id) || empty(p.id);
    const known = new Set(current.papers.map((x) => x.id));
    const added = found.filter((x) => x.id && !known.has(x.id));
    result = {
      ...current,
      papers: [...current.papers, ...added].slice(0, MAX_PAPERS),
      searches: [{ query: searchString, fromYear, found: found.length, added: added.length, by: req.user.name, at: new Date().toISOString() }, ...current.searches].slice(0, MAX_HISTORY),
      updatedAt: new Date().toISOString(),
    };
    return [...all.filter((k) => k.projectId !== p.id), result];
  });
  res.json(result);
});

router.delete('/:projectId/papers/:paperId', async (req, res) => {
  const p = project(req, res, WRITERS);
  if (!p) return;
  let result = null;
  await store.update(COLLECTION, [], (all) => all.map((k) => {
    if (k.projectId !== p.id) return k;
    result = { ...k, papers: k.papers.filter((x) => x.id !== req.params.paperId), updatedAt: new Date().toISOString() };
    return result;
  }));
  res.json(result || empty(p.id));
});

module.exports = router;
