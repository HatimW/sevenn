import { state, setLecturesState } from '../../state.js';
import { loadBlockCatalog, invalidateBlockCatalog } from '../../storage/block-catalog.js';
import { saveLecture, deleteLecture } from '../../storage/storage.js';
import { confirmModal } from './confirm.js';
import { debounce } from '../../utils.js';

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

function formatPassPlan(plan) {
  if (!plan || !Array.isArray(plan.schedule) || !plan.schedule.length) {
    return 'No pass plan';
  }
  const steps = plan.schedule
    .slice()
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .map(step => formatOffset(step?.offsetMinutes ?? 0));
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

function renderLectureRow(lecture, blockMap, onEdit, onDelete) {
  const row = document.createElement('tr');
  row.dataset.lectureRow = 'true';
  row.dataset.lectureId = String(lecture.id);
  row.dataset.blockId = String(lecture.blockId ?? '');

  const lectureCell = document.createElement('td');
  lectureCell.className = 'lecture-cell';
  const blockBadge = document.createElement('div');
  blockBadge.className = 'lecture-block';
  const block = blockMap.get(lecture.blockId);
  blockBadge.textContent = block?.title || lecture.blockId || 'Unknown block';
  if (block?.color) {
    blockBadge.style.background = block.color;
  }
  lectureCell.appendChild(blockBadge);

  const name = document.createElement('div');
  name.className = 'lecture-name';
  name.textContent = lecture.name || `Lecture ${lecture.id}`;
  lectureCell.appendChild(name);

  const id = document.createElement('div');
  id.className = 'lecture-id';
  id.textContent = `ID: ${lecture.id}`;
  lectureCell.appendChild(id);

  const tags = Array.isArray(lecture.tags) ? lecture.tags.filter(Boolean) : [];
  if (tags.length) {
    const tagList = document.createElement('div');
    tagList.className = 'lecture-tags';
    tagList.textContent = tags.join(', ');
    lectureCell.appendChild(tagList);
  }

  row.appendChild(lectureCell);

  const weekCell = document.createElement('td');
  weekCell.className = 'lecture-week';
  weekCell.textContent = formatWeekLabel(lecture.week);
  row.appendChild(weekCell);

  const passesCell = document.createElement('td');
  passesCell.className = 'lecture-passes';

  const summary = document.createElement('div');
  summary.className = 'lecture-pass-summary';
  summary.textContent = formatPassSummary(lecture);
  passesCell.appendChild(summary);

  const plan = document.createElement('div');
  plan.className = 'lecture-pass-plan';
  plan.textContent = formatPassPlan(lecture.passPlan);
  passesCell.appendChild(plan);

  const due = document.createElement('div');
  due.className = 'lecture-pass-due';
  due.textContent = formatNextDue(lecture.nextDueAt);
  passesCell.appendChild(due);

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
  ['Lecture', 'Week', 'Passes', 'Actions'].forEach(label => {
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
      onDelete
    );
    // ensure due labels use consistent now reference for deterministic order
    const dueEl = row.querySelector('.lecture-pass-due');
    if (dueEl && lecture.nextDueAt != null) {
      dueEl.textContent = formatNextDue(lecture.nextDueAt, now);
    }
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
      const haystacks = [lecture.name, lecture.id != null ? String(lecture.id) : '', lecture.blockId];
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

function buildToolbar(blocks, lectures, redraw) {
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
  addBtn.className = 'btn';
  addBtn.dataset.action = 'add-lecture';
  addBtn.textContent = 'Add Lecture';
  addBtn.disabled = !blocks.length;
  addBtn.addEventListener('click', () => {
    const defaultBlockId = filters.blockId || (blocks[0]?.blockId || '');
    openLectureDialog({
      mode: 'create',
      blocks,
      defaults: {
        blockId: defaultBlockId,
        id: '',
        name: '',
        week: ''
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
  const { mode, blocks, defaults = {}, onSubmit } = options;
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
  form.appendChild(blockField);

  const idField = document.createElement('label');
  idField.textContent = 'Lecture ID';
  const idInput = document.createElement('input');
  idInput.type = 'number';
  idInput.required = true;
  idInput.className = 'input';
  idInput.dataset.field = 'id';
  idInput.value = defaults.id ?? '';
  if (mode === 'edit') {
    idInput.disabled = true;
  }
  idField.appendChild(idInput);
  form.appendChild(idField);

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
    const idRaw = idInput.value;
    const id = Number(idRaw);
    const name = nameInput.value.trim();
    const weekValue = weekInput.value;
    const week = weekValue === '' ? null : Number(weekValue);
    if (!blockId || !name || Number.isNaN(id) || (weekValue !== '' && Number.isNaN(week))) {
      return;
    }
    const payload = {
      blockId,
      id,
      name,
      week
    };
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

function handleEdit(lecture, blocks, redraw) {
  openLectureDialog({
    mode: 'edit',
    blocks,
    defaults: {
      blockId: lecture.blockId,
      id: lecture.id,
      name: lecture.name || '',
      week: lecture.week ?? ''
    },
    onSubmit: async payload => {
      await saveLecture({
        ...lecture,
        blockId: lecture.blockId,
        id: lecture.id,
        name: payload.name,
        week: payload.week
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
  const filtered = applyFilters(allLectures, filters);

  root.innerHTML = '';
  const layout = document.createElement('div');
  layout.className = 'lectures-view';
  root.appendChild(layout);

  const toolbar = buildToolbar(blocks, allLectures, redraw);
  layout.appendChild(toolbar);

  const table = renderLectureTable(blocks, filtered, lecture => handleEdit(lecture, blocks, redraw), lecture => handleDelete(lecture, redraw));
  layout.appendChild(table);
}
