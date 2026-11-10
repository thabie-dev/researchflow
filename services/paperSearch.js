const axios = require('axios');
const { keywords } = require('./journalSearch');

const OPENALEX = 'https://api.openalex.org';
const PAGE_SIZE = 100;
const MAX_PAGES = 2;
const MAX_ABSTRACT = 700;

// Group the strongest terms into concepts: (a OR b) AND (c OR d) AND (e OR f).
function buildSearchString(text) {
  const words = keywords(text, 9);
  if (!words.length) return '';
  const groups = [];
  for (let i = 0; i < words.length; i += 2) groups.push(words.slice(i, i + 2));
  return groups.map((g) => (g.length > 1 ? `(${g.join(' OR ')})` : g[0])).join(' AND ');
}

function abstractFrom(index) {
  if (!index || typeof index !== 'object') return '';
  const slots = [];
  Object.entries(index).forEach(([word, positions]) => positions.forEach((p) => { slots[p] = word; }));
  return slots.filter(Boolean).join(' ').slice(0, MAX_ABSTRACT);
}

function shape(work) {
  const source = work.primary_location && work.primary_location.source;
  return {
    id: String(work.id || '').split('/').pop(),
    title: work.display_name || 'Untitled',
    authors: (work.authorships || []).slice(0, 6).map((a) => a.author && a.author.display_name).filter(Boolean),
    year: work.publication_year || null,
    venue: source ? source.display_name : '',
    doi: work.doi || '',
    url: work.doi || (work.primary_location && work.primary_location.landing_page_url) || work.id,
    citations: work.cited_by_count || 0,
    abstract: abstractFrom(work.abstract_inverted_index),
  };
}

async function searchPapers(searchString, { fromYear } = {}) {
  const filter = ['type:article|preprint|review', fromYear ? `from_publication_date:${fromYear}-01-01` : null].filter(Boolean).join(',');
  const papers = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await axios.get(`${OPENALEX}/works`, {
      params: {
        search: searchString,
        filter,
        select: 'id,display_name,publication_year,doi,primary_location,authorships,cited_by_count,abstract_inverted_index',
        'per-page': PAGE_SIZE,
        page,
        ...(process.env.OPENALEX_API_KEY ? { api_key: process.env.OPENALEX_API_KEY } : {}),
      },
      timeout: 20000,
    });
    papers.push(...(data.results || []).map(shape));
    if ((data.results || []).length < PAGE_SIZE) break;
  }
  return papers;
}

module.exports = { buildSearchString, searchPapers };
