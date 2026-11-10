const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} = require('docx');
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');
const ExcelJS = require('exceljs');

const NAVY = '1F2A44';
const ORANGE = 'F07F13';

const FORMATS = {
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  csv: { mime: 'text/csv; charset=utf-8', ext: 'csv' },
};

const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const paragraphs = (t) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function subtitle(doc) {
  if (doc.conference) return `${doc.conference.name}${doc.conference.format ? ` (${doc.conference.format})` : ''}`;
  if (doc.targetJournal) return `Target journal: ${doc.targetJournal}`;
  return '';
}

function normalise(body) {
  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .map((s) => ({ title: String(s.title || '').slice(0, 200), text: String(s.text || '') }))
    .filter((s) => s.title);
  return {
    title: String(body.title || 'Manuscript').slice(0, 300),
    conference: body.conference && body.conference.name ? { name: String(body.conference.name), format: String(body.conference.format || '') } : null,
    targetJournal: body.targetJournal ? String(body.targetJournal) : '',
    sections,
    tasks: (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 500).map((t) => ({
      title: String(t.title || ''), column: String(t.column || ''), due: String(t.dueDate || t.due || ''),
    })),
  };
}

async function buildDocx(doc) {
  const children = [new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE })];
  if (subtitle(doc)) children.push(new Paragraph({ children: [new TextRun({ text: subtitle(doc), italics: true })] }));
  doc.sections.forEach((s) => {
    const text = s.text.trim();
    if (!text) return;
    children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 } }));
    paragraphs(text).forEach((p) => children.push(new Paragraph({
      children: p.split('\n').flatMap((line, i) => [new TextRun({ text: line, break: i ? 1 : 0 })]),
      spacing: { after: 160 },
      alignment: AlignmentType.LEFT,
    })));
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

function buildPdf(doc) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 64, info: { Title: doc.title } });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.font('Helvetica-Bold').fontSize(22).fillColor('#1F2A44').text(doc.title);
    if (subtitle(doc)) pdf.moveDown(0.3).font('Helvetica-Oblique').fontSize(11).fillColor('#555').text(subtitle(doc));
    doc.sections.forEach((s) => {
      const text = s.text.trim();
      if (!text) return;
      pdf.moveDown(1).font('Helvetica-Bold').fontSize(15).fillColor('#1F2A44').text(s.title);
      pdf.moveDown(0.3).font('Helvetica').fontSize(11).fillColor('#222');
      paragraphs(text).forEach((p) => pdf.text(p, { align: 'left', lineGap: 2 }).moveDown(0.6));
    });
    pdf.end();
  });
}

function sentences(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
}

async function buildPptx(doc) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = doc.title;
  const title = pptx.addSlide();
  title.background = { color: NAVY };
  title.addShape(pptx.ShapeType.rect, { x: 0.6, y: 3.3, w: 1.6, h: 0.08, fill: { color: ORANGE } });
  title.addText(doc.title, { x: 0.6, y: 1.2, w: 12, h: 2, fontSize: 38, bold: true, color: 'FFFFFF', valign: 'bottom' });
  if (subtitle(doc)) title.addText(subtitle(doc), { x: 0.6, y: 3.6, w: 12, h: 0.6, fontSize: 18, color: 'D6DCE8' });

  doc.sections.forEach((s) => {
    const all = sentences(s.text);
    if (!all.length) return;
    // Short sections: one slide of the key sentences. Long ones: up to 3 slides.
    const perSlide = 5;
    const limited = all.slice(0, perSlide * 3);
    for (let i = 0; i < limited.length; i += perSlide) {
      const slide = pptx.addSlide();
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: NAVY } });
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 1.1, w: 13.33, h: 0.06, fill: { color: ORANGE } });
      const suffix = limited.length > perSlide ? ` (${i / perSlide + 1})` : '';
      slide.addText(s.title + suffix, { x: 0.6, y: 0.15, w: 12, h: 0.8, fontSize: 28, bold: true, color: 'FFFFFF' });
      slide.addText(
        limited.slice(i, i + perSlide).map((t) => ({ text: t.length > 220 ? `${t.slice(0, 217)}...` : t, options: { bullet: true, breakLine: true } })),
        { x: 0.7, y: 1.5, w: 12, h: 5.4, fontSize: 18, color: '222222', valign: 'top', paraSpaceAfter: 10, fit: 'shrink' },
      );
    }
  });
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(out);
}

function splitRow(line) {
  if (line.includes('|')) return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  return line.split(',').map((c) => c.trim());
}

// Finds blocks of consecutive delimited lines (pipe, tab or comma) with a consistent column count.
function extractTables(doc) {
  const tables = [];
  doc.sections.forEach((s) => {
    const lines = s.text.split('\n');
    let block = [];
    const flush = () => {
      if (block.length >= 2) tables.push({ section: s.title, rows: block });
      block = [];
    };
    lines.forEach((line) => {
      if (!line.trim() || /^[\s|:+-]+$/.test(line)) { if (!line.trim()) flush(); return; }
      const delimited = line.includes('|') || line.includes('\t') || line.split(',').length >= 3;
      if (!delimited) { flush(); return; }
      const row = splitRow(line);
      if (row.length < 2 || row.some((c) => c.length > 80)) { flush(); return; }
      if (block.length && block[0].length !== row.length) flush();
      block.push(row);
    });
    flush();
  });
  return tables;
}

function sectionRows(doc) {
  return [['Section', 'Words', 'Text'], ...doc.sections.map((s) => [s.title, words(s.text), s.text.trim()])];
}

async function buildXlsx(doc) {
  const wb = new ExcelJS.Workbook();
  const addSheet = (name, rows) => {
    const ws = wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${NAVY}` } };
    ws.columns.forEach((col) => {
      let max = 10;
      col.eachCell({ includeEmpty: false }, (c) => { max = Math.min(60, Math.max(max, String(c.value).split('\n')[0].length + 2)); });
      col.width = max;
    });
    return ws;
  };
  const summary = addSheet('Sections', sectionRows(doc));
  summary.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  extractTables(doc).forEach((t, i) => addSheet(`${i + 1} ${t.section}`, t.rows));
  if (doc.tasks.length) addSheet('Tasks', [['Task', 'Status', 'Due'], ...doc.tasks.map((t) => [t.title, t.column, t.due])]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(doc) {
  const tables = extractTables(doc);
  const rows = [];
  if (tables.length) {
    tables.forEach((t, i) => {
      if (i) rows.push([]);
      rows.push([`# ${t.section}`]);
      rows.push(...t.rows);
    });
  } else {
    rows.push(...sectionRows(doc));
  }
  return Buffer.from(`\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`, 'utf8');
}

async function exportDocument(format, body) {
  const doc = normalise(body);
  switch (format) {
    case 'docx': return buildDocx(doc);
    case 'pdf': return buildPdf(doc);
    case 'pptx': return buildPptx(doc);
    case 'xlsx': return buildXlsx(doc);
    case 'csv': return buildCsv(doc);
    default: throw new Error('Unsupported export format');
  }
}

module.exports = { exportDocument, FORMATS };
