import { state, setBlockBoardState } from '../../state.js';
import { loadBlockCatalog } from '../../storage/block-catalog.js';
import { listAllLectures, saveLecture } from '../../storage/storage.js';
import {
  groupLectureQueues,
  markPassCompleted,
  shiftLecturePasses,
  deriveLectureStatus,
  calculateNextDue
} from '../../lectures/scheduler.js';

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

function buildPassElement(entry, onComplete, onDelay) {
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

  const delay = document.createElement('button');
  delay.type = 'button';
  delay.className = 'btn tertiary';
  delay.textContent = '+1 day';
  delay.addEventListener('click', () => onDelay(entry));
  actions.appendChild(delay);

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

function buildDensityGradient(byOrder, total) {
  if (!total) return 'linear-gradient(to top, var(--accent) 0% 100%)';
  const entries = Array.from(byOrder.entries())
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([a], [b]) => Number(a) - Number(b));
  if (!entries.length) {
    return 'linear-gradient(to top, var(--accent) 0% 100%)';
  }
  let traversed = 0;
  const segments = entries.map(([order, count]) => {
    const start = (traversed / total) * 100;
    traversed += count;
    const end = (traversed / total) * 100;
    const color = passColor(order);
    return `${color} ${start}% ${end}%`;
  });
  return `linear-gradient(to top, ${segments.join(', ')})`;
}

function createDensityBar(dayStat, isToday, maxTotal) {
  const bar = document.createElement('div');
  bar.className = 'block-board-density-bar';
  if (isToday) bar.classList.add('today');
  const total = Number(dayStat?.total ?? 0);
  bar.style.setProperty('--density-value', String(total));
  const fill = document.createElement('div');
  fill.className = 'block-board-density-fill';
  const height = maxTotal > 0 ? Math.min(100, Math.round((total / maxTotal) * 100)) : 0;
  fill.style.height = `${height}%`;
  const gradient = buildDensityGradient(dayStat?.byOrder || new Map(), total);
  fill.style.background = gradient;
  bar.appendChild(fill);
  return bar;
}

function createDensityLegend(dayStat, isToday, maxTotal) {
  const slot = document.createElement('div');
  slot.className = 'block-board-density-slot';
  if (isToday) slot.classList.add('today');
  const bar = createDensityBar(dayStat, isToday, maxTotal);
  if (Number.isFinite(dayStat?.day)) {
    const displayDate = new Date(dayStat.day);
    slot.title = displayDate.toLocaleDateString();
  }
  slot.appendChild(bar);
  const label = document.createElement('div');
  label.className = 'block-board-density-label';
  label.textContent = new Date(dayStat.day).getDate();
  slot.appendChild(label);
  return slot;
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

    if (entries.length) {
      const pushAll = document.createElement('button');
      pushAll.type = 'button';
      pushAll.className = 'btn tertiary block-board-summary-action';
      pushAll.textContent = 'Push to tomorrow';
      pushAll.addEventListener('click', () => handlers.onPushAll(key));
      header.appendChild(pushAll);
    }

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
        const chip = buildPassElement(entry, handlers.onComplete, handlers.onDelay);
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
    const dayStats = days.map(day => {
      const entries = assignments.get(day) || [];
      const breakdown = new Map();
      entries.forEach(entry => {
        const order = Number(entry?.pass?.order);
        if (!Number.isFinite(order)) return;
        breakdown.set(order, (breakdown.get(order) || 0) + 1);
      });
      return { day, total: entries.length, byOrder: breakdown };
    });
    const maxTotal = dayStats.reduce((max, stat) => Math.max(max, stat.total), 0);
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

    const density = document.createElement('div');
    density.className = 'block-board-density';
    dayStats.forEach(stat => {
      const slot = createDensityLegend(stat, startOfDay(Date.now()) === stat.day, Math.max(1, maxTotal));
      density.appendChild(slot);
    });
    timeline.appendChild(density);
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

  const { blocks } = await loadCatalog();
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
    onDelay: async (entry) => {
      const lecture = entry?.lecture;
      if (!lecture) return;
      await updateLectureSchedule(lecture, lec => shiftLecturePasses(lec, 24 * 60));
      await renderBlockBoard(container, refresh);
    },
    onPushAll: async (bucket) => {
      const entries = queues[bucket] || [];
      const affected = new Set();
      for (const entry of entries) {
        if (!entry?.lecture) continue;
        const key = `${entry.lecture.blockId}-${entry.lecture.id}`;
        if (affected.has(key)) continue;
        affected.add(key);
        await updateLectureSchedule(entry.lecture, lec => shiftLecturePasses(lec, 24 * 60));
      }
      await renderBlockBoard(container, refresh);
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
