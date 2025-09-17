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
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', onClick);
  return btn;
}

export function createRichTextEditor({ value = '' } = {}){
  const wrapper = document.createElement('div');
  wrapper.className = 'rich-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'rich-editor-toolbar';
  wrapper.appendChild(toolbar);

  const editable = document.createElement('div');
  editable.className = 'rich-editor-area input';
  editable.contentEditable = 'true';
  editable.spellcheck = true;
  editable.innerHTML = normalizeInput(value);
  wrapper.appendChild(editable);

  function focusEditor(){
    editable.focus({ preventScroll: false });
  }

  function exec(command, arg = null){
    focusEditor();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, arg);
    editable.dispatchEvent(new Event('input'));
  }

  const controls = [
    createToolbarButton('B', 'Bold', () => exec('bold')),
    createToolbarButton('I', 'Italic', () => exec('italic')),
    createToolbarButton('U', 'Underline', () => exec('underline')),
    createToolbarButton('S', 'Strikethrough', () => exec('strikeThrough'))
  ];
  controls.forEach(btn => toolbar.appendChild(btn));

  const colorWrap = document.createElement('label');
  colorWrap.className = 'rich-editor-color';
  colorWrap.title = 'Text color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.addEventListener('input', () => {
    exec('foreColor', colorInput.value);
  });
  colorWrap.appendChild(colorInput);
  toolbar.appendChild(colorWrap);

  const highlightWrap = document.createElement('label');
  highlightWrap.className = 'rich-editor-color';
  highlightWrap.title = 'Highlight color';
  const highlightInput = document.createElement('input');
  highlightInput.type = 'color';
  highlightInput.value = '#ffff00';
  highlightInput.addEventListener('input', () => {
    exec('hiliteColor', highlightInput.value);
  });
  highlightWrap.appendChild(highlightInput);
  toolbar.appendChild(highlightWrap);

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
    focusEditor();
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
    editable.dispatchEvent(new Event('input'));
    sizeSelect.value = '';
  });
  toolbar.appendChild(sizeSelect);

  const bulletBtn = createToolbarButton('•', 'Bulleted list', () => exec('insertUnorderedList'));
  toolbar.appendChild(bulletBtn);
  const numberedBtn = createToolbarButton('1.', 'Numbered list', () => exec('insertOrderedList'));
  toolbar.appendChild(numberedBtn);

  const linkBtn = createToolbarButton('🔗', 'Insert link', () => {
    focusEditor();
    const url = prompt('Enter URL');
    if (!url) return;
    exec('createLink', url);
  });
  toolbar.appendChild(linkBtn);

  const imageBtn = createToolbarButton('🖼', 'Insert image', () => {
    focusEditor();
    const url = prompt('Enter image URL');
    if (!url) return;
    exec('insertImage', url);
  });
  toolbar.appendChild(imageBtn);

  const mediaBtn = createToolbarButton('🎬', 'Insert media', () => {
    focusEditor();
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
    document.execCommand('insertHTML', false, html);
    editable.dispatchEvent(new Event('input'));
  });
  toolbar.appendChild(mediaBtn);

  const clearBtn = createToolbarButton('⌫', 'Clear formatting', () => exec('removeFormat'));
  toolbar.appendChild(clearBtn);

  editable.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) exec('outdent'); else exec('indent');
    }
  });

  return {
    element: wrapper,
    getValue(){
      const sanitized = sanitizeHtml(editable.innerHTML);
      return isEmptyHtml(sanitized) ? '' : sanitized;
    },
    setValue(val){
      editable.innerHTML = normalizeInput(val);
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

