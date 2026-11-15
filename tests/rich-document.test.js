const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../services/store');
const config = require('../config');
const { validateRichDocument } = require('../services/richDocument');

const document = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Heading', marks: [{ type: 'bold' }] }] },
    { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [
      { type: 'text', text: 'Evidence [[cite:paper]]', marks: [{ type: 'italic' }, { type: 'textStyle', attrs: { fontFamily: 'Arial', fontSize: '12pt' } }] },
    ] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [
        { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
        { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
      ] },
      { type: 'tableRow', content: [
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
      ] },
    ] },
  ],
};
const text = 'Heading\nEvidence [[cite:paper]]\nItem\nA\tB\n1\t2';

test('validates formatting, lists and tables and derives plain text', () => {
  assert.equal(validateRichDocument(document), text);
  assert.throws(() => validateRichDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'x' } }] }] }), /structure/);
  assert.throws(() => validateRichDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Unknown' } }] }] }] }), /font/);
  assert.throws(() => validateRichDocument({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [] }] }] }), /empty/);
  assert.throws(() => validateRichDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(200001) }] }] }), /too long/);
  assert.equal(validateRichDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'citation', attrs: { id: 'paper two' } }] }] }), '[[cite:paper%20two]]');
  assert.equal(validateRichDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'citation', attrs: { id: 'paper' }, marks: [{ type: 'bold' }] }] }] }), '[[cite:paper]]');
  assert.throws(() => validateRichDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'citation', attrs: { id: '' } }] }] }), /citation/);
});

test('rich documents and safety versions round-trip without allowing plain text edits to erase them', async (t) => {
  const originalRead = store.read;
  const originalStrict = store.updateStrict;
  let project = { id: 'p', ownerId: 'owner', members: [{ email: 'reviewer@example.com', role: 'reviewer' }], manuscript: { introduction: 'Legacy' }, manuscriptVersions: {} };
  store.read = (name, fallback) => name === 'projects' ? [project] : fallback;
  store.updateStrict = async (name, fallback, mutate) => { [project] = mutate([project]); };
  t.after(() => { store.read = originalRead; store.updateStrict = originalStrict; });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    req.user = req.headers['x-user'] === 'reviewer'
      ? { id: 'reviewer', email: 'reviewer@example.com', name: 'Reviewer' }
      : { id: 'owner', email: 'owner@example.com', name: 'Owner' };
    next();
  });
  app.use('/projects', require('../routes/projects'));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/projects/p/manuscript/introduction`;
  const request = (url, method, body, user = 'owner') => fetch(url, {
    method, headers: { 'content-type': 'application/json', 'x-user': user },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const legacy = await request(`${base}/versions`, 'POST', { text: 'Legacy' });
  assert.equal(legacy.status, 201);
  const legacyId = (await legacy.json()).manuscriptVersions.introduction[0].id;
  assert.equal((await request(base, 'PUT', { text: 'incorrect', document })).status, 400);
  assert.equal((await request(base, 'PUT', { text, document }, 'reviewer')).status, 403);
  const saved = await request(base, 'PUT', { text, document });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).manuscriptRich.introduction, document);
  assert.equal((await request(base, 'PUT', { text: 'Overwrite' })).status, 409);
  assert.equal((await request(base, 'PUT', { text })).status, 200);
  assert.deepEqual(project.manuscriptRich.introduction, document);
  const version = await request(`${base}/versions`, 'POST', { text });
  assert.equal(version.status, 201);
  const richId = (await version.json()).manuscriptVersions.introduction.at(-1).id;
  assert.equal((await request(`${base}/versions/${legacyId}/restore`, 'POST')).status, 200);
  assert.equal(project.manuscript.introduction, 'Legacy');
  assert.equal(project.manuscriptRich.introduction, undefined);
  assert.deepEqual(project.manuscriptVersions.introduction.at(-1).document, document);
  assert.equal((await request(`${base}/versions/${richId}/restore`, 'POST')).status, 200);
  assert.equal(project.manuscript.introduction, text);
  assert.deepEqual(project.manuscriptRich.introduction, document);
  assert.equal((await request(`${base}/versions/${legacyId}/restore`, 'POST', null, 'reviewer')).status, 403);
  assert.equal((await request(`${base}/plain-text`, 'POST', null, 'reviewer')).status, 403);
  assert.equal((await request(`${base}/plain-text`, 'POST')).status, 200);
  assert.equal(project.manuscript.introduction, text);
  assert.equal(project.manuscriptRich.introduction, undefined);
  assert.deepEqual(project.manuscriptVersions.introduction.at(-1).document, document);
  assert.equal((await request(`${base}/plain-text`, 'POST')).status, 409);
  const citedDocument = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Evidence ' },
    { type: 'citation', attrs: { id: 'paper two' }, marks: [{ type: 'bold' }] },
  ] }] };
  const citedText = 'Evidence [[cite:paper%20two]]';
  const citationSave = await request(base, 'PUT', { text: citedText, document: citedDocument });
  assert.equal(citationSave.status, 200);
  assert.deepEqual((await citationSave.json()).manuscriptRich.introduction, citedDocument);
  const citationVersion = await request(`${base}/versions`, 'POST', { text: citedText });
  assert.equal(citationVersion.status, 201);
  assert.deepEqual((await citationVersion.json()).manuscriptVersions.introduction.at(-1).document, citedDocument);
});

test('manuscript storage errors reach the client', async (t) => {
  const originalStrict = store.updateStrict;
  store.updateStrict = async () => { throw new Error('disk full'); };
  t.after(() => { store.updateStrict = originalStrict; });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: 'owner' }; next(); });
  app.use('/projects', require('../routes/projects'));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/projects/p/manuscript/introduction`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'test' }),
  });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'disk full');
});

test('formatted content and versions persist in the project store', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'researchflow-rich-test-'));
  const oldDir = config.dataDir;
  config.dataDir = dir;
  t.after(() => {
    config.dataDir = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await store.updateStrict('projects', [], () => [{ id: 'p', ownerId: 'owner', manuscript: {} }]);
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => { req.user = { id: 'owner', name: 'Owner' }; next(); });
  app.use('/projects', require('../routes/projects'));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/projects/p/manuscript/conceptNote/versions`;
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, document }),
  });
  assert.equal(response.status, 201);
  const [stored] = JSON.parse(fs.readFileSync(path.join(dir, 'projects.json'), 'utf8'));
  assert.deepEqual(stored.manuscriptRich.conceptNote, document);
  assert.deepEqual(stored.manuscriptVersions.conceptNote[0].document, document);
  assert.equal(stored.manuscript.conceptNote, text);
});
