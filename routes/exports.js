const express = require('express');
const { exportDocument, FORMATS } = require('../services/exporter');

const router = express.Router();

router.post('/:format', express.json({ limit: '8mb' }), async (req, res, next) => {
  const info = FORMATS[req.params.format];
  if (!info) return res.status(400).json({ error: `Unsupported format. Use ${Object.keys(FORMATS).join(', ')}.` });
  try {
    const buffer = await exportDocument(req.params.format, req.body || {});
    const name = String((req.body && req.body.title) || 'manuscript').replace(/[^\w-]+/g, '_').slice(0, 80) || 'manuscript';
    res.set({
      'Content-Type': info.mime,
      'Content-Disposition': `attachment; filename="${name}.${info.ext}"`,
    });
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
