const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const store = require('../services/store');
const { renderReferences } = require('../services/references');
const PDFDocument = require('pdfkit');
const { firstPageDoi, metadataAuthors } = require('../services/pdfReference');

async function makePdf(info, pages) {
  const pdf = new PDFDocument({ info });
  const chunks = [];
  pdf.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });
  pages.forEach((text, index) => {
    if (index) pdf.addPage();
    pdf.text(text);
  });
  pdf.end();
  await done;
  return Buffer.concat(chunks);
}

test('PDF metadata parsing avoids ambiguous authors and multiple DOIs', () => {
  assert.deepEqual(metadataAuthors('Jane Smith; John Brown'), ['Jane Smith', 'John Brown']);
  assert.deepEqual(metadataAuthors('Smith, Jane'), []);
  assert.deepEqual(metadataAuthors('Smith, Jane; John Brown'), []);
  assert.equal(firstPageDoi('https://doi.org/10.1234/Example.'), '10.1234/Example');
  assert.equal(firstPageDoi('(doi:10.1234/test(abc)).'), '10.1234/test(abc)');
  assert.equal(firstPageDoi('10.1234/one and 10.2345/two'), '');
});

test('manual references persist, enforce access, detect duplicates, and render citations', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'researchflow-reference-test-'));
  const oldDir = config.dataDir;
  config.dataDir = dir;
  t.after(() => { config.dataDir = oldDir; fs.rmSync(dir, { recursive: true, force: true }); });
  await store.updateStrict('projects', [], () => [{
    id: 'p', ownerId: 'owner', members: [{ email: 'reviewer@example.com', role: 'reviewer' }],
    manuscript: {}, referenceStyle: 'apa',
  }, { id: 'other', ownerId: 'owner', manuscript: {} }]);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = req.headers['x-user'] === 'reviewer' ? { id: 'reviewer', email: 'reviewer@example.com' }
      : req.headers['x-user'] === 'outsider' ? { id: 'outsider', email: 'outsider@example.com' }
        : { id: 'owner', email: 'owner@example.com' };
    next();
  });

  app.use('/literature', require('../routes/literature'));
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/literature`;
  const request = (endpoint, method, body, user = 'owner') => fetch(base + endpoint, {
    method, headers: { 'content-type': 'application/json', 'x-user': user },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const source = {
    type: 'article-journal', title: 'A manual study', authors: ['Jane Smith', 'John Brown'],
    year: 2020, venue: 'Example Journal', volume: '12', issue: '3', pages: '10-25',
    doi: 'https://doi.org/10.1234/Example', url: 'https://example.test/article',
  };
  const uploadPdf = (file, name, user = 'owner') => {
    const form = new FormData();
    form.append('document', new Blob([file]), name);
    return fetch(`${base}/p/references/pdf-prefill`, { method: 'POST', headers: { 'x-user': user }, body: form });
  };
  const pdf = await makePdf({ Title: 'Climate Adaptation', Author: 'Jane Smith; John Brown' }, [
    'Article DOI: 10.1234/climate. Published research.',
    'Reference DOI: 10.9999/other',
  ]);
  assert.equal((await uploadPdf(pdf, 'source.pdf', 'reviewer')).status, 404);
  assert.equal((await uploadPdf(pdf, 'source.pdf', 'outsider')).status, 404);
  assert.equal((await uploadPdf(pdf, 'source.txt')).status, 400);
  const prefill = await uploadPdf(pdf, 'source.pdf');
  assert.equal(prefill.status, 200);
  assert.deepEqual((await prefill.json()).fields, { title: 'Climate Adaptation', authors: ['Jane Smith', 'John Brown'], doi: '10.1234/climate' });
  assert.equal((await (await request('/p', 'GET')).json()).papers.length, 0);
  assert.equal((await uploadPdf(Buffer.from('not a PDF'), 'invalid.pdf')).status, 422);
  assert.equal((await uploadPdf(Buffer.alloc(5 * 1024 * 1024 + 1), 'large.pdf')).status, 413);
  assert.equal((await request('/p/papers', 'POST', source, 'reviewer')).status, 404);
  assert.equal((await request('/p/papers', 'POST', source, 'outsider')).status, 404);
  const response = await request('/p/papers', 'POST', source);
  assert.equal(response.status, 201);
  const added = await response.json();
  assert.match(added.paper.id, /^manual:/);
  assert.equal(added.paper.doi, '10.1234/Example');
  assert.equal(added.knowledgeBase.papers.length, 1);
  const loaded = await (await request('/p', 'GET')).json();
  assert.deepEqual(loaded.papers[0], added.paper);
  const marker = `[[cite:${encodeURIComponent(added.paper.id)}]]`;
  const formatted = await request('/p/references/render', 'POST', { sections: [{ title: 'Intro', text: `Evidence ${marker}.` }] });
  const result = await formatted.json();
  assert.match(result.sections[0].text, /Smith.*Brown.*2020/);
  assert.match(result.bibliography, /Example Journal/);
  assert.match(result.bibliography, /10.1234\/Example/);
  assert.equal((await request('/p/papers', 'POST', { ...source, title: 'Another title', doi: 'doi:10.1234/example' })).status, 409);
  assert.equal((await request('/p/papers', 'POST', { ...source, doi: '', title: ' A manual study ' })).status, 409);
  assert.equal((await request('/other/papers', 'POST', source)).status, 201);
  for (const invalid of [
    { ...source, title: ' ' }, { ...source, authors: 'Smith' }, { ...source, type: 'unknown' },
    { ...source, year: 'nope' }, { ...source, url: 'javascript:alert(1)' }, { ...source, doi: 'bad' },
  ]) assert.equal((await request('/p/papers', 'POST', invalid)).status, 400);
  const book = { type: 'book', title: 'A research book', authors: ['Jane Smith'], year: 2019, publisher: 'Academic Press' };
  const savedBook = await (await request('/p/papers', 'POST', book)).json();
  const bookMarker = `[[cite:${encodeURIComponent(savedBook.paper.id)}]]`;
  const renderedBook = await (await request('/p/references/render', 'POST', { sections: [{ title: 'Text', text: bookMarker }] })).json();
  assert.match(renderedBook.bibliography, /Academic Press/);
  assert.doesNotMatch(renderedBook.warnings.join(' '), /incomplete metadata/);
  const concurrent = await Promise.all([request('/p/papers', 'POST', { ...book, title: 'Concurrent title' }), request('/p/papers', 'POST', { ...book, title: 'Concurrent title' })]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
});

test('all supported manual source types render in each citation style', () => {
  const sources = [
    { type: 'article-journal', title: 'Journal source', venue: 'Example Journal' },
    { type: 'book', title: 'Book source', publisher: 'Academic Press' },
    { type: 'paper-conference', title: 'Conference source', venue: 'Example Conference' },
    { type: 'report', title: 'Report source', publisher: 'Research Institute' },
    { type: 'webpage', title: 'Web source', url: 'https://example.test/page' },
  ].map((item, index) => ({ ...item, id: `m${index}`, authors: ['Jane Smith'], year: 2020 }));
  const text = sources.map((source) => `[[cite:${source.id}]]`).join(' ');
  for (const style of ['apa', 'harvard', 'ieee', 'vancouver']) {
    const result = renderReferences([{ title: 'Test', text }], sources, style);
    for (const source of sources) assert.ok(result.bibliography.includes(source.title));
    assert.doesNotMatch(result.sections[0].text, /\[\[cite:/);
    assert.ok(!result.warnings.some((warning) => warning.includes('incomplete metadata')));
  }
});

test('manual reference storage failures are reported', async (t) => {
  const originalRead = store.read;
  const originalUpdate = store.updateStrict;
  store.read = (name, fallback) => name === 'projects' ? [{ id: 'p', ownerId: 'owner' }] : fallback;
  store.updateStrict = async () => { throw new Error('disk full'); };
  t.after(() => { store.read = originalRead; store.updateStrict = originalUpdate; });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: 'owner' }; next(); });
  app.use('/literature', require('../routes/literature'));
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/literature/p/papers`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'book', title: 'Source', authors: [] }),
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'disk full');
});
