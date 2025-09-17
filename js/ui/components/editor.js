import { uid } from '../../utils.js';
import { upsertItem, listBlocks } from '../../storage/storage.js';
import { createFloatingWindow } from './window-manager.js';

const fieldMap = {
  disease: [
    ['etiology', 'Etiology'],
    ['pathophys', 'Pathophys'],
    ['clinical', 'Clinical'],
    ['diagnosis', 'Diagnosis'],
    ['treatment', 'Treatment'],
    ['complications', 'Complications'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts (comma separated)']
  ],
  drug: [
    ['class', 'Class'],
    ['source', 'Source'],
    ['moa', 'MOA'],
    ['uses', 'Uses'],
    ['sideEffects', 'Side Effects'],
    ['contraindications', 'Contraindications'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts (comma separated)']
  ],
  concept: [
    ['type', 'Type'],
    ['definition', 'Definition'],
    ['mechanism', 'Mechanism'],
    ['clinicalRelevance', 'Clinical Relevance'],
    ['example', 'Example'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts (comma separated)']
  ]
};

const titleMap = { disease: 'Disease', drug: 'Drug', concept: 'Concept' };

function escapeHTML(str = '') {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function normalizeInitialValue(raw = '') {
  if (!raw) return '';
  if (/<\w+/i.test(raw)) {
    return raw;
  }
  return escapeHTML(raw).replace(/\r?\n/g, '<br>');
}

function sanitizeHTML(html = '') {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  wrapper.querySelectorAll('script,style').forEach(el => el.remove());
  wrapper.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
      if (attr.name === 'style') {
        const style = el.getAttribute('style');
        if (style) {
          const filtered = style
            .split(';')
            .map(rule => rule.trim())
            .filter(rule => /^(color|background|background-color|font-weight|font-style|text-decoration|font-size|text-align)/i.test(rule))
            .join('; ');
          if (filtered) {
            el.setAttribute('style', filtered);
          } else {
            el.removeAttribute('style');
          }
        }
      }
    });
    if (!['A','B','I','U','STRONG','EM','SPAN','DIV','P','UL','OL','LI','IMG','BR','H1','H2','H3','H4','H5','H6','FIGURE','FIGCAPTION'].includes(el.tagName)) {
      const replacement = document.createElement('span');
      replacement.innerHTML = el.innerHTML;
      el.replaceWith(...replacement.childNodes);
    }
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src');
      if (!src) {
        el.remove();
      } else {
        el.removeAttribute('onload');
        el.removeAttribute('onerror');
        el.setAttribute('style', 'max-width:100%;height:auto;border-radius:8px;');
      }
    }
  });
  return wrapper.innerHTML.trim();
}

