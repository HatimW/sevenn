const allowedTags = new Set([
  'a','b','strong','i','em','u','s','strike','del','mark','span','font','p','div','br','ul','ol','li','img','sub','sup','blockquote','code','pre','hr','video','audio','source','iframe'
]);

const allowedAttributes = {
  'a': ['href', 'title', 'target', 'rel'],
  'img': ['src', 'alt', 'title', 'width', 'height'],
  'span': ['style'],
  'div': ['style'],
  'p': ['style'],
  'font': ['style', 'color', 'face', 'size'],
  'blockquote': ['style'],
  'code': ['style'],
  'pre': ['style'],
  'video': ['src', 'controls', 'width', 'height', 'poster', 'preload', 'loop', 'muted', 'playsinline'],
  'audio': ['src', 'controls', 'preload', 'loop', 'muted'],
  'source': ['src', 'type'],
  'iframe': ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder']
};

const allowedStyles = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration-line',
  'text-decoration',
  'text-decoration-color',
  'text-decoration-style',
  'text-align'
]);

function escapeHtml(str = ''){
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(value = '', { allowData = false, requireHttps = false } = {}){
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^javascript:/i.test(trimmed)) return false;
  if (!allowData && /^data:/i.test(trimmed)) return false;
  if (/^blob:/i.test(trimmed)) return true;
  if (requireHttps) {
    if (trimmed.startsWith('//')) return true;
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
    if (/^https:/i.test(trimmed)) return true;
    return false;
  }
  return true;
}

function cleanStyles(node){
  const style = node.getAttribute('style');
  if (!style) return;
  const cleaned = style
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [rawProp, ...valueParts] = part.split(':');
      if (!rawProp || !valueParts.length) return null;
      const prop = rawProp.trim().toLowerCase();
      if (!allowedStyles.has(prop)) return null;
      return `${prop}: ${valueParts.join(':').trim()}`;
    })
    .filter(Boolean)
    .join('; ');
  if (cleaned) node.setAttribute('style', cleaned);
  else node.removeAttribute('style');
}

