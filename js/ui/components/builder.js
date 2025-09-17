import { state, setBuilder, setCohort, resetBlockMode } from '../../state.js';
import { listBlocks, listItemsByKind } from '../../storage/storage.js';

export async function renderBuilder(root) {
  const blocks = await loadBlocks();
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'builder';
  root.appendChild(wrap);
  drawBuilder(wrap, blocks);
}

async function loadBlocks() {
  const blocks = await listBlocks();
  blocks.push({ blockId: '__unlabeled', title: 'Unlabeled', weeks: 0, lectures: [] });
  return blocks;
}

function drawBuilder(container, blocks) {
  container.innerHTML = '';
  const rerender = () => drawBuilder(container, blocks);

  const layout = document.createElement('div');
  layout.className = 'builder-layout';
  container.appendChild(layout);

  const blockColumn = document.createElement('div');
  blockColumn.className = 'builder-blocks';
  layout.appendChild(blockColumn);
  blocks.forEach(block => {
    blockColumn.appendChild(renderBlockPanel(block, rerender));
  });

  const controls = renderControls(rerender);
  layout.appendChild(controls);
}

function renderBlockPanel(block, rerender) {
  const blockId = block.blockId;
  const lectures = Array.isArray(block.lectures) ? [...block.lectures] : [];
  lectures.sort((a, b) => {
    const weekDiff = (a.week ?? 0) - (b.week ?? 0);
    if (weekDiff !== 0) return weekDiff;
    return (a.name || '').localeCompare(b.name || '');
  });
  const weeks = groupByWeek(lectures);
  const hasSelections = hasBlockSelection(blockId);
  const blockCollapsed = isBlockCollapsed(blockId);

  const card = document.createElement('div');
  card.className = 'card builder-block-card';
  if (hasSelections) card.classList.add('active');
  if (blockCollapsed) card.classList.add('is-collapsed');

  const header = document.createElement('div');
  header.className = 'builder-block-header';
  const title = document.createElement('h3');
  title.textContent = block.title || blockId;
  header.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'builder-block-meta';
  const weekCount = weeks.length;
  const lectureCount = lectures.length;
  const metaParts = [];
  if (weekCount) metaParts.push(`${weekCount} week${weekCount === 1 ? '' : 's'}`);
  if (lectureCount) metaParts.push(`${lectureCount} lecture${lectureCount === 1 ? '' : 's'}`);
  meta.textContent = metaParts.join(' • ') || 'No lectures linked yet';
  header.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'builder-block-actions';
  const blockSelected = state.builder.blocks.includes(blockId);
  const toggleBlockBtn = createPill(blockSelected, blockSelected ? 'Block added' : 'Add block', () => {
    toggleBlock(block);
    rerender();
  });
  actions.appendChild(toggleBlockBtn);

  if (lectures.length) {
    const toggleCollapseBtn = createAction(blockCollapsed ? 'Show weeks' : 'Hide weeks', () => {
      toggleBlockCollapsed(blockId);
      rerender();
    });
    actions.appendChild(toggleCollapseBtn);

    const allBtn = createAction('Select all lectures', () => {
      selectEntireBlock(block);
      rerender();
    });
    actions.appendChild(allBtn);
  }

  if (hasSelections) {
    const clearBtn = createAction('Clear block', () => {
      clearBlock(blockId);
      rerender();
    });
    actions.appendChild(clearBtn);
  }

  header.appendChild(actions);
  card.appendChild(header);

  if (blockId === '__unlabeled') {
    const note = document.createElement('div');
    note.className = 'builder-unlabeled-note';
    note.textContent = 'Include to study cards without block or lecture tags.';
    card.appendChild(note);
    return card;
  }

  const weekList = document.createElement('div');
  weekList.className = 'builder-week-list';
  weekList.hidden = blockCollapsed;
  if (!weeks.length) {
    const empty = document.createElement('div');
    empty.className = 'builder-empty';
    empty.textContent = 'No lectures added yet.';
    weekList.appendChild(empty);
  } else {
    weeks.forEach(({ week, items }) => {
      weekList.appendChild(renderWeek(block, week, items, rerender));
    });
  }
  card.appendChild(weekList);
  return card;
}

