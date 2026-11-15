const fs = require('fs/promises');
const path = require('path');
const WordExtractor = require('word-extractor');
const { extractPdfText } = require('./pdfText');

const WORD_PATTERN = /[a-zA-Z0-9']+/g;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have',
  'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'may', 'might', 'more', 'most', 'not', 'of', 'on', 'or',
  'our', 'ours', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'to', 'too', 'under', 'until', 'up', 'us', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'will', 'with', 'would', 'you',
  'your',
]);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv']);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, '.pdf', '.docx']);
const MAX_CHUNKS_PER_DOCUMENT = 20;
const TARGET_WORDS_PER_CHUNK = 180;

function tokenize(text) {
  return String(text).toLowerCase().match(WORD_PATTERN) || [];
}

function cosineSimilarity(first, second) {
  if (!first.size || !second.size) return 0;
  let dotProduct = 0;
  let firstSquare = 0;
  let secondSquare = 0;
  for (const [term, count] of first) {
    dotProduct += count * (second.get(term) || 0);
    firstSquare += count * count;
  }
  for (const count of second.values()) secondSquare += count * count;
  if (!firstSquare || !secondSquare) return 0;
  return dotProduct / (Math.sqrt(firstSquare) * Math.sqrt(secondSquare));
}

function summarize(filename, text, tokens) {
  return {
    filename,
    word_count: tokens.length,
    unique_word_count: new Set(tokens).size,
    preview: text.replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

function countTokens(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function compare(first, second) {
  const firstTokens = tokenize(first.text);
  const secondTokens = tokenize(second.text);
  const firstCounts = countTokens(firstTokens);
  const secondCounts = countTokens(secondTokens);
  const commonTerms = [...firstCounts.keys()]
    .filter((term) => secondCounts.has(term))
    .sort((a, b) => (secondCounts.get(b) + firstCounts.get(b)) - (secondCounts.get(a) + firstCounts.get(a)) || a.localeCompare(b))
    .slice(0, 12);

  return {
    similarity: Number(cosineSimilarity(firstCounts, secondCounts).toFixed(4)),
    common_terms: commonTerms,
    first: summarize(first.filename, first.text, firstTokens),
    second: summarize(second.filename, second.text, secondTokens),
  };
}

function uniqueLabels(documents) {
  const counts = new Map();
  return documents.map(({ filename }) => {
    const count = (counts.get(filename) || 0) + 1;
    counts.set(filename, count);
    return count === 1 ? filename : `${filename} (${count})`;
  });
}

function chunksFrom(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = [];
  let wordCount = 0;
  for (const sentence of sentences) {
    const count = sentence.split(/\s+/).length;
    if (current.length && wordCount + count > TARGET_WORDS_PER_CHUNK) {
      chunks.push(current.join(' '));
      current = [];
      wordCount = 0;
      if (chunks.length >= MAX_CHUNKS_PER_DOCUMENT) break;
    }
    current.push(sentence);
    wordCount += count;
  }
  if (current.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) chunks.push(current.join(' '));
  return chunks;
}

function phraseCounts(text) {
  const tokens = tokenize(text);
  const counts = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const unigram = tokens[index];
    if (STOP_WORDS.has(unigram)) continue;
    counts.set(unigram, (counts.get(unigram) || 0) + 1);
    if (index + 1 < tokens.length && !STOP_WORDS.has(tokens[index + 1])) {
      const bigram = `${unigram} ${tokens[index + 1]}`;
      counts.set(bigram, (counts.get(bigram) || 0) + 1);
    }
  }
  return counts;
}

function rankPhrases(counts, limit) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function extractTopics(documents, labels) {
  const profiles = documents.map(({ text }) => {
    const counts = new Map();
    for (const chunk of chunksFrom(text)) {
      for (const phrase of phraseCounts(chunk).keys()) {
        counts.set(phrase, (counts.get(phrase) || 0) + 1);
      }
    }
    return counts;
  });
  const globalCounts = new Map();
  for (const profile of profiles) {
    for (const [phrase, count] of profile) globalCounts.set(phrase, (globalCounts.get(phrase) || 0) + count);
  }
  const topGlobal = rankPhrases(globalCounts, 10);
  const totalGlobal = topGlobal.reduce((sum, [, count]) => sum + count, 0) || 1;
  const globalTopics = topGlobal.map(([phrase, count], index) => ({
    topic_id: index,
    label: phrase,
    keywords: phrase.split(' '),
    score: Number((count / totalGlobal).toFixed(4)),
    chunk_count: count,
  }));
  const journals = profiles.map((profile, index) => {
    const top = rankPhrases(profile, 5);
    const total = top.reduce((sum, [, count]) => sum + count, 0) || 1;
    return {
      filename: labels[index],
      topics: top.map(([phrase, count], topicIndex) => ({
        topic_id: topicIndex,
        label: phrase,
        keywords: phrase.split(' '),
        score: Number((count / total).toFixed(4)),
        chunk_count: count,
      })),
    };
  });
  return {
    engine: 'Frequency-ranked lexical themes (Node.js)',
    preprocessing: ['Whitespace normalization', 'Sentence-based text chunking', 'English stopword removal', 'Unigram and bigram frequency ranking'],
    global_topics: globalTopics,
    journals,
  };
}

function compareMany(documents) {
  const labels = uniqueLabels(documents);
  const vectors = documents.map(({ text }) => countTokens(tokenize(text)));
  const matrix = vectors.map((first) => vectors.map((second) => Number(cosineSimilarity(first, second).toFixed(4))));
  const strongestPairs = [];
  for (let first = 0; first < labels.length; first += 1) {
    for (let second = first + 1; second < labels.length; second += 1) {
      strongestPairs.push({
        first_filename: labels[first],
        second_filename: labels[second],
        similarity: matrix[first][second],
      });
    }
  }
  strongestPairs.sort((a, b) => b.similarity - a.similarity
    || a.first_filename.localeCompare(b.first_filename)
    || a.second_filename.localeCompare(b.second_filename));

  return {
    labels,
    matrix,
    documents: documents.map(({ text }, index) => summarize(labels[index], text, tokenize(text))),
    strongest_pairs: strongestPairs.slice(0, 10),
    topic_extraction: extractTopics(documents, labels),
  };
}

async function readDocument(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`${file.originalname}: use one of ${[...SUPPORTED_EXTENSIONS].join(', ')}.`);
  }

  let text;
  if (TEXT_EXTENSIONS.has(extension)) {
    text = await fs.readFile(file.path, 'utf8');
    text = text.replace(/^\uFEFF/, '');
  } else if (extension === '.pdf') {
    const buffer = await fs.readFile(file.path);
    text = await extractPdfText(buffer);
  } else {
    const extractor = new WordExtractor();
    const document = await extractor.extract(file.path);
    text = document.getBody();
  }

  text = String(text || '').trim();
  if (!text) throw new Error(`${file.originalname}: no readable text was found.`);
  return { filename: file.originalname, text };
}

module.exports = { compare, compareMany, readDocument };
