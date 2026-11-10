const path = require('path');
const { spawn } = require('child_process');
const JSZip = require('jszip');
const pdfParse = require('pdf-parse');

function docText(buffer) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'docWorker.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), 20000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err || 'the Word document could not be read'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buffer);
  });
}

const COMMON = /^(abstract|keywords?|index terms|introduction|background|related work|literature review|methodology|methods?|materials and methods|results|results and discussion|discussion|conclusions?|conclusion and future work|future work|acknowledge?ments?|references|bibliography|appendix(?:es)?|declarations?|funding|author contributions|ethics statement)\b[:.]?$/i;
const NUMBERED = /^(?:\d+(?:\.\d+){0,2}[.)]?|[IVX]+\.|[A-Z]\.)\s+[A-Za-z]/;
const ALLCAPS = /^[A-Z][A-Z0-9 &,\-:]{4,}$/;

function headingsFromText(text) {
  const out = [];
  text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).forEach((l) => {
    if (l.length < 3 || l.length > 80 || /[.!?]$/.test(l) && !COMMON.test(l)) return;
    if (COMMON.test(l) || NUMBERED.test(l) || ALLCAPS.test(l)) out.push(l);
  });
  return out;
}

function stripXml(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function fromDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const headings = [];
  const lines = [];
  (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).forEach((p) => {
    const text = stripXml((p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || []).join('')).trim();
    if (!text) return;
    lines.push(text);
    if (/<w:pStyle w:val="(?:Heading|Title)/i.test(p)) headings.push(text);
  });
  return headings.length ? headings : headingsFromText(lines.join('\n'));
}

async function fromOdt(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('content.xml').async('string');
  const headings = (xml.match(/<text:h[ >][\s\S]*?<\/text:h>/g) || []).map((h) => stripXml(h).trim()).filter(Boolean);
  if (headings.length) return headings;
  return headingsFromText((xml.match(/<text:p[ >][\s\S]*?<\/text:p>/g) || []).map((p) => stripXml(p)).join('\n'));
}

function rtfToText(rtf) {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(?:par|line)\b ?/g, '\n')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

async function extractHeadings(buffer, fileName) {
  const ext = path.extname(fileName || '').toLowerCase().replace('.', '');
  switch (ext) {
    case 'pdf': {
      const data = await pdfParse(buffer);
      if (!data.text || !data.text.trim()) {
        throw new Error('this PDF has no selectable text (it may be a scan). Paste the section headings instead');
      }
      return headingsFromText(data.text);
    }
    case 'docx': return fromDocx(buffer);
    case 'doc': return headingsFromText(await docText(buffer));
    case 'odt': return fromOdt(buffer);
    case 'rtf': return headingsFromText(rtfToText(buffer.toString('latin1')));
    case 'tex': return [...buffer.toString('utf8').matchAll(/\\(?:sub)*section\*?\{([^}]+)\}/g)].map((m) => m[1]);
    case 'md': return [...buffer.toString('utf8').matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1]);
    case 'txt': return headingsFromText(buffer.toString('utf8'));
    default:
      throw new Error('unsupported file type. Upload a PDF, Word (.docx or .doc), ODT, RTF, LaTeX, Markdown or text file');
  }
}

module.exports = { extractHeadings };
