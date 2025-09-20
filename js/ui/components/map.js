import { listItemsByKind, getItem, upsertItem, getMapConfig, saveMapConfig } from '../../storage/storage.js';
import { loadBlockCatalog } from '../../storage/block-catalog.js';
import { uid } from '../../utils.js';
import { showPopup } from './popup.js';
import { openEditor } from './editor.js';

const TOOL = {
  NAVIGATE: 'navigate',
  HIDE: 'hide',
  BREAK: 'break-link',
  ADD_LINK: 'add-link',
  AREA: 'area'
};

function createCursor(svg, hotX = 8, hotY = 8) {
  const encoded = encodeURIComponent(svg.trim())
    .replace(/%0A/g, '')
    .replace(/%20/g, ' ');
  return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, pointer`;
}

const CURSOR_STYLE = {
  hide: createCursor(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<path d="M6 19.5l9-9a3 3 0 0 1 4.24 0l6.5 6.5a3 3 0 0 1 0 4.24l-9 9H9a3 3 0 0 1-3-3z" fill="#f97316" />'
    + '<path d="M8.2 21.2l8.6 8.6" stroke="#fed7aa" stroke-width="3" stroke-linecap="round" />'
    + '<path d="M11.3 24.5l4 4" stroke="#fff7ed" stroke-width="2" stroke-linecap="round" />'
    + '</svg>',
    7,
    26
  ),
  break: createCursor(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<circle cx="11" cy="11" r="4" fill="none" stroke="#f97316" stroke-width="2.2" />'
    + '<circle cx="11" cy="21" r="4" fill="none" stroke="#f97316" stroke-width="2.2" />'
    + '<path d="M14.5 13L24 3.5" stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round" />'
    + '<path d="M14.5 19L24 28.5" stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round" />'
    + '<path d="M6 6l7 7" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" />'
    + '<path d="M6 26l7-7" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" />'
    + '</svg>',
    18,
    18
  ),
  link: createCursor(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<path d="M12 11h5a4.5 4.5 0 0 1 0 9h-3" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />'
    + '<path d="M14 15h-4a4.5 4.5 0 0 0 0 9h5" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />'
    + '<path d="M13 19h6" stroke="#bae6fd" stroke-width="2" stroke-linecap="round" />'
    + '</svg>',
    9,
    23
  )
};

const ICONS = {
  sliders:
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M6 7h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />'
    + '<path d="M6 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />'
    + '<path d="M6 17h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />'
    + '<circle cx="16" cy="7" r="2.5" stroke="currentColor" stroke-width="1.6" />'
    + '<circle cx="11" cy="12" r="2.5" stroke="currentColor" stroke-width="1.6" />'
    + '<circle cx="19" cy="17" r="2.5" stroke="currentColor" stroke-width="1.6" />'
    + '</svg>',
  close:
    '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />'
    + '</svg>',
  plus:
    '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />'
    + '</svg>',
  gear:
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="currentColor" stroke-width="1.6" />'
    + '<path d="M4.5 12.5l1.8.52c.26.08.46.28.54.54l.52 1.8a.9.9 0 0 0 1.47.41l1.43-1.08a.9.9 0 0 1 .99-.07l1.63.82a.9.9 0 0 0 1.22-.41l.73-1.66a.9.9 0 0 1 .73-.52l1.88-.2a.9.9 0 0 0 .78-1.07l-.39-1.85a.9.9 0 0 1 .25-.83l1.29-1.29a.9.9 0 0 0-.01-1.27l-1.29-1.29a.9.9 0 0 0-.83-.25l-1.85.39a.9.9 0 0 1-1.07-.78l-.2-1.88A.9.9 0 0 0 13.3 2h-2.6a.9.9 0 0 0-.9.78l-.2 1.88a.9.9 0 0 1-1.07.78l-1.85-.39a.9.9 0 0 0-.83.25L4.56 6.59a.9.9 0 0 0-.01 1.27l1.29 1.29c.22.22.31.54.25.83l-.39 1.85a.9.9 0 0 0 .7 1.07z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />'
    + '</svg>',
  trash:

    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M6 7h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />'
    + '<path d="M9 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />'
    + '<path d="M18 7v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />'
    + '<path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />'
    + '</svg>'
};

const DEFAULT_LINK_COLOR = '#888888';
const DEFAULT_LINE_STYLE = 'solid';
const DEFAULT_LINE_THICKNESS = 'regular';

const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'arrow-end', label: 'Arrow →' },
  { value: 'arrow-start', label: 'Arrow ←' },
  { value: 'arrow-both', label: 'Double arrow ↔' },
  { value: 'glow', label: 'Glow highlight' },
  { value: 'blocked', label: 'Blocked ✕' }
];

const LINE_STYLE_VALUE_SET = new Set(LINE_STYLE_OPTIONS.map(option => option.value));

const LINE_THICKNESS_VALUES = {
  thin: 2,
  regular: 4,
  bold: 7
};

const LINE_THICKNESS_OPTIONS = [
  { value: 'thin', label: 'Thin' },
  { value: 'regular', label: 'Regular' },
  { value: 'bold', label: 'Bold' }
];

const mapState = {
  tool: TOOL.NAVIGATE,
  selectionIds: [],
  previewSelection: null,
  pendingLink: null,
  hiddenMenuTab: 'nodes',
  panelVisible: true,
  menuPinned: false,
  listenersAttached: false,
  draggingView: false,
  nodeDrag: null,
  areaDrag: null,
  menuDrag: null,
  selectionRect: null,
  nodeWasDragged: false,
  viewBox: null,
  svg: null,
  g: null,
  positions: {},
  itemMap: {},
  elements: new Map(),
  root: null,
  container: null,
  updateViewBox: () => {},
  selectionBox: null,
  sizeLimit: 2000,
  minView: 100,
  lastPointer: { x: 0, y: 0 },
  autoPan: null,
  autoPanFrame: null,
  toolboxPos: { x: 16, y: 16 },
  toolboxDrag: null,
  toolboxEl: null,
  toolboxContainer: null,
  baseCursor: 'grab',
  cursorOverride: null,
  defaultViewSize: null,
  justCompletedSelection: false,
  edgeTooltip: null,
  hoveredEdge: null,
  hoveredEdgePointer: { x: 0, y: 0 },
  currentScales: { nodeScale: 1, labelScale: 1, lineScale: 1 },
  suppressNextClick: false,
  mapConfig: null,
  mapConfigLoaded: false,
  blocks: [],
  visibleItems: [],
  searchValue: '',
  searchFeedback: null,
  searchInput: null,
  searchFeedbackEl: null,
  paletteSearch: ''
};

function normalizeMapTab(tab = {}) {
  const filter = tab.filter && typeof tab.filter === 'object' ? tab.filter : {};
  const layout = {};
  if (tab.layout && typeof tab.layout === 'object') {
    Object.entries(tab.layout).forEach(([id, pos]) => {
      if (!id || !pos || typeof pos !== 'object') return;
      const x = Number(pos.x);
      const y = Number(pos.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      layout[id] = { x, y };
    });
  }
  const normalized = {
    id: tab.id || uid(),
    name: tab.name || 'Untitled map',
    includeLinked: tab.includeLinked !== false,
    manualMode: Boolean(tab.manualMode),
    manualIds: Array.isArray(tab.manualIds) ? Array.from(new Set(tab.manualIds.filter(Boolean))) : [],
    layout,
    layoutSeeded: tab.layoutSeeded === true,
    filter: {
      blockId: filter.blockId || '',
      week: Number.isFinite(filter.week) ? filter.week : (typeof filter.week === 'string' && filter.week.trim() ? Number(filter.week) : ''),
      lectureKey: filter.lectureKey || ''
    }
  };
  if (!Number.isFinite(normalized.filter.week)) {
    normalized.filter.week = '';
  }
  return normalized;
}

function normalizeMapConfig(config = null) {
  const base = config && typeof config === 'object' ? { ...config } : {};
  const tabs = Array.isArray(base.tabs)
    ? base.tabs.map(normalizeMapTab)
    : [normalizeMapTab({ id: 'default', name: 'All concepts', includeLinked: true, layoutSeeded: true })];
  const ids = new Set();
  const deduped = [];
  tabs.forEach(tab => {
    if (ids.has(tab.id)) {
      const clone = { ...tab, id: uid() };
      ids.add(clone.id);
      deduped.push(clone);
    } else {
      ids.add(tab.id);
      deduped.push(tab);
    }
  });
  const active = deduped.find(tab => tab.id === base.activeTabId) || deduped[0];
  return {
    activeTabId: active.id,
    tabs: deduped
  };
}

function ensureTabLayout(tab) {
  if (!tab) return {};
  if (!tab.layout || typeof tab.layout !== 'object') {
    tab.layout = {};
  }
  return tab.layout;
}

async function ensureMapConfig() {
  if (mapState.mapConfigLoaded && mapState.mapConfig) {
    return mapState.mapConfig;
  }
  const raw = await getMapConfig();
  const normalized = normalizeMapConfig(raw);
  mapState.mapConfig = normalized;
  mapState.mapConfigLoaded = true;
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await saveMapConfig(normalized);
  }
  return normalized;
}

async function persistMapConfig() {
  if (!mapState.mapConfig) return;
  const snapshot = JSON.parse(JSON.stringify(mapState.mapConfig));
  await saveMapConfig(snapshot);
}

function getActiveTab() {
  const config = mapState.mapConfig;
  if (!config) return null;
  return config.tabs.find(tab => tab.id === config.activeTabId) || config.tabs[0] || null;
}

async function setActiveTab(tabId) {
  const config = mapState.mapConfig;
  if (!config) return;
  const tab = config.tabs.find(t => t.id === tabId);
  if (!tab) return;
  config.activeTabId = tab.id;
  mapState.searchValue = '';
  mapState.searchFeedback = null;
  mapState.paletteSearch = '';
  mapState.selectionIds = [];
  mapState.previewSelection = null;
  mapState.pendingLink = null;
  await persistMapConfig();
  await renderMap(mapState.root);
}

async function createMapTab() {
  const config = mapState.mapConfig || normalizeMapConfig(null);
  const count = config.tabs.length + 1;
  const tab = normalizeMapTab({
    id: uid(),
    name: `Map ${count}`,
    includeLinked: true,
    manualMode: false,
    manualIds: [],
    layoutSeeded: true,
    filter: { blockId: '', week: '', lectureKey: '' }
  });
  config.tabs.push(tab);
  config.activeTabId = tab.id;
  mapState.mapConfig = config;
  mapState.searchValue = '';
  mapState.searchFeedback = null;
  await persistMapConfig();
  await renderMap(mapState.root);
}

async function deleteActiveTab() {
  const config = mapState.mapConfig;
  if (!config) return;
  if (config.tabs.length <= 1) {
    alert('At least one map tab is required.');
    return;
  }
  const tab = getActiveTab();
  if (!tab) return;
  const confirmed = confirm(`Delete map “${tab.name}”?`);
  if (!confirmed) return;
  config.tabs = config.tabs.filter(t => t.id !== tab.id);
  config.activeTabId = config.tabs[0]?.id || '';
  mapState.searchValue = '';
  mapState.searchFeedback = null;
  await persistMapConfig();
  await renderMap(mapState.root);
}

function updateSearchFeedback(message, type = '') {
  if (message) {
    mapState.searchFeedback = { message, type };
  } else {
    mapState.searchFeedback = null;
  }
  applyStoredSearchFeedback();
}

function applyStoredSearchFeedback() {
  const el = mapState.searchFeedbackEl;
  if (!el) return;
  const info = mapState.searchFeedback;
  if (info && info.message) {
    el.textContent = info.message;
    el.className = 'map-search-feedback' + (info.type ? ` ${info.type}` : '');
  } else {
    el.textContent = '';
    el.className = 'map-search-feedback';
  }
}

function setSearchInputState({ notFound = false } = {}) {
  const input = mapState.searchInput;
  if (!input) return;
  input.classList.toggle('not-found', Boolean(notFound));
}

function createMapTabsPanel(activeTab) {
  const config = mapState.mapConfig || { tabs: [] };
  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'map-tabs';

  const heading = document.createElement('div');
  heading.className = 'map-tabs-heading';
  heading.textContent = 'Concept maps';
  tabsWrap.appendChild(heading);

  const tabList = document.createElement('div');
  tabList.className = 'map-tab-list';
  config.tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-tab' + (activeTab && tab.id === activeTab.id ? ' active' : '');
    btn.textContent = tab.name || 'Untitled map';
    btn.addEventListener('click', () => {
      if (!activeTab || tab.id !== activeTab.id) {
        setActiveTab(tab.id);
      }
    });
    tabList.appendChild(btn);
  });
  tabsWrap.appendChild(tabList);

  const actions = document.createElement('div');
  actions.className = 'map-tab-actions';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'map-icon-btn map-tab-add';
  addBtn.setAttribute('aria-label', 'Create new map tab');
  addBtn.innerHTML = `${ICONS.plus}`;
  addBtn.addEventListener('click', () => {
    createMapTab();
  });
  actions.appendChild(addBtn);

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'map-icon-btn map-tab-settings';
  settingsBtn.setAttribute('aria-label', 'Open settings');
  settingsBtn.innerHTML = `${ICONS.gear}`;
  settingsBtn.addEventListener('click', () => {
    const headerSettings = document.querySelector('.header-settings-btn');
    if (headerSettings) {
      headerSettings.click();
    }
  });
  actions.appendChild(settingsBtn);

  tabsWrap.appendChild(actions);

  return tabsWrap;
}

function createSearchOverlay() {
  const searchWrap = document.createElement('div');
  searchWrap.className = 'map-search-container map-search-overlay';

  const form = document.createElement('form');
  form.className = 'map-search';
  form.addEventListener('submit', evt => {
    evt.preventDefault();
    handleSearchSubmit(input.value);
  });

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'input map-search-input';
  input.placeholder = 'Search concepts…';
  input.value = mapState.searchValue || '';
  input.addEventListener('input', () => {
    mapState.searchValue = input.value;
    setSearchInputState({ notFound: false });
    if (!input.value.trim()) {
      updateSearchFeedback('', '');
    }
  });
  form.appendChild(input);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'map-search-btn';
  submit.textContent = 'Go';
  form.appendChild(submit);

  searchWrap.appendChild(form);

  const feedback = document.createElement('div');
  feedback.className = 'map-search-feedback';
  searchWrap.appendChild(feedback);

  mapState.searchInput = input;
  mapState.searchFeedbackEl = feedback;
  applyStoredSearchFeedback();

  return searchWrap;
}

function createMapControlsPanel(activeTab) {
  const controls = document.createElement('div');
  controls.className = 'map-controls';
  if (!activeTab) {
    return controls;
  }

  const titleRow = document.createElement('div');
  titleRow.className = 'map-controls-row';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'map-control map-control-name';
  nameLabel.textContent = 'Map name';
  const nameInput = document.createElement('input');
  nameInput.className = 'input map-name-input';
  nameInput.value = activeTab.name || '';
  nameInput.addEventListener('change', async () => {
    const next = nameInput.value.trim() || 'Untitled map';
    if (next === activeTab.name) return;
    activeTab.name = next;
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  nameLabel.appendChild(nameInput);
  titleRow.appendChild(nameLabel);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'map-icon-btn danger map-delete-tab';
  deleteBtn.setAttribute('aria-label', 'Delete map');
  deleteBtn.innerHTML = `${ICONS.trash}<span class="sr-only">Delete map</span>`;
  if ((mapState.mapConfig?.tabs || []).length <= 1) {
    deleteBtn.disabled = true;
  }
  deleteBtn.addEventListener('click', () => {
    deleteActiveTab();
  });
  titleRow.appendChild(deleteBtn);

  controls.appendChild(titleRow);

  const toggleRow = document.createElement('div');
  toggleRow.className = 'map-controls-row';

  const manualToggle = document.createElement('label');
  manualToggle.className = 'map-toggle';
  const manualInput = document.createElement('input');
  manualInput.type = 'checkbox';
  manualInput.checked = Boolean(activeTab.manualMode);
  manualInput.addEventListener('change', async () => {
    activeTab.manualMode = manualInput.checked;
    if (manualInput.checked) {
      activeTab.filter.blockId = '';
      activeTab.filter.week = '';
      activeTab.filter.lectureKey = '';
      activeTab.includeLinked = false;
    } else {
      activeTab.includeLinked = true;
    }
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  const manualSpan = document.createElement('span');
  manualSpan.textContent = 'Manual mode';
  manualToggle.appendChild(manualInput);
  manualToggle.appendChild(manualSpan);
  toggleRow.appendChild(manualToggle);

  const linkedToggle = document.createElement('label');
  linkedToggle.className = 'map-toggle';
  const linkedInput = document.createElement('input');
  linkedInput.type = 'checkbox';
  linkedInput.checked = activeTab.manualMode ? false : activeTab.includeLinked !== false;
  linkedInput.addEventListener('change', async () => {
    activeTab.includeLinked = linkedInput.checked;
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  const linkedSpan = document.createElement('span');
  linkedSpan.textContent = 'Include linked concepts';
  linkedToggle.appendChild(linkedInput);
  linkedToggle.appendChild(linkedSpan);
  toggleRow.appendChild(linkedToggle);

  controls.appendChild(toggleRow);

  const filterRow = document.createElement('div');
  filterRow.className = 'map-controls-row';

  const blockWrap = document.createElement('label');
  blockWrap.className = 'map-control';
  blockWrap.textContent = 'Block';
  const blockSelect = document.createElement('select');
  blockSelect.className = 'map-select';
  const blocks = mapState.blocks || [];
  const blockDefault = document.createElement('option');
  blockDefault.value = '';
  blockDefault.textContent = 'All blocks';
  blockSelect.appendChild(blockDefault);
  blocks.forEach(block => {
    const opt = document.createElement('option');
    opt.value = block.blockId;
    opt.textContent = block.name || block.blockId;
    blockSelect.appendChild(opt);
  });
  blockSelect.value = activeTab.filter.blockId || '';
  blockSelect.disabled = Boolean(activeTab.manualMode);
  blockSelect.addEventListener('change', async () => {
    activeTab.filter.blockId = blockSelect.value;
    activeTab.filter.week = '';
    activeTab.filter.lectureKey = '';
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  blockWrap.appendChild(blockSelect);
  filterRow.appendChild(blockWrap);

  const weekWrap = document.createElement('label');
  weekWrap.className = 'map-control';
  weekWrap.textContent = 'Week';
  const weekSelect = document.createElement('select');
  weekSelect.className = 'map-select';
  const weekBlock = blocks.find(b => b.blockId === blockSelect.value);
  const weekDefault = document.createElement('option');
  weekDefault.value = '';
  weekDefault.textContent = blockSelect.value ? 'All weeks' : 'Select a block';
  weekSelect.appendChild(weekDefault);
  if (weekBlock && blockSelect.value) {
    const weekNumbers = new Set();
    if (Number(weekBlock.weeks)) {
      for (let i = 1; i <= Number(weekBlock.weeks); i++) {
        weekNumbers.add(i);
      }
    }
    (weekBlock.lectures || []).forEach(lec => {
      if (Number.isFinite(lec?.week)) {
        weekNumbers.add(lec.week);
      }
    });
    Array.from(weekNumbers)
      .sort((a, b) => a - b)
      .forEach(num => {
        const opt = document.createElement('option');
        opt.value = String(num);
        opt.textContent = `Week ${num}`;
        weekSelect.appendChild(opt);
      });
  }
  if (blockSelect.value && activeTab.filter.week) {
    weekSelect.value = String(activeTab.filter.week);
  } else {
    weekSelect.value = '';
  }
  weekSelect.disabled = !blockSelect.value || Boolean(activeTab.manualMode);
  weekSelect.addEventListener('change', async () => {
    const val = weekSelect.value;
    activeTab.filter.week = val ? Number(val) : '';
    activeTab.filter.lectureKey = '';
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  weekWrap.appendChild(weekSelect);
  filterRow.appendChild(weekWrap);

  const lectureWrap = document.createElement('label');
  lectureWrap.className = 'map-control';
  lectureWrap.textContent = 'Lecture';
  const lectureSelect = document.createElement('select');
  lectureSelect.className = 'map-select';
  const lectureDefault = document.createElement('option');
  lectureDefault.value = '';
  lectureDefault.textContent = blockSelect.value ? 'All lectures' : 'Select a block';
  lectureSelect.appendChild(lectureDefault);
  if (weekBlock && blockSelect.value) {
    const lectures = Array.isArray(weekBlock.lectures) ? weekBlock.lectures : [];
    const weekFilter = activeTab.filter.week;
    lectures
      .filter(lec => !weekFilter || lec.week === weekFilter)
      .forEach(lec => {
        const opt = document.createElement('option');
        opt.value = `${weekBlock.blockId}|${lec.id}`;
        const label = lec.name ? `${lec.name} (Week ${lec.week})` : `Lecture ${lec.id}`;
        opt.textContent = label;
        lectureSelect.appendChild(opt);
      });
  }
  lectureSelect.value = activeTab.filter.lectureKey || '';
  lectureSelect.disabled = !blockSelect.value || Boolean(activeTab.manualMode);
  lectureSelect.addEventListener('change', async () => {
    activeTab.filter.lectureKey = lectureSelect.value || '';
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  lectureWrap.appendChild(lectureSelect);
  filterRow.appendChild(lectureWrap);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn map-reset-filters';
  resetBtn.textContent = 'Clear filters';
  resetBtn.disabled = Boolean(activeTab.manualMode);
  resetBtn.addEventListener('click', async () => {
    activeTab.filter.blockId = '';
    activeTab.filter.week = '';
    activeTab.filter.lectureKey = '';
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  filterRow.appendChild(resetBtn);

  controls.appendChild(filterRow);

  return controls;
}

function createMapPalettePanel(items, activeTab) {
  if (!activeTab || !activeTab.manualMode) {
    return null;
  }
  const palette = document.createElement('div');
  palette.className = 'map-palette';

  const title = document.createElement('h3');
  title.textContent = 'Concept library';
  palette.appendChild(title);

  const description = document.createElement('p');
  description.className = 'map-palette-hint';
  description.textContent = 'Drag terms onto the canvas to add them to this map.';
  palette.appendChild(description);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'input map-palette-search';
  searchInput.placeholder = 'Filter terms';
  searchInput.value = mapState.paletteSearch || '';
  palette.appendChild(searchInput);

  const list = document.createElement('div');
  list.className = 'map-palette-list';
  palette.appendChild(list);

  const manualSet = new Set(Array.isArray(activeTab.manualIds) ? activeTab.manualIds : []);
  const itemMap = mapState.itemMap || {};

  function renderList() {
    list.innerHTML = '';
    const query = searchInput.value.trim().toLowerCase();
    const available = items
      .filter(it => !manualSet.has(it.id))
      .filter(it => !query || titleOf(it).toLowerCase().includes(query))
      .sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    if (!available.length) {
      const empty = document.createElement('div');
      empty.className = 'map-palette-empty';
      empty.textContent = query ? 'No matching terms.' : 'All terms have been added.';
      list.appendChild(empty);
      return;
    }
    available.forEach(it => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-palette-item';
      btn.textContent = titleOf(it) || it.id;
      btn.addEventListener('mousedown', evt => {
        const sourceItem = itemMap[it.id] || it;
        startMenuDrag(sourceItem, evt, { source: 'palette' });
      });
      list.appendChild(btn);
    });
  }

  searchInput.addEventListener('input', () => {
    mapState.paletteSearch = searchInput.value;
    renderList();
  });

  renderList();

  const activeWrap = document.createElement('div');
  activeWrap.className = 'map-palette-active';
  const activeTitle = document.createElement('h4');
  activeTitle.textContent = `Active concepts (${manualSet.size})`;
  activeWrap.appendChild(activeTitle);

  const activeList = document.createElement('div');
  activeList.className = 'map-palette-active-list';
  if (!manualSet.size) {
    const empty = document.createElement('div');
    empty.className = 'map-palette-empty';
    empty.textContent = 'No concepts yet. Drag from the library to begin.';
    activeList.appendChild(empty);
  } else {
    activeTab.manualIds.forEach(id => {
      const item = itemMap[id];
      if (!item) return;
      const row = document.createElement('div');
      row.className = 'map-palette-active-item';
      const label = document.createElement('span');
      label.textContent = titleOf(item) || id;
      row.appendChild(label);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn ghost';
      removeBtn.setAttribute('aria-label', `Remove ${titleOf(item) || 'item'} from this map`);
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', async () => {
        const tab = getActiveTab();
        if (!tab) return;
        tab.manualIds = (tab.manualIds || []).filter(mid => mid !== id);
        await persistMapConfig();
        await renderMap(mapState.root);
      });
      row.appendChild(removeBtn);
      activeList.appendChild(row);
    });
  }
  activeWrap.appendChild(activeList);
  palette.appendChild(activeWrap);

  return palette;
}

function handleSearchSubmit(rawQuery) {
  const query = (rawQuery || '').trim();
  if (!query) {
    mapState.searchValue = '';
    updateSearchFeedback('', '');
    setSearchInputState({ notFound: false });
    return;
  }
  mapState.searchValue = rawQuery;
  const items = mapState.visibleItems || [];
  const lower = query.toLowerCase();
  let match = items.find(it => (titleOf(it) || '').toLowerCase() === lower);
  if (!match) {
    match = items.find(it => (titleOf(it) || '').toLowerCase().includes(lower));
  }
  if (!match) {
    updateSearchFeedback('No matching concept on this map.', 'error');
    setSearchInputState({ notFound: true });
    return;
  }
  const success = centerOnNode(match.id);
  if (success) {
    updateSearchFeedback(`Centered on ${titleOf(match)}.`, 'success');
    setSearchInputState({ notFound: false });
  } else {
    updateSearchFeedback('Could not focus on that concept.', 'error');
    setSearchInputState({ notFound: true });
  }
}

function centerOnNode(id) {
  if (!mapState.viewBox || !mapState.positions) return false;
  const pos = mapState.positions[id];
  if (!pos) return false;
  const width = mapState.viewBox.w;
  const height = mapState.viewBox.h;
  const limit = mapState.sizeLimit || 0;
  const maxX = Math.max(0, limit - width);
  const maxY = Math.max(0, limit - height);
  const nextX = clamp(pos.x - width / 2, 0, maxX);
  const nextY = clamp(pos.y - height / 2, 0, maxY);
  if (Number.isFinite(nextX)) mapState.viewBox.x = nextX;
  if (Number.isFinite(nextY)) mapState.viewBox.y = nextY;
  if (mapState.updateViewBox) {
    mapState.updateViewBox();
  }
  mapState.selectionIds = [id];
  updateSelectionHighlight();
  return true;
}

function matchesFilter(item, filter = {}) {
  if (!filter) return true;
  const blockId = filter.blockId || '';
  const week = filter.week;
  const lectureKey = filter.lectureKey || '';
  if (blockId) {
    const inBlock = (item.blocks || []).includes(blockId) || (item.lectures || []).some(lec => lec.blockId === blockId);
    if (!inBlock) return false;
  }
  if (week !== '' && week !== null && week !== undefined) {
    const weekNum = Number(week);
    if (Number.isFinite(weekNum)) {
      if (blockId) {
        const matchesWeek = (item.lectures || []).some(lec => lec.blockId === blockId && lec.week === weekNum) || (item.weeks || []).includes(weekNum);
        if (!matchesWeek) return false;
      } else if (!(item.weeks || []).includes(weekNum)) {
        return false;
      }
    }
  }
  if (lectureKey) {
    const [blk, lecStr] = lectureKey.split('|');
    const lecId = Number(lecStr);
    if (Number.isFinite(lecId)) {
      const blockMatch = blk || blockId;
      const hasLecture = (item.lectures || []).some(lec => {
        if (!Number.isFinite(lec.id)) return false;
        if (blockMatch) {
          return lec.blockId === blockMatch && lec.id === lecId;
        }
        return lec.id === lecId;
      });
      if (!hasLecture) return false;
    }
  }
  return true;
}

function applyTabFilters(items, tab) {
  if (!tab) {
    return items.filter(it => !it.mapHidden);
  }
  const manualSet = new Set(Array.isArray(tab.manualIds) ? tab.manualIds : []);
  let base;
  if (tab.manualMode) {
    base = items.filter(it => manualSet.has(it.id));
  } else {
    base = items.filter(it => !it.mapHidden && matchesFilter(it, tab.filter));
  }
  const allowed = new Set(base.map(it => it.id));
  if (tab.includeLinked !== false) {
    const queue = [...allowed];
    while (queue.length) {
      const id = queue.pop();
      const item = mapState.itemMap?.[id];
      if (!item) continue;
      (item.links || []).forEach(link => {
        const other = mapState.itemMap?.[link.id];
        if (!other) return;
        if (other.mapHidden && !manualSet.has(other.id)) return;
        if (!allowed.has(other.id)) {
          allowed.add(other.id);
          queue.push(other.id);
        }
      });
    }
  }
  return items.filter(it => {
    if (!allowed.has(it.id)) return false;
    if (tab.manualMode) {
      if (manualSet.has(it.id)) return true;
      return !it.mapHidden;
    }
    return !it.mapHidden || manualSet.has(it.id);
  });
}

function openItemPopup(itemId) {
  const item = mapState.itemMap?.[itemId];
  if (!item) return;
  showPopup(item, {
    onEdit: () => openItemEditor(itemId)
  });
}

function openItemEditor(itemId) {
  const item = mapState.itemMap?.[itemId];
  if (!item) return;
  openEditor(item.kind, async () => {
    await renderMap(mapState.root);
  }, item);
}

function setAreaInteracting(active) {
  if (!mapState.root) return;
  mapState.root.classList.toggle('map-area-interacting', Boolean(active));
}

export async function renderMap(root) {
  if (mapState.root && mapState.root !== root) {
    mapState.root.classList.remove('map-area-interacting');
  }
  mapState.root = root;
  root.innerHTML = '';
  mapState.nodeDrag = null;
  mapState.areaDrag = null;
  mapState.draggingView = false;
  mapState.menuDrag = null;
  mapState.selectionRect = null;
  mapState.previewSelection = null;
  mapState.nodeWasDragged = false;
  mapState.justCompletedSelection = false;
  mapState.searchInput = null;
  mapState.searchFeedbackEl = null;
  stopToolboxDrag();
  mapState.toolboxEl = null;
  mapState.toolboxContainer = null;
  mapState.cursorOverride = null;
  mapState.hoveredEdge = null;
  mapState.hoveredEdgePointer = { x: 0, y: 0 };
  stopAutoPan();
  setAreaInteracting(false);

  ensureListeners();

  await ensureMapConfig();
  const catalog = await loadBlockCatalog();
  mapState.blocks = (catalog.blocks || []).map(block => ({
    ...block,
    lectures: (catalog.lectureLists?.[block.blockId] || []).map(lecture => ({ ...lecture }))
  }));

  const items = [
    ...(await listItemsByKind('disease')),
    ...(await listItemsByKind('drug')),
    ...(await listItemsByKind('concept'))
  ];

  const hiddenNodes = items.filter(it => it.mapHidden);

  const itemMap = Object.fromEntries(items.map(it => [it.id, it]));
  mapState.itemMap = itemMap;

  const activeTab = getActiveTab();
  const visibleItems = applyTabFilters(items, activeTab);
  mapState.visibleItems = visibleItems;

  const base = 1000;
  const size = Math.max(base, visibleItems.length * 150);
  const viewport = base;
  mapState.sizeLimit = size * 2;
  mapState.minView = 100;

  const wrapper = document.createElement('div');
  wrapper.className = 'map-wrapper';
  root.appendChild(wrapper);

  const stage = document.createElement('div');
  stage.className = 'map-stage';
  wrapper.appendChild(stage);

  const container = document.createElement('div');
  container.className = 'map-container';
  stage.appendChild(container);
  mapState.container = container;

  const overlay = document.createElement('div');
  overlay.className = 'map-overlay';
  stage.appendChild(overlay);

  const menu = document.createElement('div');
  menu.className = 'map-menu';
  overlay.appendChild(menu);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'map-menu-toggle';
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open map controls');
  toggle.innerHTML = `<span class="map-menu-icon" aria-hidden="true">${ICONS.sliders}</span><span class="sr-only">Open map controls</span>`;
  menu.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'map-menu-panel';
  panel.setAttribute('aria-label', 'Map controls');
  menu.appendChild(panel);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'map-menu-close';
  closeBtn.setAttribute('aria-label', 'Hide map controls');
  closeBtn.innerHTML = `<span class="sr-only">Hide map controls</span>${ICONS.close}`;
  panel.appendChild(closeBtn);

  const tabsPanel = createMapTabsPanel(activeTab);
  panel.appendChild(tabsPanel);

  const controlsPanel = createMapControlsPanel(activeTab);
  if (controlsPanel) {
    panel.appendChild(controlsPanel);
  }

  const palettePanel = createMapPalettePanel(items, activeTab);
  if (palettePanel) {
    panel.appendChild(palettePanel);
  }

  const searchOverlay = createSearchOverlay();
  overlay.appendChild(searchOverlay);

  let menuHoverOpen = Boolean(mapState.menuPinned);
  let menuHoverCloseTimer = null;

  const clearMenuHoverClose = () => {
    if (menuHoverCloseTimer !== null) {
      clearTimeout(menuHoverCloseTimer);
      menuHoverCloseTimer = null;
    }
  };

  const applyMenuState = () => {
    const open = Boolean(mapState.menuPinned) || menuHoverOpen;
    menu.classList.toggle('open', open);
    menu.classList.toggle('pinned', Boolean(mapState.menuPinned));
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-pressed', mapState.menuPinned ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Hide map controls' : 'Open map controls');
  };

  const openMenu = ({ pinned = false } = {}) => {
    if (pinned) {
      mapState.menuPinned = true;
    }
    menuHoverOpen = true;
    clearMenuHoverClose();
    applyMenuState();
  };

  const closeMenu = ({ unpin = false } = {}) => {
    if (unpin) {
      mapState.menuPinned = false;
    }
    menuHoverOpen = false;
    clearMenuHoverClose();
    applyMenuState();
  };

  const scheduleMenuClose = () => {
    if (mapState.menuPinned) {
      return;
    }
    clearMenuHoverClose();
    menuHoverCloseTimer = setTimeout(() => {
      menuHoverCloseTimer = null;
      closeMenu();
    }, 140);
  };

  applyMenuState();

  toggle.addEventListener('click', evt => {
    evt.preventDefault();
    if (mapState.menuPinned) {
      closeMenu({ unpin: true });
    } else {
      openMenu({ pinned: true });
    }
  });


  const handleHoverOpen = () => openMenu();

  menu.addEventListener('mouseenter', handleHoverOpen);
  toggle.addEventListener('mouseenter', handleHoverOpen);
  panel.addEventListener('mouseenter', handleHoverOpen);
  toggle.addEventListener('focusin', handleHoverOpen);
  panel.addEventListener('focusin', handleHoverOpen);

  menu.addEventListener('mouseleave', scheduleMenuClose);
  menu.addEventListener('focusout', evt => {
    if (!menu.contains(evt.relatedTarget) && !mapState.menuPinned) {

      closeMenu();
    }
  });


  closeBtn.addEventListener('click', () => {
    closeMenu({ unpin: true });
  });


  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('map-svg');
  const defaultView = {
    x: (size - viewport) / 2,
    y: (size - viewport) / 2,
    w: viewport,
    h: viewport
  };
  let viewBox;
  if (mapState.viewBox) {
    const current = mapState.viewBox;
    const cx = Number.isFinite(current.x) && Number.isFinite(current.w) ? current.x + current.w / 2 : defaultView.x + defaultView.w / 2;
    const cy = Number.isFinite(current.y) && Number.isFinite(current.h) ? current.y + current.h / 2 : defaultView.y + defaultView.h / 2;
    const minSize = mapState.minView || defaultView.w;
    const maxSize = mapState.sizeLimit || defaultView.w;
    const desiredSize = Number.isFinite(current.w) ? current.w : defaultView.w;
    const clamped = Math.min(Math.max(desiredSize, minSize), maxSize);
    viewBox = {
      x: cx - clamped / 2,
      y: cy - clamped / 2,
      w: clamped,
      h: clamped
    };
  } else {
    viewBox = { ...defaultView };
  }

  mapState.svg = svg;
  mapState.viewBox = viewBox;
  if (!Number.isFinite(mapState.defaultViewSize)) {
    mapState.defaultViewSize = viewBox.w;
  }

  const updateViewBox = () => {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    adjustScale();
  };
  mapState.updateViewBox = updateViewBox;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  buildLineMarkers(defs);
  svg.appendChild(defs);
  svg.appendChild(g);
  mapState.g = g;

  container.appendChild(svg);

  const tooltip = document.createElement('div');
  tooltip.className = 'map-edge-tooltip hidden';
  container.appendChild(tooltip);
  mapState.edgeTooltip = tooltip;

  const selectionBox = document.createElement('div');
  selectionBox.className = 'map-selection hidden';
  container.appendChild(selectionBox);
  mapState.selectionBox = selectionBox;

  attachSvgEvents(svg);

  const positions = {};
  mapState.positions = positions;
  mapState.elements = new Map();

  const linkCounts = Object.fromEntries(items.map(it => [it.id, (it.links || []).length]));
  const maxLinks = Math.max(1, ...Object.values(linkCounts));
  const minRadius = 20;
  const maxRadius = 60;

  const center = size / 2;
  const newItems = [];
  const layout = activeTab ? ensureTabLayout(activeTab) : null;
  const allowLegacyPositions = Boolean(activeTab && activeTab.layoutSeeded !== true);
  let layoutDirty = false;
  let legacyImported = false;
  visibleItems.forEach(it => {
    if (layout && layout[it.id]) {
      positions[it.id] = { ...layout[it.id] };
      return;
    }
    const legacy = it.mapPos;
    if (
      allowLegacyPositions &&
      legacy &&
      typeof legacy === 'object' &&
      Number.isFinite(Number(legacy.x)) &&
      Number.isFinite(Number(legacy.y))
    ) {
      const x = Number(legacy.x);
      const y = Number(legacy.y);
      positions[it.id] = { x, y };
      if (layout) {
        layout[it.id] = { x, y };
        layoutDirty = true;
        legacyImported = true;
      }
      return;
    }
    newItems.push(it);
  });

  newItems.sort((a, b) => (linkCounts[b.id] || 0) - (linkCounts[a.id] || 0));
  const step = (2 * Math.PI) / Math.max(newItems.length, 1);
  newItems.forEach((it, idx) => {
    const angle = idx * step;
    const degree = linkCounts[it.id] || 0;
    const dist = 100 - (degree / maxLinks) * 50;
    const x = center + dist * Math.cos(angle);
    const y = center + dist * Math.sin(angle);
    positions[it.id] = { x, y };
    if (layout) {
      layout[it.id] = { x, y };
      layoutDirty = true;
    }
  });

  if (activeTab && legacyImported && activeTab.layoutSeeded !== true) {
    activeTab.layoutSeeded = true;
    layoutDirty = true;
  }

  if (layoutDirty) {
    await persistMapConfig();
  }

  mapState.selectionIds = mapState.selectionIds.filter(id => positions[id]);

  const hiddenLinks = gatherHiddenLinks(items, itemMap);

  buildToolbox(container, hiddenNodes.length, hiddenLinks.length);
  buildHiddenPanel(container, hiddenNodes, hiddenLinks);

  const drawn = new Set();
  visibleItems.forEach(it => {
    (it.links || []).forEach(l => {
      if (l.hidden) return;
      if (!positions[l.id]) return;
      const key = it.id < l.id ? `${it.id}|${l.id}` : `${l.id}|${it.id}`;
      if (drawn.has(key)) return;
      drawn.add(key);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', calcPath(it.id, l.id));
      path.setAttribute('fill', 'none');
      path.setAttribute('class', 'map-edge');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      applyLineStyle(path, l);
      path.dataset.a = it.id;
      path.dataset.b = l.id;
      path.dataset.label = l.name || '';
      path.addEventListener('click', e => {
        e.stopPropagation();
        handleEdgeClick(path, it.id, l.id, e);
      });
      path.addEventListener('mouseenter', evt => {
        if (mapState.tool === TOOL.HIDE) {
          applyCursorOverride('hide');
        } else if (mapState.tool === TOOL.BREAK) {
          applyCursorOverride('break');
        }
        showEdgeTooltip(path, evt);
      });
      path.addEventListener('mousemove', evt => {
        moveEdgeTooltip(path, evt);
      });
      path.addEventListener('mouseleave', () => {
        if (mapState.tool === TOOL.HIDE) {
          clearCursorOverride('hide');
        }
        if (mapState.tool === TOOL.BREAK) {
          clearCursorOverride('break');
        }
        hideEdgeTooltip(path);
      });
      g.appendChild(path);
    });
  });

  visibleItems.forEach(it => {
    const pos = positions[it.id];
    if (!pos) return;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    const baseR = minRadius + ((maxRadius - minRadius) * (linkCounts[it.id] || 0) / maxLinks);
    circle.setAttribute('r', baseR);
    circle.dataset.radius = baseR;
    circle.setAttribute('class', 'map-node');
    circle.dataset.id = it.id;
    const kindColors = { disease: 'var(--purple)', drug: 'var(--blue)' };
    const fill = kindColors[it.kind] || it.color || 'var(--gray)';
    circle.setAttribute('fill', fill);

    const handleNodePointerDown = e => {
      if (e.button !== 0) return;
      const isNavigateTool = mapState.tool === TOOL.NAVIGATE;
      const isAreaDrag = mapState.tool === TOOL.AREA && mapState.selectionIds.includes(it.id);
      if (!isNavigateTool && !isAreaDrag) return;
      e.stopPropagation();
      e.preventDefault();
      mapState.suppressNextClick = false;
      const { x, y } = clientToMap(e.clientX, e.clientY);
      const current = mapState.positions[it.id] || pos;
      if (isNavigateTool) {
        mapState.nodeDrag = {
          id: it.id,
          offset: { x: x - current.x, y: y - current.y }
        };
        mapState.nodeWasDragged = false;
        setAreaInteracting(true);
      } else {
        mapState.areaDrag = {
          ids: [...mapState.selectionIds],
          start: { x, y },
          origin: mapState.selectionIds.map(id => {
            const source = mapState.positions[id] || positions[id] || { x: 0, y: 0 };
            return { id, pos: { ...source } };
          }),
          moved: false
        };
        mapState.nodeWasDragged = false;
        setAreaInteracting(true);
      }
      refreshCursor({ keepOverride: false });
    };

    circle.addEventListener('mousedown', handleNodePointerDown);

    circle.addEventListener('click', async e => {
      e.stopPropagation();
      if (mapState.suppressNextClick) {
        mapState.suppressNextClick = false;
        mapState.nodeWasDragged = false;
        return;
      }
      if (mapState.tool === TOOL.NAVIGATE) {
        if (!mapState.nodeWasDragged) {
          openItemPopup(it.id);
        }
        mapState.nodeWasDragged = false;
      } else if (mapState.tool === TOOL.HIDE) {
        if (confirm(`Remove ${titleOf(it)} from the map?`)) {
          await setNodeHidden(it.id, true);
          await renderMap(root);
        }
      } else if (mapState.tool === TOOL.ADD_LINK) {
        await handleAddLinkClick(it.id);
      }
    });

    circle.addEventListener('mouseenter', () => {
      if (mapState.tool === TOOL.HIDE) {
        applyCursorOverride('hide');
      } else if (mapState.tool === TOOL.ADD_LINK) {
        applyCursorOverride('link');
      }
    });

    circle.addEventListener('mouseleave', () => {
      if (mapState.tool === TOOL.HIDE) {
        clearCursorOverride('hide');
      }
      if (mapState.tool === TOOL.ADD_LINK) {
        clearCursorOverride('link');
      }
    });

    g.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y - (baseR + 12));
    text.setAttribute('class', 'map-label');
    text.setAttribute('font-size', '16');
    text.dataset.id = it.id;
    text.textContent = it.name || it.concept || '?';
    text.addEventListener('mousedown', handleNodePointerDown);
    text.addEventListener('click', e => {
      e.stopPropagation();
      if (mapState.suppressNextClick) {
        mapState.suppressNextClick = false;
        mapState.nodeWasDragged = false;
        return;
      }
      if (mapState.tool === TOOL.NAVIGATE && !mapState.nodeWasDragged) {
        openItemPopup(it.id);
      }
      mapState.nodeWasDragged = false;
    });
    g.appendChild(text);

    mapState.elements.set(it.id, { circle, label: text });
  });

  updateSelectionHighlight();
  updatePendingHighlight();

  updateViewBox();
  refreshCursor();
}

function ensureListeners() {
  if (mapState.listenersAttached || typeof window === 'undefined') return;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  mapState.listenersAttached = true;
  if (!window._mapResizeAttached) {
    window.addEventListener('resize', adjustScale);
    window._mapResizeAttached = true;
  }
  if (!window._mapToolboxResizeAttached) {
    window.addEventListener('resize', ensureToolboxWithinBounds);
    window._mapToolboxResizeAttached = true;
  }
}

function buildLineMarkers(defs) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const configs = [
    {
      id: 'arrow-end',
      viewBox: '0 0 12 12',
      refX: 12,
      refY: 6,
      markerWidth: 8,
      markerHeight: 8,
      path: 'M0,0 L12,6 L0,12 Z'
    },
    {
      id: 'arrow-start',
      viewBox: '0 0 12 12',
      refX: 0,
      refY: 6,
      markerWidth: 8,
      markerHeight: 8,
      path: 'M12,0 L0,6 L12,12 Z'
    }
  ];
  configs.forEach(cfg => {
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', cfg.id);
    marker.setAttribute('viewBox', cfg.viewBox);
    marker.setAttribute('refX', String(cfg.refX));
    marker.setAttribute('refY', String(cfg.refY));
    marker.setAttribute('markerWidth', String(cfg.markerWidth));
    marker.setAttribute('markerHeight', String(cfg.markerHeight));
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', cfg.path);
    path.setAttribute('fill', 'currentColor');
    marker.appendChild(path);
    defs.appendChild(marker);
  });
}

function attachSvgEvents(svg) {
  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target !== svg) return;
    mapState.justCompletedSelection = false;
    if (mapState.tool !== TOOL.AREA) {
      e.preventDefault();
      mapState.draggingView = true;
      mapState.lastPointer = { x: e.clientX, y: e.clientY };
      setAreaInteracting(true);
      refreshCursor({ keepOverride: false });
    } else if (mapState.tool === TOOL.AREA) {
      e.preventDefault();
      mapState.selectionRect = {
        start: { x: e.clientX, y: e.clientY },
        current: { x: e.clientX, y: e.clientY }
      };
      mapState.selectionBox.classList.remove('hidden');
      setAreaInteracting(true);
    }
  });

  svg.addEventListener('click', e => {
    if (mapState.tool !== TOOL.AREA) return;
    if (e.target !== svg) return;
    if (mapState.justCompletedSelection) {
      mapState.justCompletedSelection = false;
      return;
    }
    if (mapState.selectionIds.length || mapState.previewSelection) {
      mapState.selectionIds = [];
      mapState.previewSelection = null;
      updateSelectionHighlight();
    }
    setAreaInteracting(false);
  });

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.9 : 1.1;
    const rect = svg.getBoundingClientRect();
    const mx = mapState.viewBox.x + ((e.clientX - rect.left) / rect.width) * mapState.viewBox.w;
    const my = mapState.viewBox.y + ((e.clientY - rect.top) / rect.height) * mapState.viewBox.h;
    const maxSize = mapState.sizeLimit || 2000;
    const minSize = mapState.minView || 100;
    const nextW = Math.max(minSize, Math.min(maxSize, mapState.viewBox.w * factor));
    mapState.viewBox.w = nextW;
    mapState.viewBox.h = nextW;
    mapState.viewBox.x = mx - ((e.clientX - rect.left) / rect.width) * mapState.viewBox.w;
    mapState.viewBox.y = my - ((e.clientY - rect.top) / rect.height) * mapState.viewBox.h;
    mapState.updateViewBox();
  }, { passive: false });
}

function handleMouseMove(e) {
  if (!mapState.svg) return;

  if (mapState.toolboxDrag) {
    moveToolboxDrag(e.clientX, e.clientY);
    return;
  }

  if (mapState.menuDrag) {
    updateMenuDragPosition(e.clientX, e.clientY);
    return;
  }

  if (mapState.nodeDrag) {
    const entry = mapState.elements.get(mapState.nodeDrag.id);
    if (!entry || !entry.circle) return;
    const { x, y } = clientToMap(e.clientX, e.clientY);
    const nx = x - mapState.nodeDrag.offset.x;
    const ny = y - mapState.nodeDrag.offset.y;
    mapState.positions[mapState.nodeDrag.id] = { x: nx, y: ny };
    updateNodeGeometry(mapState.nodeDrag.id, entry);
    updateEdgesFor(mapState.nodeDrag.id);
    mapState.nodeWasDragged = true;
    return;
  }

  if (mapState.areaDrag) {
    updateAutoPanFromPointer(e.clientX, e.clientY);
    const { x, y } = clientToMap(e.clientX, e.clientY);
    const dx = x - mapState.areaDrag.start.x;
    const dy = y - mapState.areaDrag.start.y;
    mapState.areaDrag.moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    mapState.areaDrag.origin.forEach(({ id, pos }) => {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      mapState.positions[id] = { x: nx, y: ny };
      updateNodeGeometry(id);
      updateEdgesFor(id);
    });
    mapState.nodeWasDragged = true;
    return;
  }

  if (mapState.draggingView) {
    const scale = mapState.viewBox.w / mapState.svg.clientWidth;
    mapState.viewBox.x -= (e.clientX - mapState.lastPointer.x) * scale;
    mapState.viewBox.y -= (e.clientY - mapState.lastPointer.y) * scale;
    mapState.lastPointer = { x: e.clientX, y: e.clientY };
    mapState.updateViewBox();
    return;
  }

  if (mapState.selectionRect) {
    updateAutoPanFromPointer(e.clientX, e.clientY);
    mapState.selectionRect.current = { x: e.clientX, y: e.clientY };
    updateSelectionBox();
  }
}

async function handleMouseUp(e) {
  if (!mapState.svg) return;

  if (mapState.toolboxDrag) {
    stopToolboxDrag();
  }

  if (mapState.menuDrag) {
    await finishMenuDrag(e.clientX, e.clientY);
    return;
  }

  let cursorNeedsRefresh = false;

  if (mapState.nodeDrag) {
    const id = mapState.nodeDrag.id;
    mapState.nodeDrag = null;
    cursorNeedsRefresh = true;
    if (mapState.nodeWasDragged) {
      await persistNodePosition(id);
      mapState.suppressNextClick = true;
    } else {
      mapState.suppressNextClick = false;
    }
    mapState.nodeWasDragged = false;
    setAreaInteracting(false);
  }

  if (mapState.areaDrag) {
    const moved = mapState.areaDrag.moved;
    const ids = mapState.areaDrag.ids;
    mapState.areaDrag = null;
    cursorNeedsRefresh = true;
    if (moved) {
      for (const id of ids) {
        await persistNodePosition(id, { persist: false });
      }
      await persistMapConfig();
      mapState.suppressNextClick = true;
    } else {
      mapState.suppressNextClick = false;
    }
    mapState.nodeWasDragged = false;
    stopAutoPan();
    setAreaInteracting(false);
  }

  if (mapState.draggingView) {
    mapState.draggingView = false;
    cursorNeedsRefresh = true;
    setAreaInteracting(false);
  }

  if (mapState.selectionRect) {
    const selected = computeSelectionFromRect();
    mapState.selectionIds = selected;
    mapState.previewSelection = null;
    mapState.selectionRect = null;
    mapState.selectionBox.classList.add('hidden');
    updateSelectionHighlight();
    stopAutoPan();
    setAreaInteracting(false);
    mapState.justCompletedSelection = true;
  }

  if (cursorNeedsRefresh) {
    refreshCursor({ keepOverride: true });
  }
}

function clientToMap(clientX, clientY) {
  if (!mapState.svg) return { x: 0, y: 0 };
  const rect = mapState.svg.getBoundingClientRect();
  const x = mapState.viewBox.x + ((clientX - rect.left) / rect.width) * mapState.viewBox.w;
  const y = mapState.viewBox.y + ((clientY - rect.top) / rect.height) * mapState.viewBox.h;
  return { x, y };
}

function updateSelectionBox() {
  if (!mapState.selectionRect || !mapState.selectionBox || !mapState.svg) return;
  const { start, current } = mapState.selectionRect;
  const rect = mapState.svg.getBoundingClientRect();
  const left = Math.min(start.x, current.x) - rect.left;
  const top = Math.min(start.y, current.y) - rect.top;
  const width = Math.abs(start.x - current.x);
  const height = Math.abs(start.y - current.y);
  mapState.selectionBox.style.left = `${left}px`;
  mapState.selectionBox.style.top = `${top}px`;
  mapState.selectionBox.style.width = `${width}px`;
  mapState.selectionBox.style.height = `${height}px`;

  const from = clientToMap(start.x, start.y);
  const to = clientToMap(current.x, current.y);
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const preview = [];
  Object.entries(mapState.positions).forEach(([id, pos]) => {
    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
      preview.push(id);
    }
  });
  mapState.previewSelection = preview;
  updateSelectionHighlight();
}

function updateAutoPanFromPointer(clientX, clientY) {
  if (!mapState.svg || mapState.tool !== TOOL.AREA) return;
  const vector = computeAutoPanVector(clientX, clientY);
  if (vector) {
    startAutoPan(vector);
  } else {
    stopAutoPan();
  }
}

function computeAutoPanVector(clientX, clientY) {
  const rect = mapState.svg.getBoundingClientRect();
  const threshold = 40;
  const baseSpeed = 25;
  let dx = 0;
  let dy = 0;

  const leftDist = clientX - rect.left;
  const rightDist = rect.right - clientX;
  const topDist = clientY - rect.top;
  const bottomDist = rect.bottom - clientY;

  if (leftDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - leftDist) / threshold);
    dx -= intensity * baseSpeed;
  } else if (rightDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - rightDist) / threshold);
    dx += intensity * baseSpeed;
  }

  if (topDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - topDist) / threshold);
    dy -= intensity * baseSpeed;
  } else if (bottomDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - bottomDist) / threshold);
    dy += intensity * baseSpeed;
  }

  if (dx || dy) {
    return { dx, dy };
  }
  return null;
}

function startAutoPan(vector) {
  mapState.autoPan = vector;
  applyAutoPan(vector);
  if (typeof window === 'undefined') return;
  if (mapState.autoPanFrame) return;
  const step = () => {
    if (!mapState.autoPan) {
      mapState.autoPanFrame = null;
      return;
    }
    applyAutoPan(mapState.autoPan);
    mapState.autoPanFrame = window.requestAnimationFrame(step);
  };
  mapState.autoPanFrame = window.requestAnimationFrame(step);
}

function applyAutoPan(vector) {
  if (!mapState.svg || !mapState.viewBox || !mapState.updateViewBox) return;
  const rect = mapState.svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const scaleX = mapState.viewBox.w / rect.width;
  const scaleY = mapState.viewBox.h / rect.height;
  mapState.viewBox.x += vector.dx * scaleX;
  mapState.viewBox.y += vector.dy * scaleY;
  mapState.updateViewBox();
}

function stopAutoPan() {
  mapState.autoPan = null;
  if (mapState.autoPanFrame && typeof window !== 'undefined') {
    window.cancelAnimationFrame(mapState.autoPanFrame);
  }
  mapState.autoPanFrame = null;
}

function computeSelectionFromRect() {
  if (mapState.previewSelection) return mapState.previewSelection.slice();
  return mapState.selectionIds.slice();
}

function getCurrentScales() {
  return mapState.currentScales || { nodeScale: 1, labelScale: 1, lineScale: 1 };
}

function getLineThicknessValue(key) {
  return LINE_THICKNESS_VALUES[key] || LINE_THICKNESS_VALUES[DEFAULT_LINE_THICKNESS];
}

function normalizeLineStyle(style) {
  if (!style) return DEFAULT_LINE_STYLE;
  if (style === 'arrow') return 'arrow-end';
  return LINE_STYLE_VALUE_SET.has(style) ? style : DEFAULT_LINE_STYLE;
}

function updateNodeGeometry(id, entry = mapState.elements.get(id)) {
  if (!entry) return;
  const { circle, label } = entry;
  const pos = mapState.positions[id];
  if (!circle || !pos) return;
  const baseR = Number(circle.dataset.radius) || 20;
  const scales = getCurrentScales();
  const nodeScale = scales.nodeScale || 1;
  const labelScale = scales.labelScale || 1;
  circle.setAttribute('cx', pos.x);
  circle.setAttribute('cy', pos.y);
  circle.setAttribute('r', baseR * nodeScale);
  if (label) {
    label.setAttribute('x', pos.x);
    const offset = (baseR + 12) * nodeScale;
    label.setAttribute('y', pos.y - offset);
    label.setAttribute('font-size', 16 * labelScale);
  }
}

function updateSelectionHighlight() {
  const ids = mapState.previewSelection || mapState.selectionIds;
  const set = new Set(ids);
  mapState.elements.forEach(({ circle, label }, id) => {
    if (set.has(id)) {
      circle.classList.add('selected');
      label.classList.add('selected');
    } else {
      circle.classList.remove('selected');
      label.classList.remove('selected');
    }
  });
}

function updatePendingHighlight() {
  mapState.elements.forEach(({ circle, label }, id) => {
    if (mapState.pendingLink === id) {
      circle.classList.add('pending');
      label.classList.add('pending');
    } else {
      circle.classList.remove('pending');
      label.classList.remove('pending');
    }
  });
}

function updateEdgesFor(id) {
  if (!mapState.g) return;
  mapState.g.querySelectorAll(`path[data-a='${id}'], path[data-b='${id}']`).forEach(edge => {
    edge.setAttribute('d', calcPath(edge.dataset.a, edge.dataset.b));
    syncLineDecoration(edge);
  });
}

function buildToolbox(container, hiddenNodeCount, hiddenLinkCount) {
  const tools = [
    { id: TOOL.NAVIGATE, icon: '🧭', label: 'Navigate' },
    { id: TOOL.HIDE, icon: '🪄', label: 'Hide' },
    { id: TOOL.BREAK, icon: '✂️', label: 'Break link' },
    { id: TOOL.ADD_LINK, icon: '🔗', label: 'Add link' },
    { id: TOOL.AREA, icon: '📦', label: 'Select area' }
  ];

  const box = document.createElement('div');
  box.className = 'map-toolbox';
  box.style.left = `${mapState.toolboxPos.x}px`;
  box.style.top = `${mapState.toolboxPos.y}px`;
  mapState.toolboxEl = box;
  mapState.toolboxContainer = container;

  box.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    if (event.target.closest('.map-tool') || event.target.closest('.map-toolbox-drag')) return;
    startToolboxDrag(event);
  });

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'map-toolbox-drag';
  handle.setAttribute('aria-label', 'Drag toolbar');
  handle.innerHTML = '<span>⋮</span>';
  handle.addEventListener('mousedown', startToolboxDrag);
  box.appendChild(handle);

  const list = document.createElement('div');
  list.className = 'map-tool-list';
  tools.forEach(tool => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-tool' + (mapState.tool === tool.id ? ' active' : '');
    btn.textContent = tool.icon;
    btn.title = tool.label;
    btn.addEventListener('click', () => {
      if (mapState.tool !== tool.id) {
        mapState.tool = tool.id;
        if (tool.id !== TOOL.AREA) {
          mapState.selectionIds = [];
          mapState.previewSelection = null;
        }
        if (tool.id !== TOOL.ADD_LINK) {
          mapState.pendingLink = null;
        }
        if (tool.id === TOOL.HIDE) {
          mapState.hiddenMenuTab = mapState.hiddenMenuTab === 'links' ? 'links' : 'nodes';
          mapState.panelVisible = true;
        }
        mapState.cursorOverride = null;
        renderMap(mapState.root);
      }
    });
    list.appendChild(btn);
  });
  box.appendChild(list);

  const badges = document.createElement('div');
  badges.className = 'map-tool-badges';
  const nodeBadge = document.createElement('span');
  nodeBadge.className = 'map-tool-badge';
  nodeBadge.setAttribute('title', `${hiddenNodeCount} hidden node${hiddenNodeCount === 1 ? '' : 's'}`);
  nodeBadge.innerHTML = `<span>🙈</span><strong>${hiddenNodeCount}</strong>`;
  badges.appendChild(nodeBadge);

  const linkBadge = document.createElement('span');
  linkBadge.className = 'map-tool-badge';
  linkBadge.setAttribute('title', `${hiddenLinkCount} hidden link${hiddenLinkCount === 1 ? '' : 's'}`);
  linkBadge.innerHTML = `<span>🕸️</span><strong>${hiddenLinkCount}</strong>`;
  badges.appendChild(linkBadge);

  box.appendChild(badges);

  container.appendChild(box);
  ensureToolboxWithinBounds();
}

function buildHiddenPanel(container, hiddenNodes, hiddenLinks) {
  const allowPanel = mapState.tool === TOOL.HIDE;
  const panel = document.createElement('div');
  panel.className = 'map-hidden-panel';
  if (!(allowPanel && mapState.panelVisible)) {
    panel.classList.add('hidden');
  }

  const header = document.createElement('div');
  header.className = 'map-hidden-header';

  const tabs = document.createElement('div');
  tabs.className = 'map-hidden-tabs';

  const nodeTab = document.createElement('button');
  nodeTab.type = 'button';
  nodeTab.textContent = `Nodes (${hiddenNodes.length})`;
  nodeTab.className = mapState.hiddenMenuTab === 'nodes' ? 'active' : '';
  nodeTab.addEventListener('click', () => {
    mapState.hiddenMenuTab = 'nodes';
    renderMap(mapState.root);
  });
  tabs.appendChild(nodeTab);

  const linkTab = document.createElement('button');
  linkTab.type = 'button';
  linkTab.textContent = `Links (${hiddenLinks.length})`;
  linkTab.className = mapState.hiddenMenuTab === 'links' ? 'active' : '';
  linkTab.addEventListener('click', () => {
    mapState.hiddenMenuTab = 'links';
    renderMap(mapState.root);
  });
  tabs.appendChild(linkTab);

  header.appendChild(tabs);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'map-hidden-close';
  closeBtn.textContent = mapState.panelVisible ? 'Hide' : 'Show';
  closeBtn.addEventListener('click', () => {
    mapState.panelVisible = !mapState.panelVisible;
    renderMap(mapState.root);
  });
  header.appendChild(closeBtn);

  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'map-hidden-body';

  if (mapState.hiddenMenuTab === 'nodes') {
    const list = document.createElement('div');
    list.className = 'map-hidden-list';
    if (hiddenNodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'map-hidden-empty';
      empty.textContent = 'No hidden nodes.';
      list.appendChild(empty);
    } else {
      hiddenNodes
        .slice()
        .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
        .forEach(it => {
          const item = document.createElement('div');
          item.className = 'map-hidden-item';
          item.classList.add('draggable');
          item.textContent = titleOf(it) || it.id;
          item.addEventListener('mousedown', e => {
            if (mapState.tool !== TOOL.HIDE) return;
            startMenuDrag(it, e, { source: 'hidden' });
          });
          list.appendChild(item);
        });
    }
    body.appendChild(list);
  } else {
    const list = document.createElement('div');
    list.className = 'map-hidden-list';
    if (hiddenLinks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'map-hidden-empty';
      empty.textContent = 'No hidden links.';
      list.appendChild(empty);
    } else {
      hiddenLinks.forEach(link => {
        const item = document.createElement('div');
        item.className = 'map-hidden-item';
        const label = document.createElement('span');
        label.textContent = `${titleOf(link.a)} ↔ ${titleOf(link.b)}`;
        item.appendChild(label);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Unhide';
        btn.addEventListener('click', async () => {
          await setLinkHidden(link.a.id, link.b.id, false);
          await renderMap(mapState.root);
        });
        item.appendChild(btn);
        list.appendChild(item);
      });
    }
    body.appendChild(list);
  }

  panel.appendChild(body);

  container.appendChild(panel);

  if (allowPanel && !mapState.panelVisible) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'map-hidden-toggle';
    toggle.textContent = 'Show menu';
    toggle.addEventListener('click', () => {
      mapState.panelVisible = true;
      renderMap(mapState.root);
    });
    container.appendChild(toggle);
  }
}

function startMenuDrag(item, event, options = {}) {
  event.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'map-drag-ghost';
  ghost.textContent = titleOf(item) || item.id;
  document.body.appendChild(ghost);
  mapState.menuDrag = {
    id: item.id,
    ghost,
    source: options.source || 'hidden',
    tabId: options.tabId || (getActiveTab()?.id || null)
  };
  updateMenuDragPosition(event.clientX, event.clientY);
}

async function finishMenuDrag(clientX, clientY) {
  const drag = mapState.menuDrag;
  mapState.menuDrag = null;
  if (drag?.ghost) drag.ghost.remove();
  if (!drag || !mapState.svg) return;
  const rect = mapState.svg.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return;
  }
  const { x, y } = clientToMap(clientX, clientY);
  const item = await getItem(drag.id);
  if (!item) return;
  if (drag.source === 'palette') {
    const tab = getActiveTab();
    if (!tab || !tab.manualMode) return;
    if (drag.tabId && tab.id !== drag.tabId) return;
    if (!Array.isArray(tab.manualIds)) {
      tab.manualIds = [];
    }
    let shouldPersist = false;
    if (!tab.manualIds.includes(item.id)) {
      tab.manualIds.push(item.id);
      shouldPersist = true;
    }
    item.mapHidden = false;
    await upsertItem(item);
    const layout = ensureTabLayout(tab);
    const prev = layout[item.id];
    layout[item.id] = { x, y };
    if (!prev || prev.x !== x || prev.y !== y) {
      shouldPersist = true;
    }
    if (shouldPersist) {
      await persistMapConfig();
    }
    await renderMap(mapState.root);
    return;
  }
  item.mapHidden = false;
  await upsertItem(item);
  const tab = getActiveTab();
  if (tab) {
    const layout = ensureTabLayout(tab);
    const prev = layout[item.id];
    layout[item.id] = { x, y };
    if (!prev || prev.x !== x || prev.y !== y) {
      await persistMapConfig();
    }
  }
  await renderMap(mapState.root);
}

function updateMenuDragPosition(clientX, clientY) {
  if (!mapState.menuDrag?.ghost) return;
  mapState.menuDrag.ghost.style.left = `${clientX + 12}px`;
  mapState.menuDrag.ghost.style.top = `${clientY + 12}px`;
}

function startToolboxDrag(event) {
  if (event.button !== 0) return;
  if (!mapState.toolboxEl || !mapState.toolboxContainer) return;
  if (event.target.closest('.map-toolbox-toggle')) return;
  event.preventDefault();
  const boxRect = mapState.toolboxEl.getBoundingClientRect();
  const containerRect = mapState.toolboxContainer.getBoundingClientRect();
  mapState.toolboxDrag = {
    offsetX: event.clientX - boxRect.left,
    offsetY: event.clientY - boxRect.top,
    boxWidth: boxRect.width,
    boxHeight: boxRect.height,
    containerRect
  };
  if (typeof document !== 'undefined') {
    document.body.classList.add('map-toolbox-dragging');
  }
}

function moveToolboxDrag(clientX, clientY) {
  const drag = mapState.toolboxDrag;
  if (!drag || !mapState.toolboxEl) return;
  const { containerRect, offsetX, offsetY, boxWidth, boxHeight } = drag;
  const width = containerRect.width;
  const height = containerRect.height;
  if (!width || !height) return;
  let x = clientX - containerRect.left - offsetX;
  let y = clientY - containerRect.top - offsetY;
  const maxX = Math.max(0, width - boxWidth);
  const maxY = Math.max(0, height - boxHeight);
  x = clamp(x, 0, maxX);
  y = clamp(y, 0, maxY);
  mapState.toolboxPos = { x, y };
  mapState.toolboxEl.style.left = `${x}px`;
  mapState.toolboxEl.style.top = `${y}px`;
}

function stopToolboxDrag() {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('map-toolbox-dragging');
  }
  if (!mapState.toolboxDrag) {
    ensureToolboxWithinBounds();
    return;
  }
  mapState.toolboxDrag = null;
  ensureToolboxWithinBounds();
}

function ensureToolboxWithinBounds() {
  const box = mapState.toolboxEl;
  const container = mapState.toolboxContainer;
  if (!box || !container || !box.isConnected || !container.isConnected) return;
  const containerRect = container.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;
  if (!width || !height) return;
  const maxX = Math.max(0, width - boxRect.width);
  const maxY = Math.max(0, height - boxRect.height);
  const x = clamp(mapState.toolboxPos.x, 0, maxX);
  const y = clamp(mapState.toolboxPos.y, 0, maxY);
  mapState.toolboxPos = { x, y };
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

function determineBaseCursor() {
  if (mapState.draggingView || mapState.nodeDrag || mapState.areaDrag) return 'grabbing';
  switch (mapState.tool) {
    case TOOL.AREA:
      return 'crosshair';
    case TOOL.NAVIGATE:
      return 'grab';
    case TOOL.HIDE:
    case TOOL.BREAK:
    case TOOL.ADD_LINK:
      return 'grab';
    default:
      return 'pointer';
  }
}

function refreshCursor(options = {}) {
  if (!mapState.svg) return;
  const { keepOverride = false } = options;
  const base = determineBaseCursor();
  mapState.baseCursor = base;
  if (mapState.cursorOverride) {
    const overrideStyle = CURSOR_STYLE[mapState.cursorOverride];
    if (keepOverride && overrideStyle) {
      mapState.svg.style.cursor = overrideStyle;
      return;
    }
    mapState.cursorOverride = null;
  }
  mapState.svg.style.cursor = base;
}

function applyCursorOverride(kind) {
  if (!mapState.svg) return;
  if (mapState.nodeDrag || mapState.areaDrag || mapState.draggingView) return;
  const style = CURSOR_STYLE[kind];
  if (!style) return;
  mapState.cursorOverride = kind;
  mapState.svg.style.cursor = style;
}

function clearCursorOverride(kind) {
  if (mapState.cursorOverride !== kind) return;
  mapState.cursorOverride = null;
  refreshCursor();
}

async function persistNodePosition(id, options = {}) {
  const tab = getActiveTab();
  if (!tab) return;
  const pos = mapState.positions[id];
  if (!pos) return;
  const layout = ensureTabLayout(tab);
  layout[id] = { x: pos.x, y: pos.y };
  if (options.persist !== false) {
    await persistMapConfig();
  }
}

function gatherHiddenLinks(items, itemMap) {
  const hidden = [];
  const seen = new Set();
  items.forEach(it => {
    (it.links || []).forEach(link => {
      if (!link.hidden) return;
      const other = itemMap[link.id];
      if (!other) return;
      const key = it.id < link.id ? `${it.id}|${link.id}` : `${link.id}|${it.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      hidden.push({ a: it, b: other });
    });
  });
  return hidden;
}

