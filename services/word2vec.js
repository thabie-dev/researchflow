const { documentTerms } = require('./literatureAnalysis');

const DIMENSIONS = 24;
const WINDOW = 2;
const EPOCHS = 2;
const NEGATIVE_SAMPLES = 2;
const MAX_TOKENS = 12000;
const MAX_VOCABULARY = 1200;
const MAX_AXIS_TERMS = 12;

function analysisError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeAxis(terms, label) {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > MAX_AXIS_TERMS ||
      terms.some((term) => typeof term !== 'string' || term.length > 60 || !/^[a-z][a-z'-]{2,}$/.test(term.trim().toLowerCase()))) {
    throw analysisError(`${label} must contain 1 to ${MAX_AXIS_TERMS} single English words of 3 to 60 characters.`);
  }
  const normalized = terms.map((term) => term.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw analysisError(`${label} contains duplicate keywords.`);
  return normalized;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sigmoid(value) {
  if (value > 8) return 0.9997;
  if (value < -8) return 0.0003;
  return 1 / (1 + Math.exp(-value));
}

function cosineSimilarity(first, second) {
  let dot = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) {
    dot += first[dimension] * second[dimension];
    firstNorm += first[dimension] * first[dimension];
    secondNorm += second[dimension] * second[dimension];
  }
  return firstNorm && secondNorm ? dot / (Math.sqrt(firstNorm) * Math.sqrt(secondNorm)) : 0;
}

function trainWord2Vec(papers, requestedTerms = [], mode = 'similar', axes = null) {
  const xTerms = axes ? normalizeAxis(axes.x, 'X axis') : null;
  const yTerms = axes ? normalizeAxis(axes.y, 'Y axis') : null;
  let remaining = MAX_TOKENS;
  let truncated = false;
  const tokenized = [];
  for (let index = 0; index < papers.length; index += 1) {
    if (!remaining) { truncated = true; break; }
    const allTokens = documentTerms(papers[index]);
    if (allTokens.length > remaining) truncated = true;
    const tokens = allTokens.slice(0, remaining);
    tokenized.push(tokens);
    remaining -= tokens.length;
  }
  const frequencies = new Map();
  for (const tokens of tokenized) {
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }
  const minFrequency = [...frequencies.values()].some((frequency) => frequency >= 2) ? 2 : 1;
  const vocabulary = [...frequencies.entries()]
    .filter(([, frequency]) => frequency >= minFrequency)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_VOCABULARY);
  if (vocabulary.length < 2) {
    const error = new Error('Word2Vec needs at least two distinct terms in the saved paper titles and abstracts.');
    error.status = 409;
    throw error;
  }

  const wordIndex = new Map(vocabulary.map(([word], index) => [word, index]));
  const normalizedRequested = [...new Set(requestedTerms
    .filter((term) => typeof term === 'string')
    .map((term) => term.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  const missing = normalizedRequested.filter((term) => !wordIndex.has(term));
  if (axes) {
    for (const term of [...xTerms, ...yTerms]) if (!wordIndex.has(term) && !missing.includes(term)) missing.push(term);
  }
  if (missing.length) {
    throw analysisError(`Terms not in the trained vocabulary: ${missing.join(', ')}. Use single words from the vocabulary preview; rare words may be excluded.`);
  }
  const sequences = [];
  let tokenCount = 0;
  let retainedTokens = 0;
  for (const tokens of tokenized) {
    const sequence = [];
    for (const token of tokens) {
      const index = wordIndex.get(token);
      if (index !== undefined) { sequence.push(index); retainedTokens += 1; }
      tokenCount += 1;
    }
    if (sequence.length) sequences.push(sequence);
  }

  const random = seededRandom(202406);
  const inputVectors = vocabulary.map(() =>
    Float64Array.from({ length: DIMENSIONS }, () => (random() - 0.5) / DIMENSIONS));
  const outputVectors = vocabulary.map(() => new Float64Array(DIMENSIONS));
  const samplingWeights = vocabulary.map(([, frequency]) => Math.pow(frequency, 0.75));
  const totalSamplingWeight = samplingWeights.reduce((sum, weight) => sum + weight, 0);
  const cumulativeWeights = [];
  samplingWeights.reduce((total, weight, index) => {
    cumulativeWeights[index] = total + weight;
    return total + weight;
  }, 0);

  let totalPairs = 0;
  for (const sequence of sequences) {
    for (let position = 0; position < sequence.length; position += 1) {
      totalPairs += Math.min(WINDOW, position) + Math.min(WINDOW, sequence.length - position - 1);
    }
  }
  if (!totalPairs) {
    const error = new Error('Word2Vec could not form training pairs from the saved papers.');
    error.status = 409;
    throw error;
  }

  let processedPairs = 0;
  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    for (const sequence of sequences) {
      for (let position = 0; position < sequence.length; position += 1) {
        const center = sequence[position];
        const left = Math.max(0, position - WINDOW);
        const right = Math.min(sequence.length - 1, position + WINDOW);
        for (let contextPosition = left; contextPosition <= right; contextPosition += 1) {
          if (contextPosition === position) continue;
          const context = sequence[contextPosition];
          const progress = processedPairs / (EPOCHS * totalPairs);
          const learningRate = Math.max(0.003, 0.025 * (1 - progress));
          const targets = [[context, 1]];
          for (let negative = 0; negative < NEGATIVE_SAMPLES; negative += 1) {
            let sampled;
            let attempts = 0;
            do {
              const draw = random() * totalSamplingWeight;
              let low = 0;
              let high = cumulativeWeights.length - 1;
              while (low < high) {
                const middle = (low + high) >> 1;
                if (draw < cumulativeWeights[middle]) high = middle;
                else low = middle + 1;
              }
              sampled = low;
              attempts += 1;
            } while (sampled === context && attempts < 5);
            if (sampled !== context) targets.push([sampled, 0]);
          }

          const centerVector = inputVectors[center];
          for (const [targetIndex, label] of targets) {
            const targetVector = outputVectors[targetIndex];
            let dot = 0;
            for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) {
              dot += centerVector[dimension] * targetVector[dimension];
            }
            const gradient = (label - sigmoid(dot)) * learningRate;
            for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) {
              const centerValue = centerVector[dimension];
              const targetValue = targetVector[dimension];
              centerVector[dimension] += gradient * targetValue;
              targetVector[dimension] += gradient * centerValue;
            }
          }
          processedPairs += 1;
        }
      }
    }
  }

  const seedTerms = normalizedRequested.length
    ? normalizedRequested
    : vocabulary.slice(0, 8).map(([term]) => term);
  const relatedTerms = seedTerms.map((term) => {
    const sourceIndex = wordIndex.get(term);
    const neighbors = vocabulary
      .map(([candidate], index) => ({
        term: candidate,
        similarity: cosineSimilarity(inputVectors[sourceIndex], inputVectors[index]),
      }))
      .filter((candidate) => candidate.term !== term)
      .sort((a, b) => (mode === 'dissimilar' ? a.similarity - b.similarity : b.similarity - a.similarity) || a.term.localeCompare(b.term))
      .slice(0, 5);
    return { term, neighbors };
  });

  let heatmap;
  if (axes) {
    const presence = tokenized.map((tokens) => new Set(tokens));
    heatmap = {
      x_terms: xTerms,
      y_terms: yTerms,
      similarity: yTerms.map((y) => xTerms.map((x) => cosineSimilarity(inputVectors[wordIndex.get(y)], inputVectors[wordIndex.get(x)]))),
      cooccurrence: yTerms.map((y) => xTerms.map((x) => presence.reduce((count, terms) => count + (terms.has(x) && terms.has(y) ? 1 : 0), 0))),
      counted_sources: presence.filter((terms) => terms.size).length,
    };
  }
  return {
    engine: 'Local Word2Vec skip-gram with negative sampling',
    paper_count: papers.length,
    vocabulary_size: vocabulary.length,
    training_tokens: tokenCount,
    retained_tokens: retainedTokens,
    sources_scanned: tokenized.length,
    truncated,
    dimensions: DIMENSIONS,
    window: WINDOW,
    epochs: EPOCHS,
    negative_samples: NEGATIVE_SAMPLES,
    mode,
    related_terms: relatedTerms,
    ...(heatmap ? { heatmap } : {}),
    vocabulary_preview: vocabulary.slice(0, 40).map(([term]) => term),
  };
}

module.exports = { trainWord2Vec, MAX_AXIS_TERMS };
