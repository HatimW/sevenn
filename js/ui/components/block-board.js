import { state, setBlockBoardState } from '../../state.js';
import { loadBlockCatalog } from '../../storage/block-catalog.js';
import { listAllLectures, saveLecture } from '../../storage/storage.js';
import {
  groupLectureQueues,
  markPassCompleted,
  deriveLectureStatus,
  calculateNextDue
} from '../../lectures/scheduler.js';
import { findActiveBlockId } from '../../utils.js';

let loadCatalog = loadBlockCatalog;
let fetchLectures = listAllLectures;
let persistLecture = saveLecture;

export function __setBlockBoardDeps({ loadBlockCatalog: loadFn, listAllLectures: listFn, saveLecture: saveFn } = {}) {
  loadCatalog = typeof loadFn === 'function' ? loadFn : loadBlockCatalog;
  fetchLectures = typeof listFn === 'function' ? listFn : listAllLectures;
  persistLecture = typeof saveFn === 'function' ? saveFn : saveLecture;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PASS_COLORS = [
  'var(--pink)',
  'var(--blue)',
  'var(--green)',
  'var(--orange)',
  'var(--purple)',
  'var(--teal)',
  'var(--yellow)',
  'var(--rose)',
  'var(--indigo)',
  'var(--cyan)'
];
const DEFAULT_BOARD_DAYS = 14;
const SHIFT_OFFSET_UNITS = [
  { id: 'minutes', label: 'minutes', minutes: 1 },
  { id: 'hours', label: 'hours', minutes: 60 },
  { id: 'days', label: 'days', minutes: 60 * 24 },
  { id: 'weeks', label: 'weeks', minutes: 60 * 24 * 7 }
];
const TIMELINE_BASE_UNIT_HEIGHT = 8;
const TIMELINE_MAX_BAR_HEIGHT = 200;
const TIMELINE_MIN_SEGMENT_HEIGHT = 3;

const BLOCK_RANGE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const PASS_DUE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric'
});

const PASS_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit'
});

function ensureBoardState() {
  if (!state.blockBoard) {
    state.blockBoard = { collapsedBlocks: [], hiddenTimelines: [] };
  }
  if (!Array.isArray(state.blockBoard.collapsedBlocks)) {
    state.blockBoard.collapsedBlocks = [];
  }
  if (!Array.isArray(state.blockBoard.hiddenTimelines)) {
    state.blockBoard.hiddenTimelines = [];
    if (state.blockBoard.showDensity === false && !state.blockBoard.hiddenTimelines.includes('__all__')) {
      state.blockBoard.hiddenTimelines.push('__all__');
    }
  }
  return state.blockBoard;
}

function passColor(order = 1) {
  if (!Number.isFinite(order)) return PASS_COLORS[0];
  const idx = Math.max(0, Math.floor(order) - 1) % PASS_COLORS.length;
  return PASS_COLORS[idx];
}

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatDay(timestamp) {
  const date = new Date(Number(timestamp));
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return formatter.format(date);
}

function parseBlockDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatBlockDate(value) {
  const date = parseBlockDate(value);
  if (!date) return null;
  return BLOCK_RANGE_FORMAT.format(date);
}

