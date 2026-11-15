const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuid } = require('uuid');
const store = require('../services/store');
const { accessibleProject, WRITERS } = require('../services/ownership');
const { extractPdfText } = require('../services/pdfText');
const corpus = require('../services/analysisCorpus');

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, parts: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['.pdf', '.txt'].includes(path.extname(file.originalname).toLowerCase())) {
      const error = new Error('Upload a .pdf or .txt file.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

function authorize(roles) {
  return (req, res, next) => {
    if (!accessibleProject(req.user, req.params.projectId, roles)) return res.status(404).json({ error: 'Project not found or permission denied.' });
    next();
  };
}

router.get('/:projectId/documents', authorize(), (req, res) => {
  res.json({ documents: corpus.list(req.params.projectId).map(corpus.metadata) });
});

router.post('/:projectId/documents', authorize(WRITERS), (req, res, next) => {
  upload.single('document')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message });
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  });
}, asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF or text document.' });
  let text;
  try {
    text = path.extname(req.file.originalname).toLowerCase() === '.pdf'
      ? await extractPdfText(req.file.buffer)
      : new TextDecoder('utf-8', { fatal: true }).decode(req.file.buffer);
  } catch (error) {
    return res.status(422).json({ error: `Could not extract text from the document: ${error.message}` });
  }
  text = text.trim();
  if (!text) return res.status(422).json({ error: 'No text could be extracted. Scanned PDFs require OCR before upload.' });
  if (text.length > corpus.MAX_TEXT_LENGTH) return res.status(413).json({ error: `Extracted text exceeds ${corpus.MAX_TEXT_LENGTH} characters. Split the document before uploading.` });
  const document = {
    id: uuid(),
    projectId: req.params.projectId,
    name: path.basename(req.file.originalname).slice(0, 200),
    characters: text.length,
    uploadedAt: new Date().toISOString(),
    text,
  };
  let saved = false;
  let full = false;
  await store.updateStrict(corpus.COLLECTION, [], (all) => {
    if (all.filter((item) => item.projectId === document.projectId).length >= corpus.MAX_DOCUMENTS) {
      full = true;
      return all;
    }
    saved = true;
    return [...all, document];
  });
  if (full) return res.status(409).json({ error: `A project can contain at most ${corpus.MAX_DOCUMENTS} analysis documents.` });
  if (!saved) return res.status(500).json({ error: 'Could not save the analysis document.' });
  return res.status(201).json(corpus.metadata(document));
}));

router.delete('/:projectId/documents/:documentId', authorize(WRITERS), asyncRoute(async (req, res) => {
  let found = false;
  await store.updateStrict(corpus.COLLECTION, [], (all) => all.filter((document) => {
    if (document.projectId === req.params.projectId && document.id === req.params.documentId) {
      found = true;
      return false;
    }
    return true;
  }));
  if (!found) return res.status(404).json({ error: 'Analysis document not found.' });
  return res.status(204).end();
}));

module.exports = router;