function renderWeek(block, week, lectures, rerender) {
  const blockId = block.blockId;
  const weekKey = weekKeyFor(blockId, week);
  const selected = state.builder.weeks.includes(weekKey);
  const weekCollapsed = isWeekCollapsed(blockId, week);
  const row = document.createElement('div');
  row.className = 'builder-week-card';
  if (weekCollapsed) row.classList.add('is-collapsed');

  const header = document.createElement('div');
  header.className = 'builder-week-header';

  const label = createPill(selected, formatWeekLabel(week), () => {
    toggleWeek(block, week);
    rerender();
  }, 'week');
  header.appendChild(label);

  const meta = document.createElement('span');
  meta.className = 'builder-week-meta';
  meta.textContent = `${lectures.length} lecture${lectures.length === 1 ? '' : 's'}`;
  header.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'builder-week-actions';
  const toggleBtn = createAction(weekCollapsed ? 'Show lectures' : 'Hide lectures', () => {
    toggleWeekCollapsed(blockId, week);
    rerender();
  });
  actions.appendChild(toggleBtn);
  const allBtn = createAction('Select all', () => {
    selectWeek(block, week);
    rerender();
  });
  actions.appendChild(allBtn);
  header.appendChild(actions);

  row.appendChild(header);

  const lectureList = document.createElement('div');
  lectureList.className = 'builder-lecture-list';
  lectureList.hidden = weekCollapsed;
  lectures.forEach(lecture => {
    lectureList.appendChild(renderLecture(block, lecture, rerender));
  });
  row.appendChild(lectureList);

  return row;
}

function renderLecture(block, lecture, rerender) {
  const blockId = block.blockId;
  const lectureKey = lectureKeyFor(blockId, lecture.id);
  const active = state.builder.lectures.includes(lectureKey);
  const pill = createPill(active, lecture.name || `Lecture ${lecture.id}`, () => {
    toggleLecture(block, lecture);
    rerender();
  }, 'lecture');
  return pill;
}

function renderControls(rerender) {
  const aside = document.createElement('aside');
  aside.className = 'builder-controls';

  aside.appendChild(renderFilterCard(rerender));
  aside.appendChild(renderSummaryCard(rerender));
  return aside;
}

function renderFilterCard(rerender) {
  const card = document.createElement('div');
  card.className = 'card builder-filter-card';

  const title = document.createElement('h3');
  title.textContent = 'Filters';
  card.appendChild(title);

  const typeLabel = document.createElement('div');
  typeLabel.className = 'builder-section-title';
  typeLabel.textContent = 'Card types';
  card.appendChild(typeLabel);

  const pillRow = document.createElement('div');
  pillRow.className = 'builder-pill-row';
  const typeMap = { disease: 'Disease', drug: 'Drug', concept: 'Concept' };
  Object.entries(typeMap).forEach(([value, label]) => {
    const active = state.builder.types.includes(value);
    const pill = createPill(active, label, () => {
      toggleType(value);
      rerender();
    }, 'small');
    pillRow.appendChild(pill);
  });
  card.appendChild(pillRow);

  const favToggle = createPill(state.builder.onlyFav, 'Only favorites', () => {
    setBuilder({ onlyFav: !state.builder.onlyFav });
    rerender();
  }, 'small outline');
  card.appendChild(favToggle);

  return card;
}

function renderSummaryCard(rerender) {
  const card = document.createElement('div');
  card.className = 'card builder-summary-card';

  const title = document.createElement('h3');
  title.textContent = 'Study set';
  card.appendChild(title);

  const selectionMeta = document.createElement('div');
  selectionMeta.className = 'builder-selection-meta';
  selectionMeta.innerHTML = `
    <span>Blocks: ${state.builder.blocks.length}</span>
    <span>Weeks: ${state.builder.weeks.length}</span>
    <span>Lectures: ${state.builder.lectures.length}</span>
  `;
  card.appendChild(selectionMeta);

  const count = document.createElement('div');
  count.className = 'builder-count';
  count.textContent = `Set size: ${state.cohort.length}`;
  card.appendChild(count);

  const actions = document.createElement('div');
  actions.className = 'builder-summary-actions';

  const buildBtn = document.createElement('button');
  buildBtn.type = 'button';
  buildBtn.className = 'btn';
  buildBtn.textContent = 'Build set';
  buildBtn.addEventListener('click', async () => {
    await buildSet(buildBtn, count, rerender);
  });
  actions.appendChild(buildBtn);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn secondary';
  clearBtn.textContent = 'Clear selection';
  clearBtn.disabled = !hasAnySelection();
  clearBtn.addEventListener('click', () => {
    setBuilder({ blocks: [], weeks: [], lectures: [] });
    rerender();
  });
  actions.appendChild(clearBtn);

  card.appendChild(actions);
  return card;
}

