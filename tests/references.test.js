const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const store = require('../services/store');
const { renderReferences, ReferenceInputError } = require('../services/references');
const { exportDocument } = require('../services/exporter');
const JSZip = require('jszip');

const papers = [
  { id: 'doi:10.1234/one', title: 'First study', authors: ['Jane Smith'], year: 2020, venue: 'Journal', doi: '10.1234/one' },
  { id: 'paper two', title: 'Second study', authors: ['John Brown'], year: 2021, venue: 'Journal' },
];
const first = '[[cite:doi%3A10.1234%2Fone]]';
const second = '[[cite:paper%20two]]';

test('formats citations and bibliography using all four styles', () => {
  const sections = [
    { title: 'Introduction', text: `First ${first}; second ${second}.` },
    { title: 'Methods', text: `Again ${first}.` },
  ];
  const apa = renderReferences(sections, papers, 'apa');
  assert.match(apa.sections[0].text, /\(Smith, 2020\)/);
  assert.deepEqual(apa.citations, [['(Smith, 2020)', '(Brown, 2021)'], ['(Smith, 2020)']]);
  assert.ok(apa.bibliography.indexOf('Brown') < apa.bibliography.indexOf('Smith'));
  const harvard = renderReferences(sections, papers, 'harvard');
  assert.match(harvard.sections[1].text, /\(Smith, 2020\)/);
  const ieee = renderReferences(sections, papers, 'ieee');
  assert.equal(ieee.sections[0].text, 'First [1]; second [2].');
  assert.equal(ieee.sections[1].text, 'Again [1].');
  assert.match(ieee.bibliography, /\[1\].*Smith/);
  const vancouver = renderReferences(sections, papers, 'vancouver');
  assert.equal(vancouver.sections[0].text, 'First (1); second (2).');
  assert.match(vancouver.bibliography, /1\. Smith/);
  assert.equal(renderReferences([{ title: 'Empty', text: 'No citations' }], papers, 'apa').bibliography, '');
  assert.ok(ieee.warnings.some((warning) => warning.includes('Verify')));
});

test('author-year labels use both authors or et al. and numbered styles follow citation order', () => {
  const sources = [
    { id: 'one', title: 'One', authors: ['Ada Thabile'], year: 2025 },
    { id: 'two', title: 'Two', authors: ['Ada Thabile', 'Ben Green'], year: 2024 },
    { id: 'three', title: 'Three', authors: ['Ada Thabile', 'Ben Green', 'Cora Blue'], year: 2023 },
  ];
  const text = '[[cite:one]] [[cite:two]] [[cite:three]]';
  const apa = renderReferences([{ title: 'Test', text }], sources, 'apa');
  assert.deepEqual(apa.citations[0], ['(Thabile, 2025)', '(Thabile & Green, 2024)', '(Thabile et al., 2023)']);
  const ieee = renderReferences([{ title: 'Test', text }], sources, 'ieee');
  assert.deepEqual(ieee.citations[0], ['[1]', '[2]', '[3]']);
});

test('numbers citations again after their order changes and reports bad markers', () => {
  const result = renderReferences([{ title: 'Text', text: `${second} ${first}` }], papers, 'ieee');
  assert.equal(result.sections[0].text, '[1] [2]');
  assert.match(result.bibliography, /\[1\].*Brown/);
  assert.throws(() => renderReferences([{ title: 'Text', text: '[[cite:missing]]' }], papers, 'apa'), /missing from the library/);
  assert.throws(() => renderReferences([{ title: 'Text', text: '[[cite:%ZZ]]' }], papers, 'apa'), ReferenceInputError);
  assert.throws(() => renderReferences([{ title: 'Text', text: '[[cite:unfinished' }], papers, 'apa'), /incomplete citation/);
  assert.throws(() => renderReferences([], papers, 'toString'), /Unsupported/);
  assert.throws(() => renderReferences([{ title: 'Text', text: first.repeat(1001) }], papers, 'apa'), /at most 1000/);
});

