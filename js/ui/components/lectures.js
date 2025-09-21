import { state, setLecturesState } from '../../state.js';
import { loadBlockCatalog, invalidateBlockCatalog } from '../../storage/block-catalog.js';
import { saveLecture, deleteLecture } from '../../storage/storage.js';
import { confirmModal } from './confirm.js';
import { debounce } from '../../utils.js';
import { DEFAULT_PASS_PLAN, EMPTY_PASS_PLAN_ID, clonePassPlan } from '../../lectures/scheduler.js';
import { LECTURE_PASS_ACTIONS } from '../../lectures/actions.js';
import { getSettings } from '../../storage/storage.js';

function ensureLectureState() {
  if (!state.lectures) {
    setLecturesState({});
  }
  return state.lectures;
}

function collectLectures(catalog) {
  const lists = catalog?.lectureLists || {};
  const result = [];
  for (const list of Object.values(lists)) {
    if (!Array.isArray(list)) continue;
    list.forEach(entry => {
      if (entry && typeof entry === 'object') {
        result.push({ ...entry });
      }
    });
  }
  return result;
}

function buildBlockOrderMap(blocks) {
  const order = new Map();
  blocks.forEach((block, index) => {
    if (!block || !block.blockId) return;
    order.set(block.blockId, index);
  });
  return order;
}

function normalizeWeekValue(value) {
  if (value == null || value === '') return '';
  return String(value);
}

function formatWeekLabel(week) {
  if (week == null || week === '') return '—';
  const num = Number(week);
  if (!Number.isFinite(num)) return String(week);
  return num === 0 ? '0' : `Week ${num}`;
}

function formatOffset(minutes) {
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

const PASS_ACCENTS = [
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

const PASS_DUE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric'
});

const PASS_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit'
});

function passAccent(order = 1) {
  if (!Number.isFinite(order)) return PASS_ACCENTS[0];
  const idx = Math.max(0, Math.floor(order) - 1) % PASS_ACCENTS.length;
  return PASS_ACCENTS[idx];
}

function formatPassDueTimestamp(due) {
  if (!Number.isFinite(due)) return '';
  const date = new Date(due);
  return `${PASS_DUE_FORMAT.format(date)} • ${PASS_TIME_FORMAT.format(date)}`;
}

function buildPassDisplayList(lecture) {
  const scheduleList = Array.isArray(lecture?.passPlan?.schedule)
    ? lecture.passPlan.schedule
    : [];
  const scheduleByOrder = new Map();
  scheduleList.forEach((step, index) => {
    const order = Number.isFinite(step?.order) ? step.order : index + 1;
    scheduleByOrder.set(order, { ...step, order });
  });
  const passes = Array.isArray(lecture?.passes) ? lecture.passes : [];
  const passByOrder = new Map();
  passes.forEach(pass => {
    const order = Number(pass?.order);
    if (Number.isFinite(order)) {
      passByOrder.set(order, pass);
    }
  });
  const orders = new Set([
    ...scheduleByOrder.keys(),
    ...passByOrder.keys()
  ]);
  if (!orders.size) {
    const planLength = scheduleList.length;
    for (let i = 1; i <= planLength; i += 1) {
      orders.add(i);
    }
  }
  return Array.from(orders)
    .filter(order => Number.isFinite(order))
    .sort((a, b) => a - b)
    .map(order => {
      const schedule = scheduleByOrder.get(order) || {};
      const pass = passByOrder.get(order) || {};
      return {
        order,
        label: schedule.label || pass.label || `Pass ${order}`,
        action: schedule.action || pass.action || '',
        due: Number.isFinite(pass?.due) ? pass.due : null,
        completedAt: Number.isFinite(pass?.completedAt) ? pass.completedAt : null
      };
    });
}

function createPassChipDisplay(info, now = Date.now()) {
  const chip = document.createElement('div');
  chip.className = 'lecture-pass-chip';
  chip.style.setProperty('--chip-accent', passAccent(info?.order));
  chip.dataset.passOrder = String(info?.order ?? '');
  if (Number.isFinite(info?.completedAt)) chip.classList.add('is-complete');
  if (!Number.isFinite(info?.completedAt) && Number.isFinite(info?.due) && info.due < now) {
    chip.classList.add('is-overdue');
  }

  const header = document.createElement('div');
  header.className = 'lecture-pass-chip-header';
  const badge = document.createElement('span');
  badge.className = 'lecture-pass-chip-order';
  badge.textContent = `P${info?.order ?? ''}`;
  header.appendChild(badge);
  const label = document.createElement('span');
  label.className = 'lecture-pass-chip-label';
  label.textContent = info?.action || info?.label || `Pass ${info?.order ?? ''}`;
  header.appendChild(label);
  chip.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'lecture-pass-chip-meta';
  let metaText = '';
  if (Number.isFinite(info?.completedAt)) {
    metaText = 'Completed';
  } else if (Number.isFinite(info?.due)) {
    metaText = formatPassDueTimestamp(info.due);
  } else {
    metaText = 'Unscheduled';
  }
  meta.textContent = metaText;
  chip.appendChild(meta);
  return chip;
}

