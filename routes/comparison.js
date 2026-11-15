const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { accessibleProject } = require('../services/ownership');
const documentComparison = require('../services/documentComparison');

const router = express.Router();
const MAX_DOCUMENTS = 30;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 30 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.pdf', '.docx']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, os.tmpdir()),
    filename: (_req, file, callback) => {
      callback(null, `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_DOCUMENTS, parts: MAX_DOCUMENTS },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      const error = new Error(`Unsupported file type for ${path.basename(file.originalname)}. Use .txt, .md, .csv, .pdf, or .docx.`);
      error.status = 422;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

function authorizeProject(req, res, next) {
  const projectId = String(req.query.projectId || '');
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });
  if (!accessibleProject(req.user, projectId)) return res.status(404).json({ error: 'Project not found' });
  req.projectId = projectId;
  next();
}

function parseUploads(req, res, next) {
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TOTAL_UPLOAD_BYTES + 1024 * 1024) {
    return res.status(413).json({ error: 'Total document upload must be 30 MB or less.' });
  }
  upload.array('documents', MAX_DOCUMENTS)(req, res, (error) => {
    if (!error) return next();
    if (!(error instanceof multer.MulterError) && !error.status) return next(error);
    const status = error instanceof multer.MulterError
      ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      : error.status;
    res.status(status).json({ error: error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Each document must be 10 MB or less.'
      : error.message });
  });
}

async function removeTemporaryFiles(files) {
  await Promise.all((files || []).map((file) => fs.unlink(file.path).catch((error) => {
    if (error.code !== 'ENOENT') console.error('[comparison] Could not remove temporary upload:', error.message);
  })));
}

async function readUploads(req, res) {
  const files = req.files || [];
  try {
    if (files.length < 2) {
      res.status(422).json({ error: 'Upload at least two documents.' });
      return null;
    }
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      res.status(413).json({ error: 'Total document upload must be 30 MB or less.' });
      return null;
    }

    const documents = [];
    for (const file of files) {
      try {
        documents.push(await documentComparison.readDocument({
          path: file.path,
          originalname: path.basename(file.originalname),
        }));
      } catch (error) {
        res.status(422).json({ error: error.message });
        return null;
      }
    }
    return documents;
  } finally {
    await removeTemporaryFiles(files);
  }
}

router.post('/', authorizeProject, parseUploads, async (req, res) => {
  const documents = await readUploads(req, res);
  if (!documents) return;
  if (documents.length !== 2) return res.status(422).json({ error: 'Upload exactly two documents for a pair comparison.' });
  res.json(documentComparison.compare(documents[0], documents[1]));
});

router.post('/bulk', authorizeProject, parseUploads, async (req, res) => {
  const documents = await readUploads(req, res);
  if (!documents) return;
  res.json(documentComparison.compareMany(documents));
});

module.exports = router;
