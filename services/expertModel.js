const STOP_WORDS = new Set([
  'about', 'after', 'against', 'all', 'also', 'among', 'and', 'any', 'are',
  'because', 'been', 'before', 'being', 'between', 'but', 'can', 'could',
  'data', 'does', 'during', 'each', 'from', 'have', 'into', 'more', 'most',
  'other', 'over', 'paper', 'papers', 'research', 'results', 'should', 'some',
  'study', 'studies', 'such', 'than', 'that', 'their', 'them', 'there', 'these',
  'they', 'this', 'those', 'through', 'under', 'using', 'very', 'were', 'what',
  'when', 'where', 'which', 'while', 'with', 'would', 'your',
]);
const MAX_CANDIDATES = 180;
const MAX_DOCUMENT_TERMS = 40;
const MIN_CO_OCCURRENCE = 2;

function documentNgrams(paper) {
  const text = `${paper.title || ''} ${paper.abstract || ''}`
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean);
  const phrases = [];
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const gram = words.slice(index, index + size);
      if (gram.some((word) => word.length <= 2 || word.length > 60 || STOP_WORDS.has(word))) continue;
      phrases.push(gram.join(' '));
    }
  }
  return phrases;
}

function weightedBetweenness(adjacency) {
  const centrality = new Map([...adjacency.keys()].map((term) => [term, 0]));
  const nodes = [...adjacency.keys()];

  for (const source of nodes) {
    const stack = [];
    const predecessors = new Map(nodes.map((term) => [term, []]));
    const paths = new Map(nodes.map((term) => [term, 0]));
    const distance = new Map(nodes.map((term) => [term, -1]));
    paths.set(source, 1);
    distance.set(source, 0);
    const queue = [source];

    while (queue.length) {
      const current = queue.shift();
      stack.push(current);
      for (const neighbor of adjacency.get(current).keys()) {
        if (distance.get(neighbor) < 0) {
          queue.push(neighbor);
          distance.set(neighbor, distance.get(current) + 1);
        }
        if (distance.get(neighbor) === distance.get(current) + 1) {
          paths.set(neighbor, paths.get(neighbor) + paths.get(current));
          predecessors.get(neighbor).push(current);
        }
      }
    }

    const dependency = new Map(nodes.map((term) => [term, 0]));
    while (stack.length) {
      const target = stack.pop();
      for (const previous of predecessors.get(target)) {
        const contribution = (paths.get(previous) / paths.get(target)) * (1 + dependency.get(target));
        dependency.set(previous, dependency.get(previous) + contribution);
      }
      if (target !== source) centrality.set(target, centrality.get(target) + dependency.get(target));
    }
  }

  const scale = nodes.length > 2 ? 1 / ((nodes.length - 1) * (nodes.length - 2)) : 0;
  for (const term of nodes) centrality.set(term, centrality.get(term) * scale);
  return centrality;
}

function analyzeExpertModel(papers, project) {
  const termFrequencies = new Map();
  const paperTerms = papers.map((paper) => {
    const counts = new Map();
    for (const phrase of documentNgrams(paper)) counts.set(phrase, (counts.get(phrase) || 0) + 1);
    for (const [phrase, count] of counts) termFrequencies.set(phrase, (termFrequencies.get(phrase) || 0) + count);
    return [...counts.keys()];
  });

  const minFrequency = [...termFrequencies.values()].some((count) => count >= 3) ? 3 : 1;
  const candidates = [...termFrequencies.entries()]
    .filter(([, count]) => count >= minFrequency)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CANDIDATES)
    .map(([term, frequency]) => ({ term, frequency }));
  const candidateSet = new Set(candidates.map(({ term }) => term));
  const cooccurrences = new Map();

  for (const terms of paperTerms) {
    const present = terms.filter((term) => candidateSet.has(term))
      .sort((a, b) => termFrequencies.get(b) - termFrequencies.get(a) || a.localeCompare(b))
      .slice(0, MAX_DOCUMENT_TERMS);
    for (let first = 0; first < present.length; first += 1) {
      for (let second = first + 1; second < present.length; second += 1) {
        const key = [present[first], present[second]].sort().join('\u0000');
        cooccurrences.set(key, (cooccurrences.get(key) || 0) + 1);
      }
    }
  }

  const adjacency = new Map(candidates.map(({ term }) => [term, new Map()]));
  const edges = [];
  for (const [key, weight] of cooccurrences) {
    if (weight < MIN_CO_OCCURRENCE) continue;
    const [source, target] = key.split('\u0000');
    adjacency.get(source).set(target, weight);
    adjacency.get(target).set(source, weight);
    edges.push({ source, target, weight });
  }
  edges.sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  const betweenness = weightedBetweenness(adjacency);
  const nodes = candidates.map(({ term, frequency }) => ({
    term,
    frequency,
    strength: edges.length ? [...adjacency.get(term).values()].reduce((sum, weight) => sum + weight, 0) : paperTerms.filter((terms) => terms.includes(term)).length,
    betweenness: betweenness.get(term) || 0,
    papers: paperTerms.filter((terms) => terms.includes(term)).length,
  })).sort((a, b) => b.strength - a.strength || b.frequency - a.frequency || a.term.localeCompare(b.term));
  let cutoff = 0;
  if (nodes.length > 3 && nodes[0].strength !== nodes[nodes.length - 1].strength) {
    const first = nodes[0].strength;
    const last = nodes[nodes.length - 1].strength;
    let bestDistance = -Infinity;
    nodes.forEach((node, index) => {
      const position = index / (nodes.length - 1);
      const relative = (node.strength - last) / (first - last);
      const distance = 1 - position - relative;
      if (distance > bestDistance) { bestDistance = distance; cutoff = index; }
    });
  } else {
    cutoff = nodes.length - 1;
  }
  const cutoffStrength = nodes[cutoff] ? nodes[cutoff].strength : null;
  nodes.forEach((node) => { node.retained = cutoffStrength === null || node.strength >= cutoffStrength; });
  const keywords = [
    project.title,
    project.field,
    project.problemStatement,
    ...(project.manuscript && [project.manuscript.keywords, project.manuscript.introduction] || []),
  ].filter(Boolean).join(' ').toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
  const baseQuery = [...new Set(keywords.filter((word) => !STOP_WORDS.has(word)))].slice(0, 3);
  const refinedQueries = nodes.slice(0, 8).map((node) => {
    const concepts = [...new Set([...baseQuery, ...node.term.split(' ')])].slice(0, 8);
    return {
      term: node.term,
      query: `(${concepts.map((term) => `"${term}"`).join(' OR ')})`,
    };
  });

  return {
    engine: 'Expert n-gram co-occurrence network',
    paper_count: papers.length,
    method: '2–3 word phrase frequencies, document-level co-occurrence, weighted degree strength, normalized betweenness and elbow-based pruning',
    pruning: { method: 'maximum distance from the ranked-strength baseline (not the upstream spline)', cutoff_strength: cutoffStrength, retained_count: nodes.filter((node) => node.retained).length },
    thresholds: { min_frequency: minFrequency, min_co_occurrence: MIN_CO_OCCURRENCE },
    terms: nodes.slice(0, 30),
    network: { nodes: nodes.slice(0, 30), edges: edges.slice(0, 50) },
    refined_queries: refinedQueries,
  };
}

module.exports = { analyzeExpertModel };
