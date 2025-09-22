const DEFAULT_FRAME_WIDTH = 520;

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function sanitizeAspectRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return clamp(ratio, 0.25, 4);
}

function toDataUrl(canvas, mimeType, quality) {
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch (err) {
    console.error('Failed to export canvas', err);
    return canvas.toDataURL();
  }
}

export function cropImageFile(file) {
  if (!(file instanceof File) || !file.type?.startsWith('image/')) {
    return Promise.reject(new Error('File must be an image.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        openCropDialog({ image, file }, { mimeType: file.type }).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image file.'));
    };
    image.src = objectUrl;
  });
}

function inferMimeFromDataUrl(src) {
  if (typeof src !== 'string') return '';
  const match = src.match(/^data:([^;,]+)[;,]/i);
  return match ? match[1] : '';
}

export function editImageSource(src, { altText = '', width, height, mimeType } = {}) {
  if (!src) {
    return Promise.reject(new Error('Image source is required.'));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const options = {
        initialAlt: altText,
        initialWidth: typeof width === 'number' && width > 0 ? width : undefined,
        initialHeight: typeof height === 'number' && height > 0 ? height : undefined,
        mimeType: mimeType || inferMimeFromDataUrl(src) || 'image/png'
      };
      try {
        openCropDialog({ image, file: null }, options).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = () => {
      reject(new Error('Failed to load image.'));
    };
    try {
      if (!/^data:/i.test(src) && !/^blob:/i.test(src)) {
        image.crossOrigin = 'anonymous';
      }
      image.src = src;
    } catch (err) {
      reject(err);
    }
  });
}

