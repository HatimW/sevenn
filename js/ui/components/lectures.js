import { state, setLecturesState } from '../../state.js';
import { loadBlockCatalog, invalidateBlockCatalog } from '../../storage/block-catalog.js';
import { saveLecture, deleteLecture, getSettings } from '../../storage/storage.js';
import { confirmModal } from './confirm.js';
import { debounce } from '../../utils.js';
import { DEFAULT_PASS_PLAN, clonePassPlan, plannerDefaultsToPassPlan } from '../../lectures/scheduler.js';
import { LECTURE_PASS_ACTIONS } from '../../lectures/actions.js';

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
    order.set(String(block.blockId), index);
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

const OFFSET_UNITS = [
  { id: 'minutes', label: 'minutes', minutes: 1 },
  { id: 'hours', label: 'hours', minutes: 60 },
  { id: 'days', label: 'days', minutes: 60 * 24 },
  { id: 'weeks', label: 'weeks', minutes: 60 * 24 * 7 }
];

function normalizeOffsetUnit(id) {
  const fallback = OFFSET_UNITS[2];
  if (typeof id !== 'string') return fallback.id;
  const match = OFFSET_UNITS.find(option => option.id === id);
  return match ? match.id : fallback.id;
}

function splitOffsetMinutes(minutes) {
  const value = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  if (value === 0) {
    return { value: 0, unit: 'days' };
  }
  const preferred = [...OFFSET_UNITS].reverse().find(option => value % option.minutes === 0);
  if (preferred) {
    return { value: Math.round(value / preferred.minutes), unit: preferred.id };
  }
  if (value < 60) {
    return { value, unit: 'minutes' };
  }
  if (value < 60 * 24) {
    return { value: Math.round(value / 60), unit: 'hours' };
  }
  return { value: Math.round(value / (60 * 24)), unit: 'days' };
}

function combineOffsetValueUnit(value, unitId) {
  const normalizedUnit = normalizeOffsetUnit(unitId);
  const option = OFFSET_UNITS.find(entry => entry.id === normalizedUnit) || OFFSET_UNITS[2];
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(numeric * option.minutes));
}

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

