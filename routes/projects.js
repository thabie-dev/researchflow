const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();
const store = require('../services/store');

const COLLECTION = 'projects';

const STAGE_KEYS = [
  'problemStatement', 'conceptNote', 'literatureReview', 'frameworks',
  'methodology', 'ethics', 'dataCollection', 'dataAnalysis', 'writing', 'submission',
];

function newProject({ title, field, deadline }) {
  const progress = Object.fromEntries(STAGE_KEYS.map((k) => [k, 0]));
  return {
    id: uuid(),
    title,
    field: field || 'Not specified',
    deadline: deadline || null,
    createdAt: new Date().toISOString(),
    progress,
    overallProgress: 0,
  };
}

function recalcOverall(project) {
  const values = Object.values(project.progress);
  project.overallProgress = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return project;
}

router.get('/', (req, res) => {
  res.json(store.read(COLLECTION, []));
});

router.get('/:id', (req, res) => {
  const project = store.read(COLLECTION, []).find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/', async (req, res) => {
  const { title, field, deadline } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

  const project = newProject({ title, field, deadline });
  await store.update(COLLECTION, [], (all) => [...all, project]);
  res.status(201).json(project);
});

router.patch('/:id/progress', async (req, res) => {
  const { stageKey, value } = req.body || {};
  if (!STAGE_KEYS.includes(stageKey)) {
    return res.status(400).json({ error: `stageKey must be one of: ${STAGE_KEYS.join(', ')}` });
  }
  if (typeof value !== 'number' || value < 0 || value > 100) {
    return res.status(400).json({ error: 'value must be a number between 0 and 100' });
  }

  let updated = null;
  await store.update(COLLECTION, [], (all) =>
    all.map((p) => {
      if (p.id !== req.params.id) return p;
      const next = { ...p, progress: { ...p.progress, [stageKey]: value } };
      updated = recalcOverall(next);
      return updated;
    })
  );

  if (!updated) return res.status(404).json({ error: 'Project not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  let existed = false;
  await store.update(COLLECTION, [], (all) => {
    existed = all.some((p) => p.id === req.params.id);
    return all.filter((p) => p.id !== req.params.id);
  });
  if (!existed) return res.status(404).json({ error: 'Project not found' });
  res.status(204).send();
});

module.exports = router;
