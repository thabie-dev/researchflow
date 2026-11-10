/**
 * Minimal flat-file "database".
 *
 * Each collection (projects, tasks, ethics, aiTools, ...) lives in its own
 * JSON file under config.dataDir. Writes are serialized per-collection with
 * a promise chain so concurrent requests can't corrupt the file. This is
 * intentionally swappable: reimplement read()/write() against Postgres or
 * Mongo later and every route/service that calls this module keeps working.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

const writeQueues = new Map();

function filePathFor(collection) {
  return path.join(config.dataDir, `${collection}.json`);
}

function readSync(collection, fallback) {
  const file = filePathFor(collection);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, ''));
  } catch (err) {
    const backup = `${file}.corrupt-${Date.now()}`;
    console.error(`[store] Failed to parse ${file}; kept a copy at ${backup} and resetting to fallback.`, err);
    fs.copyFileSync(file, backup);
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function queueWrite(collection, fn) {
  const prior = writeQueues.get(collection) || Promise.resolve();
  const next = prior.then(fn).catch((err) => {
    console.error(`[store] write failed for ${collection}:`, err);
  });
  writeQueues.set(collection, next);
  return next;
}

/** Read the full contents of a collection (creates it with `fallback` if missing). */
function read(collection, fallback = []) {
  return readSync(collection, fallback);
}

/** Overwrite a collection's full contents. */
function write(collection, data) {
  return queueWrite(collection, () => {
    fs.writeFileSync(filePathFor(collection), JSON.stringify(data, null, 2));
    return data;
  });
}

/** Read-modify-write helper to avoid lost updates under concurrent calls. */
function update(collection, fallback, mutateFn) {
  return queueWrite(collection, () => {
    const current = readSync(collection, fallback);
    const next = mutateFn(current);
    fs.writeFileSync(filePathFor(collection), JSON.stringify(next, null, 2));
    return next;
  });
}

module.exports = { read, write, update };