const MAX_PASS_COUNT = 20;
const DAY_MINUTES = 24 * 60;

function defaultActionForIndex(index) {
  if (!Array.isArray(LECTURE_PASS_ACTIONS) || !LECTURE_PASS_ACTIONS.length) return '';
  const normalized = index % LECTURE_PASS_ACTIONS.length;
  return LECTURE_PASS_ACTIONS[Math.max(0, normalized)];
}

function baseSchedule(plan) {
  if (plan && Array.isArray(plan.schedule) && plan.schedule.length) {
    return plan.schedule;
  }
  return DEFAULT_PASS_PLAN.schedule;
}

function computeDefaultGap(schedule) {
  if (!Array.isArray(schedule) || schedule.length < 2) return DAY_MINUTES;
  const deltas = [];
  for (let i = 1; i < schedule.length; i += 1) {
    const prev = Number(schedule[i - 1]?.offsetMinutes);
    const current = Number(schedule[i]?.offsetMinutes);
    if (Number.isFinite(prev) && Number.isFinite(current)) {
      const delta = current - prev;
      if (delta > 0) deltas.push(delta);
    }
  }
  return deltas.length ? deltas[deltas.length - 1] : DAY_MINUTES;
}

function fallbackAnchor(index) {
  if (index === 0) return 'today';
  if (index === 1) return 'tomorrow';
  return 'upcoming';
}

function buildScheduleTemplate(plan, count) {
  const template = baseSchedule(plan);
  const safeCount = Math.max(0, Number(count) || 0);
  if (safeCount === 0) return [];
  const defaultGap = computeDefaultGap(template);
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
      : previous?.anchor || fallbackAnchor(i);
    const label = typeof source.label === 'string' && source.label.trim()
      ? source.label.trim()
      : `Pass ${order}`;
    const action = typeof source.action === 'string' && source.action.trim()
      ? source.action.trim()
      : defaultActionForIndex(i);
    schedule.push({
      order,
      offsetMinutes: offset,
      anchor,
      label,
      action
    });
  }
  return schedule;
}

function adjustPassConfigs(current, count, plan) {
  const template = buildScheduleTemplate(plan || { schedule: current }, count);
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

function clampPassCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_PASS_COUNT, Math.max(0, Math.round(parsed)));
}

function normalizeConfigEntry(config, index, previous) {
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
      : Number.isFinite(previous)
        ? previous
        : index === 0
          ? 0
          : (index * DAY_MINUTES);
  const anchor = typeof config.anchor === 'string' && config.anchor.trim()
    ? config.anchor.trim()
    : fallbackAnchor(index);
  const action = typeof config.action === 'string' && config.action.trim()
    ? config.action.trim()
    : defaultActionForIndex(index);
  return { order, label, offsetMinutes: offset, anchor, action };
}

function buildPassPlanPayload(passConfigs, existingPlan) {
  if (!Array.isArray(passConfigs) || !passConfigs.length) {
    return {
      id: EMPTY_PASS_PLAN_ID,
      allowEmpty: true,
      schedule: []
    };
  }
  const planId = existingPlan && typeof existingPlan.id === 'string' && existingPlan.id.trim()
    ? existingPlan.id.trim()
    : 'custom';
  let lastOffset = null;
  return {
    id: planId,
    schedule: passConfigs.map((config, index) => {
      const normalized = normalizeConfigEntry(config, index, lastOffset);
      if (Number.isFinite(normalized.offsetMinutes)) {
        lastOffset = normalized.offsetMinutes;
      } else {
        lastOffset = null;
      }
      return normalized;
    })
  };
}

const PASS_TIME_UNITS = [
  { value: 'minutes', label: 'Minutes', minutes: 1 },
  { value: 'hours', label: 'Hours', minutes: 60 },
  { value: 'days', label: 'Days', minutes: 60 * 24 },
  { value: 'weeks', label: 'Weeks', minutes: 60 * 24 * 7 }
];

