const express = require('express');
const { v4: uuid } = require('uuid');
const multer = require('multer');
const path = require('path');
const store = require('../services/store');
const { accessibleProject, WRITERS } = require('../services/ownership');
const { buildSearchString, searchPapers } = require('../services/paperSearch');
const literatureAnalysis = require('../services/literatureAnalysis');
const { analyzeExpertModel } = require('../services/expertModel');
const { trainWord2Vec } = require('../services/word2vec');
const { STYLES, renderReferences, ReferenceInputError } = require('../services/references');
const analysisCorpus = require('../services/analysisCorpus');
const { extractPdfReference } = require('../services/pdfReference');

const router = express.Router();
const COLLECTION = 'knowledgeBase';
const MAX_PAPERS = 400;
const MAX_HISTORY = 30;
const MAX_QUERY = 500;
const MAX_SECONDARY_KEYWORDS = 12;
const MANUAL_TYPES = ['article-journal', 'book', 'paper-conference', 'report', 'webpage'];
const referencePdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, parts: 1 },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
      const error = new Error('Choose a PDF file.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

const empty = (projectId) => ({ projectId, searches: [], papers: [], updatedAt: null });
const load = (projectId) => store.read(COLLECTION, []).find((k) => k.projectId === projectId) || empty(projectId);
const cleanPhrase = (value) => String(value || '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
const paperKeys = (paper) => {
  const doi = String(paper.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
  const title = String(paper.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return [
    ...(doi ? [`doi:${doi}`] : []),
    ...(title ? [`title:${title}|${paper.year || ''}`] : []),
    ...(paper.id ? [`id:${paper.id}`] : []),
  ];
};

function project(req, res, roles) {
  const found = accessibleProject(req.user, req.params.projectId, roles);
  if (!found) res.status(404).json({ error: 'Project not found' });
  return found;
}

router.get('/:projectId', (req, res) => {
  if (!project(req, res)) return;
  res.json(load(req.params.projectId));
});

router.post('/:projectId/references/pdf-prefill', (req, res, next) => {
  if (!project(req, res, WRITERS)) return;
  referencePdfUpload.single('document')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message });
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  });
}, async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF file.' });
  try {
    const result = await extractPdfReference(req.file.buffer);
    return res.json(result);
  } catch (error) {
    if (error.name === 'PasswordException' || error.name === 'InvalidPDFException' ||
        error.name === 'FormatError' || error.name === 'UnknownErrorException') {
      return res.status(422).json({ error: 'Could not read the PDF. Check that it is valid and not password-protected.' });
    }
    return next(error);
  }
});