function createRichTextEditor(value = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'rich-text-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'rich-text-toolbar';
  wrapper.appendChild(toolbar);

  const area = document.createElement('div');
  area.className = 'rich-text-area';
  area.contentEditable = 'true';
  area.innerHTML = normalizeInitialValue(value);
  wrapper.appendChild(area);

  function focusArea(){
    area.focus();
    document.execCommand('styleWithCSS', false, true);
  }

  function makeButton(icon, label, handler){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rich-text-btn';
    btn.innerHTML = icon;
    btn.title = label;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      focusArea();
      handler();
    });
    toolbar.appendChild(btn);
    return btn;
  }

  makeButton('<strong>B</strong>', 'Bold', () => document.execCommand('bold'));
  makeButton('<em>I</em>', 'Italic', () => document.execCommand('italic'));
  makeButton('<span style="text-decoration:underline">U</span>', 'Underline', () => document.execCommand('underline'));
  makeButton('<span style="text-decoration:line-through">S</span>', 'Strikethrough', () => document.execCommand('strikeThrough'));
  makeButton('•', 'Bullet list', () => document.execCommand('insertUnorderedList'));
  makeButton('1.', 'Numbered list', () => document.execCommand('insertOrderedList'));

  const colorLabel = document.createElement('label');
  colorLabel.className = 'rich-text-color';
  colorLabel.title = 'Text color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#ffffff';
  colorInput.addEventListener('input', () => {
    focusArea();
    document.execCommand('foreColor', false, colorInput.value);
  });
  colorLabel.appendChild(colorInput);
  toolbar.appendChild(colorLabel);

  const highlightLabel = document.createElement('label');
  highlightLabel.className = 'rich-text-color';
  highlightLabel.title = 'Highlight';
  const highlightInput = document.createElement('input');
  highlightInput.type = 'color';
  highlightInput.value = '#fef08a';
  highlightInput.addEventListener('input', () => {
    focusArea();
    const cmd = document.queryCommandSupported('hiliteColor') ? 'hiliteColor' : 'backColor';
    document.execCommand(cmd, false, highlightInput.value);
  });
  highlightLabel.appendChild(highlightInput);
  toolbar.appendChild(highlightLabel);

  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'rich-text-select';
  [
    ['normal', 'Font'],
    ['0.85', 'Small'],
    ['1', 'Normal'],
    ['1.25', 'Large'],
    ['1.5', 'Huge']
  ].forEach(([value,label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sizeSelect.appendChild(opt);
  });
  sizeSelect.value = '1';
  sizeSelect.addEventListener('change', () => {
    const factor = Number(sizeSelect.value);
    focusArea();
    if (factor === 1) {
      document.execCommand('fontSize', false, '3');
      area.querySelectorAll('font[size]').forEach(node => {
        const frag = document.createDocumentFragment();
        while (node.firstChild) {
          frag.appendChild(node.firstChild);
        }
        node.replaceWith(frag);
      });
      area.querySelectorAll('[style]').forEach(node => {
        node.style.fontSize = '';
        if (!node.getAttribute('style')) {
          node.removeAttribute('style');
        }
      });
    } else {
      document.execCommand('fontSize', false, '4');
      area.querySelectorAll('font[size="4"]').forEach(node => {
        const span = document.createElement('span');
        span.style.fontSize = `${factor}em`;
        span.innerHTML = node.innerHTML;
        node.replaceWith(span);
      });
    }
  });
  toolbar.appendChild(sizeSelect);

  makeButton('🎨', 'Clear formatting', () => document.execCommand('removeFormat'));

  makeButton('🖼️', 'Insert image', () => {
    const url = prompt('Image URL');
    if (url) {
      let finalUrl = url.trim();
      if (!/^https?:/i.test(finalUrl) && !finalUrl.startsWith('data:')) {
        finalUrl = `https://${finalUrl}`;
      }
      document.execCommand('insertImage', false, finalUrl);
    }
  });

  return {
    element: wrapper,
    getValue(){
      return sanitizeHTML(area.innerHTML);
    }
  };
}