function decomposeOffset(offsetMinutes) {
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

function composeOffset(value, unit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const unitConfig = PASS_TIME_UNITS.find(entry => entry.value === unit) || PASS_TIME_UNITS[2];
  return Math.round(numeric * unitConfig.minutes);
}

async function fetchDefaultPassPlan() {
  try {
    const settings = await getSettings();
    const passes = Array.isArray(settings?.plannerDefaults?.passes)
      ? settings.plannerDefaults.passes
      : null;
    if (!passes) {
      return clonePassPlan();
    }
    const schedule = passes.map((entry, index) => {
      const order = Number.isFinite(entry?.order) ? entry.order : index + 1;
      const label = typeof entry?.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : `Pass ${order}`;
      const offsetMinutes = Number.isFinite(entry?.offsetMinutes)
        ? entry.offsetMinutes
        : index === 0
          ? 0
          : (passes[index - 1]?.offsetMinutes ?? 0) + DAY_MINUTES;
      const anchor = typeof entry?.anchor === 'string' && entry.anchor.trim()
        ? entry.anchor.trim()
        : fallbackAnchor(index);
      const action = typeof entry?.action === 'string' && entry.action.trim()
        ? entry.action.trim()
        : defaultActionForIndex(index);
      return { order, label, offsetMinutes, anchor, action };
    });
    return {
      id: schedule.length ? 'custom' : EMPTY_PASS_PLAN_ID,
      allowEmpty: schedule.length === 0,
      schedule
    };
  } catch (err) {
    console.warn('Failed to load default pass plan', err);
    return clonePassPlan();
  }
}

function formatPassPlan(plan) {
  if (!plan || !Array.isArray(plan.schedule) || !plan.schedule.length) {
    return 'No pass plan';
  }
  const steps = plan.schedule
    .slice()
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .map(step => {
      const action = typeof step?.action === 'string' && step.action.trim()
        ? step.action.trim()
        : `Pass ${step?.order ?? ''}`;
      const offset = formatOffset(step?.offsetMinutes ?? 0);
      return `${action} (${offset})`;
    });
  return `Plan: ${steps.join(', ')}`;
}

function formatOverdue(due, now) {
  const diffMs = Math.max(0, now - due);
  if (diffMs < 60 * 1000) return 'due now';
  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 60) return `${minutes} min overdue`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr overdue`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} overdue`;
}

