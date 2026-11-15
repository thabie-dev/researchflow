const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const express = require('express');
const store = require('../services/store');
const { searchPapers } = require('../services/paperSearch');
const { renderReferences } = require('../services/references');

test('Scopus search is opt-in, uses server headers, normalizes metadata and reports failures', async (t) => {
  const originalGet = axios.get;
  const key = process.env.ELSEVIER_API_KEY;
  const token = process.env.ELSEVIER_INST_TOKEN;
  t.after(() => {
    axios.get = originalGet;
    if (key === undefined) delete process.env.ELSEVIER_API_KEY; else process.env.ELSEVIER_API_KEY = key;
    if (token === undefined) delete process.env.ELSEVIER_INST_TOKEN; else process.env.ELSEVIER_INST_TOKEN = token;
  });
  process.env.ELSEVIER_API_KEY = 'test-key';
  process.env.ELSEVIER_INST_TOKEN = 'test-token';
  let scopusCalls = 0;
  let scenario = 'success';
  axios.get = async (url, options) => {
    if (url.includes('api.elsevier.com')) {
      scopusCalls++;
      assert.equal(options.headers['X-ELS-APIKey'], 'test-key');
      assert.equal(options.headers['X-ELS-Insttoken'], 'test-token');
      assert.equal(options.params.query, 'TITLE-ABS-KEY(("climate" OR "coastal")) AND PUBYEAR > 2019');
      assert.equal(options.params.count, 50);
      assert.equal(options.params.view, 'STANDARD');
      if (scenario === 'forbidden' || scenario === 'rate') { const error = new Error('secret must not leak'); error.response = { status: scenario === 'rate' ? 429 : 403 }; throw error; }
      if (scenario === 'timeout') { const error = new Error('secret must not leak'); error.code = 'ECONNABORTED'; throw error; }
      if (scenario === 'empty') return { data: { 'search-results': { 'opensearch:totalResults': '0' } } };
      if (scenario === 'malformed') return { data: { 'search-results': { entry: [{ invalid: true }] } } };
      return { data: { 'search-results': { entry: [{
        eid: '2-s2.0-123', 'dc:title': 'Climate resilience', 'dc:creator': 'Smith, Jane',
        'prism:coverDate': '2022-05-01', 'prism:doi': '10.1234/Example',
        'prism:publicationName': 'Journal', 'citedby-count': '7',
        link: [{ '@ref': 'scopus', '@href': 'https://www.scopus.com/record/display.uri?eid=123' }],
      }] } } };
    }
    if (url.includes('openalex')) return { data: { results: scenario === 'duplicate' ? [{
      id: 'W1', display_name: 'Climate resilience', doi: '10.1234/Example',
      publication_year: 2022, authorships: [{ author: { display_name: 'Jane Smith' } }],
    }] : [] } };
    if (url.includes('crossref')) return { data: { message: { items: [] } } };
    if (url.includes('semanticscholar')) return { data: { data: [] } };
    return { data: '' };
  };
  const query = '("climate" OR "coastal")';
  const without = await searchPapers(query, { fromYear: 2020 });
  assert.equal(scopusCalls, 0);
  assert.equal(without.sources.length, 4);
  const result = await searchPapers(query, { fromYear: 2020, includeScopus: true });
  assert.equal(scopusCalls, 1);
  assert.equal(result.papers[0].id, 'doi:10.1234/example');
  assert.deepEqual(result.papers[0].authors, ['Jane Smith']);
  assert.equal(result.papers[0].authorsIncomplete, true);
  assert.equal(result.papers[0].citations, 7);
  assert.equal(result.sources.at(-1).name, 'Scopus');
  assert.ok(renderReferences([{ title: 'Test', text: `[[cite:${encodeURIComponent(result.papers[0].id)}]]` }], result.papers, 'apa').warnings.some((warning) => warning.includes('complete author list')));
  scenario = 'duplicate';
  const duplicate = await searchPapers(query, { fromYear: 2020, includeScopus: true });
  assert.equal(duplicate.papers.length, 1);
  assert.equal(duplicate.papers[0].authorsIncomplete, false);
  assert.deepEqual(duplicate.papers[0].sources, ['OpenAlex', 'Scopus']);
  scenario = 'empty';
  assert.equal((await searchPapers(query, { fromYear: 2020, includeScopus: true })).sources.at(-1).found, 0);
  for (const [kind, message] of [['forbidden', 'HTTP 403'], ['rate', 'HTTP 429'], ['timeout', 'request timed out'], ['malformed', 'request failed']]) {
    scenario = kind;
    const failed = await searchPapers(query, { fromYear: 2020, includeScopus: true });
    assert.deepEqual(failed.sources.at(-1), { name: 'Scopus', status: 'error', found: 0, error: message });
    assert.doesNotMatch(JSON.stringify(failed), /test-key|test-token|secret must not leak/);
  }
  delete process.env.ELSEVIER_API_KEY;
  await assert.rejects(() => searchPapers(query, { includeScopus: true }), /not configured/);
});

