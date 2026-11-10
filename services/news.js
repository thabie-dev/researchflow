const axios = require('axios');
const store = require('./store');

const CACHE_MS = 3 * 60 * 60 * 1000;
let cache = null;

const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

// Live funding opportunities from the public Grants.gov API (US federal funding).
async function liveFunding() {
  const { data } = await axios.post('https://api.grants.gov/v1/api/search2', {
    keyword: 'research',
    oppStatuses: 'posted',
    sortBy: 'openDate|desc',
    rows: 8,
  }, { timeout: 15000 });
  const hits = (data && data.data && data.data.oppHits) || [];
  return hits.map((o) => ({
    category: 'funding',
    live: true,
    title: decode(o.title),
    summary: `${decode(o.agency) || 'Funding agency'}${o.closeDate ? ` · closes ${o.closeDate}` : ''}`,
    date: o.openDate || '',
    source: 'Grants.gov',
    url: `https://www.grants.gov/search-results-detail/${o.id}`,
  }));
}

async function getNews() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const curated = store.read('news', []);
  let live = [];
  try { live = await liveFunding(); } catch (e) { live = []; }
  const value = { live, curated, updatedAt: new Date().toISOString() };
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { getNews };
