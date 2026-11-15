const store = require('./store');

const COLLECTION = 'analysisDocuments';
const MAX_DOCUMENTS = 30;
const MAX_TEXT_LENGTH = 200000;

function list(projectId) {
  return store.read(COLLECTION, []).filter((document) => document.projectId === projectId);
}

function metadata(document) {
  const { text, ...summary } = document;
  return summary;
}

function sources(projectId, papers, scope = 'all') {
  const documents = list(projectId);
  return {
    documents,
    corpus: [
      ...(scope === 'documents' ? [] : papers),
      ...(scope === 'papers' ? [] : documents.map((document) => ({ title: '', abstract: document.text }))),
    ],
  };
}

module.exports = { COLLECTION, MAX_DOCUMENTS, MAX_TEXT_LENGTH, list, metadata, sources };
