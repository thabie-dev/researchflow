const { PDFParse } = require('pdf-parse');

function clean(value, maxLength) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : '';
}

function metadataAuthors(value) {
  const names = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;\n]+/) : [];
  if (names.length > 50) return [];
  const cleaned = names.map((name) => clean(name, 200)).filter(Boolean);
  return cleaned.some((name) => name.includes(',')) ? [] : cleaned;
}

function firstPageDoi(text) {
  const matches = text.match(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi) || [];
  const unique = new Map();
  for (const match of matches) {
    let doi = match.replace(/[.,;:]+$/, '');
    while (doi.endsWith(')') && (doi.match(/\)/g) || []).length > (doi.match(/\(/g) || []).length) doi = doi.slice(0, -1);
    if (doi.length <= 300) unique.set(doi.toLowerCase(), doi);
  }
  return unique.size === 1 ? [...unique.values()][0] : '';
}

async function extractPdfReference(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    const firstPage = await parser.getText({ partial: [1] });
    const metadata = info.metadata;
    const xmpTitle = metadata && metadata.get('dc:title');
    const xmpAuthors = metadata && metadata.get('dc:creator');
    const title = clean(xmpTitle, 500) || clean(info.info && info.info.Title, 500);
    const authors = metadataAuthors(xmpAuthors);
    const fallbackAuthors = authors.length ? authors : metadataAuthors(info.info && info.info.Author);
    const doi = firstPageDoi(firstPage.text || '');
    return {
      fields: { ...(title ? { title } : {}), ...(fallbackAuthors.length ? { authors: fallbackAuthors } : {}), ...(doi ? { doi } : {}) },
      textExtracted: Boolean((firstPage.text || '').replace(/--\s*1\s+of\s+\d+\s*--/g, '').trim()),
    };
  } finally {
    await parser.destroy();
  }
}

module.exports = { extractPdfReference, firstPageDoi, metadataAuthors };
