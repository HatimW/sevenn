import {
  upsertBlock,
  deleteBlock,
  exportJSON,
  importJSON,
  exportAnkiCSV,
  getSettings,
  saveSettings
} from '../storage/storage.js';
import { loadBlockCatalog, invalidateBlockCatalog } from '../storage/block-catalog.js';
import { confirmModal } from './components/confirm.js';
import { DEFAULT_REVIEW_STEPS, REVIEW_RATINGS } from '../review/constants.js';

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'settings-empty-blocks';
  empty.textContent = 'No blocks yet. Use “Add block” to create one.';
  return empty;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatWeekCount(weeks) {
  if (!Number.isFinite(weeks) || weeks <= 0) return null;
  const rounded = Math.max(1, Math.round(weeks));
  return `${rounded} week${rounded === 1 ? '' : 's'}`;
}

function parseBlockDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatBlockDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const date = parseBlockDate(value);
  if (!date) return null;
  const formatter = new Intl.DateTimeFormat(undefined, options);
  return formatter.format(date);
}

function formatDateRange(start, end) {
  const startDate = parseBlockDate(start);
  const endDate = parseBlockDate(end);
  if (!startDate && !endDate) return null;
  if (startDate && endDate) {
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${formatter.format(startDate)} → ${formatter.format(endDate)}`;
  }
  if (startDate) {
    const formatted = formatBlockDate(startDate);
    return formatted ? `Starts ${formatted}` : null;
  }
  const formatted = formatBlockDate(endDate);
  return formatted ? `Ends ${formatted}` : null;
}

function computeSpanDays(start, end) {
  const startDate = parseBlockDate(start);
  const endDate = parseBlockDate(end);
  if (!startDate || !endDate) return null;
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) return null;
  return Math.round(diff / DAY_MS) + 1;
}

function formatBlockMeta(block) {
  if (!block) return 'No block data';
  const parts = [];
  const weeks = formatWeekCount(Number(block.weeks));
  if (weeks) parts.push(weeks);
  const range = formatDateRange(block.startDate, block.endDate);
  if (range) parts.push(range);
  const spanDays = computeSpanDays(block.startDate, block.endDate);
  if (spanDays) parts.push(`${spanDays} day${spanDays === 1 ? '' : 's'}`);
  return parts.join(' • ') || 'Block details unavailable';
}

export async function renderSettings(root) {
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  root.appendChild(layout);

  const [catalogResult, settingsResult] = await Promise.allSettled([
    loadBlockCatalog(),
    getSettings()
  ]);

  if (catalogResult.status === 'rejected') {
    console.warn('Failed to load block catalog', catalogResult.reason);
  }
  if (settingsResult.status === 'rejected') {
    console.warn('Failed to load app settings', settingsResult.reason);
  }

  const catalog = catalogResult.status === 'fulfilled' && catalogResult.value
    ? catalogResult.value
    : { blocks: [] };
  const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
  const blocks = Array.isArray(catalog.blocks) ? catalog.blocks : [];
  const reviewSteps = {
    ...DEFAULT_REVIEW_STEPS,
    ...(settings?.reviewSteps || {})
  };

  const blocksCard = document.createElement('section');
  blocksCard.className = 'card';
  const bHeading = document.createElement('h2');
  bHeading.textContent = 'Blocks';
  blocksCard.appendChild(bHeading);

  const list = document.createElement('div');
  list.className = 'block-list';
  blocksCard.appendChild(list);

  if (!blocks.length) {
    list.appendChild(createEmptyState());
  }

  blocks.forEach((block, index) => {
    if (!block) return;
    const wrap = document.createElement('div');
    wrap.className = 'settings-block-row';
    if (block.color) {
      wrap.style.setProperty('--block-accent', block.color);
      wrap.classList.add('has-accent');
    }

    const header = document.createElement('div');
    header.className = 'settings-block-header';
    const title = document.createElement('h3');
    title.className = 'settings-block-title';
    title.textContent = block.title || 'Untitled block';
    if (block.color) {
      title.style.setProperty('--block-accent', block.color);
      title.classList.add('has-accent');
    }
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'settings-block-meta';
    meta.textContent = formatBlockMeta(block);
    header.appendChild(meta);

    const controls = document.createElement('div');
    controls.className = 'settings-block-controls';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'btn tertiary';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', async () => {
      const other = blocks[index - 1];
      if (!other) return;
      const tmp = block.order;
      block.order = other.order;
      other.order = tmp;
      await upsertBlock(block);
      await upsertBlock(other);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'btn tertiary';
    downBtn.textContent = '↓';
    downBtn.disabled = index === blocks.length - 1;
    downBtn.addEventListener('click', async () => {
      const other = blocks[index + 1];
      if (!other) return;
      const tmp = block.order;
      block.order = other.order;
      other.order = tmp;
      await upsertBlock(block);
      await upsertBlock(other);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(downBtn);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn secondary';
    editBtn.textContent = 'Edit';
    controls.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn secondary';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!(await confirmModal('Delete block?'))) return;
      await deleteBlock(block.blockId);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(deleteBtn);

    header.appendChild(controls);

    wrap.appendChild(header);

    const detailGrid = document.createElement('div');
    detailGrid.className = 'settings-block-detail-grid';

    const startDetail = document.createElement('div');
    startDetail.className = 'settings-block-detail';
    startDetail.innerHTML = `<span>Start</span><strong>${formatBlockDate(block.startDate) || '—'}</strong>`;
    detailGrid.appendChild(startDetail);

    const endDetail = document.createElement('div');
    endDetail.className = 'settings-block-detail';
    endDetail.innerHTML = `<span>End</span><strong>${formatBlockDate(block.endDate) || '—'}</strong>`;
    detailGrid.appendChild(endDetail);

    const weeksDetail = document.createElement('div');
    weeksDetail.className = 'settings-block-detail';
    weeksDetail.innerHTML = `<span>Weeks</span><strong>${formatWeekCount(Number(block.weeks)) || '—'}</strong>`;
    detailGrid.appendChild(weeksDetail);

    const spanDays = computeSpanDays(block.startDate, block.endDate);
    const daysDetail = document.createElement('div');
    daysDetail.className = 'settings-block-detail';
    daysDetail.innerHTML = `<span>Span</span><strong>${spanDays ? `${spanDays} day${spanDays === 1 ? '' : 's'}` : '—'}</strong>`;
    detailGrid.appendChild(daysDetail);

    wrap.appendChild(detailGrid);

    const editForm = document.createElement('form');
    editForm.className = 'settings-block-edit';
    editForm.hidden = true;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.required = true;
    titleInput.className = 'input';
    titleInput.value = block.title || '';

    const weeksInput = document.createElement('input');
    weeksInput.type = 'number';
    weeksInput.min = '1';
    weeksInput.required = true;
    weeksInput.className = 'input';
    weeksInput.value = block.weeks != null ? String(block.weeks) : '1';

    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.className = 'input';
    startInput.value = block.startDate || '';

    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.className = 'input';
    endInput.value = block.endDate || '';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'input';
    colorInput.value = block.color || '#ffffff';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Save changes';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      editForm.hidden = true;
    });

    editForm.append(titleInput, startInput, endInput, weeksInput, colorInput, saveBtn, cancelBtn);
    editForm.addEventListener('submit', async event => {
      event.preventDefault();
      const titleValue = titleInput.value.trim();
      const weeksValue = Number(weeksInput.value);
      if (!titleValue || !Number.isFinite(weeksValue) || weeksValue <= 0) {
        return;
      }
      let startValue = startInput.value || null;
      let endValue = endInput.value || null;
      if (startValue && endValue) {
        const startDate = new Date(startValue);
        const endDate = new Date(endValue);
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate > endDate) {
          const swap = startValue;
          startValue = endValue;
          endValue = swap;
        }
      }
      const payload = {
        ...block,
        title: titleValue,
        weeks: weeksValue,
        color: colorInput.value || null,
        startDate: startValue,
        endDate: endValue
      };
      await upsertBlock(payload);
      invalidateBlockCatalog();
      await renderSettings(root);
    });

    wrap.appendChild(editForm);

    editBtn.addEventListener('click', () => {
      editForm.hidden = !editForm.hidden;
    });

    list.appendChild(wrap);
  });

  const form = document.createElement('form');
  form.className = 'settings-block-add';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.required = true;
  titleInput.placeholder = 'Block title';
  titleInput.className = 'input';

  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.className = 'input';
  startInput.placeholder = 'Start date';
  startInput.setAttribute('aria-label', 'Block start date');

  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.className = 'input';
  endInput.placeholder = 'End date';
  endInput.setAttribute('aria-label', 'Block end date');

  const weeksInput = document.createElement('input');
  weeksInput.type = 'number';
  weeksInput.min = '1';
  weeksInput.required = true;
  weeksInput.value = '1';
  weeksInput.placeholder = 'Weeks';
  weeksInput.className = 'input';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'input';
  colorInput.value = '#ffffff';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn';
  submitBtn.textContent = 'Add block (top)';

  form.append(titleInput, startInput, endInput, weeksInput, colorInput, submitBtn);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const titleValue = titleInput.value.trim();
    const weeksValue = Number(weeksInput.value);
    if (!titleValue || !Number.isFinite(weeksValue) || weeksValue <= 0) {
      return;
    }
    let startValue = startInput.value || null;
    let endValue = endInput.value || null;
    if (startValue && endValue) {
      const startDate = new Date(startValue);
      const endDate = new Date(endValue);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate > endDate) {
        const swap = startValue;
        startValue = endValue;
        endValue = swap;
      }
    }
    await upsertBlock({
      title: titleValue,
      weeks: weeksValue,
      color: colorInput.value || null,
      startDate: startValue,
      endDate: endValue
    });
    titleInput.value = '';
    startInput.value = '';
    endInput.value = '';
    weeksInput.value = '1';
    colorInput.value = '#ffffff';
    invalidateBlockCatalog();
    await renderSettings(root);
  });

  blocksCard.appendChild(form);

  layout.appendChild(blocksCard);

  const reviewCard = document.createElement('section');
  reviewCard.className = 'card';
  const rHeading = document.createElement('h2');
  rHeading.textContent = 'Review';
  reviewCard.appendChild(rHeading);

  const reviewForm = document.createElement('form');
  reviewForm.className = 'settings-review-form';
  reviewForm.dataset.section = 'review';

  const stepsHeading = document.createElement('h3');
  stepsHeading.className = 'settings-subheading';
  stepsHeading.textContent = 'Spaced repetition steps (minutes)';
  reviewForm.appendChild(stepsHeading);

  const grid = document.createElement('div');
  grid.className = 'settings-review-grid';
  reviewForm.appendChild(grid);

  const labels = {
    again: 'Again',
    hard: 'Hard',
    good: 'Good',
    easy: 'Easy'
  };

  const reviewInputs = new Map();
  for (const rating of REVIEW_RATINGS) {
    const row = document.createElement('label');
    row.className = 'settings-review-row';

    const label = document.createElement('span');
    label.textContent = labels[rating] || rating;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.required = true;
    input.className = 'input settings-review-input';
    input.value = String(reviewSteps[rating] ?? DEFAULT_REVIEW_STEPS[rating]);
    input.dataset.rating = rating;
    row.appendChild(input);

    reviewInputs.set(rating, input);
    grid.appendChild(row);
  }

  const saveReviewBtn = document.createElement('button');
  saveReviewBtn.type = 'submit';
  saveReviewBtn.className = 'btn';
  saveReviewBtn.textContent = 'Save review settings';
  reviewForm.appendChild(saveReviewBtn);

  const reviewStatus = document.createElement('p');
  reviewStatus.className = 'settings-review-status';
  reviewStatus.hidden = true;
  reviewForm.appendChild(reviewStatus);

  reviewForm.addEventListener('submit', async event => {
    event.preventDefault();
    reviewStatus.textContent = '';
    reviewStatus.hidden = true;
    reviewStatus.classList.remove('is-error');

    const nextSteps = {};
    for (const [rating, input] of reviewInputs) {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) {
        reviewStatus.textContent = 'Enter a positive number of minutes for each step.';
        reviewStatus.classList.add('is-error');
        reviewStatus.hidden = false;
        input.focus();
        return;
      }
      const rounded = Math.max(1, Math.round(value));
      nextSteps[rating] = rounded;
    }

    const originalText = saveReviewBtn.textContent;
    saveReviewBtn.disabled = true;
    saveReviewBtn.textContent = 'Saving…';

    try {
      await saveSettings({ reviewSteps: nextSteps });
      const updated = await getSettings();
      const normalized = {
        ...DEFAULT_REVIEW_STEPS,
        ...(updated?.reviewSteps || {})
      };
      for (const [rating, input] of reviewInputs) {
        const value = normalized[rating];
        if (Number.isFinite(value) && value > 0) {
          input.value = String(value);
        }
      }
      reviewStatus.textContent = 'Review settings saved.';
      reviewStatus.hidden = false;
    } catch (err) {
      console.warn('Failed to save review settings', err);
      reviewStatus.textContent = 'Failed to save review settings.';
      reviewStatus.classList.add('is-error');
      reviewStatus.hidden = false;
    } finally {
      saveReviewBtn.disabled = false;
      saveReviewBtn.textContent = originalText;
    }
  });

  reviewCard.appendChild(reviewForm);
  layout.appendChild(reviewCard);

  const dataCard = document.createElement('section');
  dataCard.className = 'card';
  const dHeading = document.createElement('h2');
  dHeading.textContent = 'Data';
  dataCard.appendChild(dHeading);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = 'Export DB';
  exportBtn.addEventListener('click', async () => {
    const dump = await exportJSON();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sevenn-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  dataCard.appendChild(exportBtn);

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importJSON(json);
      alert(res.message);
      location.reload();
    } catch (e) {
      alert('Import failed');
    }
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'btn';
  importBtn.textContent = 'Import DB';
  importBtn.addEventListener('click', () => importInput.click());
  dataCard.appendChild(importBtn);
  dataCard.appendChild(importInput);

  const ankiBtn = document.createElement('button');
  ankiBtn.className = 'btn';
  ankiBtn.textContent = 'Export Anki CSV';
  ankiBtn.addEventListener('click', async () => {
    const dump = await exportJSON();
    const blob = await exportAnkiCSV('qa', dump.items || []);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sevenn-anki.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  dataCard.appendChild(ankiBtn);

  layout.appendChild(dataCard);
}
