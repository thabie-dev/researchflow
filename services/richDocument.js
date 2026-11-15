// The supported document subset is deliberately explicit: unsupported content must
// be rejected rather than silently discarded when a document is saved.
const MAX_NODES = 20000;
const MAX_DOCUMENT_BYTES = 800000;
const MAX_DEPTH = 20;
const MAX_TEXT = 200000;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 12;
const FONTS = new Set(['Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana']);
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const SIZES = new Set(['10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt']);

class RichDocumentError extends Error {}

function fail(message) {
  throw new RichDocumentError(message);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    fail('Document contains unsupported properties');
  }
}

function validateRichDocument(document) {
  let nodes = 0;
  const childrenOf = {
    doc: ['paragraph', 'heading', 'bulletList', 'orderedList', 'table'],
    paragraph: ['text', 'hardBreak', 'citation'],
    heading: ['text', 'hardBreak', 'citation'],
    bulletList: ['listItem'],
    orderedList: ['listItem'],
    listItem: ['paragraph', 'heading', 'bulletList', 'orderedList'],
    table: ['tableRow'],
    tableRow: ['tableCell', 'tableHeader'],
    tableCell: ['paragraph', 'heading', 'bulletList', 'orderedList'],
    tableHeader: ['paragraph', 'heading', 'bulletList', 'orderedList'],
  };
  function validateMarks(marks) {
    if (marks === undefined) return;
    if (!Array.isArray(marks) || marks.length > 4) fail('Invalid text formatting');
    const seen = new Set();
    for (const mark of marks) {
      keys(mark, ['type', 'attrs']);
      if (!['bold', 'italic', 'underline', 'textStyle'].includes(mark.type) || seen.has(mark.type)) fail('Unsupported text formatting');
      seen.add(mark.type);
      if (mark.type === 'textStyle') {
        keys(mark.attrs, ['fontFamily', 'fontSize']);
        if (mark.attrs.fontFamily != null && !FONTS.has(mark.attrs.fontFamily)) fail('Unsupported font');
        if (mark.attrs.fontSize != null && !SIZES.has(mark.attrs.fontSize)) fail('Unsupported font size');
      } else if (mark.attrs !== undefined) fail('Unexpected formatting attributes');
    }
  }
  function validate(node, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('Document is too complex');
    keys(node, ['type', 'attrs', 'content', 'text', 'marks']);
    if (typeof node.type !== 'string') fail('Document node type is required');
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || !node.text || node.content !== undefined || node.attrs !== undefined) fail('Invalid text node');
      validateMarks(node.marks);
      return;
    }
    if (node.type === 'citation') {
      if (node.content !== undefined || node.text !== undefined) fail('Invalid citation node');
      keys(node.attrs, ['id']);
      if (typeof node.attrs.id !== 'string' || !node.attrs.id || node.attrs.id.length > 500 || /[\u0000-\u001f]/.test(node.attrs.id)) fail('Invalid citation identifier');
      try { encodeURIComponent(node.attrs.id); } catch (error) { fail('Invalid citation identifier'); }
      validateMarks(node.marks);
      return;
    }
    if (node.text !== undefined || node.marks !== undefined) fail('Invalid document node');
    if (node.type === 'hardBreak') {
      if (node.content !== undefined || node.attrs !== undefined) fail('Invalid line break');
      return;
    }
    if (!Object.hasOwn(childrenOf, node.type)) fail('Unsupported document node');
    if (node.attrs !== undefined) {
      if (node.type === 'paragraph' || node.type === 'heading') {
        keys(node.attrs, node.type === 'heading' ? ['level', 'textAlign'] : ['textAlign']);
        if (node.attrs.textAlign != null && !ALIGNMENTS.has(node.attrs.textAlign)) fail('Unsupported alignment');
        if (node.type === 'heading' && ![1, 2, 3].includes(node.attrs.level)) fail('Unsupported heading level');
      } else if (node.type === 'orderedList') {
        keys(node.attrs, ['start', 'type']);
        if (node.attrs.start !== undefined && node.attrs.start !== 1) fail('Only lists starting at one are supported');
        if (node.attrs.type != null) fail('Custom list markers are not supported');
      } else if (node.type === 'tableCell' || node.type === 'tableHeader') {
        keys(node.attrs, ['colspan', 'rowspan', 'colwidth', 'align']);
        if ((node.attrs.colspan != null && node.attrs.colspan !== 1) ||
            (node.attrs.rowspan != null && node.attrs.rowspan !== 1) ||
            (node.attrs.colwidth != null) || (node.attrs.align != null)) fail('Merged, custom-width or cell-aligned tables are not supported');
      } else fail('Unexpected node attributes');
    } else if (node.type === 'heading') fail('Heading level is required');
    if (node.content !== undefined && !Array.isArray(node.content)) fail('Invalid node content');
    const content = node.content || [];
    if (['doc', 'bulletList', 'orderedList', 'listItem', 'table', 'tableRow', 'tableCell', 'tableHeader'].includes(node.type) && !content.length) {
      fail('Document contains an empty structural node');
    }
    for (const child of content) {
      if (!object(child) || !childrenOf[node.type].includes(child.type)) fail('Invalid document structure');
      validate(child, depth + 1);
    }
    if (node.type === 'table') {
      const width = content[0].content.length;
      if (width > MAX_TABLE_COLUMNS || content.length > MAX_TABLE_ROWS || content.some((row) => row.content.length !== width)) fail('Invalid table dimensions');
    }
  }
  if (!object(document) || document.type !== 'doc') fail('Document must have a doc root');
  validate(document, 0);
  if (new TextEncoder().encode(JSON.stringify(document)).length > MAX_DOCUMENT_BYTES) {
    fail('Document is too large');
  }

  function textOf(node) {
    if (node.type === 'text') return node.text;
    if (node.type === 'citation') return `[[cite:${encodeURIComponent(node.attrs.id)}]]`;
    if (node.type === 'hardBreak') return '\n';
    const children = node.content || [];
    const separator = node.type === 'tableRow' ? '\t'
      : ['doc', 'listItem', 'bulletList', 'orderedList', 'table', 'tableCell', 'tableHeader'].includes(node.type) ? '\n' : '';
    return children.map(textOf).join(separator);
  }
  const text = textOf(document);
  if (text.length > MAX_TEXT) fail('Document text is too long');
  return text;
}

module.exports = { validateRichDocument, RichDocumentError, MAX_TABLE_ROWS, MAX_TABLE_COLUMNS, FONTS, SIZES };