test('search endpoint validates opt-in, authorizes users and saves search history', async (t) => {
  const oldGet = axios.get;
  const oldRead = store.read;
  const oldUpdate = store.updateStrict;
  const oldKey = process.env.ELSEVIER_API_KEY;
  const data = { projects: [{ id: 'p', ownerId: 'owner' }], knowledgeBase: [] };
  store.read = (name, fallback) => data[name] || fallback;
  store.updateStrict = async (name, fallback, mutate) => { data[name] = mutate(data[name] || fallback); };
  axios.get = async (url) => {
    if (url.includes('api.elsevier.com')) return { data: { 'search-results': { entry: [{ eid: 's1', 'dc:title': 'Paper', 'dc:creator': 'Smith, J.' }] } } };
    if (url.includes('openalex')) return { data: { results: [] } };
    if (url.includes('crossref')) return { data: { message: { items: [] } } };
    if (url.includes('semanticscholar')) return { data: { data: [] } };
    return { data: '' };
  };
  t.after(() => {
    axios.get = oldGet; store.read = oldRead; store.updateStrict = oldUpdate;
    if (oldKey === undefined) delete process.env.ELSEVIER_API_KEY; else process.env.ELSEVIER_API_KEY = oldKey;
  });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: req.headers['x-user'] }; next(); });
  app.use('/literature', require('../routes/literature'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const search = (user, body) => fetch(`http://127.0.0.1:${server.address().port}/literature/p/search`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user }, body: JSON.stringify(body),
  });
  assert.equal((await search('outsider', { searchString: 'climate', includeScopus: true })).status, 404);
  assert.equal((await search('owner', { searchString: 'climate', includeScopus: 'true' })).status, 400);
  delete process.env.ELSEVIER_API_KEY;
  assert.equal((await search('owner', { searchString: 'climate', includeScopus: true })).status, 503);
  process.env.ELSEVIER_API_KEY = 'test-key';
  const response = await search('owner', { searchString: 'climate', includeScopus: true });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.searches[0].includeScopus, true);
  assert.equal(result.searches[0].sources.at(-1).name, 'Scopus');
  assert.deepEqual(result.papers[0].authors, ['J. Smith']);
  assert.equal(result.papers[0].authorsIncomplete, true);
  assert.equal(data.knowledgeBase[0].papers[0].id, result.papers[0].id);
  assert.doesNotMatch(JSON.stringify(result), /test-key/);
  const repeat = await (await search('owner', { searchString: 'climate', includeScopus: true })).json();
  assert.equal(repeat.searches[0].added, 0);
  assert.equal(repeat.papers.length, 1);
});

test('author corrections are project-scoped and require write permissions', async (t) => {
  const oldRead = store.read;
  const oldUpdate = store.updateStrict;
  const data = {
    projects: [{ id: 'p', ownerId: 'owner', members: [{ email: 'reviewer@example.test', role: 'reviewer' }] }],
    knowledgeBase: [{ projectId: 'p', papers: [{ id: 's', title: 'Paper', authors: ['Jane Smith'], authorsIncomplete: true }], searches: [] }],
  };
  store.read = (name, fallback) => data[name] || fallback;
  store.updateStrict = async (name, fallback, mutate) => { data[name] = mutate(data[name] || fallback); };
  t.after(() => { store.read = oldRead; store.updateStrict = oldUpdate; });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = req.headers['x-user'] === 'reviewer' ? { id: 'reviewer', email: 'reviewer@example.test' } : { id: 'owner' };
    next();
  });
  app.use('/literature', require('../routes/literature'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const put = (user, authors, id = 's') => fetch(`http://127.0.0.1:${server.address().port}/literature/p/papers/${id}/authors`, {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-user': user }, body: JSON.stringify({ authors }),
  });
  assert.equal((await put('reviewer', ['Jane Smith'])).status, 404);
  assert.equal((await put('owner', [])).status, 400);
  assert.equal((await put('owner', ['Jane Smith'], 'missing')).status, 404);
  const response = await put('owner', [' Jane Smith ', 'Alex Jones']);
  assert.equal(response.status, 200);
  const saved = (await response.json()).papers[0];
  assert.deepEqual(saved.authors, ['Jane Smith', 'Alex Jones']);
  assert.equal(saved.authorsIncomplete, false);
});
