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
  'var(--teal)'
];
const BOARD_DAYS = 14;

function ensureBoardState() {
  if (!state.blockBoard) {
    state.blockBoard = { collapsedBlocks: [], showDensity: true };
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

function formatDueTime(due) {
  if (!Number.isFinite(due)) return 'Unscheduled';
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return formatter.format(new Date(due));
}

function collectBoardDays(now = Date.now()) {
  const today = startOfDay(now);
  const start = today - 2 * DAY_MS;
  return Array.from({ length: BOARD_DAYS }, (_, idx) => start + idx * DAY_MS);
}

function buildPassElement(entry, onComplete, onDelay) {
  const chip = document.createElement('div');
  chip.className = 'block-board-pass-chip';
  chip.style.setProperty('--chip-accent', passColor(entry?.pass?.order));
  const title = document.createElement('div');
  title.className = 'block-board-pass-title';
  title.textContent = entry?.lecture?.name || `Lecture ${entry?.lecture?.id}`;
  chip.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'block-board-pass-meta';
  const label = entry?.pass?.label || `Pass ${entry?.pass?.order ?? ''}`;
  const action = entry?.pass?.action ? ` • ${entry.pass.action}` : '';
  const dueLabel = formatDueTime(entry?.pass?.due);
  meta.textContent = `${label}${action ? action : ''} • ${dueLabel}`;
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

function createDensityBar(dayCount, isToday) {
  const bar = document.createElement('div');
  bar.className = 'block-board-density-bar';
  if (isToday) bar.classList.add('today');
  bar.style.setProperty('--density-value', String(dayCount));
  const fill = document.createElement('div');
  fill.className = 'block-board-density-fill';
  fill.style.height = `${Math.min(100, dayCount * 12)}%`;
  bar.appendChild(fill);
  return bar;
}

function createDensityLegend(day, count, isToday) {
  const slot = document.createElement('div');
  slot.className = 'block-board-density-slot';
  if (isToday) slot.classList.add('today');
  const bar = createDensityBar(count, isToday);
  slot.appendChild(bar);
  const label = document.createElement('div');
  label.className = 'block-board-density-label';
  label.textContent = new Date(day).getDate();
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
  const action = entry?.pass?.action ? ` • ${entry.pass.action}` : '';
  card.innerHTML = `<div class="card-title">${entry?.lecture?.name || 'Lecture'}</div>`
    + `<div class="card-meta">${(entry?.pass?.label || '')}${action}</div>`;
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
  wrapper.className = 'block-board-urgent';
  const config = [
    { key: 'overdue', label: 'Overdue' },
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' }
  ];
  config.forEach(({ key, label }) => {
    const group = document.createElement('div');
    group.className = 'block-board-urgent-group';
    const header = document.createElement('div');
    header.className = 'block-board-urgent-header';
    header.textContent = label;
    const pushAll = document.createElement('button');
    pushAll.type = 'button';
    pushAll.className = 'btn tertiary';
    pushAll.textContent = 'Push all +1 day';
    pushAll.addEventListener('click', () => handlers.onPushAll(key));
    header.appendChild(pushAll);
    group.appendChild(header);

    const list = document.createElement('div');
    list.className = 'block-board-urgent-list';
    const entries = queues[key] || [];
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'block-board-empty';
      empty.textContent = 'Nothing queued.';
      list.appendChild(empty);
    } else {
      entries.forEach(entry => {
        const chip = buildPassElement(entry, handlers.onComplete, handlers.onDelay);
        list.appendChild(chip);
      });
    }
    group.appendChild(list);
    wrapper.appendChild(group);
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
  if (!assignments.has('unscheduled')) assignments.set('unscheduled', []);
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

  const header = document.createElement('div');
  header.className = 'block-board-block-header';
  const title = document.createElement('h2');
  title.textContent = block?.title || block?.name || `Block ${block?.blockId}`;
  header.appendChild(title);
  const controls = document.createElement('div');
  controls.className = 'block-board-block-controls';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'btn secondary';
  const isCollapsed = boardState.collapsedBlocks.includes(String(block?.blockId));
  collapseBtn.textContent = isCollapsed ? 'Expand' : 'Collapse';
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
  const densityBtn = document.createElement('button');
  densityBtn.type = 'button';
  densityBtn.className = 'btn secondary';
  densityBtn.textContent = boardState.showDensity ? 'Hide density' : 'Show density';
  densityBtn.addEventListener('click', () => {
    setBlockBoardState({ showDensity: !ensureBoardState().showDensity });
    refresh();
  });
  controls.appendChild(densityBtn);
  header.appendChild(controls);
  wrapper.appendChild(header);

  if (boardState.showDensity) {
    const density = document.createElement('div');
    density.className = 'block-board-density';
    const counts = days.map(day => {
      const start = day;
      const end = day + DAY_MS;
      let total = 0;
      blockLectures.forEach(lecture => {
        const passes = Array.isArray(lecture?.passes) ? lecture.passes : [];
        passes.forEach(pass => {
          if (Number.isFinite(pass?.completedAt)) return;
          if (!Number.isFinite(pass?.due)) return;
          if (pass.due >= start && pass.due < end) total += 1;
        });
      });
      return total;
    });
    counts.forEach((count, idx) => {
      const day = days[idx];
      const slot = createDensityLegend(day, count, startOfDay(Date.now()) === day);
      density.appendChild(slot);
    });
    wrapper.appendChild(density);
  }

  if (isCollapsed) {
    container.appendChild(wrapper);
    return;
  }

  const assignments = buildDayAssignments(blockLectures, days);
  const board = document.createElement('div');
  board.className = 'block-board-grid';

  const unscheduled = document.createElement('div');
  unscheduled.className = 'block-board-unscheduled';
  const unscheduledHeader = document.createElement('div');
  unscheduledHeader.className = 'block-board-day-header';
  unscheduledHeader.textContent = 'Unscheduled';
  unscheduled.appendChild(unscheduledHeader);
  const unscheduledList = document.createElement('div');
  unscheduledList.className = 'block-board-day-list';
  (assignments.get('unscheduled') || []).forEach(entry => {
    const card = createPassCard(entry);
    unscheduledList.appendChild(card);
  });
  unscheduled.appendChild(unscheduledList);
  board.appendChild(unscheduled);

  const blockEntries = [];
  assignments.forEach(entries => {
    entries.forEach(entry => blockEntries.push(entry));
  });

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
  const days = collectBoardDays();

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
    renderBlockBoardBlock(blockList, block, blockLectures, days, refreshBoard);
  });
  container.appendChild(blockList);
}
