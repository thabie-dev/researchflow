const axios = require('axios');
const { keywords } = require('./journalSearch');

const OPENALEX = 'https://api.openalex.org';
const CROSSREF = 'https://api.crossref.org/works';
const SEMANTIC_SCHOLAR = 'https://api.semanticscholar.org/graph/v1/paper/search';
const ARXIV = 'https://export.arxiv.org/api/query';
const SCOPUS = 'https://api.elsevier.com/content/search/scopus';
const MAX_RESULTS_PER_SOURCE = 50;
const MAX_ABSTRACT = 700;
const REQUEST_TIMEOUT = 20000;

function buildSearchString(text) {
  const words = keywords(text, 9);
  if (!words.length) return '';
  const groups = [];
  for (let i = 0; i < words.length; i += 2) groups.push(words.slice(i, i + 2));
  return groups.map((group) => (group.length > 1 ? `(${group.join(' OR ')})` : group[0])).join(' AND ');
}

function abstractFrom(index) {
  if (!index || typeof index !== 'object') return '';
  const slots = [];
  Object.entries(index).forEach(([word, positions]) => {
    if (Array.isArray(positions)) positions.forEach((position) => { slots[position] = word; });
  });
  return slots.filter(Boolean).join(' ').slice(0, MAX_ABSTRACT);
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlTag(entry, tag) {
  const match = entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function normalizeDoi(value) {
  return String(value || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
}

function paperId(source, nativeId, doi) {
  const normalizedDoi = normalizeDoi(doi);
  return normalizedDoi ? `doi:${normalizedDoi}` : `${source}:${nativeId}`;
}

function openAlexPaper(work) {
  const source = work.primary_location && work.primary_location.source;
  const location = work.best_oa_location || {};
  const doi = work.doi || '';
  return {
    id: paperId('openalex', String(work.id || '').split('/').pop(), doi),
    title: work.display_name || 'Untitled',
    authors: (work.authorships || []).slice(0, 6).map((author) => author.author && author.author.display_name).filter(Boolean),
    year: work.publication_year || null,
    venue: source ? source.display_name : '',
    doi,
    url: work.doi || (work.primary_location && work.primary_location.landing_page_url) || work.id,
    openAccess: Boolean(work.open_access && work.open_access.is_oa),
    pdfUrl: location.pdf_url || '',
    citations: work.cited_by_count || 0,
    abstract: abstractFrom(work.abstract_inverted_index),
    source: 'OpenAlex',
  };
}

function crossrefPapers(items) {
  return items.map((item) => {
    const doi = item.DOI || '';
    const dateParts = (item.published || item['published-print'] || item['published-online'] || item.issued || item.created || {})['date-parts'];
    const parts = Array.isArray(dateParts) && Array.isArray(dateParts[0]) ? dateParts[0] : [];
    const year = Number(parts[0]) || null;
    const pdfLink = (item.link || []).find((link) => /application\/pdf/i.test(link['content-type'] || ''));
    const abstract = decodeXml(item.abstract).slice(0, MAX_ABSTRACT);
    return {
      id: paperId('crossref', normalizeDoi(doi) || String(item.title && item.title[0] || 'untitled').toLowerCase(), doi),
      title: (item.title && item.title[0]) || 'Untitled',
      authors: (item.author || []).slice(0, 6).map((author) => [author.given, author.family].filter(Boolean).join(' ')).filter(Boolean),
      year,
      venue: (item['container-title'] && item['container-title'][0]) || '',
      doi,
      url: doi ? `https://doi.org/${doi}` : (item.URL || ''),
      openAccess: Boolean(pdfLink),
      pdfUrl: pdfLink ? pdfLink.URL : '',
      citations: item['is-referenced-by-count'] || 0,
      abstract,
      source: 'Crossref',
    };
  });
}

function semanticScholarPapers(items) {
  return items.map((item) => {
    const doi = (item.externalIds && item.externalIds.DOI) || '';
    const pdfUrl = item.openAccessPdf && item.openAccessPdf.url || '';
    return {
      id: paperId('semantic-scholar', item.paperId || item.corpusId || 'unknown', doi),
      title: item.title || 'Untitled',
      authors: (item.authors || []).slice(0, 6).map((author) => author.name).filter(Boolean),
      year: Number(item.year) || null,
      venue: item.venue || '',
      doi,
      url: item.paperId ? `https://www.semanticscholar.org/paper/${item.paperId}` : (doi ? `https://doi.org/${doi}` : ''),
      openAccess: Boolean(pdfUrl),
      pdfUrl,
      citations: item.citationCount || 0,
      abstract: String(item.abstract || '').slice(0, MAX_ABSTRACT),
      source: 'Semantic Scholar',
    };
  });
}

function arxivPapers(xml) {
  const entries = String(xml || '').match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
  return entries.map((entry) => {
    const nativeUrl = xmlTag(entry, 'id');
    const nativeId = nativeUrl.split('/').pop() || 'unknown';
    const doi = xmlTag(entry, 'arxiv:doi');
    const published = xmlTag(entry, 'published');
    const authors = [...entry.matchAll(/<author(?:\s[^>]*)?>[\s\S]*?<name(?:\s[^>]*)?>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
      .slice(0, 6).map((match) => decodeXml(match[1]));
    const pdfLink = [...entry.matchAll(/<link\b([^>]*?)\/?>/gi)]
      .map((match) => match[1])
      .find((attributes) => /\btitle=["']pdf["']/i.test(attributes));
    const href = pdfLink && pdfLink.match(/\bhref=["']([^"']+)["']/i);
    return {
      id: paperId('arxiv', nativeId, doi),
      title: xmlTag(entry, 'title') || 'Untitled',
      authors,
      year: Number(published.slice(0, 4)) || null,
      venue: 'arXiv',
      doi,
      url: nativeUrl,
      openAccess: Boolean(href),
      pdfUrl: href ? decodeXml(href[1]) : '',
      citations: 0,
      abstract: xmlTag(entry, 'summary').slice(0, MAX_ABSTRACT),
      source: 'arXiv',
    };
  });
}

function inYearRange(paper, fromYear) {
  return !fromYear || !paper.year || paper.year >= fromYear;
}

function queryTerms(searchString, maxTerms) {
  return String(searchString || '')
    .replace(/\b(?:AND|OR|NOT)\b/gi, ' ')
    .match(/[a-z0-9][a-z0-9.-]*/gi)
    ?.slice(0, maxTerms) || [];
}

async function fetchOpenAlex(searchString, fromYear) {
  const filter = ['type:article|preprint|review', fromYear ? `from_publication_date:${fromYear}-01-01` : null].filter(Boolean).join(',');
  const { data } = await axios.get(`${OPENALEX}/works`, {
    params: {
      search: searchString,
      filter,
      select: 'id,display_name,publication_year,doi,primary_location,best_oa_location,open_access,authorships,cited_by_count,abstract_inverted_index',
      'per-page': MAX_RESULTS_PER_SOURCE,
      page: 1,
      ...(process.env.OPENALEX_API_KEY ? { api_key: process.env.OPENALEX_API_KEY } : {}),
    },
    timeout: REQUEST_TIMEOUT,
  });
  return (data.results || []).map(openAlexPaper).filter((paper) => inYearRange(paper, fromYear));
}

async function fetchCrossref(searchString, fromYear) {
  const { data } = await axios.get(CROSSREF, {
    params: {
      query: searchString,
      rows: MAX_RESULTS_PER_SOURCE,
      ...(fromYear ? { filter: `from-pub-date:${fromYear}-01-01` } : {}),
      ...(process.env.CROSSREF_MAILTO ? { mailto: process.env.CROSSREF_MAILTO } : {}),
    },
    timeout: REQUEST_TIMEOUT,
  });
  return crossrefPapers(data.message && data.message.items || []).filter((paper) => inYearRange(paper, fromYear));
}

async function fetchSemanticScholar(searchString, fromYear) {
  const { data } = await axios.get(SEMANTIC_SCHOLAR, {
    params: {
      query: searchString,
      limit: MAX_RESULTS_PER_SOURCE,
      fields: 'title,authors,abstract,year,venue,externalIds,openAccessPdf,citationCount',
      ...(fromYear ? { year: `${fromYear}-` } : {}),
    },
    headers: process.env.SEMANTIC_SCHOLAR_API_KEY ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY } : {},
    timeout: REQUEST_TIMEOUT,
  });
  return semanticScholarPapers(data.data || []).filter((paper) => inYearRange(paper, fromYear));
}

async function fetchArxiv(searchString, fromYear) {
  const terms = queryTerms(searchString, 8);
  if (!terms.length) return [];
  const searchQuery = [
    terms.map((term) => `all:${term}`).join(' AND '),
    fromYear ? `submittedDate:[${fromYear}01010000 TO ${new Date().getFullYear()}12312359]` : '',
  ].filter(Boolean).join(' AND ');
  const { data } = await axios.get(ARXIV, {
    params: {
      search_query: searchQuery,
      start: 0,
      max_results: MAX_RESULTS_PER_SOURCE,
      sortBy: 'relevance',
      sortOrder: 'descending',
    },
    timeout: REQUEST_TIMEOUT,
  });
  return arxivPapers(data).filter((paper) => inYearRange(paper, fromYear));
}

function scopusPapers(entries) {
  const normalizeAuthor = (name) => {
    if (typeof name !== 'string') return '';
    const parts = name.split(',');
    return parts.length === 2 ? `${parts[1].trim()} ${parts[0].trim()}`.trim() : name.trim();
  };
  return entries.filter((entry) => entry && entry['dc:title'] && (entry.eid || entry['dc:identifier'] || entry['prism:doi'])).map((entry) => {
    const doi = String(entry['prism:doi'] || '');
    const id = String(entry.eid || entry['dc:identifier'] || doi);
    const authorList = Array.isArray(entry.author) ? entry.author : [];
    const authors = authorList.map((author) => [author['given-name'], author.surname].filter(Boolean).join(' ') || normalizeAuthor(author.authname)).filter(Boolean);
    const creator = normalizeAuthor(entry['dc:creator']);
    const link = Array.isArray(entry.link) ? entry.link.find((item) => item['@ref'] === 'scopus') : null;
    return {
      id: paperId('scopus', id, doi),
      title: entry['dc:title'],
      authors: authors.length ? authors : creator ? [creator] : [],
      authorsIncomplete: true,
      year: Number(String(entry['prism:coverDate'] || '').slice(0, 4)) || null,
      venue: entry['prism:publicationName'] || '',
      doi,
      url: link && typeof link['@href'] === 'string' ? link['@href'] : (doi ? `https://doi.org/${doi}` : ''),
      openAccess: false,
      pdfUrl: '',
      citations: Math.max(0, Number(entry['citedby-count']) || 0),
      abstract: String(entry['dc:description'] || '').slice(0, MAX_ABSTRACT),
      source: 'Scopus',
    };
  });
}

async function fetchScopus(searchString, fromYear) {
  const { data } = await axios.get(SCOPUS, {
    params: {
      query: `TITLE-ABS-KEY(${searchString})${fromYear ? ` AND PUBYEAR > ${fromYear - 1}` : ''}`,
      count: MAX_RESULTS_PER_SOURCE,
      view: 'STANDARD',
    },
    headers: {
      Accept: 'application/json',
      'X-ELS-APIKey': process.env.ELSEVIER_API_KEY,
      ...(process.env.ELSEVIER_INST_TOKEN ? { 'X-ELS-Insttoken': process.env.ELSEVIER_INST_TOKEN } : {}),
    },
    timeout: REQUEST_TIMEOUT,
  });
  const result = data && data['search-results'];
  if (!result || (!Array.isArray(result.entry) && String(result['opensearch:totalResults']) !== '0')) throw new Error('Invalid Scopus response');
  if (!result.entry) return [];
  const papers = scopusPapers(result.entry);
  if (!papers.length && result.entry.length && !result.entry.every((entry) => entry && entry.error === 'Result set was empty')) {
    throw new Error('Invalid Scopus entries');
  }
  return papers.filter((paper) => inYearRange(paper, fromYear));
}

function mergePapers(sourceResults) {
  const merged = new Map();
  for (const paper of sourceResults.flatMap((result) => result.papers)) {
    const doi = normalizeDoi(paper.doi);
    const titleKey = String(paper.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const key = doi ? `doi:${doi}` : `${titleKey}|${paper.year || ''}`;
    if (!titleKey && !doi) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...paper, sources: [paper.source] });
      continue;
    }
    const useExistingAuthors = existing.authors.length > paper.authors.length ||
      (existing.authors.length === paper.authors.length && (!existing.authorsIncomplete || paper.authorsIncomplete));
    merged.set(key, {
      ...existing,
      abstract: existing.abstract.length >= paper.abstract.length ? existing.abstract : paper.abstract,
      authors: useExistingAuthors ? existing.authors : paper.authors,
      authorsIncomplete: Boolean((useExistingAuthors ? existing : paper).authorsIncomplete),
      venue: existing.venue || paper.venue,
      url: existing.url || paper.url,
      pdfUrl: existing.pdfUrl || paper.pdfUrl,
      openAccess: existing.openAccess || paper.openAccess,
      citations: Math.max(existing.citations || 0, paper.citations || 0),
      sources: [...new Set([...existing.sources, paper.source])],
    });
  }
  return [...merged.values()];
}

function providerError(error) {
  if (error.response && error.response.status) return `HTTP ${error.response.status}`;
  if (error.code === 'ECONNABORTED') return 'request timed out';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'].includes(error.code)) return 'network connection failed';
  return 'request failed';
}

async function searchPapers(searchString, { fromYear, includeScopus = false } = {}) {
  if (includeScopus && !String(process.env.ELSEVIER_API_KEY || '').trim()) {
    const error = new Error('Scopus is not configured. Set ELSEVIER_API_KEY on the server and restart it.');
    error.status = 503;
    throw error;
  }
  const providers = [
    ['OpenAlex', () => fetchOpenAlex(searchString, fromYear)],
    ['Crossref', () => fetchCrossref(searchString, fromYear)],
    ['Semantic Scholar', () => fetchSemanticScholar(searchString, fromYear)],
    ['arXiv', () => fetchArxiv(searchString, fromYear)],
  ];
  if (includeScopus) providers.push(['Scopus', () => fetchScopus(searchString, fromYear)]);
  const results = await Promise.all(providers.map(async ([name, search]) => {
    try {
      const papers = await search();
      return { name, papers, status: 'ok' };
    } catch (error) {
      return { name, papers: [], status: 'error', error: providerError(error) };
    }
  }));
  const sources = results.map(({ name, status, papers, error }) => ({
    name,
    status,
    found: papers.length,
    ...(error ? { error } : {}),
  }));
  if (results.every((result) => result.status === 'error')) {
    throw new Error(`All literature search providers failed: ${sources.map((source) => `${source.name}: ${source.error}`).join('; ')}`);
  }
  return { papers: mergePapers(results).slice(0, 400), sources };
}

module.exports = { buildSearchString, searchPapers };