router.post('/:projectId/papers', async (req, res, next) => {
  const p = project(req, res, WRITERS);
  if (!p) return;
  const body = req.body || {};
  const fields = { title: 500, venue: 300, publisher: 300, volume: 60, issue: 60, pages: 100, doi: 300, url: 2000 };
  for (const [field, max] of Object.entries(fields)) {
    if (body[field] != null && (typeof body[field] !== 'string' || body[field].trim().length > max)) {
      return res.status(400).json({ error: `${field} must be a string of at most ${max} characters` });
    }
  }
  if (!body.title || !body.title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!MANUAL_TYPES.includes(body.type)) return res.status(400).json({ error: 'Choose a supported source type' });
  if (!Array.isArray(body.authors) || body.authors.length > 50 ||
      body.authors.some((author) => typeof author !== 'string' || !author.trim() || author.trim().length > 200)) {
    return res.status(400).json({ error: 'Authors must be a list of up to 50 non-empty names of at most 200 characters each' });
  }
  if (body.year != null && typeof body.year !== 'string' && typeof body.year !== 'number') {
    return res.status(400).json({ error: 'Enter a valid publication year' });
  }
  const year = body.year == null || body.year === '' ? null : Number(body.year);
  if (year !== null && (!Number.isInteger(year) || year < 1 || year > new Date().getFullYear() + 1)) {
    return res.status(400).json({ error: 'Enter a valid publication year' });
  }
  const url = (body.url || '').trim();
  if (url) {
    try {
      if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Unsupported protocol');
    } catch (error) {
      return res.status(400).json({ error: 'URL must be a valid http or https address' });
    }
  }
  const doi = (body.doi || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  if (doi && !/^10\.\d{4,9}\/\S+$/i.test(doi)) return res.status(400).json({ error: 'Enter a valid DOI, such as 10.1234/example' });
  const paper = {
    id: `manual:${uuid()}`,
    type: body.type,
    title: body.title.trim(),
    authors: body.authors.map((author) => author.trim()),
    year,
    venue: (body.venue || '').trim(),
    publisher: (body.publisher || '').trim(),
    volume: (body.volume || '').trim(),
    issue: (body.issue || '').trim(),
    pages: (body.pages || '').trim(),
    doi, url, abstract: '', pdfUrl: '', citations: 0, source: 'Manual', sources: ['Manual'],
  };
  let result;
  let problem;
  try {
    await store.updateStrict(COLLECTION, [], (all) => {
      const current = all.find((k) => k.projectId === p.id) || empty(p.id);
      const keys = new Set(paperKeys(paper));
      const duplicate = current.papers.find((item) => paperKeys(item).some((key) => keys.has(key)));
      if (duplicate) {
        problem = `This source is already in your project library: ${duplicate.title}`;
        return all;
      }
      if (current.papers.length >= MAX_PAPERS) {
        problem = `The project library is full (maximum ${MAX_PAPERS} sources).`;
        return all;
      }
      result = { ...current, papers: [...current.papers, paper], updatedAt: new Date().toISOString() };
      return [...all.filter((item) => item.projectId !== p.id), result];
    });
    if (problem) return res.status(409).json({ error: problem });
    return res.status(201).json({ paper, knowledgeBase: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/:projectId/references/render', (req, res) => {
  const p = project(req, res);
  if (!p) return;
  const { sections } = req.body || {};
  if (!Array.isArray(sections) || sections.length > 50 || sections.some((section) =>
    !section || typeof section.title !== 'string' || section.title.length > 200 ||
    typeof section.text !== 'string' || section.text.length > 200000)) {
    return res.status(400).json({ error: 'sections must contain up to 50 titles and text strings' });
  }
  const style = p.referenceStyle || 'apa';
  if (!Object.hasOwn(STYLES, style)) return res.status(400).json({ error: 'The project citation style is invalid.' });
  try {
    return res.json({ ...renderReferences(sections, load(p.id).papers, style), style });
  } catch (error) {
    if (error instanceof ReferenceInputError) return res.status(400).json({ error: error.message });
    throw error;
  }
});

router.put('/:projectId/strategy', async (req, res) => {
  const p = project(req, res, WRITERS);
  if (!p) return;
  const body = req.body || {};
  if (typeof body.primaryKeyword !== 'string') {
    return res.status(400).json({ error: 'primaryKeyword must be a string' });
  }
  const primaryKeyword = cleanPhrase(body.primaryKeyword);
  const rawSecondary = body.secondaryKeywords;
  if (primaryKeyword.length < 2 || primaryKeyword.length > 120) {
    return res.status(400).json({ error: 'primaryKeyword must be 2-120 characters' });
  }
  if (!Array.isArray(rawSecondary) || rawSecondary.length > MAX_SECONDARY_KEYWORDS) {
    return res.status(400).json({ error: `secondaryKeywords must be an array with no more than ${MAX_SECONDARY_KEYWORDS} entries` });
  }
  if (rawSecondary.some((term) => typeof term !== 'string')) {
    return res.status(400).json({ error: 'secondaryKeywords entries must be strings' });
  }
  const secondaryKeywords = [...new Set(rawSecondary.map(cleanPhrase).filter(Boolean))];
  if (secondaryKeywords.some((term) => term.length < 2 || term.length > 100)) {
    return res.status(400).json({ error: 'Each secondary keyword must be 2-100 characters' });
  }
  const searchString = `"${primaryKeyword}"${secondaryKeywords.length
    ? ` AND (${secondaryKeywords.map((term) => `"${term}"`).join(' OR ')})`
    : ''}`;
  if (searchString.length > MAX_QUERY) {
    return res.status(400).json({ error: `The compiled search string exceeds ${MAX_QUERY} characters` });
  }

  let result;
  await store.update(COLLECTION, [], (all) => {
    const current = all.find((item) => item.projectId === p.id) || empty(p.id);
    result = {
      ...current,
      searchStrategy: { primaryKeyword, secondaryKeywords, searchString, updatedAt: new Date().toISOString() },
    };
    return [...all.filter((item) => item.projectId !== p.id), result];
  });
  res.json(result.searchStrategy);
});

router.get('/:projectId/analysis', (req, res) => {
  const p = project(req, res);
  if (!p) return;
  const papers = load(req.params.projectId).papers;
  if (!papers.length) return res.status(409).json({ error: 'Collect papers before analyzing the literature.' });
  res.json(literatureAnalysis.analyze(papers, p));
});

router.get('/:projectId/analysis/expert-model', (req, res) => {
  const p = project(req, res);
  if (!p) return;
  const knowledge = load(req.params.projectId);
  const papers = knowledge.papers;
  const scope = req.query.source || 'all';
  if (!['all', 'papers', 'documents'].includes(scope)) return res.status(400).json({ error: 'source must be all, papers or documents' });
  const { documents, corpus } = analysisCorpus.sources(p.id, papers, scope);
  if (!corpus.length) return res.status(409).json({ error: 'Collect papers or upload analysis documents first.' });
  const secondary = req.query.secondary;
  const strategy = knowledge.searchStrategy || {};
  if (secondary !== undefined && (typeof secondary !== 'string' || !(strategy.secondaryKeywords || []).includes(secondary))) {
    return res.status(400).json({ error: 'Choose a saved secondary keyword for subdomain analysis.' });
  }
  const selected = secondary ? corpus.filter((item) => `${item.title || ''} ${item.abstract || ''}`.toLowerCase().includes(secondary.toLowerCase())) : corpus;
  if (!selected.length) return res.status(409).json({ error: `No saved source contains the secondary keyword "${secondary}".` });
  const result = analyzeExpertModel(selected, p);
  const retained = result.terms.filter((term) => term.retained).slice(0, 8);
  const quote = (term) => `"${term.replace(/["\\]/g, ' ')}"`;
  let subdomainQuery = secondary ? `${quote(strategy.primaryKeyword)} AND ${quote(secondary)}` : null;
  if (subdomainQuery) {
    const included = [];
    for (const term of retained) {
      const proposed = [...included, quote(term.term)];
      if (`${subdomainQuery} AND (${proposed.join(' OR ')})`.length <= MAX_QUERY) included.push(quote(term.term));
    }
    if (included.length) subdomainQuery += ` AND (${included.join(' OR ')})`;
  }
  res.json({ ...result, source: scope, collected_papers: papers.length, uploaded_documents: documents.length, secondary_keyword: secondary || null, subdomain_query: subdomainQuery });
});

router.post('/:projectId/analysis/word2vec', (req, res) => {
  const p = project(req, res);
  if (!p) return;
  const papers = load(p.id).papers;
  const { terms, mode = 'similar', source = 'all', axes } = req.body || {};
  if (!['all', 'papers', 'documents'].includes(source)) return res.status(400).json({ error: 'source must be all, papers or documents' });
  const { documents, corpus } = analysisCorpus.sources(p.id, papers, source);
  if (!corpus.length) return res.status(409).json({ error: 'No sources are available in the selected corpus.' });
  if (!['similar', 'dissimilar'].includes(mode)) return res.status(400).json({ error: 'mode must be similar or dissimilar' });
  if (terms !== undefined && (!Array.isArray(terms) || terms.length > 8 || terms.some((term) => typeof term !== 'string' || term.length > 60))) {
    return res.status(400).json({ error: 'terms must be an array of up to 8 terms, each no longer than 60 characters' });
  }
  if (axes !== undefined && (!axes || typeof axes !== 'object' || Array.isArray(axes))) {
    return res.status(400).json({ error: 'axes must contain x and y keyword lists' });
  }
  try {
    res.json({ ...trainWord2Vec(corpus, terms || [], mode, axes || null), source, collected_papers: papers.length, uploaded_documents: documents.length });
  } catch (error) {
    if (error.status === 400 || error.status === 409) return res.status(error.status).json({ error: error.message });
    throw error;
  }
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

router.post('/:projectId/search', async (req, res, next) => {
  const p = project(req, res, WRITERS);
  if (!p) return;
  const searchString = String((req.body || {}).searchString || '').trim();
  const rawFromYear = (req.body || {}).fromYear;
  const includeScopus = (req.body || {}).includeScopus;
  if (includeScopus !== undefined && typeof includeScopus !== 'boolean') return res.status(400).json({ error: 'includeScopus must be a boolean' });
  const fromYear = rawFromYear !== undefined && rawFromYear !== null && rawFromYear !== '' ? Number(rawFromYear) : null;
  if (!searchString) return res.status(400).json({ error: 'Enter a search string' });
  if (searchString.length > MAX_QUERY) return res.status(400).json({ error: `The search string can be at most ${MAX_QUERY} characters` });
  if (fromYear !== null && (!Number.isInteger(fromYear) || fromYear < 1800 || fromYear > new Date().getFullYear())) {
    return res.status(400).json({ error: 'fromYear must be a valid publication year' });
  }

  let found;
  try {
    found = await searchPapers(searchString, { fromYear, includeScopus: includeScopus === true });
  } catch (err) {
    if (err.status === 503) return res.status(503).json({ error: err.message });
    return res.status(502).json({ error: `The paper search service could not be reached (${err.message}). Try again shortly.` });
  }

  let result;
  try {
    await store.updateStrict(COLLECTION, [], (all) => {
      const current = all.find((k) => k.projectId === p.id) || empty(p.id);
      const known = new Set(current.papers.flatMap(paperKeys));
      const added = [];
      for (const paper of found.papers) {
        if (!paper.id || added.length >= MAX_PAPERS - current.papers.length) continue;
        const keys = paperKeys(paper);
        if (keys.some((key) => known.has(key))) continue;
        keys.forEach((key) => known.add(key));
        added.push(paper);
      }
      result = {
        ...current,
        papers: [...current.papers, ...added].slice(0, MAX_PAPERS),
        searches: [{
          query: searchString,
          fromYear,
          includeScopus: includeScopus === true,
          found: found.papers.length,
          added: added.length,
          sources: found.sources,
          by: req.user.name,
          at: new Date().toISOString(),
        }, ...current.searches].slice(0, MAX_HISTORY),
        updatedAt: new Date().toISOString(),
      };
      return [...all.filter((k) => k.projectId !== p.id), result];
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/:projectId/papers/:paperId/authors', async (req, res, next) => {
  const p = project(req, res, WRITERS);
  if (!p) return;
  const { authors } = req.body || {};
  if (!Array.isArray(authors) || !authors.length || authors.length > 50 ||
      authors.some((name) => typeof name !== 'string' || !name.trim() || name.trim().length > 200)) {
    return res.status(400).json({ error: 'Enter 1 to 50 author names, each at most 200 characters.' });
  }
  try {
    let updated = null;
    await store.updateStrict(COLLECTION, [], (all) => all.map((kb) => {
      if (kb.projectId !== p.id || !kb.papers.some((paper) => paper.id === req.params.paperId)) return kb;
      updated = { ...kb, papers: kb.papers.map((paper) => paper.id === req.params.paperId
        ? { ...paper, authors: authors.map((name) => name.trim()), authorsIncomplete: false } : paper), updatedAt: new Date().toISOString() };
      return updated;
    }));
    if (!updated) return res.status(404).json({ error: 'Paper not found.' });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:projectId/papers/:paperId', async (req, res) => {
  const p = project(req, res, WRITERS);
  if (!p) return;
  const marker = `[[cite:${encodeURIComponent(req.params.paperId)}]]`;
  if (Object.values(p.manuscript || {}).some((text) => typeof text === 'string' && text.includes(marker))) {
    return res.status(409).json({ error: 'This paper is cited in the project. Remove its citation markers before removing the paper.' });
  }
  let result = null;
  await store.update(COLLECTION, [], (all) => all.map((k) => {
    if (k.projectId !== p.id) return k;
    result = { ...k, papers: k.papers.filter((x) => x.id !== req.params.paperId), updatedAt: new Date().toISOString() };
    return result;
  }));
  res.json(result || empty(p.id));
});

module.exports = router;
