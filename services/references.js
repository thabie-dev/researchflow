const CSL = require('citeproc');

const STYLES = {
  apa: require('@citation/csl-style-apa').default.content,
  harvard: require('@citation/csl-style-harvard-cite-them-right').default.content,
  ieee: require('@citation/csl-style-ieee').default.content,
  vancouver: require('@citation/csl-style-vancouver').default.content,
};
const locale = require('@citation/csl-locale-en-us').default.content;
const MARKER = /\[\[cite:([^\]\s]+)\]\]/g;
const MAX_CITATIONS = 1000;

class ReferenceInputError extends Error {}

function markerId(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch (error) {
    throw new ReferenceInputError(`Invalid citation marker: ${encoded}`);
  }
}

function cslPaper(paper) {
  const authors = (Array.isArray(paper.authors) ? paper.authors : []).map((name) => {
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return { literal: parts[0] };
    return { family: parts.pop(), given: parts.join(' ') };
  });
  const doi = String(paper.doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  return {
    id: paper.id,
    type: paper.type || 'article-journal',
    title: paper.title,
    ...(authors.length ? { author: authors } : {}),
    ...(paper.year ? { issued: { 'date-parts': [[Number(paper.year)]] } } : {}),
    ...(paper.venue ? { 'container-title': paper.venue } : {}),
    ...(paper.publisher ? { publisher: paper.publisher } : {}),
    ...(paper.volume ? { volume: paper.volume } : {}),
    ...(paper.issue ? { issue: paper.issue } : {}),
    ...(paper.pages ? { page: paper.pages } : {}),
    ...(doi ? { DOI: doi } : {}),
    ...(paper.url ? { URL: paper.url } : {}),
  };
}

function renderReferences(sections, papers, style) {
  if (!Object.hasOwn(STYLES, style)) throw new ReferenceInputError('Unsupported citation style');
  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const markers = [];
  for (const section of sections) {
    if (section.text.replace(MARKER, '').includes('[[cite:')) {
      throw new ReferenceInputError('An incomplete citation marker was found. Complete or remove it before formatting.');
    }
    for (const match of section.text.matchAll(MARKER)) {
      const id = markerId(match[1]);
      if (!byId.has(id)) throw new ReferenceInputError(`A cited paper is missing from the library: ${id}. Restore it or remove its citation marker.`);
      markers.push(id);
      if (markers.length > MAX_CITATIONS) throw new ReferenceInputError(`A document can contain at most ${MAX_CITATIONS} linked citations.`);
    }
  }
  if (!markers.length) return { sections, bibliography: '', warnings: [], citations: sections.map(() => []) };
  const items = Object.fromEntries([...new Set(markers)].map((id) => [id, cslPaper(byId.get(id))]));
  const processor = new CSL.Engine({
    retrieveLocale: () => locale,
    retrieveItem: (id) => items[id],
  }, STYLES[style], 'en-US');
  processor.setOutputFormat('text');
  const citations = [];
  const previous = [];
  markers.forEach((id, index) => {
    const citationID = `citation-${index}`;
    const result = processor.processCitationCluster({
      citationID,
      citationItems: [{ id }],
      properties: { noteIndex: 0 },
    }, previous, []);
    result[1].forEach(([position, text]) => { citations[position] = text; });
    previous.push([citationID, 0]);
  });
  let index = 0;
  const sectionCitations = [];
  const rendered = sections.map((section) => {
    const labels = [];
    const text = section.text.replace(MARKER, () => {
      const citation = citations[index++];
      labels.push(citation);
      return citation;
    });
    sectionCitations.push(labels);
    return { ...section, text };
  });
  const bibliography = processor.makeBibliography();
  const warnings = [...new Set(markers)].filter((id) => {
    const paper = byId.get(id);
    const type = paper.type || 'article-journal';
    const missingPublication = ['article-journal', 'paper-conference'].includes(type) ? !paper.venue
      : ['book', 'report'].includes(type) ? !paper.publisher : !paper.url;
    return !paper.year || !paper.authors || !paper.authors.length || missingPublication;
  }).map((id) => `Check incomplete metadata for: ${byId.get(id).title || id}`);
  warnings.push(...[...new Set(markers)].filter((id) => byId.get(id).authorsIncomplete)
    .map((id) => `Check the complete author list for: ${byId.get(id).title || id}`));
  warnings.push('Metadata may omit important details. Verify every reference against the original and your journal guidelines.');
  return { sections: rendered, bibliography: bibliography ? bibliography[1].join('\n').trim() : '', warnings, citations: sectionCitations };
}

module.exports = { STYLES, renderReferences, ReferenceInputError };
