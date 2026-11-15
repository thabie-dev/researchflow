const { MAX_TABLE_ROWS, MAX_TABLE_COLUMNS, FONTS, SIZES } = require('../services/richDocument');

function parseTabularText(text) {
  if (!text.includes('\t')) return null;
  const rows = [[]];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  let hasSeparator = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '' && !afterQuote) {
      quoted = true;
    } else if (char === '\t' || char === '\n' || char === '\r') {
      rows[rows.length - 1].push(cell);
      cell = '';
      afterQuote = false;
      if (char === '\t') {
        hasSeparator = true;
      } else {
        if (char === '\r' && text[i + 1] === '\n') i++;
        if (i < text.length - 1) rows.push([]);
      }
    } else {
      if (afterQuote) throw new Error('The copied tab-separated data contains an invalid quoted cell.');
      cell += char;
    }
  }
  if (quoted && hasSeparator) throw new Error('The copied tab-separated data contains an unclosed quoted cell.');
  if (quoted) return null;
  if (!hasSeparator) return null;
  if (cell || afterQuote || !/[\r\n]$/.test(text)) rows[rows.length - 1].push(cell);
  if (rows.length > MAX_TABLE_ROWS || rows[0].length > MAX_TABLE_COLUMNS ||
      rows.some((row) => row.length !== rows[0].length)) {
    throw new Error(`Tables must be rectangular and have at most ${MAX_TABLE_ROWS} rows and ${MAX_TABLE_COLUMNS} columns.`);
  }
  return rows;
}

function prepareTableHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  if (!tables.length) return null;
  for (const table of tables) {
    if (table.parentElement.closest('table') || table.querySelector('img, video, audio, object, iframe, svg, math')) {
      throw new Error('Tables containing nested tables or non-text content cannot be pasted.');
    }
    const rows = Array.from(table.rows);
    if (!rows.length || rows.length > MAX_TABLE_ROWS) {
      throw new Error(`Tables must have between 1 and ${MAX_TABLE_ROWS} rows.`);
    }
    const width = rows[0].cells.length;
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.colSpan !== 1 || cell.rowSpan !== 1) {
          throw new Error('Merged table cells are not supported. Unmerge them before pasting.');
        }
      }
    }
    if (!width || width > MAX_TABLE_COLUMNS || rows.some((row) => row.cells.length !== width)) {
      throw new Error(`Tables must be rectangular and have at most ${MAX_TABLE_COLUMNS} columns.`);
    }
    for (const row of rows) {
      for (const cell of row.cells) {
        cell.removeAttribute('data-colwidth');
        cell.removeAttribute('colwidth');
        cell.removeAttribute('align');
      }
    }
    for (const element of table.querySelectorAll('[style]')) {
      const family = element.style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (family && FONTS.has(family)) element.style.fontFamily = family;
      else element.style.removeProperty('font-family');
      if (!SIZES.has(element.style.fontSize)) element.style.removeProperty('font-size');
      if (element.style.textAlign && !['left', 'center', 'right', 'justify'].includes(element.style.textAlign)) {
        element.style.removeProperty('text-align');
      }
    }
  }
  return doc.body.innerHTML;
}

function tabularTextHtml(rows) {
  const table = document.createElement('table');
  const body = table.createTBody();
  for (const values of rows) {
    const row = body.insertRow();
    for (const value of values) {
      const cell = row.insertCell();
      const paragraph = document.createElement('p');
      const lines = value.split(/\r\n|\r|\n/);
      lines.forEach((line, index) => {
        if (index) paragraph.appendChild(document.createElement('br'));
        paragraph.appendChild(document.createTextNode(line));
      });
      cell.appendChild(paragraph);
    }
  }
  return table.outerHTML;
}

module.exports = { parseTabularText, prepareTableHtml, tabularTextHtml };