async function buildSet(button, countEl, rerender) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Building…';
  try {
    const items = await gatherItems();
    setCohort(items);
    resetBlockMode();
    countEl.textContent = `Set size: ${items.length}`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
  rerender();
}

async function gatherItems() {
  let items = [];
  for (const kind of state.builder.types) {
    const byKind = await listItemsByKind(kind);
    items = items.concat(byKind);
  }
  return items.filter(item => {
    if (state.builder.onlyFav && !item.favorite) return false;
    if (state.builder.blocks.length) {
      const wantUnlabeled = state.builder.blocks.includes('__unlabeled');
      const hasBlockMatch = item.blocks?.some(b => state.builder.blocks.includes(b));
      if (!hasBlockMatch) {
        const isUnlabeled = !item.blocks || !item.blocks.length;
        if (!(wantUnlabeled && isUnlabeled)) return false;
      }
    }
    if (state.builder.weeks.length) {
      const ok = state.builder.weeks.some(pair => {
        const [blockId, weekStr] = pair.split('|');
        const weekNum = Number(weekStr);
        return item.blocks?.includes(blockId) && item.weeks?.includes(weekNum);
      });
      if (!ok) return false;
    }
    if (state.builder.lectures.length) {
      const ok = item.lectures?.some(lecture => {
        const key = lectureKeyFor(lecture.blockId, lecture.id);
        return state.builder.lectures.includes(key);
      });
      if (!ok) return false;
    }
    return true;
  });
}

function toggleBlock(block) {
  const blockId = block.blockId;
  const set = new Set(state.builder.blocks);
  const isActive = set.has(blockId);
  if (isActive) {
    set.delete(blockId);
    const weeks = state.builder.weeks.filter(key => !key.startsWith(`${blockId}|`));
    const lectures = state.builder.lectures.filter(key => !key.startsWith(`${blockId}|`));
    setBuilder({ blocks: Array.from(set), weeks, lectures });
  } else {
    set.add(blockId);
    setBuilder({ blocks: Array.from(set) });
  }
}

function selectEntireBlock(block) {
  const blockId = block.blockId;
  const blockSet = new Set(state.builder.blocks);
  const weekSet = new Set(state.builder.weeks);
  const lectureSet = new Set(state.builder.lectures);
  blockSet.add(blockId);
  (block.lectures || []).forEach(lecture => {
    if (lecture.week != null) weekSet.add(weekKeyFor(blockId, lecture.week));
    lectureSet.add(lectureKeyFor(blockId, lecture.id));
  });
  setBuilder({
    blocks: Array.from(blockSet),
    weeks: Array.from(weekSet),
    lectures: Array.from(lectureSet)
  });
}

function clearBlock(blockId) {
  const blocks = state.builder.blocks.filter(id => id !== blockId);
  const weeks = state.builder.weeks.filter(key => !key.startsWith(`${blockId}|`));
  const lectures = state.builder.lectures.filter(key => !key.startsWith(`${blockId}|`));
  setBuilder({ blocks, weeks, lectures });
}

function toggleWeek(block, week) {
  const weekKey = weekKeyFor(block.blockId, week);
  const weekSet = new Set(state.builder.weeks);
  const lectureSet = new Set(state.builder.lectures);
  const blockSet = new Set(state.builder.blocks);
  if (weekSet.has(weekKey)) {
    weekSet.delete(weekKey);
    (block.lectures || []).forEach(lecture => {
      if (lecture.week === week) {
        lectureSet.delete(lectureKeyFor(block.blockId, lecture.id));
      }
    });
  } else {
    weekSet.add(weekKey);
    blockSet.add(block.blockId);
  }
  setBuilder({
    weeks: Array.from(weekSet),
    lectures: Array.from(lectureSet),
    blocks: Array.from(blockSet)
  });
}

