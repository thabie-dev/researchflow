const crypto = require('crypto');
const seed = require('../data/aiTools.seed.json');
const store = require('./store');

const COLLECTION = 'aiTools';
const STAGES = Object.keys(seed);

function normalizeUrl(url = '') {
  return url.trim().toLowerCase().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '');
}

function makeId(stage, name, url) {
  return crypto.createHash('sha1').update(`${stage}::${name}::${normalizeUrl(url)}`).digest('hex').slice(0, 12);
}

function withDefaults(stage, entry) {
  return {
    id: makeId(stage, entry.name, entry.url),
    name: entry.name,
    description: entry.description || '',
    url: entry.url || '',
    category: entry.category || 'uncategorized',
    apiAvailable: !!entry.apiAvailable,
    embeddable: !!entry.embeddable,
    tags: entry.tags || [],
    source: entry.source || 'seed',
    lastVerified: entry.lastVerified || new Date().toISOString(),
  };
}

/** Build the initial on-disk registry from the seed file, keyed by stage. */
function buildSeedRegistry() {
  const registry = {};
  for (const stage of STAGES) {
    registry[stage] = seed[stage].map((t) => withDefaults(stage, t));
  }
  registry.__meta = { lastRefreshed: null, stages: STAGES };
  return registry;
}

function getRegistry() {
  return store.read(COLLECTION, buildSeedRegistry());
}

function listStages() {
  return STAGES;
}

/** Tools for a stage. `onlyEmbeddable` filters to ones usable inside this app (API-reachable). */
function getToolsForStage(stage, { onlyEmbeddable = false } = {}) {
  const registry = getRegistry();
  const tools = registry[stage] || [];
  return onlyEmbeddable ? tools.filter((t) => t.embeddable) : tools;
}

function getAllTools() {
  const registry = getRegistry();
  const { __meta, ...rest } = registry;
  return rest;
}

function getMeta() {
  return getRegistry().__meta || {};
}

/**
 * Merge newly discovered tools into a stage's list. Existing entries (by id,
 * i.e. same stage+name+url) are refreshed in place (lastVerified bumped);
 * genuinely new tools are appended. Nothing is ever silently dropped, so a
 * human can audit `source: "discovered"` entries later if desired.
 */
function mergeDiscovered(stage, discoveredEntries) {
  return store.update(COLLECTION, buildSeedRegistry(), (registry) => {
    if (!registry[stage]) registry[stage] = [];
    const existingById = new Map(registry[stage].map((t) => [t.id, t]));

    for (const raw of discoveredEntries) {
      if (!raw.name || !raw.url) continue;
      const entry = withDefaults(stage, { ...raw, source: raw.source || 'discovered' });
      if (existingById.has(entry.id)) {
        const prior = existingById.get(entry.id);
        existingById.set(entry.id, { ...prior, ...entry, source: prior.source });
      } else {
        existingById.set(entry.id, entry);
      }
    }

    registry[stage] = Array.from(existingById.values());
    registry.__meta = { ...(registry.__meta || {}), stages: STAGES, lastRefreshed: new Date().toISOString() };
    return registry;
  });
}

function touchMeta(patch) {
  return store.update(COLLECTION, buildSeedRegistry(), (registry) => {
    registry.__meta = { ...(registry.__meta || {}), ...patch };
    return registry;
  });
}

module.exports = {
  STAGES,
  listStages,
  getToolsForStage,
  getAllTools,
  getMeta,
  mergeDiscovered,
  touchMeta,
};
