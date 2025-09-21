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
import { DEFAULT_PASS_PLAN } from '../lectures/scheduler.js';
import { LECTURE_PASS_ACTIONS } from '../lectures/actions.js';

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'settings-empty-blocks';
  empty.textContent = 'No blocks yet. Use “Add block” to create one.';
  return empty;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const PASS_DAY_MINUTES = 24 * 60;
const PASS_MAX_COUNT = 20;
const PASS_TIME_UNITS = [
  { value: 'minutes', label: 'Minutes', minutes: 1 },
  { value: 'hours', label: 'Hours', minutes: 60 },
  { value: 'days', label: 'Days', minutes: 60 * 24 },
  { value: 'weeks', label: 'Weeks', minutes: 60 * 24 * 7 }
];

function formatPassOffset(minutes) {
  if (!Number.isFinite(minutes)) return '0m';
  const abs = Math.abs(minutes);
  if (abs < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (Math.abs(hours) < 24) return `${Math.round(hours)}h`;
  const days = minutes / (60 * 24);
  if (Math.abs(days) < 7) return `${Math.round(days)}d`;
  const weeks = minutes / (60 * 24 * 7);
  if (Math.abs(weeks) < 4) return `${Math.round(weeks)}w`;
  const months = minutes / (60 * 24 * 30);
  return `${Math.round(months)}mo`;
}

function plannerFallbackAnchor(index) {
  if (index === 0) return 'today';
  if (index === 1) return 'tomorrow';
  return 'upcoming';
}

function plannerDefaultAction(index) {
  if (!Array.isArray(LECTURE_PASS_ACTIONS) || !LECTURE_PASS_ACTIONS.length) return '';
  const normalized = index % LECTURE_PASS_ACTIONS.length;
  return LECTURE_PASS_ACTIONS[Math.max(0, normalized)];
}

function plannerBaseSchedule(plan) {
  if (plan && Array.isArray(plan.schedule) && plan.schedule.length) {
    return plan.schedule;
  }
  return DEFAULT_PASS_PLAN.schedule;
}

function plannerBuildTemplate(plan, count) {
  const template = plannerBaseSchedule(plan);
  const safeCount = Math.max(0, Number(count) || 0);
  if (safeCount === 0) return [];
  const deltas = [];
  for (let i = 1; i < template.length; i += 1) {
    const prev = Number(template[i - 1]?.offsetMinutes);
    const next = Number(template[i]?.offsetMinutes);
    if (Number.isFinite(prev) && Number.isFinite(next)) {
      const delta = next - prev;
      if (delta > 0) deltas.push(delta);
    }
  }
  const defaultGap = deltas.length ? deltas[deltas.length - 1] : PASS_DAY_MINUTES;
  const schedule = [];
  for (let i = 0; i < safeCount; i += 1) {
    const source = template[i] || {};
    const previous = schedule[i - 1] || null;
    const previousOffset = Number.isFinite(previous?.offsetMinutes) ? previous.offsetMinutes : null;
    const hasExplicitOffset = Number.isFinite(source.offsetMinutes);
    const isExplicitNull = source.offsetMinutes === null;
    const order = i + 1;
    const offset = hasExplicitOffset
      ? source.offsetMinutes
      : isExplicitNull
        ? null
        : previousOffset != null
          ? previousOffset + defaultGap
          : i === 0
            ? 0
            : defaultGap * i;
    const anchor = typeof source.anchor === 'string' && source.anchor.trim()
      ? source.anchor.trim()
      : previous?.anchor || plannerFallbackAnchor(i);
    const label = typeof source.label === 'string' && source.label.trim()
      ? source.label.trim()
      : `Pass ${order}`;
    const action = typeof source.action === 'string' && source.action.trim()
      ? source.action.trim()
      : plannerDefaultAction(i);
    schedule.push({ order, offsetMinutes: offset, anchor, label, action });
  }
  return schedule;
}

function plannerAdjustConfigs(current, count, plan) {
  const template = plannerBuildTemplate(plan || { schedule: current }, count);
  return template.map((step, index) => {
    const existing = current[index];
    const action = existing && typeof existing.action === 'string' && existing.action.trim()
      ? existing.action.trim()
      : step.action;
    const label = existing && typeof existing.label === 'string' && existing.label.trim()
      ? existing.label.trim()
      : step.label;
    const anchor = existing && typeof existing.anchor === 'string' && existing.anchor.trim()
      ? existing.anchor.trim()
      : step.anchor;
    const existingOffset = existing?.offsetMinutes;
    const offsetMinutes = Number.isFinite(existingOffset) || existingOffset === null
      ? existingOffset
      : step.offsetMinutes;
    return { ...step, action, label, anchor, offsetMinutes };
  });
}

function plannerClampCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(PASS_MAX_COUNT, Math.max(0, Math.round(parsed)));
}

