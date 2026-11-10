const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();
const store = require('../services/store');
const { accessibleProject, accessibleProjectIds, WRITERS } = require('../services/ownership');

const COLLECTION = 'tasks';
const COLUMNS = ['todo', 'progress', 'review', 'done'];

router.get('/', (req, res) => {
  const mine = accessibleProjectIds(req.user);
  const all = store.read(COLLECTION, []).filter((t) => mine.has(t.projectId));
  const { projectId, column } = req.query;
  const filtered = all.filter(
    (t) => (!projectId || t.projectId === projectId) && (!column || t.column === column)
  );
  res.json(filtered);
});

router.post('/', async (req, res) => {
  const { title, column = 'todo', output, projectId } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (!COLUMNS.includes(column)) return res.status(400).json({ error: `column must be one of: ${COLUMNS.join(', ')}` });
  if (!accessibleProject(req.user, projectId, WRITERS)) return res.status(403).json({ error: 'Only the owner and co-authors can change tasks' });

  const task = {
    id: uuid(),
    title,
    output: output || 'No expected output added.',
    column,
    projectId,
    createdAt: new Date().toISOString(),
  };

  await store.update(COLLECTION, [], (all) => [...all, task]);
  res.status(201).json(task);
});

router.patch('/:id', async (req, res) => {
  const { column } = req.body || {};
  if (column && !COLUMNS.includes(column)) {
    return res.status(400).json({ error: `column must be one of: ${COLUMNS.join(', ')}` });
  }

  const mine = accessibleProjectIds(req.user, WRITERS);
  let updated = null;
  await store.update(COLLECTION, [], (all) =>
    all.map((t) => {
      if (t.id !== req.params.id || !mine.has(t.projectId)) return t;
      // Only the column and title can change; id and projectId stay as they were.
      updated = { ...t, ...(column ? { column } : {}), ...(typeof req.body.title === 'string' && req.body.title.trim() ? { title: req.body.title } : {}) };
      return updated;
    })
  );

  if (!updated) return res.status(404).json({ error: 'Task not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const mine = accessibleProjectIds(req.user, WRITERS);
  let existed = false;
  await store.update(COLLECTION, [], (all) => {
    const target = (t) => t.id === req.params.id && mine.has(t.projectId);
    existed = all.some(target);
    return all.filter((t) => !target(t));
  });
  if (!existed) return res.status(404).json({ error: 'Task not found' });
  res.status(204).send();
});

module.exports = router;
