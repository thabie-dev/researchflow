const express = require('express');
const router = express.Router();
const registry = require('../services/aiToolsRegistry');
const discovery = require('../services/discovery');

// GET /api/ai-tools -> every stage's catalog + refresh metadata
router.get('/', (req, res) => {
  res.json({ meta: registry.getMeta(), stages: registry.getAllTools() });
});

// GET /api/ai-tools/:stage?embeddable=true
router.get('/:stage', (req, res) => {
  const { stage } = req.params;
  if (!registry.listStages().includes(stage)) {
    return res.status(404).json({ error: `Unknown stage "${stage}". Valid stages: ${registry.listStages().join(', ')}` });
  }
  const onlyEmbeddable = req.query.embeddable === 'true';
  res.json({ stage, meta: registry.getMeta(), tools: registry.getToolsForStage(stage, { onlyEmbeddable }) });
});

// POST /api/ai-tools/refresh              -> refresh every stage
// POST /api/ai-tools/refresh?stage=xyz    -> refresh one stage
// Fire-and-poll: kicks the job off and returns immediately so a slow search
// provider / LLM call never blocks the HTTP request.
router.post('/refresh', (req, res) => {
  const { stage } = req.query;

  if (stage && !registry.listStages().includes(stage)) {
    return res.status(404).json({ error: `Unknown stage "${stage}".` });
  }

  const job = stage ? discovery.runDiscoveryForStage(stage) : discovery.runDiscoveryForAllStages();
  job.catch((err) => console.error('[ai-tools] manual refresh failed:', err));

  res.status(202).json({ status: 'refresh_started', stage: stage || 'all' });
});

module.exports = router;
