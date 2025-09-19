
import { state, setFlashSession, setSubtab } from '../../state.js';

import { collectDueSections } from '../../review/scheduler.js';
import { listBlocks } from '../../storage/storage.js';
import { getSectionLabel } from './section-utils.js';

const REVIEW_SCOPES = ['all', 'blocks', 'lectures'];
let activeScope = 'all';
let blockTitleCache = null;

function ensureBlockTitleMap(blocks) {
  if (blockTitleCache) return blockTitleCache;
  const map = new Map();
  blocks.forEach(block => {
    if (!block || !block.blockId) return;
    map.set(block.blockId, block.title || block.blockId);
  });
  blockTitleCache = map;
  return map;
}

function titleOf(item) {
  return item?.name || item?.concept || 'Untitled';
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

function groupByBlock(entries, blockTitles) {
  const groups = new Map();
  entries.forEach(entry => {
    const blocks = Array.isArray(entry.item.blocks) && entry.item.blocks.length
      ? entry.item.blocks
      : ['__unassigned'];
    blocks.forEach(blockId => {
      const group = groups.get(blockId) || { id: blockId, entries: [] };
      group.entries.push(entry);
      groups.set(blockId, group);
    });
  });
  return Array.from(groups.values()).map(group => ({
    id: group.id,
    title: group.id === '__unassigned' ? 'Unassigned' : (blockTitles.get(group.id) || group.id),
    entries: group.entries
  })).sort((a, b) => b.entries.length - a.entries.length);
}

function groupByLecture(entries, blockTitles) {
  const groups = new Map();
  entries.forEach(entry => {
    const lectures = Array.isArray(entry.item.lectures) && entry.item.lectures.length
      ? entry.item.lectures
      : [{ blockId: '__unassigned', id: '__none', name: 'Unassigned lecture' }];
    lectures.forEach(lec => {
      const key = `${lec.blockId || '__unassigned'}::${lec.id}`;
      const blockTitle = blockTitles.get(lec.blockId) || lec.blockId || 'Unassigned';
      const title = lec.name ? `${blockTitle} – ${lec.name}` : `${blockTitle} – Lecture ${lec.id}`;
      const group = groups.get(key) || { id: key, title, entries: [] };
      group.entries.push(entry);
      groups.set(key, group);
    });
  });
  return Array.from(groups.values()).sort((a, b) => b.entries.length - a.entries.length);
}

function buildSessionPayload(entries) {
  return entries.map(entry => ({ item: entry.item, sections: [entry.sectionKey] }));
}

function renderEmptyState(container) {
  const empty = document.createElement('div');
  empty.className = 'review-empty';
  empty.textContent = 'No cards are due right now. Nice work!';
  container.appendChild(empty);
}

function renderAllView(container, entries, now, start) {
  const actionRow = document.createElement('div');
  actionRow.className = 'review-actions';
  const startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = `Start review (${entries.length})`;
  startBtn.disabled = entries.length === 0;
  startBtn.addEventListener('click', () => {
    if (!entries.length) return;
    start(buildSessionPayload(entries));
  });
  actionRow.appendChild(startBtn);
  container.appendChild(actionRow);

  if (!entries.length) {
    renderEmptyState(container);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'review-entry-list';
  entries.forEach(entry => {
    const item = document.createElement('li');
    item.className = 'review-entry';
    const title = document.createElement('div');
    title.className = 'review-entry-title';
    title.textContent = titleOf(entry.item);
    const meta = document.createElement('div');
    meta.className = 'review-entry-meta';
    meta.textContent = `${getSectionLabel(entry.item, entry.sectionKey)} • ${formatOverdue(entry.due, now)}`;
    item.appendChild(title);
    item.appendChild(meta);
    list.appendChild(item);
  });
  container.appendChild(list);
}

function renderGroupView(container, groups, label, start) {
  if (!groups.length) {
    renderEmptyState(container);
    return;
  }
  const list = document.createElement('div');
  list.className = 'review-group-list';
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'review-group-card';
    const heading = document.createElement('div');
    heading.className = 'review-group-heading';
    const title = document.createElement('div');
    title.className = 'review-group-title';
    title.textContent = group.title;
    const count = document.createElement('span');
    count.className = 'review-group-count';
    count.textContent = `${group.entries.length} card${group.entries.length === 1 ? '' : 's'}`;
    heading.appendChild(title);
    heading.appendChild(count);
    card.appendChild(heading);

    const actions = document.createElement('div');
    actions.className = 'review-group-actions';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn';
    startBtn.textContent = `Start ${label}`;
    startBtn.addEventListener('click', () => {
      start(buildSessionPayload(group.entries));
    });
    actions.appendChild(startBtn);
    card.appendChild(actions);

    list.appendChild(card);

  });
  container.appendChild(list);
}

export async function renderReview(root, redraw) {
  root.innerHTML = '';
  const cohort = state.cohort || [];
  if (!cohort.length) {
    const empty = document.createElement('div');
    empty.className = 'review-empty';
    empty.textContent = 'Build a study set to generate review cards.';
    root.appendChild(empty);
    return;
  }

  const now = Date.now();
  const dueEntries = collectDueSections(cohort, { now });
  const blocks = await listBlocks();
  const blockTitles = ensureBlockTitleMap(blocks);

  const wrapper = document.createElement('section');
  wrapper.className = 'card review-panel';

  const backRow = document.createElement('div');
  backRow.className = 'review-back-row';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn secondary';
  backBtn.textContent = 'Back to study';
  backBtn.addEventListener('click', () => {
    setSubtab('Study', 'Builder');
    redraw();
  });
  backRow.appendChild(backBtn);
  wrapper.appendChild(backRow);


  const heading = document.createElement('h2');
  heading.textContent = 'Review queue';
  wrapper.appendChild(heading);

  const summary = document.createElement('div');
  summary.className = 'review-summary';
  summary.textContent = `Cards due: ${dueEntries.length}`;
  wrapper.appendChild(summary);

  const tabs = document.createElement('div');
  tabs.className = 'review-tabs';
  REVIEW_SCOPES.forEach(scope => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    const label = scope === 'all' ? 'All' : scope === 'blocks' ? 'By block' : 'By lecture';
    if (activeScope === scope) btn.classList.add('active');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (activeScope === scope) return;
      activeScope = scope;
      renderReview(root, redraw);
    });
    tabs.appendChild(btn);
  });
  wrapper.appendChild(tabs);

  const body = document.createElement('div');
  body.className = 'review-body';
  wrapper.appendChild(body);

  const startSession = (pool) => {
    if (!pool.length) return;
    setFlashSession({ idx: 0, pool, ratings: {}, mode: 'review' });
    redraw();
  };

  if (activeScope === 'all') {
    renderAllView(body, dueEntries, now, startSession);
  } else if (activeScope === 'blocks') {
    const groups = groupByBlock(dueEntries, blockTitles);
    renderGroupView(body, groups, 'block review', startSession);
  } else {
    const groups = groupByLecture(dueEntries, blockTitles);
    renderGroupView(body, groups, 'lecture review', startSession);
  }

  root.appendChild(wrapper);
}
