import { cropImageFile, readFileAsDataUrl, editImageSource } from './media-upload.js';

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

const RICH_TEXT_CACHE_LIMIT = 400;
const richTextCache = new Map();
const richTextCacheKeys = [];

function escapeHtml(str = ''){
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const htmlEntityDecoder = typeof document !== 'undefined'
  ? document.createElement('textarea')
  : null;

function decodeHtmlEntities(str = ''){
  if (!str) return '';
  if (!htmlEntityDecoder) return String(str);
  htmlEntityDecoder.innerHTML = str;
  return htmlEntityDecoder.value;
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
  if (value == null) return '';
  const str = String(value);
  if (!str) return '';
  const looksHtml = /<([a-z][^>]*>)/i.test(str);
  if (looksHtml) return sanitizeHtml(str);
  const decoded = decodeHtmlEntities(str);
  return sanitizeHtml(escapeHtml(decoded).replace(/\r?\n/g, '<br>'));
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

export function createRichTextEditor({ value = '', onChange, ariaLabel, ariaLabelledBy } = {}){
  const wrapper = document.createElement('div');
  wrapper.className = 'rich-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'rich-editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text formatting toolbar');
  wrapper.appendChild(toolbar);

  const imageFileInput = document.createElement('input');
  imageFileInput.type = 'file';
  imageFileInput.accept = 'image/*';
  imageFileInput.style.display = 'none';
  wrapper.appendChild(imageFileInput);

  const mediaFileInput = document.createElement('input');
  mediaFileInput.type = 'file';
  mediaFileInput.accept = 'video/*,audio/*';
  mediaFileInput.style.display = 'none';
  wrapper.appendChild(mediaFileInput);

  let pendingImageTarget = null;
  let activeImageEditor = null;

  async function insertCroppedImageFile(file, targetImage = null) {
    try {
      const result = await cropImageFile(file);
      if (!result) return;
      const altText = result.altText || (file.name || '').replace(/\.[^.]+$/, '');
      if (targetImage && wrapper.contains(targetImage)) {
        targetImage.src = result.dataUrl;
        if (altText) {
          targetImage.setAttribute('alt', altText);
        } else {
          targetImage.removeAttribute('alt');
        }
        setImageSize(targetImage, result.width, result.height);
        triggerEditorChange();
        if (activeImageEditor && activeImageEditor.image === targetImage && typeof activeImageEditor.update === 'function') {
          requestAnimationFrame(() => activeImageEditor.update());
        }
      } else {
        const safeAlt = altText ? escapeHtml(altText) : '';
        const altAttr = safeAlt ? ` alt="${safeAlt}"` : '';
        const html = `<img src="${result.dataUrl}" width="${result.width}" height="${result.height}"${altAttr}>`;
        insertHtml(html);
      }
    } catch (err) {
      console.error('Failed to upload image', err);
    }
  }

  async function insertMediaFile(file) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl) return;
      const isAudio = file.type?.startsWith('audio/');
      if (isAudio) {
        insertHtml(`<audio controls preload="metadata" src="${dataUrl}"></audio>`);
      } else {
        insertHtml(`<video controls preload="metadata" src="${dataUrl}" width="640"></video>`);
      }
    } catch (err) {
      console.error('Failed to add media file', err);
    }
  }

  imageFileInput.addEventListener('change', () => {
    const file = imageFileInput.files?.[0];
    const target = pendingImageTarget;
    pendingImageTarget = null;
    if (file) insertCroppedImageFile(file, target);
    imageFileInput.value = '';
  });

  mediaFileInput.addEventListener('change', () => {
    const file = mediaFileInput.files?.[0];
    if (file) insertMediaFile(file);
    mediaFileInput.value = '';
  });

  const editable = document.createElement('div');
  editable.className = 'rich-editor-area input';
  editable.contentEditable = 'true';
  editable.spellcheck = true;
  editable.innerHTML = normalizeInput(value);
  if (ariaLabel) editable.setAttribute('aria-label', ariaLabel);
  if (ariaLabelledBy) editable.setAttribute('aria-labelledby', ariaLabelledBy);
  wrapper.appendChild(editable);

  editable.addEventListener('paste', (event) => {
    if (!event.clipboardData) return;
    const files = Array.from(event.clipboardData.files || []);
    const imageFile = files.find(file => file && file.type && file.type.startsWith('image/')) || null;
    if (imageFile) {
      event.preventDefault();
      void insertCroppedImageFile(imageFile);
      return;
    }
    const mediaFile = files.find(file => file && file.type && (file.type.startsWith('video/') || file.type.startsWith('audio/')));
    if (mediaFile) {
      event.preventDefault();
      void insertMediaFile(mediaFile);
      return;
    }
    const html = event.clipboardData.getData('text/html');
    if (html) {
      const sanitized = sanitizeHtml(html);
      if (sanitized.trim()) {
        event.preventDefault();
        insertHtml(sanitized);
        return;
      }
    }
    const text = event.clipboardData.getData('text/plain');
    event.preventDefault();
    insertPlainText(text || '');
  });

  function triggerEditorChange(){
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setImageSize(image, width, height){
    if (!(image instanceof HTMLImageElement)) return;
    const MIN_SIZE = 32;
    const MAX_SIZE = 4096;
    const widthValue = Number.isFinite(width) ? Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(width))) : null;
    const heightValue = Number.isFinite(height) ? Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(height))) : null;
    if (widthValue) {
      image.style.width = `${widthValue}px`;
      image.setAttribute('width', String(widthValue));
    } else {
      image.style.removeProperty('width');
      image.removeAttribute('width');
    }
    if (heightValue) {
      image.style.height = `${heightValue}px`;
      image.setAttribute('height', String(heightValue));
    } else {
      image.style.removeProperty('height');
      image.removeAttribute('height');
    }
  }

  function destroyActiveImageEditor(){
    if (activeImageEditor && typeof activeImageEditor.destroy === 'function') {
      activeImageEditor.destroy();
    }
    activeImageEditor = null;
  }

  function beginImageEditing(image){
    if (!(image instanceof HTMLImageElement)) return;
    if (!wrapper.contains(image)) return;
    if (activeImageEditor && activeImageEditor.image === image) {
      if (typeof activeImageEditor.update === 'function') {
        requestAnimationFrame(() => activeImageEditor.update());
      }
      return;
    }
    destroyActiveImageEditor();
    activeImageEditor = createImageEditor(image);
    if (activeImageEditor && typeof activeImageEditor.update === 'function') {
      requestAnimationFrame(() => activeImageEditor.update());
    }
  }

  function createImageEditor(image){
    const overlay = document.createElement('div');
    overlay.className = 'rich-editor-image-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const toolbar = document.createElement('div');
    toolbar.className = 'rich-editor-image-toolbar';

    const cropBtn = document.createElement('button');
    cropBtn.type = 'button';
    cropBtn.className = 'rich-editor-image-tool';
    cropBtn.textContent = 'Crop';

    const replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'rich-editor-image-tool';
    replaceBtn.textContent = 'Replace';

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'rich-editor-image-tool rich-editor-image-tool--primary';
    doneBtn.textContent = 'Done';

    toolbar.append(cropBtn, replaceBtn, doneBtn);
    overlay.appendChild(toolbar);

    const handleDefs = [
      { name: 'se', axis: 'both', label: 'Resize from corner' },
      { name: 'e', axis: 'x', label: 'Resize width' },
      { name: 's', axis: 'y', label: 'Resize height' }
    ];

    let resizeState = null;

    const onPointerMove = (event) => {
      if (!resizeState) return;
      event.preventDefault();
      const dx = event.clientX - resizeState.startX;
      const dy = event.clientY - resizeState.startY;
      let nextWidth = resizeState.startWidth;
      let nextHeight = resizeState.startHeight;
      if (resizeState.axis === 'both' || resizeState.axis === 'x') {
        nextWidth = resizeState.startWidth + dx;
      }
      if (resizeState.axis === 'both' || resizeState.axis === 'y') {
        nextHeight = resizeState.startHeight + dy;
      }
      if (resizeState.keepRatio && resizeState.ratio > 0) {
        if (resizeState.axis === 'x') {
          nextHeight = nextWidth / resizeState.ratio;
        } else if (resizeState.axis === 'y') {
          nextWidth = nextHeight * resizeState.ratio;
        } else {
          if (Math.abs(dx) >= Math.abs(dy)) {
            nextHeight = nextWidth / resizeState.ratio;
          } else {
            nextWidth = nextHeight * resizeState.ratio;
          }
        }
      }
      setImageSize(image, nextWidth, nextHeight);
      requestAnimationFrame(() => update());
    };

    const stopResize = () => {
      if (!resizeState) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      if (resizeState.handle && resizeState.pointerId != null) {
        try {
          resizeState.handle.releasePointerCapture(resizeState.pointerId);
        } catch (err) {
          // ignore
        }
      }
      overlay.classList.remove('is-resizing');
      resizeState = null;
      triggerEditorChange();
      requestAnimationFrame(() => update());
    };

    handleDefs.forEach(def => {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = `rich-editor-image-handle rich-editor-image-handle--${def.name}`;
      handle.setAttribute('aria-label', def.label);
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = image.getBoundingClientRect();
        resizeState = {
          axis: def.axis,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: rect.width,
          startHeight: rect.height,
          ratio: rect.height > 0 ? rect.width / rect.height : 1,
          keepRatio: event.shiftKey,
          pointerId: event.pointerId,
          handle
        };
        overlay.classList.add('is-resizing');
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (err) {
          // ignore unsupported pointer capture
        }
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stopResize);
        window.addEventListener('pointercancel', stopResize);
      });
      overlay.appendChild(handle);
    });

    wrapper.appendChild(overlay);
    image.classList.add('rich-editor-image-active');

    const update = () => {
      if (!document.body.contains(image)) {
        destroy();
        return;
      }
      const rect = image.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.left = `${rect.left - wrapperRect.left}px`;
      overlay.style.top = `${rect.top - wrapperRect.top}px`;
    };

    const onScroll = () => update();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        destroy();
      }
    };

    const handleOutside = (event) => {
      if (event.target === image) return;
      if (overlay.contains(event.target)) return;
      destroy();
    };

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => update())
      : null;
    if (resizeObserver) {
      try {
        resizeObserver.observe(image);
      } catch (err) {
        // ignore
      }
    }

    const destroy = () => {
      if (resizeObserver) resizeObserver.disconnect();
      document.removeEventListener('scroll', onScroll, true);
      editable.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      document.removeEventListener('mousedown', handleOutside, true);
      document.removeEventListener('keydown', onKeyDown, true);
      stopResize();
      overlay.remove();
      image.classList.remove('rich-editor-image-active');
      if (pendingImageTarget === image) pendingImageTarget = null;
    };

    cropBtn.addEventListener('click', async () => {
      try {
        const currentWidth = Number(image.getAttribute('width')) || Math.round(image.getBoundingClientRect().width);
        const currentHeight = Number(image.getAttribute('height')) || Math.round(image.getBoundingClientRect().height);
        const alt = image.getAttribute('alt') || '';
        const result = await editImageSource(image.src, { altText: alt, width: currentWidth, height: currentHeight });
        if (!result) return;
        image.src = result.dataUrl;
        if (result.altText) {
          image.setAttribute('alt', result.altText);
        } else {
          image.removeAttribute('alt');
        }
        setImageSize(image, result.width, result.height);
        triggerEditorChange();
        requestAnimationFrame(() => update());
      } catch (err) {
        console.error('Failed to edit image', err);
      }
    });

    replaceBtn.addEventListener('click', () => {
      pendingImageTarget = image;
      imageFileInput.click();
    });

    doneBtn.addEventListener('click', () => {
      destroyActiveImageEditor();
    });

    document.addEventListener('scroll', onScroll, true);
    editable.addEventListener('scroll', onScroll);
    window.addEventListener('resize', update);
    document.addEventListener('mousedown', handleOutside, true);
    document.addEventListener('keydown', onKeyDown, true);

    return {
      image,
      update,
      destroy
    };
  }

  const commandButtons = [];
  let sizeInput = null;
  let fontNameLabel = null;
  let fontSizeLabel = null;

  function focusEditor(){
    editable.focus({ preventScroll: false });
  }

  let savedRange = null;
  let suppressSelectionCapture = false;

  function rangeWithinEditor(range, { allowCollapsed = true } = {}){
    if (!range) return false;
    if (!allowCollapsed && range.collapsed) return false;
    const { startContainer, endContainer } = range;
    if (!startContainer || !endContainer) return false;
    return editable.contains(startContainer) && editable.contains(endContainer);
  }

  function captureSelectionRange(){
    if (suppressSelectionCapture) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!rangeWithinEditor(range)) return;
    savedRange = range.cloneRange();
  }

  function getSavedRange({ requireSelection = false } = {}){
    if (!savedRange) return null;
    return rangeWithinEditor(savedRange, { allowCollapsed: !requireSelection }) ? savedRange : null;
  }

  function restoreSavedRange({ requireSelection = false } = {}){
    const range = getSavedRange({ requireSelection });
    if (!range) return false;
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    const clone = range.cloneRange();
    selection.addRange(clone);
    savedRange = clone.cloneRange();
    return true;
  }

  function runCommand(action, { requireSelection = false } = {}){
    const existing = getSavedRange({ requireSelection });
    if (!existing) return false;

    const preservedRange = existing.cloneRange();
    let restored = false;

    suppressSelectionCapture = true;
    try {
      focusEditor();
      savedRange = preservedRange.cloneRange();
      restored = restoreSavedRange({ requireSelection });
    } finally {
      suppressSelectionCapture = false;
    }

    if (!restored) return false;

    let inputFired = false;
    const handleInput = () => {
      inputFired = true;
    };
    editable.addEventListener('input', handleInput, { once: true });

    const result = action();

    editable.removeEventListener('input', handleInput);
    captureSelectionRange();
    if (!inputFired) {
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    }
    updateInlineState();
    return result;
  }

  function exec(command, arg = null, { requireSelection = false, styleWithCss = true } = {}){
    return runCommand(() => {
      let previousStyleWithCss = null;
      try {
        previousStyleWithCss = document.queryCommandState('styleWithCSS');
      } catch (err) {
        previousStyleWithCss = null;
      }
      try {
        document.execCommand('styleWithCSS', false, styleWithCss);
        return document.execCommand(command, false, arg);
      } finally {
        if (previousStyleWithCss !== null) {
          document.execCommand('styleWithCSS', false, previousStyleWithCss);
        }
      }
    }, { requireSelection });
  }

  function insertPlainText(text) {
    if (text == null) return;
    const normalized = String(text).replace(/\r\n/g, '\n');
    runCommand(() => {
      const ok = document.execCommand('insertText', false, normalized);
      if (ok === false) {
        const html = escapeHtml(normalized).replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, html);
      }
    });
  }

  function insertHtml(html) {
    if (!html) return;
    runCommand(() => document.execCommand('insertHTML', false, html));
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
    return Boolean(getSavedRange({ requireSelection: true }));
  }

  function collapsedInlineState(){
    const selection = window.getSelection();
    if (!selection?.anchorNode) return null;
    let node = selection.anchorNode;
    const state = { bold: false, italic: false, underline: false, strike: false };

    const applyFromElement = (el) => {
      const tag = el.tagName?.toLowerCase();
      if (tag === 'b' || tag === 'strong') state.bold = true;
      if (tag === 'i' || tag === 'em') state.italic = true;
      if (tag === 'u') state.underline = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') state.strike = true;
      if (el instanceof Element) {
        const inlineStyle = el.style;
        if (inlineStyle) {
          if (!state.bold) {
            const weightRaw = inlineStyle.fontWeight || '';
            const weightText = typeof weightRaw === 'string' ? weightRaw.toLowerCase() : `${weightRaw}`.toLowerCase();
            const weightValue = Number.parseInt(weightText, 10);
            if (weightText === 'bold' || weightText === 'bolder' || Number.isFinite(weightValue) && weightValue >= 600) {
              state.bold = true;
            }
          }
          if (!state.italic && inlineStyle.fontStyle === 'italic') state.italic = true;
          const deco = `${inlineStyle.textDecorationLine || inlineStyle.textDecoration || ''}`.toLowerCase();
          if (!state.underline && deco.includes('underline')) state.underline = true;
          if (!state.strike && (deco.includes('line-through') || deco.includes('strikethrough'))) state.strike = true;
        }
      }
    };

    while (node && node !== editable) {
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode;
        continue;
      }
      if (!(node instanceof Element)) {
        node = node.parentNode;
        continue;
      }
      applyFromElement(node);
      node = node.parentNode;
    }

    return state;
  }

  function updateInlineState(){
    const inEditor = selectionWithinEditor();
    const selection = window.getSelection();
    const collapsed = Boolean(selection?.isCollapsed);
    const collapsedState = inEditor && collapsed ? collapsedInlineState() : null;

    commandButtons.forEach(({ btn, command, stateKey }) => {
      let active = false;
      if (inEditor) {
        if (collapsed && collapsedState && stateKey) {
          active = collapsedState[stateKey];
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

    const style = inEditor ? computeSelectionStyle() : null;
    updateTypographyState(style);
  }

  function styleForNode(node) {
    let current = node;
    while (current && current !== editable) {
      if (current instanceof Element) {
        return window.getComputedStyle(current);
      }
      current = current.parentNode;
    }
    if (editable instanceof Element) {
      return window.getComputedStyle(editable);
    }
    return null;
  }

  function computeSelectionStyle() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    if (selection.isCollapsed) {
      return styleForNode(selection.anchorNode);
    }
    const range = selection.getRangeAt(0);
    const startStyle = styleForNode(range.startContainer);
    if (startStyle) return startStyle;
    const endStyle = styleForNode(range.endContainer);
    if (endStyle) return endStyle;
    return styleForNode(range.commonAncestorContainer);
  }

  function formatFontFamily(value = '') {
    if (!value) return 'Default';
    const primary = value.split(',')[0] || value;
    return primary.replace(/^['"]+|['"]+$/g, '').trim() || 'Default';
  }

  function updateTypographyState(style) {
    if (!fontNameLabel || !fontSizeLabel || !sizeInput) return;
    const editingSize = document.activeElement === sizeInput;
    if (!style) {
      fontNameLabel.textContent = 'Font: Default';
      fontSizeLabel.textContent = 'Size: —';
      if (!editingSize) {
        sizeInput.value = '';
        sizeInput.placeholder = 'Size (px)';
      }
      return;
    }
    const family = formatFontFamily(style.fontFamily || '');
    const sizeText = style.fontSize || '';
    fontNameLabel.textContent = `Font: ${family}`;
    fontSizeLabel.textContent = `Size: ${sizeText || '—'}`;
    if (!editingSize) {
      const numeric = Number.parseFloat(sizeText);
      sizeInput.value = Number.isFinite(numeric) ? String(Math.round(numeric)) : '';
    }
    sizeInput.placeholder = sizeText || 'Size (px)';
  }

  function collectElementsInRange(range) {
    const elements = [];
    if (!range) return elements;
    const walker = document.createTreeWalker(
      editable,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          try {
            return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          } catch (err) {
            return NodeFilter.FILTER_SKIP;
          }
        }
      }
    );
    while (walker.nextNode()) {
      elements.push(walker.currentNode);
    }
    return elements;
  }

  function removeFontSizeFromRange(range) {
    const elements = collectElementsInRange(range);
    elements.forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      if (node.style && node.style.fontSize) {
        node.style.removeProperty('font-size');
        if (!node.style.length) node.removeAttribute('style');
      }
      if (node.tagName?.toLowerCase() === 'font') {
        const parent = node.parentNode;
        if (!parent) return;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
      }
    });
  }

  function applyFontSizeValue(value) {
    runCommand(() => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      removeFontSizeFromRange(range);
      const numeric = Number.parseFloat(value);
      const hasSize = Number.isFinite(numeric) && numeric > 0;
      if (!hasSize) {
        return;
      }
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('fontSize', false, 4);
      const fonts = editable.querySelectorAll('font');
      fonts.forEach(node => {
        const parent = node.parentNode;
        if (!parent) return;
        const span = document.createElement('span');
        span.style.fontSize = `${numeric}px`;
        while (node.firstChild) span.appendChild(node.firstChild);
        parent.replaceChild(span, node);
      });
    }, { requireSelection: true });
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
    ['B', 'Bold', 'bold', 'bold'],
    ['I', 'Italic', 'italic', 'italic'],
    ['U', 'Underline', 'underline', 'underline'],
    ['S', 'Strikethrough', 'strikeThrough', 'strike']
  ].forEach(([label, title, command, stateKey]) => {
    const btn = createToolbarButton(label, title, () => exec(command));
    btn.dataset.command = command;
    commandButtons.push({ btn, command, stateKey });
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
    if (!getSavedRange({ requireSelection: true })) {
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
    if (!getSavedRange({ requireSelection: true })) return;
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

  const typographyGroup = createGroup('rich-editor-typography-group');

  const fontInfo = document.createElement('div');
  fontInfo.className = 'rich-editor-font-info';
  fontNameLabel = document.createElement('span');
  fontNameLabel.className = 'rich-editor-font-name';
  fontNameLabel.textContent = 'Font: Default';
  fontInfo.appendChild(fontNameLabel);
  fontSizeLabel = document.createElement('span');
  fontSizeLabel.className = 'rich-editor-font-size';
  fontSizeLabel.textContent = 'Size: —';
  fontInfo.appendChild(fontSizeLabel);
  typographyGroup.appendChild(fontInfo);

  sizeInput = document.createElement('input');
  sizeInput.type = 'number';
  sizeInput.className = 'rich-editor-size rich-editor-size-input';
  sizeInput.placeholder = 'Size (px)';
  sizeInput.min = '8';
  sizeInput.max = '96';
  sizeInput.step = '1';
  sizeInput.setAttribute('aria-label', 'Font size in pixels');

  const commitFontSize = () => {
    if (!hasActiveSelection()) {
      sizeInput.value = '';
      return;
    }
    const raw = sizeInput.value.trim();
    if (!raw) {
      applyFontSizeValue(null);
    } else {
      applyFontSizeValue(raw);
    }
  };

  sizeInput.addEventListener('change', commitFontSize);
  sizeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitFontSize();
      sizeInput.blur();
    }
  });
  typographyGroup.appendChild(sizeInput);

  const resetSizeBtn = createToolbarButton('↺', 'Reset font size', () => {
    if (!hasActiveSelection()) return;
    sizeInput.value = '';
    applyFontSizeValue(null);
  });
  typographyGroup.appendChild(resetSizeBtn);

  const mediaGroup = createGroup('rich-editor-media-group');

  const linkBtn = createToolbarButton('🔗', 'Insert link', () => {
    if (!hasActiveSelection()) return;
    const url = prompt('Enter URL');
    if (!url) return;
    exec('createLink', url, { requireSelection: true });
  });
  mediaGroup.appendChild(linkBtn);

  const imageBtn = createToolbarButton('🖼', 'Upload image (Shift+Click for URL)', (event) => {
    if (event.shiftKey) {
      const url = prompt('Enter image URL');
      if (!url) return;
      exec('insertImage', url, { styleWithCss: false });
      return;
    }
    imageFileInput.click();
  });
  mediaGroup.appendChild(imageBtn);

  const mediaBtn = createToolbarButton('🎬', 'Upload media (Shift+Click for URL)', (event) => {
    if (event.shiftKey) {
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
      insertHtml(html);
      return;
    }
    mediaFileInput.click();
  });
  mediaGroup.appendChild(mediaBtn);

  const clearBtn = createToolbarButton('⌫', 'Clear formatting', () => exec('removeFormat', null, { requireSelection: true, styleWithCss: false }));
  const utilityGroup = createGroup('rich-editor-utility-group');
  utilityGroup.appendChild(clearBtn);

  let settingValue = false;
  editable.addEventListener('input', () => {
    if (settingValue) return;
    if (typeof onChange === 'function') onChange();
    updateInlineState();
  });

  editable.addEventListener('dblclick', (event) => {
    const target = event.target;
    if (target instanceof HTMLImageElement) {
      event.preventDefault();
      beginImageEditing(target);
    }
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
      destroyActiveImageEditor();
      return;
    }
    captureSelectionRange();
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
      destroyActiveImageEditor();
      editable.innerHTML = normalizeInput(val);
      settingValue = false;
      updateInlineState();
    },
    focus(){
      focusEditor();
    }
  };
}

function normalizedFromCache(value){
  if (!value) return '';
  const key = typeof value === 'string' ? value : null;
  if (key !== null && richTextCache.has(key)) {
    return richTextCache.get(key);
  }
  const normalized = normalizeInput(value);
  if (key !== null && key.length <= 20000) {
    if (!richTextCache.has(key)) {
      richTextCacheKeys.push(key);
      if (richTextCacheKeys.length > RICH_TEXT_CACHE_LIMIT) {
        const oldest = richTextCacheKeys.shift();
        if (oldest != null) richTextCache.delete(oldest);
      }
    }
    richTextCache.set(key, normalized);
  }
  return normalized;
}

export function renderRichText(target, value){
  const normalized = normalizedFromCache(value);
  if (!normalized) {
    target.textContent = '';
    target.classList.remove('rich-content');
    return;
  }
  target.classList.add('rich-content');
  target.innerHTML = normalized;
}

export function hasRichTextContent(value){
  return !isEmptyHtml(normalizeInput(value));
}