async function handleAddLinkClick(nodeId) {
  if (!mapState.pendingLink) {
    mapState.pendingLink = nodeId;
    updatePendingHighlight();
    return;
  }
  if (mapState.pendingLink === nodeId) {
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  const from = mapState.itemMap[mapState.pendingLink];
  const to = mapState.itemMap[nodeId];
  if (!from || !to) {
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  const existing = (from.links || []).find(l => l.id === nodeId);
  if (existing) {
    if (existing.hidden) {
      if (confirm('A hidden link already exists. Unhide it?')) {
        await setLinkHidden(from.id, to.id, false);
        await renderMap(mapState.root);
      }
    } else {
      alert('These concepts are already linked.');
    }
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  if (!confirm(`Create a link between ${titleOf(from)} and ${titleOf(to)}?`)) {
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  const label = prompt('Optional label for this link:', '') || '';
  await createLink(from.id, to.id, {
    name: label,
    color: DEFAULT_LINK_COLOR,
    style: DEFAULT_LINE_STYLE,
    thickness: DEFAULT_LINE_THICKNESS,
    hidden: false
  });
  mapState.pendingLink = null;
  updatePendingHighlight();
  await renderMap(mapState.root);
}

function handleEdgeClick(path, aId, bId, evt) {
  hideEdgeTooltip(path);
  if (mapState.tool === TOOL.NAVIGATE) {
    openLineMenu(evt, path, aId, bId);
  } else if (mapState.tool === TOOL.BREAK) {
    if (confirm('Are you sure you want to delete this link?')) {
      removeLink(aId, bId).then(() => renderMap(mapState.root));
    }
  } else if (mapState.tool === TOOL.HIDE) {
    if (confirm('Hide this link on the map?')) {
      setLinkHidden(aId, bId, true).then(() => renderMap(mapState.root));
    }
  }
}

function showEdgeTooltip(line, evt) {
  const tooltip = mapState.edgeTooltip;
  const container = mapState.container;
  if (!tooltip || !container) return;
  const text = line?.dataset?.label || '';
  if (!text) {
    hideEdgeTooltip(line);
    return;
  }
  tooltip.textContent = text;
  tooltip.classList.remove('hidden');
  mapState.hoveredEdge = line;
  if (evt && Number.isFinite(evt.clientX) && Number.isFinite(evt.clientY)) {
    mapState.hoveredEdgePointer = { x: evt.clientX, y: evt.clientY };
  }
  positionEdgeTooltip(evt);
}

function moveEdgeTooltip(line, evt) {
  if (mapState.hoveredEdge !== line) return;
  if (!mapState.edgeTooltip || mapState.edgeTooltip.classList.contains('hidden')) return;
  if (evt && Number.isFinite(evt.clientX) && Number.isFinite(evt.clientY)) {
    mapState.hoveredEdgePointer = { x: evt.clientX, y: evt.clientY };
  }
  positionEdgeTooltip(evt);
}

function hideEdgeTooltip(line) {
  if (line && mapState.hoveredEdge && mapState.hoveredEdge !== line) return;
  const tooltip = mapState.edgeTooltip;
  if (!tooltip) return;
  tooltip.classList.add('hidden');
  tooltip.textContent = '';
  mapState.hoveredEdge = null;
}

function positionEdgeTooltip(evt) {
  const tooltip = mapState.edgeTooltip;
  const container = mapState.container;
  if (!tooltip || !container) return;
  const rect = container.getBoundingClientRect();
  const pointer = evt && Number.isFinite(evt.clientX) && Number.isFinite(evt.clientY)
    ? { x: evt.clientX, y: evt.clientY }
    : mapState.hoveredEdgePointer;
  const rawX = pointer.x - rect.left + 14;
  const rawY = pointer.y - rect.top + 14;
  const maxX = rect.width - tooltip.offsetWidth - 12;
  const maxY = rect.height - tooltip.offsetHeight - 12;
  const clampedX = clamp(rawX, 12, Math.max(12, maxX));
  const clampedY = clamp(rawY, 12, Math.max(12, maxY));
  tooltip.style.left = `${clampedX}px`;
  tooltip.style.top = `${clampedY}px`;
}

function adjustScale() {
  const svg = mapState.svg;
  if (!svg) return;
  const vb = svg.getAttribute('viewBox');
  if (!vb) return;
  const [,, w] = vb.split(' ').map(Number);
  if (!Number.isFinite(w) || w <= 0) return;
  const defaultSize = Number.isFinite(mapState.defaultViewSize) ? mapState.defaultViewSize : w;
  const zoomInRatio = defaultSize / w;
  const zoomOutRatio = w / defaultSize;
  const nodeScale = clamp(Math.pow(zoomInRatio, 0.5), 0.65, 2.6);
  const labelScale = clamp(Math.pow(zoomOutRatio, 0.4), 1.2, 3.2);
  const lineScale = clamp(Math.pow(zoomInRatio, 0.33), 0.7, 2.4);

  mapState.currentScales = { nodeScale, labelScale, lineScale };

  mapState.elements.forEach((entry, id) => {
    updateNodeGeometry(id, entry);
  });

  svg.querySelectorAll('.map-edge').forEach(line => {
    updateLineStrokeWidth(line);
    syncLineDecoration(line);
  });
}

function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function calcPath(aId, bId) {
  const positions = mapState.positions;
  const a = positions[aId];
  const b = positions[bId];
  if (!a || !b) return '';
  const x1 = a.x, y1 = a.y;
  const x2 = b.x, y2 = b.y;
  let cx = (x1 + x2) / 2;
  let cy = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  for (const id in positions) {
    if (id === aId || id === bId) continue;
    const p = positions[id];
    if (pointToSegment(p.x, p.y, x1, y1, x2, y2) < 40) {
      const nx = -dy / len;
      const ny = dx / len;
      const side = ((p.x - x1) * nx + (p.y - y1) * ny) > 0 ? 1 : -1;
      cx += nx * 80 * side;
      cy += ny * 80 * side;
      break;
    }
  }
  return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
}

function applyLineStyle(line, info = {}) {
  const previousColor = line.dataset.color;
  const previousStyle = line.dataset.style;
  const previousThickness = line.dataset.thickness;
  const previousLabel = line.dataset.label;

  const color = info.color ?? previousColor ?? DEFAULT_LINK_COLOR;
  const style = normalizeLineStyle(info.style ?? previousStyle);
  const thickness = info.thickness ?? previousThickness ?? DEFAULT_LINE_THICKNESS;
  const label = info.name ?? previousLabel ?? '';

  line.dataset.color = color;
  line.dataset.style = style;
  line.dataset.thickness = thickness;
  line.dataset.baseWidth = String(getLineThicknessValue(thickness));
  line.dataset.label = label;

  line.style.stroke = color;
  line.style.color = color;
  line.style.filter = '';
  line.removeAttribute('marker-start');
  line.removeAttribute('marker-end');
  line.removeAttribute('marker-mid');
  line.removeAttribute('stroke-dasharray');
  line.classList.remove('edge-glow');

  updateLineStrokeWidth(line);

  if (style === 'dashed') {
    const base = getLineThicknessValue(thickness);
    line.setAttribute('stroke-dasharray', `${base * 3},${base * 2}`);
    line.setAttribute('stroke-linecap', 'round');
  } else if (style === 'dotted') {
    const base = Math.max(1, getLineThicknessValue(thickness) * 0.9);
    line.setAttribute('stroke-dasharray', `${base},${base * 2.1}`);
    line.setAttribute('stroke-linecap', 'round');
  } else {
    line.removeAttribute('stroke-dasharray');
    line.setAttribute('stroke-linecap', 'round');
  }

  if (style === 'arrow-end') {
    line.setAttribute('marker-end', 'url(#arrow-end)');
  } else if (style === 'arrow-start') {
    line.setAttribute('marker-start', 'url(#arrow-start)');
  } else if (style === 'arrow-both') {
    line.setAttribute('marker-start', 'url(#arrow-start)');
    line.setAttribute('marker-end', 'url(#arrow-end)');
  }

  if (style === 'glow') {
    line.classList.add('edge-glow');
  }

  const title = line.querySelector('title');
  if (title) title.remove();
  if (label) {
    line.setAttribute('aria-label', label);
  } else {
    line.removeAttribute('aria-label');
  }

  if (mapState.hoveredEdge === line) {
    if (label) {
      showEdgeTooltip(line, { clientX: mapState.hoveredEdgePointer.x, clientY: mapState.hoveredEdgePointer.y });
    } else {
      hideEdgeTooltip(line);
    }
  }

  syncLineDecoration(line);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateLineStrokeWidth(line) {
  if (!line) return;
  const baseWidth = Number(line.dataset.baseWidth) || getLineThicknessValue(line.dataset.thickness);
  const { lineScale = 1 } = getCurrentScales();
  const strokeWidth = baseWidth * lineScale;
  if (Number.isFinite(strokeWidth)) {
    line.setAttribute('stroke-width', strokeWidth);
  }
  if (line._overlay) {
    const overlayBase = Number(line._overlay.dataset.baseWidth) || baseWidth * 0.85;
    const overlayWidth = overlayBase * lineScale;
    if (Number.isFinite(overlayWidth)) {
      line._overlay.setAttribute('stroke-width', overlayWidth);
    }
  }
}

function syncLineDecoration(line) {
  const style = normalizeLineStyle(line?.dataset?.style);
  if (style === 'blocked') {
    const overlay = ensureLineOverlay(line);
    if (overlay) updateBlockedOverlay(line, overlay);
  } else {
    removeLineOverlay(line);
  }
}

function ensureLineOverlay(line) {
  if (!line || !line.parentNode) return null;
  let overlay = line._overlay;
  if (overlay && overlay.parentNode !== line.parentNode) {
    overlay.remove();
    overlay = null;
  }
  if (!overlay) {
    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    overlay.classList.add('map-edge-decoration');
    overlay.setAttribute('fill', 'none');
    overlay.setAttribute('pointer-events', 'none');
    overlay.setAttribute('stroke-linecap', 'round');
    overlay.setAttribute('stroke-linejoin', 'round');
    line.parentNode.insertBefore(overlay, line.nextSibling);
    line._overlay = overlay;
  }
  return overlay;
}

function removeLineOverlay(line) {
  if (line && line._overlay) {
    line._overlay.remove();
    line._overlay = null;
  }
}

function updateBlockedOverlay(line, overlay) {
  if (!line || !overlay) return;
  const a = mapState.positions[line.dataset.a];
  const b = mapState.positions[line.dataset.b];
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!len) return;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const tx = dx / len;
  const ty = dy / len;
  const nx = -ty;
  const ny = tx;
  const diag1x = tx + nx;
  const diag1y = ty + ny;
  const diag2x = tx - nx;
  const diag2y = ty - ny;
  const norm1 = Math.hypot(diag1x, diag1y) || 1;
  const norm2 = Math.hypot(diag2x, diag2y) || 1;
  const baseWidth = Number(line.dataset.baseWidth) || getLineThicknessValue(line.dataset.thickness);
  const armLength = Math.max(28, baseWidth * 4.2);
  const d = `M${midX - (diag1x / norm1) * armLength} ${midY - (diag1y / norm1) * armLength}`
    + ` L${midX + (diag1x / norm1) * armLength} ${midY + (diag1y / norm1) * armLength}`
    + ` M${midX - (diag2x / norm2) * armLength} ${midY - (diag2y / norm2) * armLength}`
    + ` L${midX + (diag2x / norm2) * armLength} ${midY + (diag2y / norm2) * armLength}`;
  overlay.setAttribute('d', d);
  const overlayBase = baseWidth * 1.6;
  overlay.dataset.baseWidth = String(overlayBase);
  const scales = getCurrentScales();
  overlay.setAttribute('stroke', '#dc2626');
  overlay.setAttribute('stroke-width', overlayBase * (scales.lineScale || 1));
}

async function setNodeHidden(id, hidden) {
  const item = await getItem(id);
  if (!item) return;
  item.mapHidden = hidden;
  await upsertItem(item);
}

async function createLink(aId, bId, info) {
  const a = await getItem(aId);
  const b = await getItem(bId);
  if (!a || !b) return;
  const linkInfo = {
    id: bId,
    style: DEFAULT_LINE_STYLE,
    thickness: DEFAULT_LINE_THICKNESS,
    color: DEFAULT_LINK_COLOR,
    name: '',
    hidden: false,
    ...info
  };
  const reverseInfo = { ...linkInfo, id: aId };
  a.links = a.links || [];
  b.links = b.links || [];
  a.links.push({ ...linkInfo });
  b.links.push({ ...reverseInfo });
  await upsertItem(a);
  await upsertItem(b);
}

async function removeLink(aId, bId) {
  const a = await getItem(aId);
  const b = await getItem(bId);
  if (!a || !b) return;
  a.links = (a.links || []).filter(l => l.id !== bId);
  b.links = (b.links || []).filter(l => l.id !== aId);
  await upsertItem(a);
  await upsertItem(b);
}

async function setLinkHidden(aId, bId, hidden) {
  await updateLink(aId, bId, { hidden });
}

function titleOf(item) {
  return item?.name || item?.concept || '';
}

async function openLineMenu(evt, line, aId, bId) {
  const existing = await getItem(aId);
  const link = existing.links.find(l => l.id === bId) || {};
  const menu = document.createElement('div');
  menu.className = 'line-menu';
  menu.style.left = evt.pageX + 'px';
  menu.style.top = evt.pageY + 'px';

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = link.color || '#888888';
  colorLabel.appendChild(colorInput);
  menu.appendChild(colorLabel);

  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Style';
  const typeSel = document.createElement('select');
  LINE_STYLE_OPTIONS.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    typeSel.appendChild(opt);
  });
  typeSel.value = normalizeLineStyle(link.style || DEFAULT_LINE_STYLE);
  typeLabel.appendChild(typeSel);
  menu.appendChild(typeLabel);

  const thickLabel = document.createElement('label');
  thickLabel.textContent = 'Thickness';
  const thickSel = document.createElement('select');
  LINE_THICKNESS_OPTIONS.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    thickSel.appendChild(opt);
  });
  thickSel.value = link.thickness || DEFAULT_LINE_THICKNESS;
  thickLabel.appendChild(thickSel);
  menu.appendChild(thickLabel);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Label';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = link.name || '';
  nameLabel.appendChild(nameInput);
  menu.appendChild(nameLabel);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Save';
  btn.addEventListener('click', async () => {
    const patch = {
      color: colorInput.value,
      style: typeSel.value,
      thickness: thickSel.value,
      name: nameInput.value
    };
    await updateLink(aId, bId, patch);
    applyLineStyle(line, patch);
    document.body.removeChild(menu);
  });
  menu.appendChild(btn);

  document.body.appendChild(menu);
  const closer = e => {
    if (!menu.contains(e.target)) {
      document.body.removeChild(menu);
      document.removeEventListener('mousedown', closer);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closer), 0);
}

async function updateLink(aId, bId, patch) {
  const a = await getItem(aId);
  const b = await getItem(bId);
  if (!a || !b) return;
  const apply = (item, otherId) => {
    item.links = item.links || [];
    const l = item.links.find(x => x.id === otherId);
    if (l) Object.assign(l, patch);
  };
  apply(a, bId);
  apply(b, aId);
  await upsertItem(a);
  await upsertItem(b);
}