export async function openEditor(kind, onSave, existing = null) {
  const win = createFloatingWindow({
    title: `${existing ? 'Edit' : 'Add'} ${titleMap[kind] || kind}`,
    width: 600
  });

  const form = document.createElement('form');
  form.className = 'editor-form';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = kind === 'concept' ? 'Concept' : 'Name';
  nameLabel.className = 'editor-field';
  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.value = existing ? (existing.name || existing.concept || '') : '';
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  const fieldInputs = {};
  fieldMap[kind].forEach(([field, label]) => {
    const lbl = document.createElement('label');
    lbl.className = 'editor-field';
    lbl.textContent = label;
    let inp;
    if (field === 'facts') {
      inp = document.createElement('input');
      inp.className = 'input';
      inp.value = existing ? (existing.facts || []).join(', ') : '';
    } else {
      const rich = createRichTextEditor(existing ? existing[field] || '' : '');
      inp = rich.element;
      fieldInputs[field] = rich;
    }
    lbl.appendChild(inp);
    form.appendChild(lbl);
    if (field === 'facts') fieldInputs[field] = inp;
  });

  const colorLabel = document.createElement('label');
  colorLabel.className = 'editor-field';
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'input';
  colorInput.value = existing?.color || '#ffffff';
  colorLabel.appendChild(colorInput);
  form.appendChild(colorLabel);

  const blocks = await listBlocks();
  const blockMap = new Map(blocks.map(b => [b.blockId, b]));
  const blockSet = new Set(existing?.blocks || []);
  const weekSet = new Set();
  const lectSet = new Set();
  existing?.lectures?.forEach(l => {
    blockSet.add(l.blockId);
    weekSet.add(`${l.blockId}|${l.week}`);
    lectSet.add(`${l.blockId}|${l.id}`);
  });

  const blockWrap = document.createElement('div');
  blockWrap.className = 'tag-wrap editor-tags';
  const blockTitle = document.createElement('div');
  blockTitle.className = 'editor-tags-title';
  blockTitle.textContent = 'Tags';
  blockWrap.appendChild(blockTitle);

  blocks.forEach(b => {
    const blockDiv = document.createElement('div');
    blockDiv.className = 'editor-tag-block';
    const blkLabel = document.createElement('label');
    blkLabel.className = 'row';
    const blkCb = document.createElement('input');
    blkCb.type = 'checkbox';
    blkCb.checked = blockSet.has(b.blockId);
    blkLabel.appendChild(blkCb);
    blkLabel.appendChild(document.createTextNode(b.title || b.blockId));
    blockDiv.appendChild(blkLabel);

    const weekWrap = document.createElement('div');
    weekWrap.className = 'builder-sub';
    weekWrap.style.display = blkCb.checked ? 'block' : 'none';
    blockDiv.appendChild(weekWrap);

    blkCb.addEventListener('change', () => {
      if (blkCb.checked) blockSet.add(b.blockId); else blockSet.delete(b.blockId);
      weekWrap.style.display = blkCb.checked ? 'block' : 'none';
    });

    const weeks = Array.from({ length: b.weeks || 0 }, (_, i) => i + 1);
    weeks.forEach(w => {
      const wkLabel = document.createElement('label');
      wkLabel.className = 'row';
      const wkCb = document.createElement('input');
      wkCb.type = 'checkbox';
      const wkKey = `${b.blockId}|${w}`;
      wkCb.checked = weekSet.has(wkKey);
      wkLabel.appendChild(wkCb);
      wkLabel.appendChild(document.createTextNode(`Week ${w}`));
      weekWrap.appendChild(wkLabel);

      const lecWrap = document.createElement('div');
      lecWrap.className = 'builder-sub';
      lecWrap.style.display = wkCb.checked ? 'block' : 'none';
      wkLabel.appendChild(lecWrap);

      wkCb.addEventListener('change', () => {
        if (wkCb.checked) weekSet.add(wkKey); else weekSet.delete(wkKey);
        lecWrap.style.display = wkCb.checked ? 'block' : 'none';
      });

      (b.lectures || []).filter(l => l.week === w).forEach(l => {
        const key = `${b.blockId}|${l.id}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip' + (lectSet.has(key) ? ' active' : '');
        btn.textContent = l.name;
        btn.addEventListener('click', () => {
          if (lectSet.has(key)) lectSet.delete(key); else lectSet.add(key);
          btn.classList.toggle('active');
        });
        lecWrap.appendChild(btn);
      });
    });

    blockWrap.appendChild(blockDiv);
  });

  form.appendChild(blockWrap);

  const actionBar = document.createElement('div');
  actionBar.className = 'editor-actions';

  const status = document.createElement('span');
  status.className = 'editor-status';

  async function persist(closeAfter){
    const titleKey = kind === 'concept' ? 'concept' : 'name';
    const trimmed = nameInput.value.trim();
    if (!trimmed) {
      status.textContent = 'Name is required.';
      return;
    }
    status.textContent = 'Saving…';
    const item = existing || { id: uid(), kind };
    item[titleKey] = trimmed;
    fieldMap[kind].forEach(([field]) => {
      if (field === 'facts') {
        const v = fieldInputs[field].value.trim();
        item.facts = v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
      } else {
        const editor = fieldInputs[field];
        item[field] = editor ? editor.getValue() : '';
      }
    });
    item.blocks = Array.from(blockSet);
    const weekNums = new Set(Array.from(weekSet).map(k => Number(k.split('|')[1])));
    item.weeks = Array.from(weekNums);
    const lectures = [];
    for (const key of lectSet) {
      const [blockId, lecIdStr] = key.split('|');
      const lecId = Number(lecIdStr);
      const blk = blockMap.get(blockId);
      const l = blk?.lectures.find(le => le.id === lecId);
      if (l) lectures.push({ blockId, id: l.id, name: l.name, week: l.week });
    }
    item.lectures = lectures;
    item.color = colorInput.value;
    await upsertItem(item);
    existing = item;
    updateTitle();
    status.textContent = closeAfter ? '' : 'Saved';
    if (onSave) onSave();
    if (closeAfter) {
      win.close('saved');
    }
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => persist(false));

  const saveCloseBtn = document.createElement('button');
  saveCloseBtn.type = 'button';
  saveCloseBtn.className = 'btn';
  saveCloseBtn.textContent = 'Save & Close';
  saveCloseBtn.addEventListener('click', () => persist(true));

  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 'btn secondary';
  discardBtn.textContent = 'Close without Saving';
  discardBtn.addEventListener('click', () => win.close('discard'));

  actionBar.appendChild(saveBtn);
  actionBar.appendChild(saveCloseBtn);
  actionBar.appendChild(discardBtn);
  actionBar.appendChild(status);
  form.appendChild(actionBar);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    persist(false);
  });

  win.setContent(form);

  const updateTitle = () => {
    const base = `${existing ? 'Edit' : 'Add'} ${titleMap[kind] || kind}`;
    const name = nameInput.value.trim();
    if (name) {
      win.setTitle(`${base}: ${name}`);
    } else {
      win.setTitle(base);
    }
  };
  nameInput.addEventListener('input', updateTitle);
  updateTitle();

  win.focus();
  nameInput.focus();
}