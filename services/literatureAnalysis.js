const { keywords } = require('./journalSearch');

const STOP_WORDS = new Set([
  'about', 'after', 'against', 'all', 'also', 'among', 'and', 'any', 'are',
  'because', 'been', 'before', 'being', 'between', 'but', 'can', 'could',
  'data', 'does', 'during', 'each', 'from', 'have', 'into', 'more', 'most',
  'other', 'over', 'paper', 'papers', 'research', 'results', 'should', 'some',
  'study', 'studies', 'such', 'than', 'that', 'their', 'them', 'there', 'these',
  'they', 'this', 'those', 'through', 'under', 'using', 'very', 'were', 'what',
  'when', 'where', 'which', 'while', 'with', 'would', 'your',
]);
const MAX_TERMS = 30;
const MAX_EDGES = 50;

function documentTerms(paper) {
  const text = `${paper.title || ''} ${paper.abstract || ''}`.toLowerCase();
  return (text.match(/[a-z][a-z'-]{2,}/g) || []).filter((term) => term.length <= 60 && !STOP_WORDS.has(term));
}

function analyze(papers, project) {
  const termCounts = new Map();
  const documentFrequency = new Map();
  const edges = new Map();
  const paperTerms = papers.map((paper) => {
    const terms = documentTerms(paper);
    for (const term of terms) {
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    }
    const uniqueTerms = [...new Set(terms)];
    for (const term of uniqueTerms) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    const prominent = uniqueTerms.slice(0, 20);
    for (let first = 0; first < prominent.length; first += 1) {
      for (let second = first + 1; second < prominent.length; second += 1) {
        const key = [prominent[first], prominent[second]].sort().join('\u0000');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    return terms;
  });

  const rankedTerms = [...termCounts.entries()]
    .map(([term, strength]) => ({ term, strength, papers: documentFrequency.get(term) || 0 }))
    .sort((a, b) => b.strength - a.strength || a.term.localeCompare(b.term))
    .slice(0, MAX_TERMS);
  const selected = new Set(rankedTerms.map(({ term }) => term));
  const cooccurrences = [...edges.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('\u0000');
      return { source, target, weight };
    })
    .filter(({ source, target }) => selected.has(source) && selected.has(target))
    .sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
    .slice(0, MAX_EDGES);

  const yearCounts = new Map();
  const termYears = new Map();
  papers.forEach((paper, index) => {
    const year = Number(paper.year);
    if (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear() + 1) return;
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
    if (!termYears.has(year)) termYears.set(year, new Map());
    const counts = termYears.get(year);
    for (const term of new Set(paperTerms[index])) counts.set(term, (counts.get(term) || 0) + 1);
  });
  const years = [...yearCounts.keys()].sort((a, b) => a - b);
  const temporalTerms = rankedTerms.slice(0, 10).map(({ term }) => ({
    term,
    counts: years.map((year) => termYears.get(year).get(term) || 0),
  }));
  const baseText = [project.title, project.field, project.problemStatement].filter(Boolean).join(' ');
  const baseTerms = keywords(baseText, 3);
  const queryTerms = rankedTerms.slice(0, 8).map(({ term }) => term);
  const suggestedQuery = [
    ...(baseTerms.length ? [`(${baseTerms.map((term) => `"${term}"`).join(' OR ')})`] : []),
    ...(queryTerms.length ? [`(${queryTerms.map((term) => `"${term}"`).join(' OR ')})`] : []),
  ].join(' AND ');

  return {
    engine: 'Local lexical analysis of saved paper titles and abstracts',
    paper_count: papers.length,
    top_terms: rankedTerms,
    network: { nodes: rankedTerms, edges: cooccurrences },
    temporal: { years, paper_counts: years.map((year) => yearCounts.get(year)), terms: temporalTerms },
    suggested_query: suggestedQuery,
  };
}

module.exports = { analyze, documentTerms };
