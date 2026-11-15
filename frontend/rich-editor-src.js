const { Editor, Extension, Node } = require('@tiptap/core');
const StarterKit = require('@tiptap/starter-kit').default;
const { TableKit } = require('@tiptap/extension-table');
const TextAlign = require('@tiptap/extension-text-align').default;
const { TextStyle, FontFamily, FontSize } = require('@tiptap/extension-text-style');
const { EditorState, Plugin } = require('@tiptap/pm/state');
const { validateRichDocument } = require('../services/richDocument');
const { parseTabularText, prepareTableHtml, tabularTextHtml } = require('./table-paste');

function fromPlainText(text) {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

function convertCitationMarkers(node) {
  if (!node.content) return node;
  const content = [];
  for (const child of node.content) {
    if (child.type !== 'text') {
      content.push(convertCitationMarkers(child));
      continue;
    }
    const pattern = /\[\[cite:([^\]\s]+)\]\]/g;
    let start = 0;
    for (const match of child.text.matchAll(pattern)) {
      let id;
      try { id = decodeURIComponent(match[1]); } catch (error) { continue; }
      if (!id || id.length > 500 || /[\u0000-\u001f]/.test(id)) continue;
      if (match.index > start) content.push({ ...child, text: child.text.slice(start, match.index) });
      content.push({ type: 'citation', attrs: { id }, ...(child.marks ? { marks: child.marks } : {}) });
      start = match.index + match[0].length;
    }
    if (start < child.text.length) content.push({ ...child, text: child.text.slice(start) });
  }
  return { ...node, content };
}

