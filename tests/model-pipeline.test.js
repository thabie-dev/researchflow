const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const PDFDocument = require('pdfkit');
const store = require('../services/store');
const { trainWord2Vec } = require('../services/word2vec');
const { analyzeExpertModel } = require('../services/expertModel');

const text = 'climate resilience planning strengthens coastal communities climate resilience planning supports coastal adaptation';

test('expert model prunes ranked network terms without joining across stopwords', () => {
  const data = analyzeExpertModel([
    { title: '', abstract: `${text} forests and wetlands` },
    { title: '', abstract: text },
  ], { title: 'Climate', field: 'Environment' });
  assert.ok(data.terms.some((term) => term.term === 'climate resilience' && term.retained));
  assert.ok(!data.terms.some((term) => term.term === 'forests wetlands'));
  assert.ok(data.pruning.retained_count > 0);
  assert.ok(data.network.edges.length > 0);
});

test('Word2Vec returns real sorted similar and dissimilar results and rejects unknown words', () => {
  const corpus = [{ title: '', abstract: `${text} ${text} ${text}` }];
  const similar = trainWord2Vec(corpus, ['climate']);
  const dissimilar = trainWord2Vec(corpus, ['climate'], 'dissimilar');
  assert.equal(similar.related_terms[0].term, 'climate');
  assert.ok(similar.related_terms[0].neighbors[0].similarity >= similar.related_terms[0].neighbors[1].similarity);
  assert.ok(dissimilar.related_terms[0].neighbors[0].similarity <= dissimilar.related_terms[0].neighbors[1].similarity);
  assert.throws(() => trainWord2Vec(corpus, ['notpresent']), /not in the trained vocabulary/);
  assert.throws(() => trainWord2Vec([{ title: 'coast', abstract: '' }, { title: 'climate', abstract: '' }]), /could not form training pairs/);
});

test('heatmaps use requested axis order and count shared sources, not token pairs', () => {
  const corpus = [
    { title: '', abstract: 'climate climate coastal coastal adaptation adaptation' },
    { title: '', abstract: 'climate coastal climate coastal' },
    { title: '', abstract: 'adaptation adaptation coastal coastal' },
  ];
  const result = trainWord2Vec(corpus, [], 'similar', { x: ['COASTAL', 'adaptation'], y: ['climate', 'coastal'] });
  assert.deepEqual(result.heatmap.x_terms, ['coastal', 'adaptation']);
  assert.deepEqual(result.heatmap.y_terms, ['climate', 'coastal']);
  assert.deepEqual(result.heatmap.cooccurrence, [[2, 1], [3, 2]]);
  assert.equal(result.heatmap.counted_sources, 3);
  assert.ok(Math.abs(result.heatmap.similarity[1][0] - 1) < 1e-10);
  assert.ok(result.heatmap.similarity.flat().every((value) => value >= -1.000001 && value <= 1.000001));
  assert.throws(() => trainWord2Vec(corpus, [], 'similar', { x: ['climate', 'Climate'], y: ['coastal'] }), /duplicate/);
  assert.throws(() => trainWord2Vec(corpus, [], 'similar', { x: ['climate change'], y: ['coastal'] }), /single English words/);
  assert.throws(() => trainWord2Vec(corpus, [], 'similar', { x: ['unknown'], y: ['coastal'] }), /not in the trained vocabulary/);
  assert.throws(() => trainWord2Vec(corpus, [], 'similar', { x: Array(13).fill('climate'), y: ['coastal'] }), /1 to 12/);
});

test('heatmap counts only the same bounded corpus used for training', () => {
  const result = trainWord2Vec([
    { title: '', abstract: 'climate coastal '.repeat(6000) },
    { title: '', abstract: 'climate coastal climate coastal' },
  ], [], 'similar', { x: ['climate'], y: ['coastal'] });
  assert.equal(result.training_tokens, 12000);
  assert.equal(result.sources_scanned, 1);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.heatmap.cooccurrence, [[1]]);
});

