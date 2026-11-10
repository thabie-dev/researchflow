const express = require('express');
const router = express.Router();
const { extractHeadings } = require('../services/templateParser');

const MAX_BYTES = 15 * 1024 * 1024;

// Raw file bytes in the body; the original file name is sent in the X-File-Name header.
router.post('/parse', express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
  const fileName = decodeURIComponent(String(req.get('x-file-name') || ''));
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'No file received.' });
  }
  try {
    const found = await extractHeadings(req.body, fileName);
    const seen = new Set();
    const headings = found
      .map((t) => String(t).replace(/^\s*(?:\d+(?:\.\d+)*[.)]?|[IVX]+\.|[A-Z]\.)\s+/, '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && t.length <= 120 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
      .slice(0, 40);
    if (!headings.length) {
      return res.status(422).json({ error: 'No section headings were found in this file. Paste them into the box instead.' });
    }
    res.json({ fileName, headings });
  } catch (err) {
    res.status(422).json({ error: `Could not read this file: ${err.message}` });
  }
});

module.exports = router;