function sanitizeNode(node){
  if (node.nodeType === Node.TEXT_NODE) return;
  if (node.nodeType === Node.COMMENT_NODE) {
    node.remove();
    return;
  }
  const tag = node.tagName?.toLowerCase();
  if (!tag) return;
  if (!allowedTags.has(tag)) {
    if (node.childNodes.length) {
      const parent = node.parentNode;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
    } else {
      node.remove();
    }
    return;
  }
  const attrs = Array.from(node.attributes || []);
  const allowList = allowedAttributes[tag] || [];
  attrs.forEach(attr => {
    const name = attr.name.toLowerCase();
    if (name === 'style') {
      cleanStyles(node);
      return;
    }
    if (!allowList.includes(name)) {
      node.removeAttribute(attr.name);
      return;
    }
    if (tag === 'a' && name === 'href') {
      const value = attr.value.trim();
      if (!value || value.startsWith('javascript:')) {
        node.removeAttribute(attr.name);
      } else {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (name === 'src' && ['img','video','audio','source','iframe'].includes(tag)) {
      const allowData = tag === 'img';
      const requireHttps = tag === 'iframe';
      if (!isSafeUrl(attr.value || '', { allowData, requireHttps })) {
        node.removeAttribute(attr.name);
      }
    }
  });
  Array.from(node.childNodes).forEach(sanitizeNode);
}

export function sanitizeHtml(html = ''){
  const template = document.createElement('template');
  template.innerHTML = html;
  Array.from(template.content.childNodes).forEach(sanitizeNode);
  return template.innerHTML;
}

function normalizeInput(value = ''){
  if (!value) return '';
  const looksHtml = /<([a-z][^>]*>)/i.test(value);
  if (looksHtml) return sanitizeHtml(value);
  return sanitizeHtml(escapeHtml(value).replace(/\n/g, '<br>'));
}

function isEmptyHtml(html = ''){
  if (!html) return true;
  const template = document.createElement('template');
  template.innerHTML = html;
  const hasMedia = template.content.querySelector('img,video,audio,iframe');
  const text = template.content.textContent?.replace(/\u00a0/g, ' ').trim();
  return !hasMedia && !text;
}

function createToolbarButton(label, title, onClick){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rich-editor-btn';
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.dataset.toggle = 'true';
  btn.dataset.active = 'false';
  btn.setAttribute('aria-pressed', 'false');
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', onClick);
  return btn;
}

export function createRichTextEditor({ value = '', onChange } = {}){
  const wrapper = document.createElement('div');
  wrapper.className = 'rich-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'rich-editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text formatting toolbar');
  wrapper.appendChild(toolbar);

  const editable = document.createElement('div');
  editable.className = 'rich-editor-area input';
  editable.contentEditable = 'true';
  editable.spellcheck = true;
  editable.innerHTML = normalizeInput(value);
  wrapper.appendChild(editable);

  const commandButtons = [];

  function focusEditor(){
    editable.focus({ preventScroll: false });
  }

  function runCommand(action, { requireSelection = false } = {}){
    if (requireSelection && !hasActiveSelection()) return false;
    focusEditor();
    const result = action();
    editable.dispatchEvent(new Event('input'));
    updateInlineState();
    return result;
  }

  function exec(command, arg = null, { requireSelection = false, styleWithCss = true } = {}){
    return runCommand(() => {
      document.execCommand('styleWithCSS', false, styleWithCss);
      return document.execCommand(command, false, arg);
    }, { requireSelection });
  }

  function selectionWithinEditor({ allowCollapsed = true } = {}){
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    if (!allowCollapsed && selection.isCollapsed) return false;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    if (!anchor || !focus) return false;
    return editable.contains(anchor) && editable.contains(focus);
  }

  function hasActiveSelection(){
    return selectionWithinEditor({ allowCollapsed: false });
  }

  function getSelectionTargets(){
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];
    const range = selection.getRangeAt(0);
    const set = new Set();

    const pushNode = (node) => {
      if (!node) return;
      let current = node;
      if (current.nodeType === Node.TEXT_NODE) current = current.parentElement;
      while (current && current !== editable) {
        if (current.nodeType === Node.ELEMENT_NODE) {
          set.add(current);
          return;
        }
        current = current.parentElement;
      }
      if (current === editable) set.add(editable);
    };

    pushNode(range.startContainer);
    pushNode(range.endContainer);

    if (set.size === 0) {
      let ancestor = range.commonAncestorContainer;
      if (ancestor) {
        if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
        if (ancestor && editable.contains(ancestor)) set.add(ancestor);
      }
    }

    if (set.size === 0) set.add(editable);

    return Array.from(set);
  }

  function weightIsBold(value = ''){
    const trimmed = String(value).trim().toLowerCase();
    if (!trimmed) return false;
    if (trimmed === 'bold' || trimmed === 'bolder') return true;
    const num = parseInt(trimmed, 10);
    return !Number.isNaN(num) && num >= 600;
  }

  function textDecorationIncludes(value = '', keyword){
    if (!value) return false;
    return value.toLowerCase().split(/[,\s]+/).includes(keyword);
  }

  function computeStyles(element){
    const view = element?.ownerDocument?.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function') return null;
    try {
      return view.getComputedStyle(element);
    } catch (err) {
      return null;
    }
  }

  function elementMatchesCommand(element, command){
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    const style = element.style || {};
    const computed = computeStyles(element);

    if (command === 'bold') {
      if (tag === 'b' || tag === 'strong') return true;
      if (weightIsBold(style.fontWeight)) return true;
      return computed ? weightIsBold(computed.fontWeight) : false;
    }
    if (command === 'italic') {
      if (tag === 'i' || tag === 'em') return true;
      const inline = (style.fontStyle || '').toLowerCase();
      if (inline.includes('italic') || inline.includes('oblique')) return true;
      if (!computed) return false;
      const fontStyle = (computed.fontStyle || '').toLowerCase();
      return fontStyle.includes('italic') || fontStyle.includes('oblique');
    }
    if (command === 'underline') {
      if (tag === 'u') return true;
      const deco = style.textDecorationLine || style.textDecoration || '';
      if (textDecorationIncludes(deco, 'underline')) return true;
      if (!computed) return false;
      const compDeco = computed.textDecorationLine || computed.textDecoration || '';
      return textDecorationIncludes(compDeco, 'underline');
    }
    if (command === 'strikeThrough') {
      if (tag === 's' || tag === 'strike' || tag === 'del') return true;
      const deco = style.textDecorationLine || style.textDecoration || '';
      if (textDecorationIncludes(deco, 'line-through')) return true;
      if (!computed) return false;
      const compDeco = computed.textDecorationLine || computed.textDecoration || '';
      return textDecorationIncludes(compDeco, 'line-through');
    }
    return false;
  }

  function commandIsActive(command){
    const targets = getSelectionTargets();
    if (!targets.length) return false;
    return targets.every(target => elementMatchesCommand(target, command));
  }

  function updateInlineState(){
    const inEditor = selectionWithinEditor();
    commandButtons.forEach(({ btn, command, detect }) => {
      let active = false;
      if (inEditor) {
        if (typeof detect === 'function') {
          active = detect();
        } else {
          try {
            active = document.queryCommandState(command);
          } catch (err) {
            active = false;
          }
        }
      }
      const isActive = Boolean(active);
      btn.classList.toggle('is-active', isActive);
      btn.dataset.active = isActive ? 'true' : 'false';
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function createGroup(extraClass){
    const group = document.createElement('div');
    group.className = 'rich-editor-group';
    if (extraClass) group.classList.add(extraClass);
    toolbar.appendChild(group);
    return group;
  }
  const inlineGroup = createGroup();
  [
    ['B', 'Bold', 'bold'],
    ['I', 'Italic', 'italic'],
    ['U', 'Underline', 'underline'],
    ['S', 'Strikethrough', 'strikeThrough']
  ].forEach(([label, title, command]) => {
    const btn = createToolbarButton(label, title, () => exec(command));
    btn.dataset.command = command;
    commandButtons.push({ btn, command, detect: () => commandIsActive(command) });
    inlineGroup.appendChild(btn);
  });

  const colorWrap = document.createElement('label');
  colorWrap.className = 'rich-editor-color';
  colorWrap.title = 'Text color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#ffffff';
  colorInput.dataset.lastColor = '#ffffff';
  colorInput.addEventListener('input', () => {
    if (!hasActiveSelection()) {
      const previous = colorInput.dataset.lastColor || '#ffffff';
      colorInput.value = previous;
      return;
    }
    exec('foreColor', colorInput.value, { requireSelection: true });
    colorInput.dataset.lastColor = colorInput.value;
  });
  colorWrap.appendChild(colorInput);
  const colorGroup = createGroup('rich-editor-color-group');
  colorGroup.appendChild(colorWrap);

  const highlightRow = document.createElement('div');
  highlightRow.className = 'rich-editor-highlight-row';
  colorGroup.appendChild(highlightRow);

  const highlightColors = [
    ['#facc15', 'Yellow'],
    ['#f472b6', 'Pink'],
    ['#f87171', 'Red'],
    ['#4ade80', 'Green'],
    ['#38bdf8', 'Blue']
  ];

  function applyHighlight(color) {
    if (!hasActiveSelection()) return;
    exec('hiliteColor', color, { requireSelection: true });
  }

  const clearSwatch = document.createElement('button');
  clearSwatch.type = 'button';
  clearSwatch.className = 'rich-editor-swatch rich-editor-swatch--clear';
  clearSwatch.title = 'Remove highlight';
  clearSwatch.setAttribute('aria-label', 'Remove highlight');
  clearSwatch.textContent = '×';
  clearSwatch.addEventListener('mousedown', e => e.preventDefault());
  clearSwatch.addEventListener('click', () => {
    exec('hiliteColor', 'transparent', { requireSelection: true });
  });
  highlightRow.appendChild(clearSwatch);

  highlightColors.forEach(([color, label]) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'rich-editor-swatch';
    swatch.style.setProperty('--swatch-color', color);
    swatch.title = `${label} highlight`;
    swatch.setAttribute('aria-label', `${label} highlight`);
    swatch.addEventListener('mousedown', e => e.preventDefault());
    swatch.addEventListener('click', () => applyHighlight(color));
    highlightRow.appendChild(swatch);
  });

  const listGroup = createGroup('rich-editor-list-group');

  function applyOrderedStyle(style){
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    let node = selection.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editable) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName?.toLowerCase() === 'ol') {
        if (style) node.style.listStyleType = style;
        else node.style.removeProperty('list-style-type');
        break;
      }
      node = node.parentNode;
    }
  }

  function insertOrdered(style){
    runCommand(() => {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('insertOrderedList', false, null);
      if (style) applyOrderedStyle(style);
    });
  }

  const listButtons = [
    ['•', 'Bulleted list', () => exec('insertUnorderedList', null, { styleWithCss: false })],
    ['1.', 'Numbered list', () => insertOrdered('')],
    ['a.', 'Lettered list', () => insertOrdered('lower-alpha')],
    ['i.', 'Roman numeral list', () => insertOrdered('lower-roman')]
  ];
  listButtons.forEach(([label, title, handler]) => {
    const btn = createToolbarButton(label, title, handler);
    listGroup.appendChild(btn);
  });

  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'rich-editor-size';
  const sizes = [
    ['Default', ''],
    ['Small', '0.85rem'],
    ['Normal', '1rem'],
    ['Large', '1.25rem'],
    ['Huge', '1.5rem']
  ];
  sizes.forEach(([label, value]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sizeSelect.appendChild(opt);
  });
  sizeSelect.addEventListener('change', () => {
    if (!hasActiveSelection()) {
      sizeSelect.value = '';
      return;
    }
    runCommand(() => {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('fontSize', false, 4);
      const selection = window.getSelection();
      if (selection?.rangeCount) {
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_ELEMENT, {
          acceptNode: (node) => node.tagName?.toLowerCase() === 'font' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        });
        const toAdjust = [];
        while (walker.nextNode()) {
          toAdjust.push(walker.currentNode);
        }
        toAdjust.forEach(node => {
          if (sizeSelect.value) {
            const span = document.createElement('span');
            span.style.fontSize = sizeSelect.value;
            while (node.firstChild) span.appendChild(node.firstChild);
            node.parentNode.replaceChild(span, node);
          } else {
            const parent = node.parentNode;
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
          }
        });
      }
    }, { requireSelection: true });
    sizeSelect.value = '';
  });
  listGroup.appendChild(sizeSelect);

  const mediaGroup = createGroup('rich-editor-media-group');

  const linkBtn = createToolbarButton('🔗', 'Insert link', () => {
    if (!hasActiveSelection()) return;
    const url = prompt('Enter URL');
    if (!url) return;
    exec('createLink', url, { requireSelection: true });
  });
  mediaGroup.appendChild(linkBtn);

  const imageBtn = createToolbarButton('🖼', 'Insert image', () => {
    const url = prompt('Enter image URL');
    if (!url) return;
    exec('insertImage', url, { styleWithCss: false });
  });
  mediaGroup.appendChild(imageBtn);

  const mediaBtn = createToolbarButton('🎬', 'Insert media', () => {
    const url = prompt('Enter media URL');
    if (!url) return;
    const typePrompt = prompt('Media type (video/audio/embed)', 'video');
    const kind = (typePrompt || 'video').toLowerCase();
    const safeUrl = escapeHtml(url);
    let html = '';
    if (kind.startsWith('a')) {
      html = `<audio controls src="${safeUrl}"></audio>`;
    } else if (kind.startsWith('e') || kind.startsWith('i')) {
      html = `<iframe src="${safeUrl}" title="Embedded media" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      html = `<video controls src="${safeUrl}"></video>`;
    }
    runCommand(() => document.execCommand('insertHTML', false, html));
  });
  mediaGroup.appendChild(mediaBtn);

  const clearBtn = createToolbarButton('⌫', 'Clear formatting', () => exec('removeFormat', null, { requireSelection: true, styleWithCss: false }));
  const utilityGroup = createGroup('rich-editor-utility-group');
  utilityGroup.appendChild(clearBtn);

  editable.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) exec('outdent'); else exec('indent');
    }
  });

  let settingValue = false;
  editable.addEventListener('input', () => {
    if (settingValue) return;
    if (typeof onChange === 'function') onChange();
    updateInlineState();
  });

  ['keyup','mouseup','focus'].forEach(event => {
    editable.addEventListener(event, () => updateInlineState());
  });

  editable.addEventListener('blur', () => {
    setTimeout(() => updateInlineState(), 0);
  });

  const selectionHandler = () => {
    if (!document.body.contains(wrapper)) {
      document.removeEventListener('selectionchange', selectionHandler);
      return;
    }
    updateInlineState();
  };
  document.addEventListener('selectionchange', selectionHandler);

  updateInlineState();

  return {
    element: wrapper,
    getValue(){
      const sanitized = sanitizeHtml(editable.innerHTML);
      return isEmptyHtml(sanitized) ? '' : sanitized;
    },
    setValue(val){
      settingValue = true;
      editable.innerHTML = normalizeInput(val);
      settingValue = false;
      updateInlineState();
    },
    focus(){
      focusEditor();
    }
  };
}

export function renderRichText(target, value){
  const normalized = normalizeInput(value);
  if (!normalized) {
    target.textContent = '';
    target.classList.remove('rich-content');
    return;
  }
  target.classList.add('rich-content');
  target.innerHTML = normalized;
}