test('document upload, permissions, model stages and removal work per project', async (t) => {
  const originals = { read: store.read, update: store.update, updateStrict: store.updateStrict };
  const project = { id: 'p', ownerId: 'owner', title: 'Climate', field: 'Environment', members: [{ email: 'reviewer@example.com', role: 'reviewer' }] };
  const collections = {
    projects: [project],
    knowledgeBase: [{ projectId: 'p', papers: [], searches: [], searchStrategy: { primaryKeyword: 'climate', secondaryKeywords: ['coastal', 'forests'] } }],
    analysisDocuments: [],
  };
  store.read = (name, fallback) => collections[name] || fallback;
  store.update = store.updateStrict = async (name, fallback, mutate) => {
    collections[name] = mutate(collections[name] || fallback);
    return collections[name];
  };
  t.after(() => Object.assign(store, originals));
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const user = req.headers['x-test-user'];
    req.user = user === 'owner' ? { id: 'owner', email: 'owner@example.com' }
      : user === 'reviewer' ? { id: 'reviewer', email: 'reviewer@example.com' }
        : { id: 'outsider', email: 'outsider@example.com' };
    next();
  });
  app.use('/analysis', require('../routes/analysisDocuments'));
  app.use('/literature', require('../routes/literature'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, user = 'owner') => fetch(base + path, { headers: { 'x-test-user': user } });
  const upload = (file, name, user = 'owner') => {
    const body = new FormData();
    body.append('document', new Blob([file]), name);
    return fetch(`${base}/analysis/p/documents`, { method: 'POST', headers: { 'x-test-user': user }, body });
  };
  assert.equal((await upload(text, 'test.txt', 'outsider')).status, 404);
  assert.equal((await upload(text, 'test.txt', 'reviewer')).status, 404);
  assert.equal((await upload(text, 'test.exe')).status, 400);
  assert.equal((await upload('', 'empty.txt')).status, 422);
  assert.equal((await upload('a'.repeat(200001), 'long.txt')).status, 413);
  const response = await upload(text, 'test.txt');
  assert.equal(response.status, 201);
  const document = await response.json();
  assert.equal(document.text, undefined);
  const listed = await (await get('/analysis/p/documents', 'reviewer')).json();
  assert.equal(listed.documents.length, 1);
  assert.equal(listed.documents[0].text, undefined);

  const pdf = new PDFDocument();
  const chunks = [];
  pdf.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => pdf.on('end', resolve));
  pdf.text('Coastal climate resilience planning and adaptation.');
  pdf.end();
  await done;
  assert.equal((await upload(Buffer.concat(chunks), 'article.pdf')).status, 201);
  const expert = await get('/literature/p/analysis/expert-model?secondary=coastal', 'reviewer');
  assert.equal(expert.status, 200);
  const result = await expert.json();
  assert.equal(result.uploaded_documents, 2);
  assert.equal(result.paper_count, 2);
  assert.match(result.subdomain_query, /"climate" AND "coastal"/);
  assert.equal((await get('/literature/p/analysis/expert-model?secondary=forests')).status, 409);
  assert.equal((await get('/literature/p/analysis/expert-model?secondary=unknown')).status, 400);
  assert.equal((await get('/literature/p/analysis/expert-model?source=papers')).status, 409);
  assert.equal((await get('/literature/p/analysis/expert-model?source=other')).status, 400);
  const model = await fetch(`${base}/literature/p/analysis/word2vec`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': 'reviewer' },
    body: JSON.stringify({ terms: ['climate'], mode: 'dissimilar', source: 'documents' }),
  });
  assert.equal(model.status, 200);
  const modelResult = await model.json();
  assert.equal(modelResult.mode, 'dissimilar');
  assert.equal(modelResult.source, 'documents');
  const heatmapRequest = (user, axes, source = 'documents') => fetch(`${base}/literature/p/analysis/word2vec`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': user },
    body: JSON.stringify({ axes, source }),
  });
  const heatmap = await heatmapRequest('reviewer', { x: ['climate'], y: ['coastal'] });
  assert.equal(heatmap.status, 200);
  const heatmapResult = await heatmap.json();
  assert.deepEqual(heatmapResult.heatmap.cooccurrence, [[2]]);
  assert.ok(heatmapResult.vocabulary_preview.includes('climate'));
  assert.equal((await heatmapRequest('outsider', { x: ['climate'], y: ['coastal'] })).status, 404);
  assert.equal((await heatmapRequest('owner', { x: [], y: ['coastal'] })).status, 400);
  assert.equal((await heatmapRequest('owner', { x: ['climate'], y: ['missing'] })).status, 400);
  assert.equal((await heatmapRequest('owner', { x: ['climate'], y: ['coastal'] }, 'papers')).status, 409);
  assert.equal((await fetch(`${base}/analysis/p/documents/${document.id}`, { method: 'DELETE', headers: { 'x-test-user': 'reviewer' } })).status, 404);
  assert.equal((await fetch(`${base}/analysis/p/documents/${document.id}`, { method: 'DELETE', headers: { 'x-test-user': 'owner' } })).status, 204);
  assert.equal(collections.analysisDocuments.length, 1);
});