function blockRangeLabel(block) {
  const start = formatBlockDate(block?.startDate);
  const end = formatBlockDate(block?.endDate);
  if (start && end) return `${start} → ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return null;
}

function blockSpanDays(block) {
  const start = parseBlockDate(block?.startDate);
  const end = parseBlockDate(block?.endDate);
  if (!start || !end) return null;
  const diff = end.getTime() - start.getTime();
  if (diff < 0) return null;
  return Math.round(diff / DAY_MS) + 1;
}

function normalizeShiftUnit(id) {
  if (typeof id !== 'string') return 'days';
  const normalized = SHIFT_OFFSET_UNITS.find(option => option.id === id);
  return normalized ? normalized.id : 'days';
}

function combineShiftValueUnit(value, unitId) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  const unit = SHIFT_OFFSET_UNITS.find(option => option.id === normalizeShiftUnit(unitId)) || SHIFT_OFFSET_UNITS[2];
  return Math.max(0, Math.round(numeric * unit.minutes));
}

function buildScopeOptions(mode) {
  if (mode === 'pull') {
    return [
      { id: 'single', label: 'Only this pass' },
      { id: 'chain-before', label: 'This & preceding passes' }
    ];
  }
  return [
    { id: 'single', label: 'Only this pass' },
    { id: 'chain-after', label: 'This & following passes' }
  ];
}

function openShiftDialog(mode, { title, description, defaultValue = 1, defaultUnit = 'days' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal block-board-shift-modal';

    const card = document.createElement('div');
    card.className = 'card block-board-shift-card';

    const heading = document.createElement('h3');
    heading.textContent = title || (mode === 'push' ? 'Push later' : 'Pull earlier');
    card.appendChild(heading);

    if (description) {
      const desc = document.createElement('p');
      desc.className = 'block-board-shift-description';
      desc.textContent = description;
      card.appendChild(desc);
    }

    const fields = document.createElement('div');
    fields.className = 'block-board-shift-fields';

    const amountField = document.createElement('label');
    amountField.className = 'block-board-shift-field';
    amountField.textContent = 'Amount';
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.className = 'input block-board-shift-input';
    amountInput.min = '0';
    amountInput.step = '1';
    amountInput.value = String(defaultValue);
    amountField.appendChild(amountInput);
    fields.appendChild(amountField);

    const unitField = document.createElement('label');
    unitField.className = 'block-board-shift-field';
    unitField.textContent = 'Unit';
    const unitSelect = document.createElement('select');
    unitSelect.className = 'input block-board-shift-unit';
    SHIFT_OFFSET_UNITS.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = option.label;
      unitSelect.appendChild(opt);
    });
    unitSelect.value = normalizeShiftUnit(defaultUnit);
    unitField.appendChild(unitSelect);
    fields.appendChild(unitField);

    card.appendChild(fields);

    const scopeGroup = document.createElement('fieldset');
    scopeGroup.className = 'block-board-shift-scope';
    const legend = document.createElement('legend');
    legend.textContent = 'Scope';
    scopeGroup.appendChild(legend);
    const scopeInputs = [];
    buildScopeOptions(mode).forEach((option, index) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'block-board-shift-scope-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'block-board-shift-scope';
      input.value = option.id;
      if (index === 0) input.checked = true;
      const span = document.createElement('span');
      span.textContent = option.label;
      wrapper.appendChild(input);
      wrapper.appendChild(span);
      scopeGroup.appendChild(wrapper);
      scopeInputs.push(input);
    });
    card.appendChild(scopeGroup);

    const feedback = document.createElement('div');
    feedback.className = 'block-board-shift-error';
    card.appendChild(feedback);

    const actions = document.createElement('div');
    actions.className = 'block-board-shift-actions';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn';
    confirm.textContent = mode === 'push' ? 'Push later' : 'Pull earlier';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn secondary';
    cancel.textContent = 'Cancel';
    actions.appendChild(confirm);
    actions.appendChild(cancel);
    card.appendChild(actions);

    function cleanup(result) {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      resolve(result);
    }

    confirm.addEventListener('click', () => {
      const minutes = combineShiftValueUnit(amountInput.value, unitSelect.value);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        feedback.textContent = 'Enter a value greater than zero.';
        feedback.classList.add('is-visible');
        amountInput.focus();
        return;
      }
      const selectedScope = scopeInputs.find(input => input.checked)?.value || 'single';
      cleanup({ minutes, scope: selectedScope });
    });

    cancel.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    amountInput.focus({ preventScroll: true });
  });
}

function shiftPassesForScope(lecture, passOrder, deltaMinutes, scope) {
  if (!lecture || typeof lecture !== 'object') return lecture;
  const targetOrder = Number(passOrder);
  if (!Number.isFinite(targetOrder)) return lecture;
  const delta = Number(deltaMinutes);
  if (!Number.isFinite(delta) || delta === 0) return lecture;
  const passes = Array.isArray(lecture.passes) ? lecture.passes.map(pass => ({ ...pass })) : [];
  if (!passes.length) return lecture;
  const shiftMs = Math.round(delta * 60 * 1000);
  const normalizedScope = scope === 'chain-after' || scope === 'chain-before' ? scope : 'single';
  passes.forEach(pass => {
    const order = Number(pass?.order);
    if (!Number.isFinite(order)) return;
    const inScope = normalizedScope === 'chain-after'
      ? order >= targetOrder
      : normalizedScope === 'chain-before'
        ? order <= targetOrder
        : order === targetOrder;
    if (!inScope) return;
    if (!Number.isFinite(pass?.due)) return;
    if (Number.isFinite(pass?.completedAt)) return;
    const nextDue = Math.max(0, Math.round(pass.due + shiftMs));
    pass.due = nextDue;
  });
  const status = deriveLectureStatus(passes, lecture.status);
  const nextDueAt = calculateNextDue(passes);
  return {
    ...lecture,
    passes,
    status,
    nextDueAt
  };
}

function collectTimelineSegments(blockLectures, days) {
  const dayMap = new Map(days.map(day => [day, []]));
  blockLectures.forEach(lecture => {
    const passes = Array.isArray(lecture?.passes) ? lecture.passes : [];
    passes.forEach(pass => {
      if (!pass) return;
      const due = Number(pass?.due);
      if (!Number.isFinite(due)) return;
      const dayKey = startOfDay(due);
      if (!dayMap.has(dayKey)) return;
      dayMap.get(dayKey).push({
        lecture,
        pass,
        order: Number(pass?.order),
        completed: Number.isFinite(pass?.completedAt)
      });
    });
  });
  return days.map(day => {
    const entries = (dayMap.get(day) || []).slice().sort((a, b) => {
      const orderA = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
      const orderB = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      const nameA = a.lecture?.name || '';
      const nameB = b.lecture?.name || '';
      return nameA.localeCompare(nameB);
    });
    return { day, entries };
  });
}

function formatDueTime(due) {
  if (!Number.isFinite(due)) return 'Unscheduled';
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return formatter.format(new Date(due));
}

function formatPassDueLabel(due) {
  if (!Number.isFinite(due)) return '';
  const date = new Date(due);
  const datePart = PASS_DUE_FORMAT.format(date);
  const timePart = PASS_TIME_FORMAT.format(date);
  return `${datePart} • ${timePart}`;
}

function collectDefaultBoardDays(now = Date.now()) {
  const today = startOfDay(now);
  const start = today - 2 * DAY_MS;
  return Array.from({ length: DEFAULT_BOARD_DAYS }, (_, idx) => start + idx * DAY_MS);
}

function collectLectureDueRange(lectures) {
  let start = null;
  let end = null;
  if (!Array.isArray(lectures)) return { start, end };
  lectures.forEach(lecture => {
    const passes = Array.isArray(lecture?.passes) ? lecture.passes : [];
    passes.forEach(pass => {
      const due = Number(pass?.due);
      if (!Number.isFinite(due)) return;
      const day = startOfDay(due);
      if (start == null || day < start) start = day;
      if (end == null || day > end) end = day;
    });
  });
  return { start, end };
}

function collectDaysForBlock(block, lectures = [], now = Date.now()) {
  const startDate = parseBlockDate(block?.startDate);
  const endDate = parseBlockDate(block?.endDate);
  const dueRange = collectLectureDueRange(lectures);
  const weeks = Number(block?.weeks);

  let startDay = startDate ? startOfDay(startDate.getTime()) : null;
  let endDay = endDate ? startOfDay(endDate.getTime()) : null;

  if (Number.isFinite(weeks) && weeks > 0) {
    const totalDays = Math.max(1, Math.round(weeks * 7));
    if (startDay != null && endDay == null) {
      endDay = startDay + (totalDays - 1) * DAY_MS;
    } else if (endDay != null && startDay == null) {
      startDay = endDay - (totalDays - 1) * DAY_MS;
    }
  }

  if (dueRange.start != null) {
    startDay = startDay == null ? dueRange.start : Math.min(startDay, dueRange.start);
  }
  if (dueRange.end != null) {
    endDay = endDay == null ? dueRange.end : Math.max(endDay, dueRange.end);
  }

  if (startDay != null && endDay != null && endDay >= startDay) {
    const spanDays = Math.floor((endDay - startDay) / DAY_MS) + 1;
    if (spanDays < 3) {
      const deficit = 3 - spanDays;
      const padBefore = Math.ceil(deficit / 2);
      const padAfter = deficit - padBefore;
      startDay -= padBefore * DAY_MS;
      endDay += padAfter * DAY_MS;
    }
    const days = [];
    for (let ts = startDay; ts <= endDay; ts += DAY_MS) {
      days.push(ts);
    }
    return days;
  }

  if (Number.isFinite(weeks) && weeks > 0) {
    const totalDays = Math.max(1, Math.round(weeks * 7));
    const anchor = dueRange.start != null ? dueRange.start : startOfDay(now);
    return Array.from({ length: totalDays }, (_, idx) => anchor + idx * DAY_MS);
  }

  if (dueRange.start != null && dueRange.end != null && dueRange.end >= dueRange.start) {
    const days = [];
    for (let ts = dueRange.start; ts <= dueRange.end; ts += DAY_MS) {
      days.push(ts);
    }
    return days;
  }

  if (startDate) {
    const start = startOfDay(startDate.getTime());
    return Array.from({ length: 7 }, (_, idx) => start + idx * DAY_MS);
  }

  return [];
}

function buildPassElement(entry, onComplete, onShift) {
  const chip = document.createElement('div');
  chip.className = 'block-board-pass-chip';
  chip.style.setProperty('--chip-accent', passColor(entry?.pass?.order));
  chip.dataset.passOrder = String(entry?.pass?.order ?? '');
  const title = document.createElement('div');
  title.className = 'block-board-pass-title';
  title.textContent = entry?.lecture?.name || `Lecture ${entry?.lecture?.id}`;
  chip.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'block-board-pass-meta';
  const label = entry?.pass?.label || `Pass ${entry?.pass?.order ?? ''}`;
  const action = entry?.pass?.action ? entry.pass.action : '';
  const dueLabel = Number.isFinite(entry?.pass?.due)
    ? formatPassDueLabel(entry.pass.due)
    : 'Unscheduled';
  const parts = [label];
  if (action) parts.push(action);
  if (dueLabel) parts.push(dueLabel);
  meta.textContent = parts.join(' • ');
  chip.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'block-board-pass-actions';
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn tertiary';
  done.textContent = 'Mark done';
  done.addEventListener('click', () => onComplete(entry));
  actions.appendChild(done);

  if (typeof onShift === 'function') {
    const push = document.createElement('button');
    push.type = 'button';
    push.className = 'btn tertiary';
    push.textContent = 'Push';
    push.addEventListener('click', () => onShift(entry, 'push'));
    actions.appendChild(push);

    const pull = document.createElement('button');
    pull.type = 'button';
    pull.className = 'btn tertiary';
    pull.textContent = 'Pull';
    pull.addEventListener('click', () => onShift(entry, 'pull'));
    actions.appendChild(pull);
  }

  chip.appendChild(actions);
  return chip;
}

function applyPassDueUpdate(lecture, passOrder, newDue) {
  const passes = Array.isArray(lecture?.passes)
    ? lecture.passes.map(pass => ({ ...pass }))
    : [];
  const index = passes.findIndex(pass => pass?.order === passOrder);
  if (index >= 0) {
    passes[index] = { ...passes[index], due: newDue ?? null };
    if (!Number.isFinite(newDue)) {
      passes[index].due = null;
    }
    passes[index].completedAt = passes[index].completedAt ?? null;
    if (passes[index].completedAt && newDue && newDue > passes[index].completedAt) {
      passes[index].completedAt = null;
    }
  }
  const status = deriveLectureStatus(passes, lecture?.status);
  const nextDueAt = calculateNextDue(passes);
  return { ...lecture, passes, status, nextDueAt };
}

function createPassCard(entry, onDrag) {
  const card = document.createElement('div');
  card.className = 'block-board-pass-card';
  card.draggable = true;
  card.style.setProperty('--card-accent', passColor(entry?.pass?.order));
  card.dataset.blockId = entry?.lecture?.blockId ?? '';
  card.dataset.lectureId = entry?.lecture?.id ?? '';
  card.dataset.passOrder = entry?.pass?.order ?? '';
  card.dataset.passDue = Number.isFinite(entry?.pass?.due) ? String(entry.pass.due) : '';
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = entry?.lecture?.name || 'Lecture';
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const metaParts = [];
  if (entry?.pass?.label) metaParts.push(entry.pass.label);
  else if (entry?.pass?.order != null) metaParts.push(`Pass ${entry.pass.order}`);
  if (entry?.pass?.action) metaParts.push(entry.pass.action);
  meta.textContent = metaParts.length ? metaParts.join(' • ') : 'Pass';
  card.appendChild(meta);

  const due = document.createElement('div');
  due.className = 'card-due';
  const dueText = Number.isFinite(entry?.pass?.due)
    ? formatPassDueLabel(entry.pass.due)
    : 'Unscheduled';
  due.textContent = dueText;
  card.appendChild(due);

  card.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) return;
    const payload = {
      blockId: card.dataset.blockId,
      lectureId: card.dataset.lectureId,
      passOrder: Number(card.dataset.passOrder),
      due: card.dataset.passDue ? Number(card.dataset.passDue) : null
    };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    onDrag?.(payload);
  });
  return card;
}

function createDayColumn(dayTs) {
  const column = document.createElement('div');
  column.className = 'block-board-day-column';
  column.dataset.day = String(dayTs);
  const header = document.createElement('div');
  header.className = 'block-board-day-header';
  header.textContent = formatDay(dayTs);
  if (startOfDay(Date.now()) === dayTs) {
    column.classList.add('today');
  }
  column.appendChild(header);
  const list = document.createElement('div');
  list.className = 'block-board-day-list';
  column.appendChild(list);
  column.addEventListener('dragover', (event) => {
    event.preventDefault();
    column.classList.add('dropping');
  });
  column.addEventListener('dragleave', () => {
    column.classList.remove('dropping');
  });
  return column;
}

async function updateLectureSchedule(lecture, updateFn) {
  const updated = updateFn(lecture);
  await persistLecture(updated);
}

function renderUrgentQueues(root, queues, handlers) {
  const wrapper = document.createElement('section');
  wrapper.className = 'block-board-summary';
  const config = [
    { key: 'today', label: "Today's To-Do", empty: 'Nothing due today.', accent: 'var(--blue)' },
    { key: 'tomorrow', label: 'Due Tomorrow', empty: 'Nothing due tomorrow.', accent: 'var(--yellow)' },
    { key: 'overdue', label: 'Overdue', empty: 'No overdue passes. 🎉', accent: 'var(--rose)' }
  ];
  config.forEach(({ key, label, empty, accent }) => {
    const card = document.createElement('article');
    card.className = 'block-board-summary-card';
    if (accent) card.style.setProperty('--summary-accent', accent);

    const header = document.createElement('div');
    header.className = 'block-board-summary-header';

    const title = document.createElement('h3');
    title.className = 'block-board-summary-title';
    title.textContent = label;
    header.appendChild(title);

    const entries = queues[key] || [];
    const count = document.createElement('span');
    count.className = 'block-board-summary-count';
    count.textContent = String(entries.length);
    header.appendChild(count);

    card.appendChild(header);

    const list = document.createElement('div');
    list.className = 'block-board-summary-list';
    if (!entries.length) {
      const emptyState = document.createElement('div');
      emptyState.className = 'block-board-summary-empty';
      emptyState.textContent = empty || 'Nothing queued.';
      list.appendChild(emptyState);
    } else {
      entries.forEach(entry => {
        const chip = buildPassElement(entry, handlers.onComplete, handlers.onShift);
        list.appendChild(chip);
      });
    }
    card.appendChild(list);
    wrapper.appendChild(card);
  });
  root.appendChild(wrapper);
}

function buildDayAssignments(blockLectures, days) {
  const assignments = new Map();
  blockLectures.forEach(lecture => {
    const passes = Array.isArray(lecture?.passes) ? lecture.passes : [];
    passes.forEach(pass => {
      if (!pass || Number.isFinite(pass.completedAt)) return;
      const due = Number.isFinite(pass.due) ? startOfDay(pass.due) : null;
      const key = due != null ? due : 'unscheduled';
      if (!assignments.has(key)) assignments.set(key, []);
      assignments.get(key).push({ lecture, pass });
    });
  });
  days.forEach(day => {
    if (!assignments.has(day)) assignments.set(day, []);
  });
  const unscheduled = assignments.get('unscheduled');
  if (!unscheduled || !unscheduled.length) {
    assignments.delete('unscheduled');
  }
  return assignments;
}

function attachDropHandlers(column, blockEntries, refresh) {
  column.addEventListener('drop', async (event) => {
    event.preventDefault();
    column.classList.remove('dropping');
    const payloadRaw = event.dataTransfer?.getData('application/json');
    if (!payloadRaw) return;
    let payload;
    try {
      payload = JSON.parse(payloadRaw);
    } catch (err) {
      return;
    }
    const { lectureId, passOrder } = payload || {};
    const lecture = blockEntries.find(item => String(item.lecture?.id) === String(lectureId))?.lecture;
    if (!lecture) return;
    const dayValue = column.dataset.day;
    const targetDay = dayValue ? Number(dayValue) : null;
    const newDue = targetDay != null ? targetDay + (payload?.due != null ? (payload.due % DAY_MS) : 9 * 60 * 60 * 1000) : null;
    await updateLectureSchedule(lecture, lec => applyPassDueUpdate(lec, passOrder, newDue));
    await refresh();
  });
}

function renderBlockBoardBlock(container, block, blockLectures, days, refresh) {
  const boardState = ensureBoardState();
  const wrapper = document.createElement('section');
  wrapper.className = 'block-board-block';
  wrapper.dataset.blockId = String(block?.blockId ?? '');
  if (block?.color) {
    wrapper.style.setProperty('--block-accent', block.color);
    wrapper.classList.add('has-accent');
  }

  const header = document.createElement('div');
  header.className = 'block-board-block-header';
  const heading = document.createElement('div');
  heading.className = 'block-board-block-heading';
  const title = document.createElement('h2');
  title.className = 'block-board-block-title';
  title.textContent = block?.title || block?.name || `Block ${block?.blockId}`;
  if (block?.color) {
    title.style.setProperty('--block-accent', block.color);
    title.classList.add('has-accent');
  }
  heading.appendChild(title);

  const metaParts = [];
  const rangeText = blockRangeLabel(block);
  if (rangeText) metaParts.push(rangeText);
  const weekValue = Number(block?.weeks);
  if (Number.isFinite(weekValue) && weekValue > 0) {
    const weeks = Math.round(weekValue);
    metaParts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
  }
  const span = blockSpanDays(block);
  if (span) metaParts.push(`${span} day${span === 1 ? '' : 's'}`);
  if (metaParts.length) {
    const meta = document.createElement('div');
    meta.className = 'block-board-block-meta';
    meta.textContent = metaParts.join(' • ');
    heading.appendChild(meta);
  }
  header.appendChild(heading);
  const controls = document.createElement('div');
  controls.className = 'block-board-block-controls';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'btn secondary';
  const isCollapsed = boardState.collapsedBlocks.includes(String(block?.blockId));
  collapseBtn.textContent = isCollapsed ? 'Expand' : 'Minimize';
  collapseBtn.addEventListener('click', () => {
    const current = ensureBoardState();
    const nextCollapsed = new Set(current.collapsedBlocks.map(String));
    if (nextCollapsed.has(String(block.blockId))) {
      nextCollapsed.delete(String(block.blockId));
    } else {
      nextCollapsed.add(String(block.blockId));
    }
    setBlockBoardState({ collapsedBlocks: Array.from(nextCollapsed) });
    refresh();
  });
  controls.appendChild(collapseBtn);
  const hiddenTimelineSet = new Set((boardState.hiddenTimelines || []).map(id => String(id)));
  const blockKey = String(block?.blockId ?? '');
  const timelineHidden = hiddenTimelineSet.has('__all__') || hiddenTimelineSet.has(blockKey);
  const timelineBtn = document.createElement('button');
  timelineBtn.type = 'button';
  timelineBtn.className = 'btn secondary';
  timelineBtn.textContent = timelineHidden ? 'Show timeline' : 'Hide timeline';
  timelineBtn.addEventListener('click', () => {
    const current = ensureBoardState();
    const nextHidden = new Set((current.hiddenTimelines || []).map(id => String(id)));
    nextHidden.delete('__all__');
    if (timelineHidden) {
      nextHidden.delete(blockKey);
    } else {
      nextHidden.add(blockKey);
    }
    setBlockBoardState({ hiddenTimelines: Array.from(nextHidden) });
    refresh();
  });
  controls.appendChild(timelineBtn);
  header.appendChild(controls);
  wrapper.appendChild(header);

  const assignments = buildDayAssignments(blockLectures, days);
  const unscheduledEntries = assignments.get('unscheduled') || [];
  assignments.delete('unscheduled');

  const blockEntries = [];
  assignments.forEach(entries => {
    entries.forEach(entry => blockEntries.push(entry));
  });
  unscheduledEntries.forEach(entry => blockEntries.push(entry));

  if (!timelineHidden) {
    const timelineData = collectTimelineSegments(blockLectures, days);
    const timeline = document.createElement('div');
    timeline.className = 'block-board-timeline';

    const timelineHeader = document.createElement('div');
    timelineHeader.className = 'block-board-timeline-header';
    const timelineTitle = document.createElement('h3');
    timelineTitle.className = 'block-board-timeline-title';
    timelineTitle.textContent = `Block Timeline — ${block?.title || block?.name || 'Block'}`;
    timelineHeader.appendChild(timelineTitle);

    const spanCount = blockSpanDays(block) || days.length;
    const spanLabel = document.createElement('span');
    spanLabel.className = 'block-board-timeline-span';
    spanLabel.textContent = `${spanCount} day${spanCount === 1 ? '' : 's'}`;
    timelineHeader.appendChild(spanLabel);

    timeline.appendChild(timelineHeader);

    const track = document.createElement('div');
    track.className = 'block-board-timeline-track';
    const todayKey = startOfDay(Date.now());
    timelineData.forEach(({ day, entries }) => {
      const column = document.createElement('div');
      column.className = 'block-board-timeline-column';
      if (day === todayKey) {
        column.classList.add('is-today');
      }
      const date = new Date(day);
      const isoDate = Number.isFinite(day) ? date.toISOString().slice(0, 10) : '';
      const tooltip = isoDate ? `${isoDate} • ${entries.length} due` : `${date.toLocaleDateString()} • ${entries.length} due`;
      column.setAttribute('data-count', String(entries.length));

      const bar = document.createElement('div');
      bar.className = 'block-board-timeline-bar';
      bar.title = tooltip;
      const count = entries.length;
      if (count > 0) {
        const gap = 2;
        let segmentHeight = TIMELINE_BASE_UNIT_HEIGHT;
        const gapTotal = gap * Math.max(0, count - 1);
        let totalHeight = segmentHeight * count + gapTotal;
        if (totalHeight > TIMELINE_MAX_BAR_HEIGHT) {
          const available = Math.max(TIMELINE_MAX_BAR_HEIGHT - gapTotal, TIMELINE_MIN_SEGMENT_HEIGHT * count);
          segmentHeight = Math.max(TIMELINE_MIN_SEGMENT_HEIGHT, available / count);
          totalHeight = segmentHeight * count + gapTotal;
        }
        bar.style.height = `${Math.max(totalHeight, TIMELINE_MIN_SEGMENT_HEIGHT)}px`;
        entries.forEach(entry => {
          const segment = document.createElement('div');
          segment.className = 'block-board-timeline-segment';
          segment.style.background = passColor(entry.order);
          segment.style.height = `${segmentHeight}px`;
          if (!entry.completed) {
            segment.classList.add('is-pending');
          }
          bar.appendChild(segment);
        });
      } else {
        bar.classList.add('is-empty');
      }
      column.appendChild(bar);

      const label = document.createElement('div');
      label.className = 'block-board-timeline-day';
      label.textContent = date.getDate();
      label.setAttribute('aria-hidden', 'true');
      column.appendChild(label);

      if (tooltip) {
        column.setAttribute('aria-label', tooltip);
      }

      track.appendChild(column);
    });
    timeline.appendChild(track);
    wrapper.appendChild(timeline);
  }

  if (isCollapsed) {
    container.appendChild(wrapper);
    return;
  }

  if (unscheduledEntries.length) {
    const backlog = document.createElement('div');
    backlog.className = 'block-board-backlog';
    const backlogTitle = document.createElement('h3');
    backlogTitle.className = 'block-board-backlog-title';
    backlogTitle.textContent = 'Needs a date';
    backlog.appendChild(backlogTitle);
    const backlogHint = document.createElement('p');
    backlogHint.className = 'block-board-backlog-hint';
    backlogHint.textContent = 'Drag a pass onto a day to schedule it.';
    backlog.appendChild(backlogHint);
    const backlogList = document.createElement('div');
    backlogList.className = 'block-board-backlog-list';
    unscheduledEntries.forEach(entry => {
      const card = createPassCard(entry);
      backlogList.appendChild(card);
    });
    backlog.appendChild(backlogList);
    wrapper.appendChild(backlog);
  }

  const board = document.createElement('div');
  board.className = 'block-board-grid';

  days.forEach(day => {
    const column = createDayColumn(day);
    const entries = assignments.get(day) || [];
    entries.forEach(entry => {
      const card = createPassCard(entry);
      column.querySelector('.block-board-day-list').appendChild(card);
    });
    attachDropHandlers(column, blockEntries, refresh);
    board.appendChild(column);
  });

  wrapper.appendChild(board);
  container.appendChild(wrapper);
}

export async function renderBlockBoard(container, refresh) {
  container.innerHTML = '';
  container.classList.add('block-board-container');

  const boardState = ensureBoardState();
  const { blocks } = await loadCatalog();
  if ((!Array.isArray(boardState.collapsedBlocks) || boardState.collapsedBlocks.length === 0) && Array.isArray(blocks)) {
    const activeBlockId = findActiveBlockId(blocks);
    if (activeBlockId) {
      const collapsedDefaults = blocks
        .map(block => String(block?.blockId ?? ''))
        .filter(id => id && id !== activeBlockId);
      if (collapsedDefaults.length) {
        setBlockBoardState({ collapsedBlocks: collapsedDefaults });
        boardState.collapsedBlocks = collapsedDefaults;
      }
    }
  }
  const lectures = await fetchLectures();
  const fallbackDays = collectDefaultBoardDays();

  const queues = groupLectureQueues(lectures);

  const urgentHost = document.createElement('div');
  renderUrgentQueues(urgentHost, queues, {
    onComplete: async (entry) => {
      const passOrder = entry?.pass?.order;
      const lecture = entry?.lecture;
      if (!lecture || !Number.isFinite(passOrder)) return;
      const passIndex = Array.isArray(lecture.passes)
        ? lecture.passes.findIndex(pass => pass?.order === passOrder)
        : -1;
      if (passIndex < 0) return;
      await updateLectureSchedule(lecture, lec => markPassCompleted(lec, passIndex));
      await renderBlockBoard(container, refresh);
    },
    onShift: async (entry, mode) => {
      if (!entry?.lecture) return;
      const lecture = entry.lecture;
      const passOrder = Number(entry?.pass?.order);
      if (!Number.isFinite(passOrder)) return;
      const lectureLabel = lecture?.name || `Lecture ${lecture?.id ?? ''}`;
      const passLabel = entry?.pass?.label || (Number.isFinite(passOrder) ? `Pass ${passOrder}` : 'Pass');
      const result = await openShiftDialog(mode, {
        description: `${lectureLabel} • ${passLabel}`,
        defaultUnit: 'days',
        defaultValue: 1
      });
      if (!result || !Number.isFinite(result.minutes) || result.minutes <= 0) return;
      const delta = mode === 'push' ? result.minutes : -result.minutes;
      try {
        await updateLectureSchedule(lecture, lec => shiftPassesForScope(lec, passOrder, delta, result.scope));
        await renderBlockBoard(container, refresh);
      } catch (err) {
        console.error('Failed to shift pass timing', err);
      }
    }
  });
  container.appendChild(urgentHost);

  const blockList = document.createElement('div');
  blockList.className = 'block-board-list';
  const refreshBoard = async () => {
    await renderBlockBoard(container, refresh);
  };
  const lecturesByBlock = new Map();
  lectures.forEach(lecture => {
    const key = String(lecture?.blockId ?? '');
    if (!lecturesByBlock.has(key)) lecturesByBlock.set(key, []);
    lecturesByBlock.get(key).push(lecture);
  });
  blocks.forEach(block => {
    const blockLectures = lecturesByBlock.get(String(block.blockId)) || [];
    const blockDays = collectDaysForBlock(block, blockLectures);
    const daysForBlock = blockDays.length ? blockDays : fallbackDays;
    renderBlockBoardBlock(blockList, block, blockLectures, daysForBlock, refreshBoard);
  });
  container.appendChild(blockList);
}
