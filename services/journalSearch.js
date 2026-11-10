const axios = require('axios');

const OPENALEX = 'https://api.openalex.org';
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

const STOP = new Set(('a an the and or of in on for to with by from at as is are was were be been this that these those it its into ' +
  'about between among through using use used based study studies research paper analysis effect effects impact role how what why ' +
  'which their our we can may will not than more most such also other new within across towards toward while both each have has had').split(' '));

function keywords(text, limit = 8) {
  const counts = new Map();
  (text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []).forEach((w) => {
    if (!STOP.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, limit).map(([w]) => w);
}

async function get(path, params) {
  const { data } = await axios.get(`${OPENALEX}${path}`, {
    params: { ...params, ...(process.env.OPENALEX_API_KEY ? { api_key: process.env.OPENALEX_API_KEY } : {}) },
    timeout: 15000,
  });
  return data;
}

async function suggestJournals({ problem, field }) {
  const words = keywords(`${problem} ${field || ''}`);
  if (!words.length) return { keywords: [], journals: [] };

  const key = words.join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const query = words.slice(0, 6).join(' ');
  const filter = 'primary_location.source.type:journal,type:article,from_publication_date:2019-01-01';
  const found = await get('/works', { search: query, filter, select: 'id,primary_location', 'per-page': 100 });
  const tally = new Map();
  (found.results || []).forEach((w) => {
    const src = w.primary_location && w.primary_location.source;
    if (src && src.id) tally.set(src.id.split('/').pop(), (tally.get(src.id.split('/').pop()) || 0) + 1);
  });
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!top.length) return { keywords: words, journals: [] };

  const counts = new Map(top);
  const sources = await get('/sources', {
    filter: `openalex:${[...counts.keys()].join('|')}`,
    select: 'id,display_name,host_organization_name,homepage_url,is_oa,is_in_doaj,issn_l,works_count,summary_stats',
    'per-page': 20,
  });

  const journals = (sources.results || [])
    .map((s) => {
      const id = s.id.split('/').pop();
      return {
        name: s.display_name,
        publisher: s.host_organization_name || '',
        url: s.homepage_url || s.id,
        openAccess: Boolean(s.is_oa),
        doaj: Boolean(s.is_in_doaj),
        issn: s.issn_l || '',
        relatedPapers: counts.get(id) || 0,
        impact: s.summary_stats && s.summary_stats['2yr_mean_citedness'] != null
          ? Number(s.summary_stats['2yr_mean_citedness'].toFixed(2)) : null,
      };
    })
    .sort((a, b) => b.relatedPapers - a.relatedPapers)
    .slice(0, 8);

  const value = { keywords: words, journals };
  cache.set(key, { at: Date.now(), value });
  return value;
}

module.exports = { suggestJournals, keywords };