function formatTimeUntil(due, now) {
  const diffMs = Math.max(0, due - now);
  if (diffMs < 60 * 1000) return 'due in under a minute';
  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 60) return `due in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `due in ${hours} hr`;
  const days = Math.round(hours / 24);
  return `due in ${days} day${days === 1 ? '' : 's'}`;
}

function formatNextDue(nextDueAt, now = Date.now()) {
  if (nextDueAt == null) return 'Not scheduled';
  if (!Number.isFinite(nextDueAt)) return '—';
  if (nextDueAt <= now) return formatOverdue(nextDueAt, now);
  return formatTimeUntil(nextDueAt, now);
}

function formatNextDueDescriptor(nextDueAt, now = Date.now()) {
  if (nextDueAt == null || !Number.isFinite(nextDueAt)) return 'Not scheduled';
  const date = new Date(nextDueAt);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
  const relative = nextDueAt <= now ? formatOverdue(nextDueAt, now) : formatTimeUntil(nextDueAt, now);
  return `${dateLabel} • ${relative}`;
}

function formatPassSummary(lecture) {
  const total = Array.isArray(lecture?.passes)
    ? lecture.passes.length
    : Array.isArray(lecture?.passPlan?.schedule)
      ? lecture.passPlan.schedule.length
      : 0;
  const completed = Array.isArray(lecture?.passes)
    ? lecture.passes.filter(pass => Number.isFinite(pass?.completedAt)).length
    : lecture?.status?.completedPasses ?? 0;
  const stateLabel = lecture?.status?.state ? lecture.status.state : 'pending';
  return `${completed}/${total} passes • ${stateLabel}`;
}

function renderEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'lectures-empty';
  empty.textContent = 'No lectures found. Use “Add Lecture” to create one.';
  return empty;
}


function renderLectureRow(lecture, blockMap, onEdit, onDelete, now = Date.now()) {
  const row = document.createElement('tr');
  row.dataset.lectureRow = 'true';
  row.dataset.lectureId = String(lecture.id);
  row.dataset.blockId = String(lecture.blockId ?? '');

  const lectureCell = document.createElement('td');
  lectureCell.className = 'lecture-cell';
  const block = blockMap.get(lecture.blockId);

  const header = document.createElement('div');
  header.className = 'lecture-cell-header';

  const blockBadge = document.createElement('span');
  blockBadge.className = 'lecture-block';
  blockBadge.textContent = block?.title || lecture.blockId || 'Unknown block';
  if (block?.color) {
    blockBadge.style.setProperty('--block-accent', block.color);
    blockBadge.classList.add('has-accent');
  }
  header.appendChild(blockBadge);

  const name = document.createElement('div');
  name.className = 'lecture-name';
  name.textContent = lecture.name || `Lecture ${lecture.id}`;
  header.appendChild(name);

  lectureCell.appendChild(header);

  const positionValue = lecture.position ?? lecture.id;
  if (positionValue != null) {
    const meta = document.createElement('div');
    meta.className = 'lecture-position';
    meta.textContent = `Position: ${positionValue}`;
    lectureCell.appendChild(meta);
  }

  const tags = Array.isArray(lecture.tags) ? lecture.tags.filter(Boolean) : [];
  if (tags.length) {
    const tagList = document.createElement('div');
    tagList.className = 'lecture-tags';
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'lecture-tag';
      chip.textContent = tag;
      tagList.appendChild(chip);
    });
    lectureCell.appendChild(tagList);
  }

  row.appendChild(lectureCell);

  const scheduleCell = document.createElement('td');
  scheduleCell.className = 'lecture-schedule';

  const week = document.createElement('div');
  week.className = 'lecture-week';
  week.textContent = formatWeekLabel(lecture.week);
  scheduleCell.appendChild(week);

  const statusRow = document.createElement('div');
  statusRow.className = 'lecture-status-row';
  const statusBadge = document.createElement('span');
  statusBadge.className = 'lecture-status-pill';
  const statusLabel = lecture?.status?.state || 'pending';
  statusBadge.textContent = statusLabel;
  statusBadge.dataset.status = statusLabel;
  statusRow.appendChild(statusBadge);
  scheduleCell.appendChild(statusRow);

  const nextDue = document.createElement('div');
  nextDue.className = 'lecture-next-due';
  nextDue.textContent = formatNextDueDescriptor(lecture.nextDueAt, now);
  scheduleCell.appendChild(nextDue);

  row.appendChild(scheduleCell);

  const passesCell = document.createElement('td');
  passesCell.className = 'lecture-passes';

  const summary = document.createElement('div');
  summary.className = 'lecture-pass-summary';
  summary.textContent = formatPassSummary(lecture);
  passesCell.appendChild(summary);

  const passList = buildPassDisplayList(lecture);
  const chips = document.createElement('div');
  chips.className = 'lecture-pass-chips';
  if (passList.length) {
    passList.forEach(info => {
      chips.appendChild(createPassChipDisplay(info, now));
    });
  } else {
    const empty = document.createElement('div');
    empty.className = 'lecture-pass-empty';
    empty.textContent = 'No passes scheduled';
    chips.appendChild(empty);
  }
  passesCell.appendChild(chips);

  const planText = formatPassPlan(lecture.passPlan);
  if (planText) {
    const plan = document.createElement('div');
    plan.className = 'lecture-pass-plan';
    plan.textContent = planText;
    passesCell.appendChild(plan);
  }

  row.appendChild(passesCell);

  const actions = document.createElement('td');
  actions.className = 'lecture-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn secondary';
  editBtn.dataset.action = 'edit-lecture';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => onEdit(lecture));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn secondary';
  deleteBtn.dataset.action = 'delete-lecture';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => onDelete(lecture));
  actions.appendChild(deleteBtn);

  row.appendChild(actions);

  return row;
}

function renderLectureTable(blocks, lectures, onEdit, onDelete) {
  const card = document.createElement('section');
  card.className = 'card lectures-card';

  const table = document.createElement('table');
  table.className = 'table lectures-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Lecture', 'Schedule', 'Pass plan', 'Actions'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const blockMap = new Map(blocks.map(block => [block.blockId, block]));
  const orderMap = buildBlockOrderMap(blocks);
  const now = Date.now();
  const sorted = lectures
    .slice()
    .sort((a, b) => {
      const ao = orderMap.has(a.blockId) ? orderMap.get(a.blockId) : Number.POSITIVE_INFINITY;
      const bo = orderMap.has(b.blockId) ? orderMap.get(b.blockId) : Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      const aw = a.week ?? Number.POSITIVE_INFINITY;
      const bw = b.week ?? Number.POSITIVE_INFINITY;
      if (aw !== bw) return aw - bw;
      const an = (a.name || '').toLowerCase();
      const bn = (b.name || '').toLowerCase();
      if (an !== bn) return an.localeCompare(bn);
      return (a.id ?? 0) - (b.id ?? 0);
    });

  if (!sorted.length) {
    card.appendChild(renderEmptyState());
    return card;
  }

  sorted.forEach(lecture => {
    const row = renderLectureRow(
      { ...lecture, nextDueAt: lecture.nextDueAt ?? null, status: lecture.status, passPlan: lecture.passPlan },
      blockMap,
      onEdit,
      onDelete,
      now
    );
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

function uniqueStatusValues(lectures) {
  const set = new Set();
  lectures.forEach(lecture => {
    const state = lecture?.status?.state;
    if (state) set.add(state);
  });
  return Array.from(set);
}

function uniqueWeeks(lectures) {
  const set = new Set();
  lectures.forEach(lecture => {
    if (lecture.week == null) {
      set.add('');
    } else {
      set.add(String(lecture.week));
    }
  });
  return Array.from(set)
    .filter(value => value !== '')
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function applyFilters(lectures, filters) {
  const query = (filters.query || '').trim().toLowerCase();
  const blockId = (filters.blockId || '').trim();
  const weekFilter = (filters.week || '').trim();
  const statusFilter = (filters.status || '').trim();
  const tagFilter = (filters.tag || '').trim().toLowerCase();

  return lectures.filter(lecture => {
    if (blockId && String(lecture.blockId) !== blockId) return false;
    if (weekFilter) {
      const week = lecture.week == null ? '' : String(lecture.week);
      if (week !== weekFilter) return false;
    }
    if (statusFilter && statusFilter !== 'all') {
      const statusState = lecture?.status?.state || '';
      if (statusState !== statusFilter) return false;
    }
    if (query) {
      const actionTerms = Array.isArray(lecture?.passPlan?.schedule)
        ? lecture.passPlan.schedule.map(step => step?.action || '')
        : [];
      const haystacks = [lecture.name, lecture.id != null ? String(lecture.id) : '', lecture.blockId, ...actionTerms];
      if (!haystacks.some(value => String(value || '').toLowerCase().includes(query))) {
        return false;
      }
    }
    if (tagFilter) {
      const tags = Array.isArray(lecture.tags) ? lecture.tags : [];
      if (!tags.some(tag => String(tag).toLowerCase().includes(tagFilter))) {
        return false;
      }
    }
    return true;
  });
}

function buildToolbar(blocks, lectures, lectureLists, redraw) {
  const filters = ensureLectureState();
  const toolbar = document.createElement('div');
  toolbar.className = 'lectures-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Lecture filters');

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'input lectures-search';
  search.placeholder = 'Search lectures';
  search.value = filters.query || '';
  const debouncedSearch = debounce(value => {
    setLecturesState({ query: value });
    redraw();
  }, 150);
  search.addEventListener('input', e => {
    debouncedSearch(e.target.value);
  });
  toolbar.appendChild(search);

  const blockSelect = document.createElement('select');
  blockSelect.className = 'input lectures-filter';
  blockSelect.setAttribute('aria-label', 'Filter by block');
  const allBlocksOption = document.createElement('option');
  allBlocksOption.value = '';
  allBlocksOption.textContent = 'All blocks';
  blockSelect.appendChild(allBlocksOption);
  blocks.forEach(block => {
    if (!block || !block.blockId) return;
    const option = document.createElement('option');
    option.value = block.blockId;
    option.textContent = block.title || block.blockId;
    blockSelect.appendChild(option);
  });
  blockSelect.value = filters.blockId || '';
  blockSelect.addEventListener('change', () => {
    setLecturesState({ blockId: blockSelect.value });
    redraw();
  });
  toolbar.appendChild(blockSelect);

  const weekSelect = document.createElement('select');
  weekSelect.className = 'input lectures-filter';
  weekSelect.setAttribute('aria-label', 'Filter by week');
  const allWeeksOption = document.createElement('option');
  allWeeksOption.value = '';
  allWeeksOption.textContent = 'All weeks';
  weekSelect.appendChild(allWeeksOption);
  uniqueWeeks(lectures).forEach(week => {
    const option = document.createElement('option');
    option.value = String(week);
    option.textContent = `Week ${week}`;
    weekSelect.appendChild(option);
  });
  weekSelect.value = normalizeWeekValue(filters.week);
  weekSelect.addEventListener('change', () => {
    setLecturesState({ week: weekSelect.value });
    redraw();
  });
  toolbar.appendChild(weekSelect);

  const statuses = uniqueStatusValues(lectures);
  if (statuses.length) {
    const statusSelect = document.createElement('select');
    statusSelect.className = 'input lectures-filter';
    statusSelect.setAttribute('aria-label', 'Filter by status');
    const allStatusOption = document.createElement('option');
    allStatusOption.value = 'all';
    allStatusOption.textContent = 'All statuses';
    statusSelect.appendChild(allStatusOption);
    statuses.sort().forEach(status => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      statusSelect.appendChild(option);
    });
    statusSelect.value = filters.status || 'all';
    statusSelect.addEventListener('change', () => {
      setLecturesState({ status: statusSelect.value });
      redraw();
    });
    toolbar.appendChild(statusSelect);
  }

  const tagSearch = document.createElement('input');
  tagSearch.type = 'search';
  tagSearch.className = 'input lectures-tag-search';
  tagSearch.placeholder = 'Filter tags';
  tagSearch.value = filters.tag || '';
  const debouncedTag = debounce(value => {
    setLecturesState({ tag: value });
    redraw();
  }, 150);
  tagSearch.addEventListener('input', e => {
    debouncedTag(e.target.value);
  });
  toolbar.appendChild(tagSearch);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn primary lectures-add-btn';
  addBtn.dataset.action = 'add-lecture';
  addBtn.textContent = 'Add Lecture';
  addBtn.disabled = !blocks.length;
  addBtn.addEventListener('click', () => {
    const defaultBlockId = filters.blockId || (blocks[0]?.blockId || '');
    const dialog = openLectureDialog({
      mode: 'create',
      blocks,
      lectureLists,
      defaults: {
        blockId: defaultBlockId,
        name: '',
        week: '',
        passPlan: clonePassPlan()
      },
      onSubmit: async payload => {
        await saveLecture(payload);
        await invalidateBlockCatalog();
        await redraw();
      }
    });
    fetchDefaultPassPlan().then(plan => {
      if (plan && dialog && typeof dialog.updatePassPlan === 'function') {
        dialog.updatePassPlan(plan);
      }
    }).catch(err => {
      console.warn('Failed to apply default pass plan', err);
    });
  });
  toolbar.appendChild(addBtn);

  return toolbar;
}

function openLectureDialog(options) {
  const { mode, blocks, defaults = {}, lectureLists = {}, onSubmit } = options;
  const overlay = document.createElement('div');
  overlay.className = 'modal lecture-dialog';
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('h2');
  title.textContent = mode === 'edit' ? 'Edit lecture' : 'Add lecture';
  card.appendChild(title);

  const form = document.createElement('form');
  form.className = 'lecture-form';

  const blockField = document.createElement('label');
  blockField.textContent = 'Block';
  const blockSelect = document.createElement('select');
  blockSelect.className = 'input';
  blockSelect.dataset.field = 'blockId';
  blocks.forEach(block => {
    if (!block || !block.blockId) return;
    const option = document.createElement('option');
    option.value = block.blockId;
    option.textContent = block.title || block.blockId;
    blockSelect.appendChild(option);
  });
  blockSelect.value = defaults.blockId || (blocks[0]?.blockId || '');
  if (mode === 'edit') {
    blockSelect.disabled = true;
  }
  blockField.appendChild(blockSelect);
  const positionNote = document.createElement('div');
  positionNote.className = 'lecture-position-note';
  blockField.appendChild(positionNote);
  form.appendChild(blockField);

  const nameField = document.createElement('label');
  nameField.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.className = 'input';
  nameInput.dataset.field = 'name';
  nameInput.value = defaults.name ?? '';
  nameField.appendChild(nameInput);
  form.appendChild(nameField);

  const weekField = document.createElement('label');
  weekField.textContent = 'Week';
  const weekInput = document.createElement('input');
  weekInput.type = 'number';
  weekInput.className = 'input';
  weekInput.dataset.field = 'week';
  if (defaults.week != null && defaults.week !== '') {
    weekInput.value = defaults.week;
  }
  weekField.appendChild(weekInput);
  form.appendChild(weekField);

  let passPlanTemplate = defaults.passPlan;
  const initialSchedule = Array.isArray(passPlanTemplate?.schedule) ? passPlanTemplate.schedule : [];
  const isEmptyPlan = passPlanTemplate?.id === EMPTY_PASS_PLAN_ID || passPlanTemplate?.allowEmpty;
  const fallbackCount = isEmptyPlan
    ? 0
    : (initialSchedule.length || DEFAULT_PASS_PLAN.schedule.length);
  let passConfigs = adjustPassConfigs(initialSchedule, fallbackCount, passPlanTemplate);

  const passSection = document.createElement('section');
  passSection.className = 'lecture-pass-section';

  const passHeader = document.createElement('div');
  passHeader.className = 'lecture-pass-section-header';
  const passTitle = document.createElement('h3');
  passTitle.textContent = 'Pass plan';
  passHeader.appendChild(passTitle);
  passSection.appendChild(passHeader);

  const passCountField = document.createElement('label');
  passCountField.className = 'lecture-pass-count-field';
  passCountField.textContent = 'Number of passes';
  const passCountInput = document.createElement('input');
  passCountInput.type = 'number';
  passCountInput.min = '0';
  passCountInput.max = String(MAX_PASS_COUNT);
  passCountInput.className = 'input';
  passCountInput.value = String(passConfigs.length);
  passCountField.appendChild(passCountInput);
  passSection.appendChild(passCountField);

  const passSummary = document.createElement('div');
  passSummary.className = 'lecture-pass-editor';
  passSection.appendChild(passSummary);

  const advancedControls = document.createElement('div');
  advancedControls.className = 'lecture-pass-advanced-controls';
  const advancedToggle = document.createElement('button');
  advancedToggle.type = 'button';
  advancedToggle.className = 'btn tertiary lecture-pass-advanced-toggle';
  advancedToggle.textContent = 'Advanced settings';
  advancedControls.appendChild(advancedToggle);
  passSection.appendChild(advancedControls);

  const advancedSection = document.createElement('div');
  advancedSection.className = 'lecture-pass-advanced';
  const advancedNote = document.createElement('p');
  advancedNote.className = 'lecture-pass-advanced-note';
  advancedNote.textContent = 'Customize the learning method and timing for each pass.';
  advancedSection.appendChild(advancedNote);
  const advancedList = document.createElement('div');
  advancedList.className = 'lecture-pass-advanced-list';
  advancedSection.appendChild(advancedList);
  passSection.appendChild(advancedSection);

  form.appendChild(passSection);

  let advancedOpen = false;

  function refreshPassPlanTemplate() {
    if (passConfigs.length) {
      passPlanTemplate = {
        ...(passPlanTemplate || {}),
        id: passPlanTemplate?.id || 'custom',
        schedule: passConfigs.map(config => ({ ...config }))
      };
    } else {
      passPlanTemplate = {
        id: EMPTY_PASS_PLAN_ID,
        allowEmpty: true,
        schedule: []
      };
    }
  }

  function updatePositionNote() {
    if (mode === 'edit') {
      if (defaults.id != null) {
        positionNote.textContent = `Position: ${defaults.id}`;
      } else {
        positionNote.textContent = '';
      }
      return;
    }
    const activeBlock = blockSelect.value.trim();
    if (!activeBlock) {
      positionNote.textContent = '';
      return;
    }
    const list = Array.isArray(lectureLists[activeBlock]) ? lectureLists[activeBlock] : [];
    let maxId = 0;
    for (const entry of list) {
      const value = Number(entry?.id);
      if (Number.isFinite(value) && value > maxId) {
        maxId = value;
      }
    }
    positionNote.textContent = `Next position in block: ${maxId + 1}`;
  }

  function renderPassSummary() {
    passSummary.innerHTML = '';
    if (!passConfigs.length) {
      const empty = document.createElement('div');
      empty.className = 'lecture-pass-empty';
      empty.textContent = 'No passes scheduled.';
      passSummary.appendChild(empty);
      return;
    }
    passConfigs.forEach((config, index) => {
      const row = document.createElement('div');
      row.className = 'lecture-pass-row';

      const label = document.createElement('span');
      label.className = 'lecture-pass-label';
      label.textContent = `Pass ${index + 1}`;
      row.appendChild(label);

      const method = document.createElement('span');
      method.className = 'lecture-pass-method';
      method.textContent = config.action || defaultActionForIndex(index) || '—';
      row.appendChild(method);

      const timing = document.createElement('span');
      timing.className = 'lecture-pass-offset';
      const timingLabel = Number.isFinite(config.offsetMinutes)
        ? formatOffset(config.offsetMinutes)
        : 'Unscheduled';
      timing.textContent = `Timing: ${timingLabel}`;
      row.appendChild(timing);

      passSummary.appendChild(row);
    });
  }

  function rebuildAdvancedRows() {
    advancedList.innerHTML = '';
    if (!passConfigs.length) {
      const empty = document.createElement('div');
      empty.className = 'lecture-pass-empty';
      empty.textContent = 'No passes to configure.';
      advancedList.appendChild(empty);
      return;
    }
    passConfigs.forEach((config, index) => {
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
        const value = event.target.value;
        passConfigs[index] = { ...passConfigs[index], action: value };
        refreshPassPlanTemplate();
        renderPassSummary();
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
      const { value: offsetValue, unit } = decomposeOffset(config.offsetMinutes ?? 0);
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
        ? `Current: ${formatOffset(config.offsetMinutes)}`
        : 'Current: Unscheduled';
      offsetWrap.appendChild(preview);

      function applyOffsetUpdate() {
        const minutes = composeOffset(offsetInput.value, unitSelect.value);
        if (minutes == null) {
          passConfigs[index] = { ...passConfigs[index], offsetMinutes: null };
          preview.textContent = 'Current: Unscheduled';
        } else {
          passConfigs[index] = { ...passConfigs[index], offsetMinutes: minutes };
          preview.textContent = `Current: ${formatOffset(minutes)}`;
        }
        refreshPassPlanTemplate();
        renderPassSummary();
      }

      offsetInput.addEventListener('input', applyOffsetUpdate);
      unitSelect.addEventListener('change', applyOffsetUpdate);

      timingField.appendChild(offsetWrap);
      row.appendChild(timingField);

      advancedList.appendChild(row);
    });
  }

  function renderPassEditor(forceAdvancedRebuild = false) {
    renderPassSummary();
    advancedToggle.disabled = passConfigs.length === 0;
    advancedToggle.setAttribute('aria-expanded', advancedOpen && passConfigs.length ? 'true' : 'false');
    if (!passConfigs.length) {
      advancedSection.hidden = true;
      advancedSection.classList.remove('is-open');
      advancedList.innerHTML = '';
      return;
    }
    if (advancedOpen) {
      advancedSection.hidden = false;
      advancedSection.classList.add('is-open');
      if (forceAdvancedRebuild || !advancedList.childElementCount) {
        rebuildAdvancedRows();
      } else {
        // Update headers in case counts changed
        Array.from(advancedList.querySelectorAll('.lecture-pass-advanced-header')).forEach((header, idx) => {
          header.textContent = `Pass ${idx + 1}`;
        });
      }
    } else {
      advancedSection.hidden = true;
      advancedSection.classList.remove('is-open');
      advancedList.innerHTML = '';
    }
  }

  renderPassEditor(true);
  refreshPassPlanTemplate();

  function handlePassCountChange() {
    const next = clampPassCount(passCountInput.value);
    passCountInput.value = String(next);
    passConfigs = adjustPassConfigs(passConfigs, next, passPlanTemplate);
    if (next > 0) {
      advancedOpen = true;
    }
    refreshPassPlanTemplate();
    renderPassEditor(true);
  }

  passCountInput.addEventListener('input', handlePassCountChange);
  passCountInput.addEventListener('change', handlePassCountChange);

  advancedToggle.addEventListener('click', () => {
    if (!passConfigs.length) return;
    advancedOpen = !advancedOpen;
    renderPassEditor(true);
  });

  function applyPassPlan(plan) {
    if (!plan || !document.body.contains(overlay)) return;
    const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
    const isEmpty = plan.id === EMPTY_PASS_PLAN_ID || plan.allowEmpty || schedule.length === 0;
    passPlanTemplate = plan;
    const nextCount = isEmpty ? 0 : schedule.length;
    passConfigs = adjustPassConfigs(schedule, nextCount, plan);
    passCountInput.value = String(passConfigs.length);
    refreshPassPlanTemplate();
    renderPassEditor(true);
  }

  if (mode !== 'edit') {
    blockSelect.addEventListener('change', () => {
      updatePositionNote();
    });
  }

  updatePositionNote();

  const actions = document.createElement('div');
  actions.className = 'row lecture-dialog-actions';
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn';
  submitBtn.textContent = mode === 'edit' ? 'Save changes' : 'Add lecture';
  actions.appendChild(submitBtn);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const blockId = blockSelect.value.trim();
    const name = nameInput.value.trim();
    const weekValue = weekInput.value;
    const week = weekValue === '' ? null : Number(weekValue);
    if (!blockId || !name || (weekValue !== '' && Number.isNaN(week))) {
      return;
    }
    const passPlan = buildPassPlanPayload(passConfigs, defaults.passPlan);
    const payload = {
      blockId,
      name,
      week,
      passPlan
    };
    if (mode === 'edit') {
      payload.id = defaults.id;
    }
    await onSubmit(payload);
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  });

  card.appendChild(form);
  overlay.appendChild(card);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
  document.body.appendChild(overlay);
  nameInput.focus();

  return {
    updatePassPlan: applyPassPlan
  };
}

function handleEdit(lecture, blocks, lectureLists, redraw) {
  openLectureDialog({
    mode: 'edit',
    blocks,
    lectureLists,
    defaults: {
      blockId: lecture.blockId,
      id: lecture.id,
      name: lecture.name || '',
      week: lecture.week ?? '',
      passPlan: lecture.passPlan
    },
    onSubmit: async payload => {
      await saveLecture({
        blockId: lecture.blockId,
        id: lecture.id,
        name: payload.name,
        week: payload.week,
        passPlan: payload.passPlan
      });
      await invalidateBlockCatalog();
      await redraw();
    }
  });
}

function handleDelete(lecture, redraw) {
  (async () => {
    if (!(await confirmModal('Delete lecture?'))) return;
    await deleteLecture(lecture.blockId, lecture.id);
    await invalidateBlockCatalog();
    await redraw();
  })();
}

export async function renderLectures(root, redraw) {
  const catalog = await loadBlockCatalog();
  const filters = ensureLectureState();
  const blocks = (catalog.blocks || []).map(block => ({ ...block }));
  const allLectures = collectLectures(catalog);
  const lectureLists = catalog.lectureLists || {};
  const filtered = applyFilters(allLectures, filters);

  root.innerHTML = '';
  const layout = document.createElement('div');
  layout.className = 'lectures-view';
  root.appendChild(layout);

  const toolbar = buildToolbar(blocks, allLectures, lectureLists, redraw);
  layout.appendChild(toolbar);

  const table = renderLectureTable(
    blocks,
    filtered,
    lecture => handleEdit(lecture, blocks, lectureLists, redraw),
    lecture => handleDelete(lecture, redraw)
  );
  layout.appendChild(table);
}