function createEditor(container, textarea, onChange, onError) {
  const toolbar = document.createElement('div');
  toolbar.className = 'rich-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Formatting ribbon');
  const surface = document.createElement('div');
  surface.className = 'rich-surface';
  const scrollHint = document.createElement('p');
  scrollHint.className = 'ribbon-scroll-hint';
  scrollHint.textContent = 'Swipe across the ribbon for more tools.';
  container.append(toolbar, scrollHint, surface);
  const tableTools = document.createElement('div');
  tableTools.className = 'table-context-tools';
  tableTools.setAttribute('role', 'group');
  tableTools.setAttribute('aria-label', 'Add rows and columns at the selected cell');
  tableTools.hidden = true;
  container.appendChild(tableTools);
  const Validate = Extension.create({
    name: 'validateDocument',
    addProseMirrorPlugins() {
      return [new Plugin({
        filterTransaction(transaction) {
          if (!transaction.docChanged) return true;
          try {
            validateRichDocument(transaction.doc.toJSON());
            return true;
          } catch (error) {
            onError(`Edit not applied: ${error.message}`);
            return false;
          }
        },
      })];
    },
  });
  const Citation = Node.create({
    name: 'citation',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() { return { id: { default: null } }; },
    parseHTML() { return [{ tag: 'span[data-citation-id]', getAttrs: (element) => ({ id: element.getAttribute('data-citation-id') }) }]; },
    renderHTML({ node }) { return ['span', { 'data-citation-id': node.attrs.id }, `[[cite:${encodeURIComponent(node.attrs.id)}]]`]; },
    renderText({ node }) { return `[[cite:${encodeURIComponent(node.attrs.id)}]]`; },
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('span');
        dom.className = 'linked-citation';
        dom.setAttribute('data-citation-id', node.attrs.id);
        dom.setAttribute('contenteditable', 'false');
        dom.textContent = '[Formatting citation…]';
        return { dom };
      };
    },
  });
  let tablePasteError = null;
  const editor = new Editor({
    element: surface,
    extensions: [
      StarterKit.configure({
        blockquote: false, code: false, codeBlock: false, horizontalRule: false,
        strike: false, link: false, heading: { levels: [1, 2, 3] },
      }),
      TableKit.configure({ table: { resizable: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle, FontFamily, FontSize, Citation, Validate,
    ],
    editorProps: {
      attributes: { 'aria-label': textarea.getAttribute('aria-label') || 'Document editor', role: 'textbox', 'aria-multiline': 'true' },
      transformPastedHTML(html) {
        tablePasteError = null;
        try {
          return prepareTableHtml(html) || html;
        } catch (error) {
          tablePasteError = error;
          return '<p></p>';
        }
      },
      handlePaste(view, event) {
        if (tablePasteError) {
          onError(`Table not pasted: ${tablePasteError.message}`);
          tablePasteError = null;
          return true;
        }
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        try {
          const html = clipboard.getData('text/html');
          if (html && prepareTableHtml(html)) return false;
          const rows = parseTabularText(clipboard.getData('text/plain'));
          if (!rows) return false;
          view.pasteHTML(tabularTextHtml(rows));
          return true;
        } catch (error) {
          onError(`Table not pasted: ${error.message}`);
          return true;
        }
      },
    },
    onUpdate({ editor: updated }) {
      const document = updated.getJSON();
      textarea.value = validateRichDocument(document);
      onChange(document, textarea.value);
    },
  });
  const controls = [];
  function group(label) {
    const section = document.createElement('div');
    section.className = 'ribbon-group';
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', label);
    const content = document.createElement('div');
    content.className = 'ribbon-group-controls';
    const caption = document.createElement('span');
    caption.className = 'ribbon-group-label';
    caption.textContent = label;
    caption.setAttribute('aria-hidden', 'true');
    section.append(content, caption);
    toolbar.appendChild(section);
    return content;
  }
  function button(parent, label, title, action, active, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `ghost-btn ribbon-button ${className}`.trim();
    element.textContent = label;
    element.title = title;
    element.setAttribute('aria-label', title);
    if (active) element.setAttribute('aria-pressed', 'false');
    element.addEventListener('mousedown', (event) => event.preventDefault());
    element.addEventListener('click', () => action(editor.chain().focus()).run());
    parent.appendChild(element);
    controls.push(element);
    return { element, active };
  }
  function select(parent, label, options, apply, className = '') {
    const element = document.createElement('select');
    element.className = `ribbon-select ${className}`.trim();
    element.setAttribute('aria-label', label);
    options.forEach(([value, name]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = name;
      element.appendChild(option);
    });
    element.addEventListener('change', () => {
      if (element.value) apply(editor.chain().focus(), element.value).run();
      refreshControls();
    });
    parent.appendChild(element);
    controls.push(element);
    return element;
  }

  const historyGroup = group('History');
  button(historyGroup, 'Undo', 'Undo', (chain) => chain.undo());
  button(historyGroup, 'Redo', 'Redo', (chain) => chain.redo());
  const styleGroup = group('Style');
  const style = select(styleGroup, 'Paragraph style', [['', 'Mixed style'], ['p', 'Normal'], ['1', 'Heading 1'], ['2', 'Heading 2'], ['3', 'Heading 3']],
    (chain, value) => value === 'p' ? chain.setParagraph() : value ? chain.setHeading({ level: Number(value) }) : chain);
  const fontGroup = group('Font');
  const font = select(fontGroup, 'Font', [['', 'Default font'], ...['Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana'].map((name) => [name, name])],
    (chain, value) => value ? chain.setFontFamily(value) : chain);
  const size = select(fontGroup, 'Font size', [['', 'Size'], ...['10', '11', '12', '14', '16', '18', '24'].map((value) => [`${value}pt`, `${value} pt`])],
    (chain, value) => value ? chain.setFontSize(value) : chain, 'ribbon-size');
  const toggles = [
    button(fontGroup, 'B', 'Bold', (chain) => chain.toggleBold(), () => editor.isActive('bold'), 'ribbon-bold'),
    button(fontGroup, 'I', 'Italic', (chain) => chain.toggleItalic(), () => editor.isActive('italic'), 'ribbon-italic'),
    button(fontGroup, 'U', 'Underline', (chain) => chain.toggleUnderline(), () => editor.isActive('underline'), 'ribbon-underline'),
  ];
  const paragraphGroup = group('Paragraph');
  const alignment = select(paragraphGroup, 'Alignment', [['', 'Alignment'], ['left', 'Align left'], ['center', 'Center'], ['right', 'Align right'], ['justify', 'Justify']],
    (chain, value) => chain.setTextAlign(value));
  toggles.push(
    button(paragraphGroup, 'Bullets', 'Bulleted list', (chain) => chain.toggleBulletList(), () => editor.isActive('bulletList')),
    button(paragraphGroup, 'Numbering', 'Numbered list', (chain) => chain.toggleOrderedList(), () => editor.isActive('orderedList')),
  );
  const tableGroup = group('Table');
  const tableActions = {
    insert: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    addRow: (chain) => chain.addRowAfter(),
    addColumn: (chain) => chain.addColumnAfter(),
    deleteRow: (chain) => chain.deleteRow(),
    deleteColumn: (chain) => chain.deleteColumn(),
    deleteTable: (chain) => chain.deleteTable(),
  };
  const table = select(tableGroup, 'Table actions', [
    ['', 'Table actions'], ['insert', 'Insert 3 × 3 table'], ['addRow', 'Add row below'],
    ['addColumn', 'Add column after'], ['deleteRow', 'Delete row'], ['deleteColumn', 'Delete column'], ['deleteTable', 'Delete table'],
  ], (chain, value) => tableActions[value](chain));
  [
    ['Row above', 'Add row above selected cell', (chain) => chain.addRowBefore()],
    ['Row below', 'Add row below selected cell', (chain) => chain.addRowAfter()],
    ['Column before', 'Add column before selected cell', (chain) => chain.addColumnBefore()],
    ['Column after', 'Add column after selected cell', (chain) => chain.addColumnAfter()],
  ].forEach(([label, title, action]) => button(tableTools, label, title, action));
  table.title = 'While editing a table, press Alt+Shift+T to focus the cell controls.';
  tableTools.firstElementChild.setAttribute('aria-keyshortcuts', 'Alt+Shift+T');
  editor.view.dom.setAttribute('aria-description', 'In a table, press Alt+Shift+T to focus the row and column controls.');
  editor.view.dom.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey &&
        event.key.toLowerCase() === 't' && !tableTools.hidden) {
      event.preventDefault();
      tableTools.firstElementChild.focus();
    }
  });
  const caseGroup = group('Text case');
  // The host owns case actions and status, so role and citation protections remain shared.
  const existingCase = textarea.id === 'conceptText' ? 'conceptText' : 'writeText';
  document.querySelectorAll(`[data-case-editor="${existingCase}"]`).forEach((caseButton) => {
    const upper = caseButton.textContent.trim() === 'UPPERCASE';
    caseButton.textContent = upper ? 'UPPER' : 'lower';
    caseButton.setAttribute('aria-label', upper ? 'Convert selected text to uppercase' : 'Convert selected text to lowercase');
    caseButton.title = caseButton.getAttribute('aria-label');
    caseButton.className = 'ghost-btn ribbon-button';
    caseButton.addEventListener('mousedown', (event) => event.preventDefault());
    caseGroup.appendChild(caseButton);
  });

  function refreshControls() {
    style.value = [1, 2, 3].find((level) => editor.isActive('heading', { level }))?.toString()
      || (editor.isActive('paragraph') ? 'p' : '');
    const attrs = editor.getAttributes('textStyle');
    font.value = attrs.fontFamily || '';
    size.value = attrs.fontSize || '';
    alignment.value = ['center', 'right', 'justify', 'left'].find((value) => editor.isActive({ textAlign: value })) || 'left';
    toggles.forEach(({ element, active }) => element.setAttribute('aria-pressed', String(active())));
    table.value = '';
    const insideTable = editor.isActive('table');
    Array.from(table.options).forEach((option) => {
      if (option.value) option.disabled = option.value === 'insert' ? insideTable : !insideTable;
    });
    scheduleTableTools();
  }
  let positionFrame = null;
  function scheduleTableTools() {
    if (positionFrame !== null) cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      positionTableTools();
    });
  }
  function positionTableTools() {
    if (!editor.isEditable || !editor.isActive('table') ||
        (!editor.view.hasFocus() && !tableTools.contains(document.activeElement))) {
      tableTools.hidden = true;
      return;
    }
    const { $from } = editor.state.selection;
    let cell = null;
    for (let depth = $from.depth; depth > 0; depth--) {
      if (['tableCell', 'tableHeader'].includes($from.node(depth).type.name)) {
        cell = editor.view.nodeDOM($from.before(depth));
        break;
      }
    }
    if (!(cell instanceof HTMLElement)) {
      tableTools.hidden = true;
      return;
    }
    const bounds = cell.getBoundingClientRect();
    const surfaceBounds = surface.getBoundingClientRect();
    const ribbonBounds = toolbar.getBoundingClientRect();
    const topLimit = Math.max(4, ribbonBounds.top <= 4 && ribbonBounds.bottom > 0 ? ribbonBounds.bottom + 4 : 4);
    if (bounds.bottom <= topLimit || bounds.top >= window.innerHeight ||
        bounds.right <= surfaceBounds.left || bounds.left >= surfaceBounds.right) {
      tableTools.hidden = true;
      return;
    }
    tableTools.hidden = false;
    const width = tableTools.offsetWidth;
    const height = tableTools.offsetHeight;
    const left = Math.max(4, Math.min(bounds.left, window.innerWidth - width - 4));
    const above = bounds.top - height - 6;
    const below = bounds.bottom + 6;
    const top = above >= topLimit ? above : Math.min(below, window.innerHeight - height - 4);
    tableTools.style.left = `${left}px`;
    tableTools.style.top = `${Math.max(topLimit, top)}px`;
  }
  editor.on('transaction', refreshControls);
  editor.on('focus', scheduleTableTools);
  editor.on('blur', scheduleTableTools);
  tableTools.addEventListener('focusin', scheduleTableTools);
  tableTools.addEventListener('focusout', scheduleTableTools);
  window.addEventListener('scroll', scheduleTableTools, true);
  window.addEventListener('resize', scheduleTableTools);
  refreshControls();
  textarea.hidden = true;
  return {
    load(document, text) {
      const content = convertCitationMarkers(document || fromPlainText(text));
      validateRichDocument(content);
      const doc = editor.schema.nodeFromJSON(content);
      doc.check();
      editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins }));
      textarea.value = validateRichDocument(editor.getJSON());
      refreshControls();
    },
    setEditable(editable) {
      editor.setEditable(editable, false);
      controls.forEach((element) => { element.disabled = !editable; });
      scheduleTableTools();
    },
    focus() { editor.commands.focus(); },
    hasFocus() { return editor.isFocused; },
    insertText(text) { editor.chain().focus().insertContent(text).run(); },
    insertCitation(id) { editor.chain().focus().insertContent({ type: 'citation', attrs: { id } }).run(); },
    setCitationLabels(labels) {
      const citationIndexes = [];
      let markerCount = 0;
      editor.state.doc.descendants((node) => {
        if (!node.isTextblock) return true;
        let text = '';
        const offsets = [];
        node.forEach((child) => {
          if (child.type.name === 'citation') {
            offsets.push(text.length);
            text += `[[cite:${encodeURIComponent(child.attrs.id)}]]`;
          } else if (child.isText) text += child.text;
          else text += '\n';
        });
        for (const match of text.matchAll(/\[\[cite:([^\]\s]+)\]\]/g)) {
          if (offsets.includes(match.index)) citationIndexes.push(markerCount);
          markerCount++;
        }
        return false;
      });
      const elements = editor.view.dom.querySelectorAll('.linked-citation');
      const complete = labels.length === markerCount && elements.length === citationIndexes.length;
      elements.forEach((element, index) => {
        element.textContent = complete ? labels[citationIndexes[index]] : '[Citation unavailable]';
      });
      return complete;
    },
    getDocument() { return editor.getJSON(); },
    changeCase(mode) {
      const { from, to, empty } = editor.state.selection;
      if (empty) return 'Select text in the editor first.';
      const changes = [];
      let blocked = false;
      editor.state.doc.nodesBetween(from, to, (node, pos) => {
        if ((node.type.name === 'paragraph' || node.type.name === 'heading') && node.textContent.includes('[[cite:')) blocked = true;
        if (!node.isText) return;
        const start = Math.max(from, pos) - pos;
        const end = Math.min(to, pos + node.nodeSize) - pos;
        const selected = node.text.slice(start, end);
        if (node.text.includes('[[cite:') || selected.includes('cite:') || selected.includes('[[') || selected.includes(']]')) blocked = true;
        changes.push({ from: pos + start, to: pos + end, text: mode === 'upper' ? selected.toLocaleUpperCase() : selected.toLocaleLowerCase(), marks: node.marks });
      });
      if (blocked) return 'Select text outside citation markers to keep citations linked.';
      const transaction = editor.state.tr;
      changes.reverse().forEach((change) => transaction.replaceWith(change.from, change.to, editor.state.schema.text(change.text, change.marks)));
      editor.view.dispatch(transaction);
      editor.commands.focus();
      return `Selected text changed to ${mode === 'upper' ? 'uppercase' : 'lowercase'}.`;
    },
  };
}

window.ResearchFlowRichEditor = { createEditor };