function openCropDialog({ image, file }, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'media-cropper-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'media-cropper-dialog';
    overlay.appendChild(dialog);

    const header = document.createElement('header');
    header.className = 'media-cropper-header';
    const title = document.createElement('h3');
    title.textContent = 'Upload image';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn ghost media-cropper-close';
    closeBtn.title = 'Cancel';
    closeBtn.textContent = '✕';
    header.appendChild(closeBtn);
    dialog.appendChild(header);

  const body = document.createElement('div');
  body.className = 'media-cropper-body';
  dialog.appendChild(body);

    const preview = document.createElement('div');
    preview.className = 'media-cropper-preview';
    const canvas = document.createElement('canvas');
    canvas.width = DEFAULT_FRAME_WIDTH;
    canvas.height = Math.round(DEFAULT_FRAME_WIDTH * 0.75);
    preview.appendChild(canvas);
    body.appendChild(preview);

    const controls = document.createElement('div');
    controls.className = 'media-cropper-controls';
    body.appendChild(controls);

    const ratioRow = document.createElement('div');
    ratioRow.className = 'media-cropper-row';
    const ratioLabel = document.createElement('label');
    ratioLabel.textContent = 'Aspect ratio';
    const ratioSelect = document.createElement('select');
    ratioSelect.className = 'media-cropper-select';
    const naturalRatio = sanitizeAspectRatio(image.naturalWidth / image.naturalHeight || 1);
  const ratioOptions = [
    { value: 'original', label: 'Original', ratio: naturalRatio },
      { value: '1:1', label: 'Square', ratio: 1 },
      { value: '4:3', label: '4 : 3', ratio: 4 / 3 },
      { value: '3:4', label: '3 : 4', ratio: 3 / 4 },
      { value: '16:9', label: '16 : 9', ratio: 16 / 9 }
    ];
    ratioOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      ratioSelect.appendChild(option);
    });
    ratioSelect.value = 'original';
    ratioLabel.appendChild(ratioSelect);
    ratioRow.appendChild(ratioLabel);
    controls.appendChild(ratioRow);

    const zoomRow = document.createElement('div');
    zoomRow.className = 'media-cropper-row media-cropper-zoom';
    const zoomLabel = document.createElement('span');
    zoomLabel.textContent = 'Zoom';
    zoomRow.appendChild(zoomLabel);
    const zoomRange = document.createElement('input');
    zoomRange.type = 'range';
    zoomRange.min = '1';
    zoomRange.max = '3';
    zoomRange.step = '0.01';
    zoomRange.value = '1';
    zoomRange.className = 'media-cropper-zoom-range';
    zoomRow.appendChild(zoomRange);
    const zoomValue = document.createElement('span');
    zoomValue.className = 'media-cropper-zoom-value';
    zoomValue.textContent = '100%';
    zoomRow.appendChild(zoomValue);
    controls.appendChild(zoomRow);

  const sizeRow = document.createElement('div');
  sizeRow.className = 'media-cropper-row';
  const widthLabel = document.createElement('label');
  widthLabel.textContent = 'Output width';
  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = '64';
  const naturalWidth = Math.round(image.naturalWidth) || Math.round(image.width) || 1024;
  widthInput.max = String(Math.max(64, naturalWidth));
  const presetWidth = Math.round(options.initialWidth || 0);
  const defaultWidth = Math.min(960, naturalWidth || 960);
  widthInput.value = String(presetWidth > 0 ? Math.min(Math.max(64, presetWidth), Math.max(64, naturalWidth)) : defaultWidth);
  widthInput.className = 'media-cropper-size-input';
  widthLabel.appendChild(widthInput);
    sizeRow.appendChild(widthLabel);
    const dimensions = document.createElement('span');
    dimensions.className = 'media-cropper-dimensions';
    dimensions.textContent = '×';
    sizeRow.appendChild(dimensions);
    controls.appendChild(sizeRow);

    const altRow = document.createElement('div');
    altRow.className = 'media-cropper-row';
    const altLabel = document.createElement('label');
    altLabel.textContent = 'Alt text';
  const altInput = document.createElement('input');
  altInput.type = 'text';
  altInput.placeholder = 'Describe the image';
  const defaultAlt = options.initialAlt != null && options.initialAlt !== ''
    ? options.initialAlt
    : (file?.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  altInput.value = defaultAlt;
    altInput.className = 'media-cropper-alt-input';
    altLabel.appendChild(altInput);
    altRow.appendChild(altLabel);
    controls.appendChild(altRow);

    const actions = document.createElement('div');
    actions.className = 'media-cropper-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn subtle';
    cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn';
    confirmBtn.textContent = 'Insert image';
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);

    document.body.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    let aspectRatio = naturalRatio;
    let frameWidth = Math.min(DEFAULT_FRAME_WIDTH, presetWidth > 0 ? presetWidth : naturalWidth || DEFAULT_FRAME_WIDTH);
    if (!Number.isFinite(frameWidth) || frameWidth <= 0) frameWidth = DEFAULT_FRAME_WIDTH;
    let frameHeight = Math.max(120, Math.round(frameWidth / aspectRatio));
    let minZoom = 1;
    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function focusDefault() {
      requestAnimationFrame(() => {
        altInput.focus({ preventScroll: true });
      });
    }

    function updateCanvasSize() {
      frameHeight = Math.max(120, Math.round(frameWidth / aspectRatio));
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      updateZoomBounds();
    }

    function updateZoomBounds() {
      const widthRatio = frameWidth / (image.naturalWidth || image.width || 1);
      const heightRatio = frameHeight / (image.naturalHeight || image.height || 1);
      const nextMin = sanitizeAspectRatio(Math.max(widthRatio, heightRatio));
      minZoom = nextMin;
      if (!Number.isFinite(zoom) || zoom < minZoom) {
        zoom = minZoom;
      }
      zoomRange.min = String(Math.max(0.1, minZoom));
      zoomRange.max = String(Math.max(minZoom * 4, minZoom + 0.5));
      if (Number(zoomRange.value) < minZoom) {
        zoomRange.value = String(minZoom);
      }
      render();
    }

    function clampOffsets() {
      const scaledWidth = (image.naturalWidth || image.width || frameWidth) * zoom;
      const scaledHeight = (image.naturalHeight || image.height || frameHeight) * zoom;
      const maxOffsetX = Math.max(0, (scaledWidth - frameWidth) / 2);
      const maxOffsetY = Math.max(0, (scaledHeight - frameHeight) / 2);
      offsetX = clamp(offsetX, -maxOffsetX, maxOffsetX);
      offsetY = clamp(offsetY, -maxOffsetY, maxOffsetY);
    }

    function getOutputWidth() {
      const raw = Number(widthInput.value);
      const maxWidth = Math.max(64, naturalWidth);
      if (!Number.isFinite(raw)) return Math.min(maxWidth, 960);
      return clamp(Math.round(raw), 64, maxWidth);
    }

    function updateMeta() {
      const zoomPercent = Math.round((zoom / minZoom) * 100);
      zoomValue.textContent = `${zoomPercent}%`;
      const outWidth = getOutputWidth();
      const outHeight = Math.max(1, Math.round(outWidth / aspectRatio));
      dimensions.textContent = `${outWidth} × ${outHeight}`;
    }

    function render() {
      clampOffsets();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, 0, frameWidth, frameHeight);
      const drawWidth = (image.naturalWidth || image.width || frameWidth) * zoom;
      const drawHeight = (image.naturalHeight || image.height || frameHeight) * zoom;
      const originX = (frameWidth - drawWidth) / 2 + offsetX;
      const originY = (frameHeight - drawHeight) / 2 + offsetY;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, originX, originY, drawWidth, drawHeight);
      ctx.restore();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, frameWidth - 1, frameHeight - 1);
      updateMeta();
    }

    function closeDialog(result) {
      window.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      resolve(result || null);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog(null);
      }
    }

    ratioSelect.addEventListener('change', () => {
      const selected = ratioOptions.find(opt => opt.value === ratioSelect.value);
      aspectRatio = sanitizeAspectRatio(selected ? selected.ratio : naturalRatio);
      updateCanvasSize();
      render();
    });

    zoomRange.addEventListener('input', () => {
      const next = Number(zoomRange.value);
      if (!Number.isFinite(next)) return;
      const previous = zoom;
      zoom = Math.max(minZoom, next);
      if (previous > 0) {
        const scale = zoom / previous;
        offsetX *= scale;
        offsetY *= scale;
      }
      render();
    });

    widthInput.addEventListener('input', () => updateMeta());

    let activePointerId = null;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (event) => {
      activePointerId = event.pointerId;
      dragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragOffsetX = offsetX;
      dragOffsetY = offsetY;
      canvas.classList.add('dragging');
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        // Ignore failures on browsers that do not support pointer capture.
      }
    });

    const handlePointerEnd = (event) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) return;
      dragging = false;
      canvas.classList.remove('dragging');
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (err) {
        // Ignore
      }
      activePointerId = null;
    };

    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointerleave', handlePointerEnd);

    canvas.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      offsetX = dragOffsetX + dx;
      offsetY = dragOffsetY + dy;
      render();
    });

    cancelBtn.addEventListener('click', () => closeDialog(null));
    closeBtn.addEventListener('click', () => closeDialog(null));

    confirmBtn.addEventListener('click', () => {
      const exportCanvas = document.createElement('canvas');
      const outWidth = getOutputWidth();
      const outHeight = Math.max(1, Math.round(outWidth / aspectRatio));
      exportCanvas.width = outWidth;
      exportCanvas.height = outHeight;
      const exportCtx = exportCanvas.getContext('2d');
      exportCtx.imageSmoothingEnabled = true;
      exportCtx.imageSmoothingQuality = 'high';

      const drawWidth = (image.naturalWidth || image.width || outWidth) * zoom;
      const drawHeight = (image.naturalHeight || image.height || outHeight) * zoom;
      const originX = (frameWidth - drawWidth) / 2 + offsetX;
      const originY = (frameHeight - drawHeight) / 2 + offsetY;
      const cropX = clamp(-originX / zoom, 0, image.naturalWidth || image.width || outWidth);
      const cropY = clamp(-originY / zoom, 0, image.naturalHeight || image.height || outHeight);
      const cropWidth = Math.min((frameWidth) / zoom, (image.naturalWidth || image.width || outWidth));
      const cropHeight = Math.min((frameHeight) / zoom, (image.naturalHeight || image.height || outHeight));

      exportCtx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        exportCanvas.width,
        exportCanvas.height
      );

      const preferredMime = options.mimeType || file?.type || '';
      const mime = /^image\/jpe?g$/i.test(preferredMime) ? 'image/jpeg' : /^image\/png$/i.test(preferredMime) ? 'image/png' : 'image/png';
      const quality = mime === 'image/jpeg' ? 0.92 : undefined;
      const dataUrl = toDataUrl(exportCanvas, mime, quality);
      const altText = altInput.value.trim();
      closeDialog({
        dataUrl,
        width: exportCanvas.width,
        height: exportCanvas.height,
        mimeType: mime,
        altText
      });
    });

    window.addEventListener('keydown', onKeyDown, true);
    updateCanvasSize();
    render();
    focusDefault();
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    try {
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });
}