function selectWeek(block, week) {
  const weekKey = weekKeyFor(block.blockId, week);
  const weekSet = new Set(state.builder.weeks);
  const lectureSet = new Set(state.builder.lectures);
  const blockSet = new Set(state.builder.blocks);
  weekSet.add(weekKey);
  blockSet.add(block.blockId);
  (block.lectures || []).forEach(lecture => {
    if (lecture.week === week) {
      lectureSet.add(lectureKeyFor(block.blockId, lecture.id));
    }
  });
  setBuilder({
    weeks: Array.from(weekSet),
    lectures: Array.from(lectureSet),
    blocks: Array.from(blockSet)
  });
}

function toggleLecture(block, lecture) {
  const key = lectureKeyFor(block.blockId, lecture.id);
  const lectureSet = new Set(state.builder.lectures);
  const blockSet = new Set(state.builder.blocks);
  const weekSet = new Set(state.builder.weeks);
  if (lectureSet.has(key)) {
    lectureSet.delete(key);
  } else {
    lectureSet.add(key);
    blockSet.add(block.blockId);
    if (lecture.week != null) weekSet.add(weekKeyFor(block.blockId, lecture.week));
  }
  setBuilder({
    lectures: Array.from(lectureSet),
    blocks: Array.from(blockSet),
    weeks: Array.from(weekSet)
  });
}

function toggleType(type) {
  const types = new Set(state.builder.types);
  if (types.has(type)) types.delete(type); else types.add(type);
  setBuilder({ types: Array.from(types) });
}

function isBlockCollapsed(blockId) {
  return (state.builder.collapsedBlocks || []).includes(blockId);
}

function toggleBlockCollapsed(blockId) {
  const collapsed = new Set(state.builder.collapsedBlocks || []);
  if (collapsed.has(blockId)) {
    collapsed.delete(blockId);
  } else {
    collapsed.add(blockId);
  }
  setBuilder({ collapsedBlocks: Array.from(collapsed) });
}

function isWeekCollapsed(blockId, week) {
  return (state.builder.collapsedWeeks || []).includes(weekKeyFor(blockId, week));
}

function toggleWeekCollapsed(blockId, week) {
  const key = weekKeyFor(blockId, week);
  const collapsed = new Set(state.builder.collapsedWeeks || []);
  if (collapsed.has(key)) {
    collapsed.delete(key);
  } else {
    collapsed.add(key);
  }
  setBuilder({ collapsedWeeks: Array.from(collapsed) });
}

function hasBlockSelection(blockId) {
  return state.builder.blocks.includes(blockId)
    || state.builder.weeks.some(key => key.startsWith(`${blockId}|`))
    || state.builder.lectures.some(key => key.startsWith(`${blockId}|`));
}

function hasAnySelection() {
  return state.builder.blocks.length || state.builder.weeks.length || state.builder.lectures.length;
}

function groupByWeek(lectures) {
  const map = new Map();
  lectures.forEach(lecture => {
    const week = lecture.week != null ? lecture.week : -1;
    if (!map.has(week)) map.set(week, []);
    map.get(week).push(lecture);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([week, items]) => ({ week, items }));
}

function weekKeyFor(blockId, week) {
  return `${blockId}|${week}`;
}

function lectureKeyFor(blockId, lectureId) {
  return `${blockId}|${lectureId}`;
}

function formatWeekLabel(week) {
  if (week == null || week < 0) return 'No week';
  return `Week ${week}`;
}

function createPill(active, label, onClick, variant = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'builder-pill';
  if (variant) {
    const variants = Array.isArray(variant) ? variant : variant.split(' ');
    variants.filter(Boolean).forEach(name => btn.classList.add(`builder-pill-${name}`));
  }
  if (active) btn.classList.add('active');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function createAction(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'builder-action';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}