function describePassCountdown(due, now = Date.now()) {
  if (!Number.isFinite(due)) return 'Unscheduled';
  const diffMs = due - now;
  const dayMs = 24 * 60 * 60 * 1000;
  if (Math.abs(diffMs) < dayMs) {
    return diffMs >= 0 ? 'Due today' : 'Overdue today';
  }
  if (diffMs > 0) {
    const days = Math.ceil(diffMs / dayMs);
    return days === 1 ? 'In 1 day' : `In ${days} days`;
  }
  const overdueDays = Math.ceil(Math.abs(diffMs) / dayMs);
  return overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`;
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
        completedAt: Number.isFinite(pass?.completedAt) ? pass.completedAt : null,
        offsetMinutes: Number.isFinite(schedule?.offsetMinutes) ? schedule.offsetMinutes : null,
        anchor: schedule.anchor || pass.anchor || null
      };
    });
}

function createPassChipDisplay(info, now = Date.now()) {
  const chip = document.createElement('div');
  chip.className = 'lecture-pass-chip';
  chip.style.setProperty('--chip-accent', passAccent(info?.order));
  chip.dataset.passOrder = String(info?.order ?? '');
  chip.setAttribute('role', 'button');
  chip.tabIndex = 0;
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

  const functionLine = document.createElement('div');
  functionLine.className = 'lecture-pass-chip-function';
  functionLine.textContent = info?.action || info?.label || '';
  chip.appendChild(functionLine);

  const timing = document.createElement('div');
  timing.className = 'lecture-pass-chip-due';
  timing.textContent = Number.isFinite(info?.due)
    ? formatPassDueTimestamp(info.due)
    : 'No scheduled date';
  chip.appendChild(timing);

  const countdown = document.createElement('div');
  countdown.className = 'lecture-pass-chip-countdown';
  countdown.textContent = describePassCountdown(info?.due, now);
  chip.appendChild(countdown);
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
  if (plan && Array.isArray(plan.schedule)) {
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
  const numericCount = Number(count);
  const safeCount = Math.max(0, Number.isFinite(numericCount) ? Math.round(numericCount) : 0);
  const defaultGap = computeDefaultGap(template);
  const schedule = [];
  for (let i = 0; i < safeCount; i += 1) {
    const source = template[i] || {};
    const previous = schedule[i - 1] || null;
    const order = i + 1;
    const offset = Number.isFinite(source.offsetMinutes)
      ? source.offsetMinutes
      : previous
        ? previous.offsetMinutes + defaultGap
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
  const byOrder = new Map();
  (Array.isArray(current) ? current : []).forEach(entry => {
    const order = Number(entry?.order);
    if (Number.isFinite(order) && !byOrder.has(order)) {
      byOrder.set(order, entry);
    }
  });
  return template.map((step, index) => {
    const existing = byOrder.get(step.order) || current[index] || {};
    const action = typeof existing?.action === 'string' && existing.action.trim()
      ? existing.action.trim()
      : step.action;
    const offsetMinutes = Number.isFinite(existing?.offsetMinutes)
      ? Math.max(0, Math.round(existing.offsetMinutes))
      : step.offsetMinutes;
    const anchor = typeof existing?.anchor === 'string' && existing.anchor.trim()
      ? existing.anchor.trim()
      : step.anchor;
    const label = typeof existing?.label === 'string' && existing.label.trim()
      ? existing.label.trim()
      : step.label;
    return { ...step, action, offsetMinutes, anchor, label };
  });
}

function clampPassCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_PASS_COUNT, Math.max(0, Math.round(parsed)));
}

function buildPassPlanPayload(passConfigs, existingPlan) {
  const planId = existingPlan && typeof existingPlan.id === 'string' && existingPlan.id.trim()
    ? existingPlan.id.trim()
    : 'custom';
  return {
    id: planId,
    schedule: passConfigs.map((config, index) => {
      const order = index + 1;
      const label = typeof config.label === 'string' && config.label.trim()
        ? config.label.trim()
        : `Pass ${order}`;
      const offset = Number.isFinite(config.offsetMinutes)
        ? Math.max(0, Math.round(config.offsetMinutes))
        : index === 0
          ? 0
          : (passConfigs[index - 1]?.offsetMinutes ?? 0) + DAY_MINUTES;
      const anchor = typeof config.anchor === 'string' && config.anchor.trim()
        ? config.anchor.trim()
        : fallbackAnchor(index);
      const action = typeof config.action === 'string' && config.action.trim()
        ? config.action.trim()
        : defaultActionForIndex(index);
      return {
        order,
        label,
        offsetMinutes: offset,
        anchor,
        action
      };
    })
  };
}

function formatPassPlan(plan) {
  if (!plan || !Array.isArray(plan.schedule) || !plan.schedule.length) {
    return 'No passes scheduled';
  }
  const steps = plan.schedule
    .slice()
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .map(step => {
      const action = typeof step?.action === 'string' && step.action.trim()
        ? step.action.trim()
        : `Pass ${step?.order ?? ''}`;
      const offset = formatOffset(step?.offsetMinutes ?? 0);
      return `${action} • ${offset}`;
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


function computeLecturePassStats(lecture) {
  const passes = Array.isArray(lecture?.passes) ? lecture.passes : [];
  const scheduled = Array.isArray(lecture?.passPlan?.schedule) ? lecture.passPlan.schedule.length : 0;
  const statusTotal = Number.isFinite(lecture?.status?.totalPasses) ? lecture.status.totalPasses : 0;
  let planned = Math.max(scheduled, passes.length, statusTotal);
  const completedFromPasses = passes.filter(pass => Number.isFinite(pass?.completedAt)).length;
  const completedFromStatus = Number.isFinite(lecture?.status?.completedPasses)
    ? lecture.status.completedPasses
    : 0;
  const completed = Math.max(completedFromPasses, completedFromStatus);
  planned = Math.max(planned, completed);
  const remaining = Math.max(0, planned - completed);
  return { planned, completed, remaining };
}

function summarizeLectures(lectures) {
  return (Array.isArray(lectures) ? lectures : []).reduce(
    (acc, lecture) => {
      const stats = computeLecturePassStats(lecture);
      acc.totalPasses += stats.planned;
      acc.completed += stats.completed;
      return acc;
    },
    { totalPasses: 0, completed: 0 }
  );
}

function formatPassTotals(summary) {
  if (!summary || summary.totalPasses === 0) return '0 passes planned';
  return `${summary.completed}/${summary.totalPasses} passes complete`;
}

function labelForWeekKey(weekKey) {
  if (weekKey === '__no-week') return 'No week assigned';
  return formatWeekLabel(weekKey);
}

function sortLecturesForDisplay(lectures) {
  return (Array.isArray(lectures) ? lectures : []).slice().sort((a, b) => {
    const posA = Number(a?.position);
    const posB = Number(b?.position);
    const posAValid = Number.isFinite(posA);
    const posBValid = Number.isFinite(posB);
    if (posAValid && posBValid && posA !== posB) return posA - posB;
    if (posAValid && !posBValid) return -1;
    if (!posAValid && posBValid) return 1;
    const nameA = (a?.name || '').toLowerCase();
    const nameB = (b?.name || '').toLowerCase();
    if (nameA && nameB && nameA !== nameB) return nameA.localeCompare(nameB);
    const idA = Number(a?.id);
    const idB = Number(b?.id);
    if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) return idA - idB;
    return 0;
  });
}

function resolveNextDueAt(lecture) {
  if (Number.isFinite(lecture?.nextDueAt)) return lecture.nextDueAt;
  const passes = Array.isArray(lecture?.passes) ? lecture.passes : [];
  for (const pass of passes) {
    if (!pass || Number.isFinite(pass?.completedAt)) continue;
    if (Number.isFinite(pass?.due)) return pass.due;
  }
  return null;
}

function getLectureState(lecture, stats) {
  if (lecture?.status?.state) return lecture.status.state;
  const counts = stats || computeLecturePassStats(lecture);
  if (!counts.planned) return 'unscheduled';
  if (counts.completed >= counts.planned) return 'complete';
  if (counts.completed > 0) return 'in-progress';
  return 'pending';
}

function renderLectureWeekRow(lecture, onEdit, onDelete, onEditPass, now = Date.now()) {
  const row = document.createElement('tr');
  row.dataset.lectureRow = 'true';
  row.dataset.lectureId = String(lecture.id);
  row.dataset.blockId = String(lecture.blockId ?? '');

  const stats = computeLecturePassStats(lecture);
  const stateLabel = getLectureState(lecture, stats);

  const overviewCell = document.createElement('td');
  overviewCell.className = 'lecture-overview';

  const header = document.createElement('div');
  header.className = 'lecture-overview-header';

  const name = document.createElement('span');
  name.className = 'lecture-name';
  name.textContent = lecture.name || `Lecture ${lecture.id}`;
  header.appendChild(name);

  const status = document.createElement('span');
  status.className = 'lecture-status-pill';
  status.dataset.status = stateLabel;
  status.textContent = stateLabel;
  header.appendChild(status);

  overviewCell.appendChild(header);

  if (lecture.position != null) {
    const position = document.createElement('div');
    position.className = 'lecture-overview-position';
    position.textContent = `Position: ${lecture.position}`;
    overviewCell.appendChild(position);
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
    overviewCell.appendChild(tagList);
  }

  const metrics = document.createElement('div');
  metrics.className = 'lecture-overview-metrics';

  const completedMetric = document.createElement('span');
  completedMetric.className = 'lecture-metric lecture-metric-complete';
  completedMetric.textContent = `${stats.completed} complete`;
  metrics.appendChild(completedMetric);

  const remainingMetric = document.createElement('span');
  remainingMetric.className = 'lecture-metric lecture-metric-remaining';
  remainingMetric.textContent = `${stats.remaining} remaining`;
  metrics.appendChild(remainingMetric);

  overviewCell.appendChild(metrics);

  row.appendChild(overviewCell);

  const passesCell = document.createElement('td');
  passesCell.className = 'lecture-passes-cell';
  const passScroller = document.createElement('div');
  passScroller.className = 'lecture-pass-scroller';
  const passList = buildPassDisplayList(lecture);
  if (!passList.length) {
    const empty = document.createElement('div');
    empty.className = 'lecture-pass-empty';
    empty.textContent = 'No passes planned';
    passScroller.appendChild(empty);
  } else {
    passList.forEach(info => {
      const chip = createPassChipDisplay(info, now);
      chip.addEventListener('click', () => onEditPass(lecture, info));
      chip.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEditPass(lecture, info);
        }
      });
      passScroller.appendChild(chip);
    });
  }
  passesCell.appendChild(passScroller);
  row.appendChild(passesCell);

  const nextDueCell = document.createElement('td');
  nextDueCell.className = 'lecture-next-cell';
  nextDueCell.textContent = formatNextDueDescriptor(resolveNextDueAt(lecture), now);
  row.appendChild(nextDueCell);

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

function renderLectureTable(blocks, lectures, filters, onEdit, onDelete, onEditPass) {
  const card = document.createElement('section');
  card.className = 'card lectures-card';

  const title = document.createElement('h2');
  title.textContent = 'Lectures';
  card.appendChild(title);

  if (!lectures.length) {
    card.appendChild(renderEmptyState());
    return card;
  }

  const blockMap = new Map();
  blocks.forEach(block => {
    if (!block || block.blockId == null) return;
    blockMap.set(String(block.blockId), block);
  });
  const orderMap = buildBlockOrderMap(blocks);
  const blockFilter = String(filters?.blockId || '').trim();
  const weekFilter = String(filters?.week || '').trim();
  const now = Date.now();

  const blockGroups = new Map();

  lectures.forEach(lecture => {
    if (!lecture) return;
    const rawBlockId = lecture.blockId == null || lecture.blockId === '' ? '' : lecture.blockId;
    const key = rawBlockId === '' ? '__no-block' : String(rawBlockId);
    if (!blockGroups.has(key)) {
      const blockInfo = blockMap.get(String(rawBlockId));
      const fallbackTitle = rawBlockId === '' ? 'No block assigned' : `Block ${rawBlockId}`;
      blockGroups.set(key, {
        key,
        blockId: rawBlockId,
        block: blockInfo || { blockId: rawBlockId, title: blockInfo?.title || fallbackTitle, color: blockInfo?.color || null },
        lectures: [],
        weeks: new Map()
      });
    }
    const group = blockGroups.get(key);
    group.lectures.push(lecture);
    const weekKey = lecture.week == null || lecture.week === '' ? '__no-week' : String(lecture.week);
    if (!group.weeks.has(weekKey)) {
      group.weeks.set(weekKey, []);
    }
    group.weeks.get(weekKey).push(lecture);
  });

  const groupsContainer = document.createElement('div');
  groupsContainer.className = 'lectures-groups';

  const sortedGroups = Array.from(blockGroups.values()).sort((a, b) => {
    const ao = orderMap.has(a.blockId) ? orderMap.get(a.blockId) : orderMap.get(String(a.blockId)) ?? Number.POSITIVE_INFINITY;
    const bo = orderMap.has(b.blockId) ? orderMap.get(b.blockId) : orderMap.get(String(b.blockId)) ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    const nameA = (a.block?.title || a.block?.name || String(a.blockId || '') || '').toLowerCase();
    const nameB = (b.block?.title || b.block?.name || String(b.blockId || '') || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  sortedGroups.forEach(group => {
    const blockDetails = document.createElement('details');
    blockDetails.className = 'lectures-block-group';
    blockDetails.dataset.blockId = String(group.blockId ?? '');
    const blockInfo = group.block || {};
    if (blockInfo.color) {
      blockDetails.style.setProperty('--block-accent', blockInfo.color);
      blockDetails.classList.add('has-accent');
    }

    const blockSummary = document.createElement('summary');
    blockSummary.className = 'lectures-block-summary';

    const blockTitle = document.createElement('span');
    blockTitle.className = 'lectures-block-name';
    blockTitle.textContent = blockInfo.title || blockInfo.name || (group.blockId ? `Block ${group.blockId}` : 'No block assigned');
    blockSummary.appendChild(blockTitle);

    const blockStats = summarizeLectures(group.lectures);
    const blockCounts = document.createElement('span');
    blockCounts.className = 'lectures-block-counts';
    const lectureCount = group.lectures.length;
    const lectureLabel = `${lectureCount} lecture${lectureCount === 1 ? '' : 's'}`;
    blockCounts.textContent = `${lectureLabel} • ${formatPassTotals(blockStats)}`;
    blockSummary.appendChild(blockCounts);

    blockDetails.appendChild(blockSummary);

    const weekWrapper = document.createElement('div');
    weekWrapper.className = 'lectures-week-groups';

    const sortedWeeks = Array.from(group.weeks.entries()).sort((aEntry, bEntry) => {
      const [aKey] = aEntry;
      const [bKey] = bEntry;
      if (aKey === '__no-week' && bKey === '__no-week') return 0;
      if (aKey === '__no-week') return 1;
      if (bKey === '__no-week') return -1;
      const aNum = Number(aKey);
      const bNum = Number(bKey);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
      if (Number.isFinite(aNum) && !Number.isFinite(bNum)) return -1;
      if (!Number.isFinite(aNum) && Number.isFinite(bNum)) return 1;
      return String(aKey).localeCompare(String(bKey));
    });

    sortedWeeks.forEach(([weekKey, weekLectures]) => {
      const weekDetails = document.createElement('details');
      weekDetails.className = 'lectures-week-group';
      const normalizedWeek = weekKey === '__no-week' ? '' : weekKey;
      weekDetails.dataset.week = normalizedWeek;
      weekDetails.open = !weekFilter || weekFilter === normalizedWeek;

      const weekSummary = document.createElement('summary');
      weekSummary.className = 'lectures-week-summary';

      const weekTitle = document.createElement('span');
      weekTitle.className = 'lectures-week-title';
      weekTitle.textContent = labelForWeekKey(weekKey);
      weekSummary.appendChild(weekTitle);

      const weekStats = summarizeLectures(weekLectures);
      const weekCounts = document.createElement('span');
      weekCounts.className = 'lectures-week-counts';
      const weekLectureCount = weekLectures.length;
      const weekLectureLabel = `${weekLectureCount} lecture${weekLectureCount === 1 ? '' : 's'}`;
      weekCounts.textContent = `${weekLectureLabel} • ${formatPassTotals(weekStats)}`;
      weekSummary.appendChild(weekCounts);

      weekDetails.appendChild(weekSummary);

      const weekBody = document.createElement('div');
      weekBody.className = 'lectures-week-body';

      const table = document.createElement('table');
      table.className = 'lectures-week-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      [
        { label: 'Lecture', className: 'lectures-col-lecture' },
        { label: 'Passes', className: 'lectures-col-passes' },
        { label: 'Next due', className: 'lectures-col-next' },
        { label: 'Actions', className: 'lectures-col-actions' }
      ].forEach(column => {
        const th = document.createElement('th');
        th.textContent = column.label;
        if (column.className) th.classList.add(column.className);
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      sortLecturesForDisplay(weekLectures).forEach(entry => {
        const row = renderLectureWeekRow(entry, onEdit, onDelete, onEditPass, now);
        tbody.appendChild(row);
      });
      table.appendChild(tbody);

      weekBody.appendChild(table);
      weekDetails.appendChild(weekBody);
      weekWrapper.appendChild(weekDetails);
    });

    const shouldOpenBlock = !blockFilter || blockFilter === String(group.blockId ?? '') || sortedGroups.length === 1;
    blockDetails.open = shouldOpenBlock;

    blockDetails.appendChild(weekWrapper);
    groupsContainer.appendChild(blockDetails);
  });

  card.appendChild(groupsContainer);
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

function buildToolbar(blocks, lectures, lectureLists, redraw, defaultPassPlan) {
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
  addBtn.className = 'btn primary add-lecture-btn';
  addBtn.dataset.action = 'add-lecture';
  addBtn.disabled = !blocks.length;
  const addIcon = document.createElement('span');
  addIcon.className = 'add-lecture-btn-icon';
  addIcon.textContent = '+';
  const addLabel = document.createElement('span');
  addLabel.className = 'add-lecture-btn-label';
  addLabel.textContent = 'Add lecture';
  addBtn.append(addIcon, addLabel);
  addBtn.addEventListener('click', () => {
    const defaultBlockId = filters.blockId || (blocks[0]?.blockId || '');
    const passPlanTemplate = clonePassPlan(
      defaultPassPlan && Array.isArray(defaultPassPlan.schedule) ? defaultPassPlan : undefined
    );
    openLectureDialog({
      mode: 'create',
      blocks,
      lectureLists,
      defaults: {
        blockId: defaultBlockId,
        name: '',
        week: '',
        passPlan: passPlanTemplate
      },
      onSubmit: async payload => {
        await saveLecture(payload);
        await invalidateBlockCatalog();
        await redraw();
      }
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
  nameInput.placeholder = 'Lecture name';
  nameInput.className = 'input';
  nameInput.dataset.field = 'name';
  nameInput.value = defaults.name ?? '';
  nameField.appendChild(nameInput);
  form.appendChild(nameField);

  const weekField = document.createElement('label');
  weekField.textContent = 'Week';
  const weekInput = document.createElement('input');
  weekInput.type = 'number';
  weekInput.min = '0';
  weekInput.className = 'input';
  weekInput.placeholder = 'Week number (optional)';
  weekInput.dataset.field = 'week';
  if (defaults.week != null && defaults.week !== '') {
    weekInput.value = defaults.week;
  }
  weekField.appendChild(weekInput);
  form.appendChild(weekField);

  const planTemplate = defaults.passPlan && Array.isArray(defaults.passPlan.schedule)
    ? defaults.passPlan
    : clonePassPlan();
  const initialSchedule = Array.isArray(planTemplate.schedule) ? planTemplate.schedule : [];
  const defaultFallbackCount = Array.isArray(DEFAULT_PASS_PLAN.schedule)
    ? DEFAULT_PASS_PLAN.schedule.length
    : 0;
  const initialCount = clampPassCount(
    initialSchedule.length > 0
      ? initialSchedule.length
      : defaults.passPlan
        ? 0
        : defaultFallbackCount
  );
  let passConfigs = adjustPassConfigs(initialSchedule, initialCount, planTemplate);

  const passCountField = document.createElement('label');
  passCountField.className = 'lecture-pass-count';
  passCountField.textContent = 'Planned passes';
  const passCountInput = document.createElement('input');
  passCountInput.type = 'number';
  passCountInput.min = '0';
  passCountInput.max = String(MAX_PASS_COUNT);
  passCountInput.className = 'input';
  passCountInput.value = String(passConfigs.length);
  passCountField.appendChild(passCountInput);
  const passHelp = document.createElement('span');
  passHelp.className = 'lecture-pass-help';
  passHelp.textContent = 'Set how many times you want to revisit this lecture.';
  passCountField.appendChild(passHelp);
  form.appendChild(passCountField);

  const passSummary = document.createElement('div');
  passSummary.className = 'lecture-pass-summary-line';
  form.appendChild(passSummary);

  const advanced = document.createElement('details');
  advanced.className = 'lecture-pass-advanced';
  if (mode === 'edit') {
    advanced.open = true;
  }
  const advancedSummary = document.createElement('summary');
  advancedSummary.textContent = `Advanced pass settings (${passConfigs.length})`;
  advanced.appendChild(advancedSummary);

  const advancedHint = document.createElement('p');
  advancedHint.className = 'lecture-pass-advanced-hint';
  advancedHint.textContent = 'Tune the pass function and timing for each pass.';
  advanced.appendChild(advancedHint);

  const passList = document.createElement('div');
  passList.className = 'lecture-pass-editor';
  advanced.appendChild(passList);
  form.appendChild(advanced);

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

  function updatePassSummary() {
    if (!passConfigs.length) {
      passSummary.textContent = 'No passes scheduled for this lecture.';
    } else {
      const planPreview = buildPassPlanPayload(passConfigs, planTemplate);
      const previewText = formatPassPlan(planPreview);
      const cleaned = previewText.startsWith('Plan: ')
        ? previewText.slice(6)
        : previewText;
      passSummary.textContent = `${passConfigs.length} pass${passConfigs.length === 1 ? '' : 'es'} • ${cleaned}`;
    }
    advancedSummary.textContent = `Advanced pass settings (${passConfigs.length})`;
  }

  function renderPassEditor() {
    passList.innerHTML = '';
    if (!passConfigs.length) {
      const empty = document.createElement('div');
      empty.className = 'lecture-pass-empty';
      empty.textContent = 'No passes planned. Increase the pass count to build a schedule.';
      passList.appendChild(empty);
      updatePassSummary();
      return;
    }
    passConfigs.forEach((config, index) => {
      const row = document.createElement('div');
      row.className = 'lecture-pass-row';

      const label = document.createElement('div');
      label.className = 'lecture-pass-label';
      label.textContent = `Pass ${index + 1}`;
      row.appendChild(label);

      const controls = document.createElement('div');
      controls.className = 'lecture-pass-controls';

      const actionField = document.createElement('div');
      actionField.className = 'lecture-pass-field';
      const actionLabel = document.createElement('span');
      actionLabel.className = 'lecture-pass-field-label';
      actionLabel.textContent = 'Pass function';
      actionField.appendChild(actionLabel);
      const select = document.createElement('select');
      select.className = 'input lecture-pass-action';
      LECTURE_PASS_ACTIONS.forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = action;
        select.appendChild(option);
      });
      if (config.action && !LECTURE_PASS_ACTIONS.includes(config.action)) {
        const custom = document.createElement('option');
        custom.value = config.action;
        custom.textContent = config.action;
        select.appendChild(custom);
      }
      select.value = config.action || '';
      select.addEventListener('change', event => {
        const value = event.target.value;
        passConfigs[index] = { ...passConfigs[index], action: value };
        updatePassSummary();
      });
      actionField.appendChild(select);
      controls.appendChild(actionField);

      const offsetField = document.createElement('div');
      offsetField.className = 'lecture-pass-field lecture-pass-offset-field';
      const offsetLabel = document.createElement('span');
      offsetLabel.className = 'lecture-pass-field-label';
      offsetLabel.textContent = 'Timing';
      offsetField.appendChild(offsetLabel);

      const offsetInputs = document.createElement('div');
      offsetInputs.className = 'lecture-pass-offset-inputs';
      const split = splitOffsetMinutes(config.offsetMinutes ?? 0);
      const offsetInput = document.createElement('input');
      offsetInput.type = 'number';
      offsetInput.min = '0';
      offsetInput.step = '1';
      offsetInput.className = 'input lecture-pass-offset-value';
      offsetInput.value = String(split.value);
      const unitSelect = document.createElement('select');
      unitSelect.className = 'input lecture-pass-offset-unit';
      OFFSET_UNITS.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.id;
        opt.textContent = option.label;
        unitSelect.appendChild(opt);
      });
      unitSelect.value = split.unit;
      offsetInputs.appendChild(offsetInput);
      offsetInputs.appendChild(unitSelect);
      offsetField.appendChild(offsetInputs);

      const preview = document.createElement('span');
      preview.className = 'lecture-pass-offset-preview';
      preview.textContent = formatOffset(config.offsetMinutes ?? 0);
      offsetField.appendChild(preview);

      function commitOffset() {
        const minutes = combineOffsetValueUnit(offsetInput.value, unitSelect.value);
        passConfigs[index] = {
          ...passConfigs[index],
          offsetMinutes: minutes
        };
        preview.textContent = formatOffset(passConfigs[index].offsetMinutes ?? 0);
        updatePassSummary();
      }

      offsetInput.addEventListener('change', () => {
        const numeric = Number(offsetInput.value);
        if (!Number.isFinite(numeric) || numeric < 0) {
          offsetInput.value = '0';
        }
        commitOffset();
      });
      offsetInput.addEventListener('blur', () => {
        const numeric = Math.max(0, Math.round(Number(offsetInput.value) || 0));
        offsetInput.value = String(numeric);
        commitOffset();
      });
      unitSelect.addEventListener('change', commitOffset);

      controls.appendChild(offsetField);
      row.appendChild(controls);
      passList.appendChild(row);
    });

    updatePassSummary();
  }

  renderPassEditor();

  passCountInput.addEventListener('change', () => {
    const next = clampPassCount(passCountInput.value);
    passCountInput.value = String(next);
    passConfigs = adjustPassConfigs(passConfigs, next, planTemplate);
    renderPassEditor();
  });

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

function passScopeModal(mode) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal lecture-pass-scope-modal';

    const card = document.createElement('div');
    card.className = 'card lecture-pass-scope-card';

    const title = document.createElement('h3');
    title.textContent = mode === 'push'
      ? 'Push pass timing'
      : 'Pull pass timing';
    card.appendChild(title);

    const message = document.createElement('p');
    message.textContent = mode === 'push'
      ? 'Choose how far the push should ripple.'
      : 'Choose how far the pull should ripple.';
    card.appendChild(message);

    const buttons = document.createElement('div');
    buttons.className = 'row lecture-pass-scope-buttons';

    const single = document.createElement('button');
    single.className = 'btn secondary';
    single.textContent = 'Only this pass';
    single.addEventListener('click', () => {
      cleanup('single');
    });

    const cascade = document.createElement('button');
    cascade.className = 'btn';
    cascade.textContent = mode === 'push' ? 'This & following' : 'This & preceding';
    cascade.addEventListener('click', () => {
      cleanup(mode === 'push' ? 'chain-after' : 'chain-before');
    });

    const cancel = document.createElement('button');
    cancel.className = 'btn secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      cleanup(null);
    });

    buttons.appendChild(single);
    buttons.appendChild(cascade);
    buttons.appendChild(cancel);
    card.appendChild(buttons);

    overlay.appendChild(card);

    function cleanup(result) {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      resolve(result);
    }

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });

    document.body.appendChild(overlay);
    single.focus();
  });
}

function clampOffsetMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function cloneLecturePasses(lecture) {
  return Array.isArray(lecture?.passes)
    ? lecture.passes.map(pass => ({ ...pass }))
    : [];
}

function normalizeSchedule(plan) {
  return Array.isArray(plan?.schedule)
    ? plan.schedule.map(step => ({ ...step }))
    : [];
}

async function updatePassFunction(lecture, order, action, redraw) {
  if (!lecture || lecture.blockId == null || lecture.id == null) return;
  const plan = clonePassPlan(lecture.passPlan || {});
  const schedule = normalizeSchedule(plan);
  const step = schedule.find(entry => Number(entry?.order) === Number(order));
  if (!step) return;
  step.action = action;
  const passes = cloneLecturePasses(lecture);
  const pass = passes.find(entry => Number(entry?.order) === Number(order));
  if (pass) {
    pass.action = action;
  }
  plan.schedule = schedule;
  await saveLecture({
    blockId: lecture.blockId,
    id: lecture.id,
    passPlan: plan,
    passes
  });
  await invalidateBlockCatalog();
  await redraw();
}

async function shiftPassTiming(lecture, order, deltaMinutes, scope, redraw) {
  if (!lecture || lecture.blockId == null || lecture.id == null) return;
  if (!Number.isFinite(deltaMinutes) || deltaMinutes === 0) return;
  const plan = clonePassPlan(lecture.passPlan || {});
  const schedule = normalizeSchedule(plan);
  if (!schedule.length) return;

  const targetOrder = Number(order);
  if (!Number.isFinite(targetOrder)) return;

  const affectedOrders = new Set();
  schedule.forEach(step => {
    const currentOrder = Number(step?.order);
    if (!Number.isFinite(currentOrder)) return;
    if (scope === 'chain-after' && currentOrder >= targetOrder) {
      affectedOrders.add(currentOrder);
    } else if (scope === 'chain-before' && currentOrder <= targetOrder) {
      affectedOrders.add(currentOrder);
    } else if (!scope || scope === 'single') {
      if (currentOrder === targetOrder) affectedOrders.add(currentOrder);
    }
  });
  if (!affectedOrders.size) affectedOrders.add(targetOrder);

  schedule.forEach(step => {
    const currentOrder = Number(step?.order);
    if (!Number.isFinite(currentOrder)) return;
    const offset = clampOffsetMinutes(step.offsetMinutes);
    if (affectedOrders.has(currentOrder)) {
      step.offsetMinutes = Math.max(0, offset + deltaMinutes);
    } else {
      step.offsetMinutes = offset;
    }
  });

  const minuteMs = 60 * 1000;
  const passMap = new Map();
  cloneLecturePasses(lecture).forEach(pass => {
    const orderKey = Number(pass?.order);
    if (Number.isFinite(orderKey) && !passMap.has(orderKey)) {
      passMap.set(orderKey, { ...pass });
    }
  });

  affectedOrders.forEach(orderKey => {
    const pass = passMap.get(orderKey);
    if (pass && Number.isFinite(pass.due)) {
      const nextDue = Math.max(0, Math.round(pass.due + deltaMinutes * minuteMs));
      pass.due = nextDue;
      passMap.set(orderKey, pass);
    }
  });

  const decorated = schedule.map((step, index) => ({
    ...step,
    originalOrder: Number(step?.order) || index + 1,
    offsetMinutes: clampOffsetMinutes(step.offsetMinutes)
  }));

  decorated.sort((a, b) => {
    if (a.offsetMinutes !== b.offsetMinutes) return a.offsetMinutes - b.offsetMinutes;
    return a.originalOrder - b.originalOrder;
  });

  const newSchedule = [];
  const reassignedPasses = [];
  decorated.forEach((entry, index) => {
    const newOrder = index + 1;
    const base = { ...entry };
    delete base.originalOrder;
    base.order = newOrder;
    newSchedule.push(base);
    const pass = passMap.get(entry.originalOrder);
    if (pass) {
      pass.order = newOrder;
      reassignedPasses.push(pass);
      passMap.delete(entry.originalOrder);
    }
  });

  passMap.forEach(pass => {
    reassignedPasses.push(pass);
  });

  reassignedPasses.sort((a, b) => {
    const ao = Number(a?.order) || 0;
    const bo = Number(b?.order) || 0;
    return ao - bo;
  });

  plan.schedule = newSchedule;

  await saveLecture({
    blockId: lecture.blockId,
    id: lecture.id,
    passPlan: plan,
    passes: reassignedPasses
  });
  await invalidateBlockCatalog();
  await redraw();
}

function openPassEditDialog({ lecture, passInfo, onUpdateAction, onShift }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal lecture-pass-modal';

  const card = document.createElement('div');
  card.className = 'card lecture-pass-card';

  const title = document.createElement('h2');
  const passLabel = passInfo?.label || `Pass ${passInfo?.order ?? ''}`;
  title.textContent = `Edit ${passLabel}`;
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'lecture-pass-meta';

  const dateLine = document.createElement('div');
  dateLine.className = 'lecture-pass-meta-line';
  dateLine.textContent = Number.isFinite(passInfo?.due)
    ? formatPassDueTimestamp(passInfo.due)
    : 'No scheduled date';
  meta.appendChild(dateLine);

  const countdownLine = document.createElement('div');
  countdownLine.className = 'lecture-pass-meta-line';
  countdownLine.textContent = describePassCountdown(passInfo?.due);
  meta.appendChild(countdownLine);

  card.appendChild(meta);

  const actionField = document.createElement('label');
  actionField.className = 'lecture-pass-modal-field';
  actionField.textContent = 'Pass function';
  const actionInput = document.createElement('input');
  actionInput.type = 'text';
  actionInput.className = 'input';
  actionInput.value = passInfo?.action || passInfo?.label || '';
  const actionListId = `pass-action-${lecture.blockId}-${lecture.id}-${passInfo?.order}`
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const actionDatalist = document.createElement('datalist');
  actionDatalist.id = actionListId;
  LECTURE_PASS_ACTIONS.forEach(action => {
    const option = document.createElement('option');
    option.value = action;
    actionDatalist.appendChild(option);
  });
  actionInput.setAttribute('list', actionListId);
  actionField.appendChild(actionInput);
  actionField.appendChild(actionDatalist);
  card.appendChild(actionField);

  const adjustSection = document.createElement('section');
  adjustSection.className = 'lecture-pass-adjust';

  const adjustTitle = document.createElement('h3');
  adjustTitle.textContent = 'Adjust timing';
  adjustSection.appendChild(adjustTitle);

  const adjustControls = document.createElement('div');
  adjustControls.className = 'lecture-pass-adjust-controls';

  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.className = 'input lecture-pass-adjust-value';
  amountInput.min = '0';
  amountInput.step = '1';
  amountInput.value = '1';

  const unitSelect = document.createElement('select');
  unitSelect.className = 'input lecture-pass-adjust-unit';
  OFFSET_UNITS.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.id;
    opt.textContent = option.label;
    unitSelect.appendChild(opt);
  });
  unitSelect.value = 'days';

  adjustControls.appendChild(amountInput);
  adjustControls.appendChild(unitSelect);
  adjustSection.appendChild(adjustControls);

  const adjustButtons = document.createElement('div');
  adjustButtons.className = 'lecture-pass-adjust-buttons';

  const pushBtn = document.createElement('button');
  pushBtn.type = 'button';
  pushBtn.className = 'btn';
  pushBtn.textContent = 'Push later';

  const pullBtn = document.createElement('button');
  pullBtn.type = 'button';
  pullBtn.className = 'btn secondary';
  pullBtn.textContent = 'Pull earlier';

  adjustButtons.appendChild(pushBtn);
  adjustButtons.appendChild(pullBtn);
  adjustSection.appendChild(adjustButtons);

  card.appendChild(adjustSection);

  const feedback = document.createElement('div');
  feedback.className = 'lecture-pass-feedback';
  card.appendChild(feedback);

  const actions = document.createElement('div');
  actions.className = 'row lecture-pass-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save function';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = 'Close';

  actions.appendChild(saveBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  overlay.appendChild(card);

  function showMessage(message) {
    feedback.textContent = message || '';
    if (message) {
      feedback.classList.add('is-visible');
    } else {
      feedback.classList.remove('is-visible');
    }
  }

  let busy = false;

  function setBusy(value) {
    busy = Boolean(value);
    saveBtn.disabled = busy;
    pushBtn.disabled = busy;
    pullBtn.disabled = busy;
  }

  function close() {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }

  async function handleSave() {
    if (busy) return;
    const value = actionInput.value.trim();
    if (!value) {
      showMessage('Enter a function for this pass.');
      return;
    }
    setBusy(true);
    try {
      await onUpdateAction(value);
      close();
    } catch (err) {
      console.error(err);
      showMessage('Failed to update pass. Please try again.');
      setBusy(false);
    }
  }

  async function handleShift(mode) {
    if (busy) return;
    const amount = Number(amountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage('Enter how much to adjust the pass by.');
      return;
    }
    const minutes = combineOffsetValueUnit(amount, unitSelect.value);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      showMessage('Pick a timing greater than zero.');
      return;
    }
    const scope = await passScopeModal(mode);
    if (!scope) return;
    const delta = mode === 'push' ? minutes : -minutes;
    setBusy(true);
    try {
      await onShift(delta, scope);
      close();
    } catch (err) {
      console.error(err);
      showMessage('Failed to adjust timing. Please try again.');
      setBusy(false);
    }
  }

  saveBtn.addEventListener('click', handleSave);
  pushBtn.addEventListener('click', () => handleShift('push'));
  pullBtn.addEventListener('click', () => handleShift('pull'));
  closeBtn.addEventListener('click', close);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      close();
    }
  });

  document.body.appendChild(overlay);
  actionInput.focus();
}

function handlePassEdit(lecture, passInfo, redraw) {
  if (!lecture || !passInfo) return;
  openPassEditDialog({
    lecture,
    passInfo,
    onUpdateAction: action => updatePassFunction(lecture, passInfo.order, action, redraw),
    onShift: (delta, scope) => shiftPassTiming(lecture, passInfo.order, delta, scope, redraw)
  });
}

export async function renderLectures(root, redraw) {
  const [catalog, settings] = await Promise.all([
    loadBlockCatalog(),
    getSettings()
  ]);
  const filters = ensureLectureState();
  const blocks = (catalog.blocks || []).map(block => ({ ...block }));
  const allLectures = collectLectures(catalog);
  const lectureLists = catalog.lectureLists || {};
  const filtered = applyFilters(allLectures, filters);
  const defaultPassPlan = plannerDefaultsToPassPlan(settings?.plannerDefaults);

  root.innerHTML = '';
  const layout = document.createElement('div');
  layout.className = 'lectures-view';
  root.appendChild(layout);

  const toolbar = buildToolbar(blocks, allLectures, lectureLists, redraw, defaultPassPlan);
  layout.appendChild(toolbar);

  const table = renderLectureTable(
    blocks,
    filtered,
    filters,
    lecture => handleEdit(lecture, blocks, lectureLists, redraw),
    lecture => handleDelete(lecture, redraw),
    (lecture, pass) => handlePassEdit(lecture, pass, redraw)
  );
  layout.appendChild(table);
}