test('bibliography follows cited sources, deduplicates and updates after removal or style change', () => {
  const sections = [
    { title: 'Introduction', text: `${first} ${second}` },
    { title: 'Methods', text: first },
    { title: 'References', text: 'My manually written reference.' },
  ];
  const apa = renderReferences(sections, papers, 'apa');
  assert.equal((apa.bibliography.match(/First study/g) || []).length, 1);
  assert.equal((apa.bibliography.match(/Second study/g) || []).length, 1);
  assert.equal(apa.sections[2].text, 'My manually written reference.');
  const remaining = renderReferences([{ title: 'Methods', text: first }], papers, 'ieee');
  assert.match(remaining.bibliography, /\[1\].*First study/);
  assert.doesNotMatch(remaining.bibliography, /Second study/);
  assert.equal(renderReferences([{ title: 'Methods', text: '' }], papers, 'apa').bibliography, '');
});

test('formatted citations and bibliography survive Word export', async () => {
  const formatted = renderReferences([{ title: 'Introduction', text: `Evidence ${first}.` }], papers, 'ieee');
  const buffer = await exportDocument('docx', {
    title: 'Test manuscript',
    sections: [...formatted.sections, { title: 'References', text: formatted.bibliography }],
  });
  const zip = await JSZip.loadAsync(buffer);
  const document = await zip.file('word/document.xml').async('string');
  assert.match(document, /Evidence \[1\]/);
  assert.match(document, /\[1\] J\. Smith/);
  assert.doesNotMatch(document, /\[\[cite:/);
});

test('reference endpoints enforce project access and style permissions', async (t) => {
  const originalRead = store.read;
  const originalUpdate = store.update;
  let project = {
    id: 'project', ownerId: 'owner', members: [{ email: 'reviewer@example.com', role: 'reviewer' }],
    manuscript: { introduction: first },
  };
  store.read = (collection, fallback) => {
    if (collection === 'projects') return [project];
    if (collection === 'knowledgeBase') return [{ projectId: 'project', papers, searches: [] }];
    return fallback;
  };
  store.update = async (collection, fallback, mutate) => {
    if (collection === 'projects') [project] = mutate([project]);
    else mutate(store.read(collection, fallback));
  };
  t.after(() => { store.read = originalRead; store.update = originalUpdate; });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const user = req.headers['x-test-user'];
    req.user = user === 'owner' ? { id: 'owner', email: 'owner@example.com' }
      : user === 'outsider' ? { id: 'outsider', email: 'outsider@example.com' }
        : { id: 'reviewer', email: 'reviewer@example.com' };
    next();
  });
  app.use('/projects', require('../routes/projects'));
  app.use('/literature', require('../routes/literature'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method, body, user = 'reviewer') => fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': user },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const sections = [{ title: 'Introduction', text: first }];
  const preview = await request('/literature/project/references/render', 'POST', { sections });
  assert.equal(preview.status, 200);
  assert.match((await preview.json()).sections[0].text, /Smith, 2020/);
  assert.equal((await request('/literature/project/references/render', 'POST', { sections }, 'outsider')).status, 404);
  assert.equal((await request('/literature/project/references/render', 'POST', { sections: 'invalid' })).status, 400);
  assert.equal((await request('/projects/project/reference-style', 'PUT', { style: 'ieee' })).status, 403);
  assert.equal((await request('/projects/project/reference-style', 'PUT', { style: 'bogus' }, 'owner')).status, 400);
  assert.equal((await request('/projects/project/reference-style', 'PUT', { style: 'ieee' }, 'owner')).status, 200);
  const changed = await request('/literature/project/references/render', 'POST', { sections });
  assert.equal((await changed.json()).sections[0].text, '[1]');
  assert.equal((await request(`/literature/project/papers/${encodeURIComponent(papers[0].id)}`, 'DELETE', null, 'owner')).status, 409);
});
