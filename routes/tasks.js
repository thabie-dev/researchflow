const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();
const store = require('../services/store');

const COLLECTION = 'tasks';
const COLUMNS = ['todo', 'progress', 'review', 'done'];

router.get('/', (req, res) => {
  const all = store.read(COLLECTION, []);
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

  const task = {
    id: uuid(),
    title,
    output: output || 'No expected output added.',
    column,
    projectId: projectId || null,
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

  let updated = null;
  await store.update(COLLECTION, [], (all) =>
    all.map((t) => {
      if (t.id !== req.params.id) return t;
      updated = { ...t, ...req.body };
      return updated;
    })
  );

  if (!updated) return res.status(404).json({ error: 'Task not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  let existed = false;
  await store.update(COLLECTION, [], (all) => {
    existed = all.some((t) => t.id === req.params.id);
    return all.filter((t) => t.id !== req.params.id);
  });
  if (!existed) return res.status(404).json({ error: 'Task not found' });
  res.status(204).send();
});

module.exports = router;