function plannerDecomposeOffset(offsetMinutes) {
  if (!Number.isFinite(offsetMinutes)) {
    return { value: '', unit: 'days' };
  }
  const abs = Math.abs(offsetMinutes);
  for (const unit of PASS_TIME_UNITS.slice().reverse()) {
    if (abs % unit.minutes === 0) {
      return { value: offsetMinutes / unit.minutes, unit: unit.value };
    }
  }
  return { value: offsetMinutes, unit: 'minutes' };
}

function plannerComposeOffset(value, unit) {
  if (value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const unitConfig = PASS_TIME_UNITS.find(entry => entry.value === unit) || PASS_TIME_UNITS[2];
  return Math.round(numeric * unitConfig.minutes);
}

function plannerNormalizeConfig(config, index, previousOffset) {
  const order = index + 1;
  const label = typeof config.label === 'string' && config.label.trim()
    ? config.label.trim()
    : `Pass ${order}`;
  const hasOffset = Number.isFinite(config.offsetMinutes);
  const isExplicitNull = config.offsetMinutes === null;
  const offset = hasOffset
    ? config.offsetMinutes
    : isExplicitNull
      ? null
      : Number.isFinite(previousOffset)
        ? previousOffset
        : index === 0
          ? 0
          : index * PASS_DAY_MINUTES;
  const anchor = typeof config.anchor === 'string' && config.anchor.trim()
    ? config.anchor.trim()
    : plannerFallbackAnchor(index);
  const action = typeof config.action === 'string' && config.action.trim()
    ? config.action.trim()
    : plannerDefaultAction(index);
  return { order, label, offsetMinutes: offset, anchor, action };
}

function plannerBuildPayload(passConfigs) {
  if (!Array.isArray(passConfigs) || !passConfigs.length) return [];
  let lastOffset = null;
  return passConfigs.map((config, index) => {
    const normalized = plannerNormalizeConfig(config, index, lastOffset);
    if (Number.isFinite(normalized.offsetMinutes)) {
      lastOffset = normalized.offsetMinutes;
    } else {
      lastOffset = null;
    }
    return normalized;
  });
}

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

  const plannerCard = document.createElement('section');
  plannerCard.className = 'card settings-lecture-defaults-card';
  const plannerHeading = document.createElement('h2');
  plannerHeading.textContent = 'Lecture defaults';
  plannerCard.appendChild(plannerHeading);

  const plannerIntro = document.createElement('p');
  plannerIntro.className = 'settings-lecture-defaults-intro';
  plannerIntro.textContent = 'Configure the default pass timing and learning methods applied when you add a new lecture.';
  plannerCard.appendChild(plannerIntro);

  const plannerPasses = Array.isArray(settings?.plannerDefaults?.passes)
    ? settings.plannerDefaults.passes.map(entry => ({ ...entry }))
    : [];
  const templateSchedule = plannerPasses.length
    ? plannerPasses.map(entry => ({ ...entry }))
    : DEFAULT_PASS_PLAN.schedule.map(entry => ({ ...entry }));
  let planTemplate = { schedule: templateSchedule };
  let passDefaults = plannerAdjustConfigs(plannerPasses, plannerPasses.length, planTemplate);
  let defaultsAdvancedOpen = false;

  function updatePlanTemplateFromCurrent() {
    if (passDefaults.length) {
      planTemplate = { schedule: passDefaults.map(entry => ({ ...entry })) };
    } else {
      planTemplate = { schedule: DEFAULT_PASS_PLAN.schedule.map(entry => ({ ...entry })) };
    }
  }

  const passCountField = document.createElement('label');
  passCountField.className = 'settings-pass-count-field';
  passCountField.textContent = 'Number of passes';
  const passCountInput = document.createElement('input');
  passCountInput.type = 'number';
  passCountInput.min = '0';
  passCountInput.max = String(PASS_MAX_COUNT);
  passCountInput.className = 'input';
  passCountInput.value = String(passDefaults.length);
  passCountField.appendChild(passCountInput);
  plannerCard.appendChild(passCountField);

  const passSummary = document.createElement('div');
  passSummary.className = 'lecture-pass-editor settings-pass-summary';
  plannerCard.appendChild(passSummary);

  const plannerAdvancedControls = document.createElement('div');
  plannerAdvancedControls.className = 'lecture-pass-advanced-controls';
  const plannerAdvancedToggle = document.createElement('button');
  plannerAdvancedToggle.type = 'button';
  plannerAdvancedToggle.className = 'btn tertiary lecture-pass-advanced-toggle';
  plannerAdvancedToggle.textContent = 'Advanced settings';
  plannerAdvancedControls.appendChild(plannerAdvancedToggle);
  plannerCard.appendChild(plannerAdvancedControls);

  const plannerAdvancedSection = document.createElement('div');
  plannerAdvancedSection.className = 'lecture-pass-advanced';
  const plannerAdvancedNote = document.createElement('p');
  plannerAdvancedNote.className = 'lecture-pass-advanced-note';
  plannerAdvancedNote.textContent = 'Adjust the schedule and learning method for each pass.';
  plannerAdvancedSection.appendChild(plannerAdvancedNote);
  const plannerAdvancedList = document.createElement('div');
  plannerAdvancedList.className = 'lecture-pass-advanced-list';
  plannerAdvancedSection.appendChild(plannerAdvancedList);
  plannerCard.appendChild(plannerAdvancedSection);

  const plannerActions = document.createElement('div');
  plannerActions.className = 'settings-lecture-defaults-actions';
  const saveDefaultsBtn = document.createElement('button');
  saveDefaultsBtn.type = 'button';
  saveDefaultsBtn.className = 'btn';
  saveDefaultsBtn.textContent = 'Save lecture defaults';
  plannerActions.appendChild(saveDefaultsBtn);
  plannerCard.appendChild(plannerActions);

  const defaultsStatus = document.createElement('p');
  defaultsStatus.className = 'settings-defaults-status';
  defaultsStatus.hidden = true;
  plannerCard.appendChild(defaultsStatus);

  function renderDefaultsSummary() {
    passSummary.innerHTML = '';
    if (!passDefaults.length) {
      const empty = document.createElement('div');
      empty.className = 'lecture-pass-empty';
      empty.textContent = 'No passes scheduled.';
      passSummary.appendChild(empty);
      return;
    }
    passDefaults.forEach((config, index) => {
      const row = document.createElement('div');
      row.className = 'lecture-pass-row';

      const label = document.createElement('span');
      label.className = 'lecture-pass-label';
      label.textContent = `Pass ${index + 1}`;
      row.appendChild(label);

      const method = document.createElement('span');
      method.className = 'lecture-pass-method';
      method.textContent = config.action || plannerDefaultAction(index) || '—';
      row.appendChild(method);

      const timing = document.createElement('span');
      timing.className = 'lecture-pass-offset';
      const timingLabel = Number.isFinite(config.offsetMinutes)
        ? formatPassOffset(config.offsetMinutes)
        : 'Unscheduled';
      timing.textContent = `Timing: ${timingLabel}`;
      row.appendChild(timing);

      passSummary.appendChild(row);
    });
  }

  function rebuildDefaultsAdvancedRows() {
    plannerAdvancedList.innerHTML = '';
    if (!passDefaults.length) {
      const empty = document.createElement('div');
      empty.className = 'lecture-pass-empty';
      empty.textContent = 'No passes to configure.';
      plannerAdvancedList.appendChild(empty);
      return;
    }
    passDefaults.forEach((config, index) => {
      const row = document.createElement('div');
      row.className = 'lecture-pass-advanced-row';

      const header = document.createElement('div');
      header.className = 'lecture-pass-advanced-header';
      header.textContent = `Pass ${index + 1}`;
      row.appendChild(header);

      const actionField = document.createElement('label');
      actionField.className = 'lecture-pass-advanced-field';
      const actionTitle = document.createElement('span');
      actionTitle.textContent = 'Learning method';
      actionField.appendChild(actionTitle);
      const actionSelect = document.createElement('select');
      actionSelect.className = 'input lecture-pass-action';
      LECTURE_PASS_ACTIONS.forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = action;
        actionSelect.appendChild(option);
      });
      if (config.action && !LECTURE_PASS_ACTIONS.includes(config.action)) {
        const custom = document.createElement('option');
        custom.value = config.action;
        custom.textContent = config.action;
        actionSelect.appendChild(custom);
      }
      actionSelect.value = config.action || '';
      actionSelect.addEventListener('change', event => {
        passDefaults[index] = { ...passDefaults[index], action: event.target.value };
        updatePlanTemplateFromCurrent();
        renderDefaultsSummary();
      });
      actionField.appendChild(actionSelect);
      row.appendChild(actionField);

      const timingField = document.createElement('label');
      timingField.className = 'lecture-pass-advanced-field';
      const timingTitle = document.createElement('span');
      timingTitle.textContent = 'Timing';
      timingField.appendChild(timingTitle);
      const offsetWrap = document.createElement('div');
      offsetWrap.className = 'lecture-pass-offset-editor';
      const offsetInput = document.createElement('input');
      offsetInput.type = 'number';
      offsetInput.className = 'input';
      offsetInput.step = '1';
      const { value: offsetValue, unit } = plannerDecomposeOffset(config.offsetMinutes ?? 0);
      if (offsetValue !== '') {
        offsetInput.value = String(offsetValue);
      }
      offsetWrap.appendChild(offsetInput);
      const unitSelect = document.createElement('select');
      unitSelect.className = 'input';
      PASS_TIME_UNITS.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        unitSelect.appendChild(opt);
      });
      unitSelect.value = unit;
      offsetWrap.appendChild(unitSelect);
      const preview = document.createElement('div');
      preview.className = 'lecture-pass-advanced-preview';
      preview.textContent = Number.isFinite(config.offsetMinutes)
        ? `Current: ${formatPassOffset(config.offsetMinutes)}`
        : 'Current: Unscheduled';
      offsetWrap.appendChild(preview);

      function applyOffsetUpdate() {
        if (offsetInput.value === '') {
          passDefaults[index] = { ...passDefaults[index], offsetMinutes: null };
          preview.textContent = 'Current: Unscheduled';
        } else {
          const minutes = plannerComposeOffset(offsetInput.value, unitSelect.value);
          if (minutes == null) {
            passDefaults[index] = { ...passDefaults[index], offsetMinutes: null };
            preview.textContent = 'Current: Unscheduled';
          } else {
            passDefaults[index] = { ...passDefaults[index], offsetMinutes: minutes };
            preview.textContent = `Current: ${formatPassOffset(minutes)}`;
          }
        }
        updatePlanTemplateFromCurrent();
        renderDefaultsSummary();
      }

      offsetInput.addEventListener('input', applyOffsetUpdate);
      unitSelect.addEventListener('change', applyOffsetUpdate);

      timingField.appendChild(offsetWrap);
      row.appendChild(timingField);

      plannerAdvancedList.appendChild(row);
    });
  }

  function renderDefaultsEditor(forceAdvancedRebuild = false) {
    passCountInput.value = String(passDefaults.length);
    renderDefaultsSummary();
    plannerAdvancedToggle.disabled = passDefaults.length === 0;
    plannerAdvancedToggle.setAttribute('aria-expanded', defaultsAdvancedOpen && passDefaults.length ? 'true' : 'false');
    if (!passDefaults.length) {
      plannerAdvancedSection.hidden = true;
      plannerAdvancedSection.classList.remove('is-open');
      plannerAdvancedList.innerHTML = '';
      return;
    }
    if (defaultsAdvancedOpen) {
      plannerAdvancedSection.hidden = false;
      plannerAdvancedSection.classList.add('is-open');
      if (forceAdvancedRebuild || !plannerAdvancedList.childElementCount) {
        rebuildDefaultsAdvancedRows();
      } else {
        Array.from(plannerAdvancedList.querySelectorAll('.lecture-pass-advanced-header')).forEach((header, idx) => {
          header.textContent = `Pass ${idx + 1}`;
        });
      }
    } else {
      plannerAdvancedSection.hidden = true;
      plannerAdvancedSection.classList.remove('is-open');
      plannerAdvancedList.innerHTML = '';
    }
  }

  updatePlanTemplateFromCurrent();
  renderDefaultsEditor(true);

  function handlePlannerCountChange() {
    const next = plannerClampCount(passCountInput.value);
    passCountInput.value = String(next);
    passDefaults = plannerAdjustConfigs(passDefaults, next, planTemplate);
    updatePlanTemplateFromCurrent();
    renderDefaultsEditor(true);
  }

  passCountInput.addEventListener('input', handlePlannerCountChange);
  passCountInput.addEventListener('change', handlePlannerCountChange);

  plannerAdvancedToggle.addEventListener('click', () => {
    if (!passDefaults.length) return;
    defaultsAdvancedOpen = !defaultsAdvancedOpen;
    renderDefaultsEditor(true);
  });

  saveDefaultsBtn.addEventListener('click', async () => {
    defaultsStatus.textContent = '';
    defaultsStatus.hidden = true;
    defaultsStatus.classList.remove('is-error');
    const payload = plannerBuildPayload(passDefaults);
    const originalText = saveDefaultsBtn.textContent;
    saveDefaultsBtn.disabled = true;
    saveDefaultsBtn.textContent = 'Saving…';
    try {
      await saveSettings({ plannerDefaults: { passes: payload } });
      const updated = await getSettings();
      const updatedPasses = Array.isArray(updated?.plannerDefaults?.passes)
        ? updated.plannerDefaults.passes.map(entry => ({ ...entry }))
        : [];
      planTemplate = { schedule: (updatedPasses.length ? updatedPasses : DEFAULT_PASS_PLAN.schedule).map(entry => ({ ...entry })) };
      passDefaults = plannerAdjustConfigs(updatedPasses, updatedPasses.length, planTemplate);
      updatePlanTemplateFromCurrent();
      renderDefaultsEditor(true);
      defaultsStatus.textContent = 'Lecture defaults saved.';
      defaultsStatus.hidden = false;
    } catch (err) {
      console.warn('Failed to save lecture defaults', err);
      defaultsStatus.textContent = 'Failed to save lecture defaults.';
      defaultsStatus.classList.add('is-error');
      defaultsStatus.hidden = false;
    } finally {
      saveDefaultsBtn.disabled = false;
      saveDefaultsBtn.textContent = originalText;
    }
  });

  layout.appendChild(plannerCard);

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
