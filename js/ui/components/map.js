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

const PAN_ACCELERATION = 1.12;
const ZOOM_INTENSITY = 0.0032;

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
  search:
    '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<circle cx="9" cy="9" r="5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />'
    + '<path d="M12.8 12.8L16.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />'
    + '</svg>',
  arrowRight:
    '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M4 10h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />'
    + '<path d="M10 6l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />'
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
const DEFAULT_CURVE_ANCHOR = 0.5;

const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Smooth' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'arrow-end', label: 'Arrowhead →' },
  { value: 'arrow-start', label: 'Arrowhead ←' },
  { value: 'arrow-both', label: 'Twin arrows ↔' },
  { value: 'blocked', label: 'Blocked ✕' },
  { value: 'inhibit', label: 'Inhibit ⊣' },
  { value: 'glow', label: 'Glow highlight' }
];

const LINE_STYLE_CLASSNAMES = [
  'map-edge--solid',
  'map-edge--dashed',
  'map-edge--dotted',
  'map-edge--arrow-end',
  'map-edge--arrow-start',
  'map-edge--arrow-both',
  'map-edge--blocked',
  'map-edge--inhibit',
  'map-edge--glow'
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

const KIND_FALLBACK_COLORS = {
  disease: 'var(--purple)',
  drug: 'var(--blue)',
  concept: 'var(--green)'
};

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
  edgeDrag: null,
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
  lastPointer: { x: 0, y: 0, mapX: 0, mapY: 0 },
  autoPan: null,
  autoPanFrame: null,
  toolboxPos: { x: 16, y: 16 },
  toolboxDrag: null,
  toolboxEl: null,
  toolboxContainer: null,
  baseCursor: 'grab',
  cursorOverride: null,
  defaultViewSize: null,
  lastScaleSize: null,
  viewBoxFrame: null,
  pendingViewBoxOptions: null,
  svgRect: null,
  svgRectTime: 0,
  justCompletedSelection: false,
  edgeTooltip: null,
  hoveredEdge: null,
  hoveredEdgePointer: { x: 0, y: 0 },
  currentScales: { nodeScale: 1, labelScale: 1, lineScale: 1 },
  suppressNextClick: false,
  edgeDragJustCompleted: false,
  viewPointerId: null,
  mapConfig: null,
  mapConfigLoaded: false,
  blocks: [],
  visibleItems: [],
  searchValue: '',
  searchFeedback: null,
  searchInput: null,
  searchFieldEl: null,
  searchFeedbackEl: null,
  searchSuggestions: [],
  searchSuggestionsEl: null,
  searchActiveIndex: -1,
  searchSuggestionTimer: null,
  paletteSearch: '',
  nodeRadii: null,
  edgeLayer: null,
  nodeLayer: null,
  lineMarkers: new Map(),
  edgeRefs: new Map(),
  allEdges: new Set(),
  pendingNodeUpdates: new Map(),
  nodeUpdateFrame: null
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
      weeks: getFilterWeeks(filter),
      lectureKeys: getFilterLectureKeys(filter)
    }
  };
  return normalized;
}

function parseWeekValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeWeekArray(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach(value => {
    const week = parseWeekValue(value);
    if (!Number.isFinite(week) || seen.has(week)) return;
    seen.add(week);
    result.push(week);
  });
  result.sort((a, b) => a - b);
  return result;
}

function normalizeLectureKeyArray(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach(value => {
    const key = typeof value === 'string' ? value.trim() : '';
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(key);
  });
  return result;
}

function getFilterWeeks(filter = {}) {
  if (!filter || typeof filter !== 'object') {
    return [];
  }
  const weeks = normalizeWeekArray(filter.weeks);
  if (weeks.length) {
    return weeks;
  }
  const legacy = parseWeekValue(filter.week);
  return Number.isFinite(legacy) ? [legacy] : [];
}

function getFilterLectureKeys(filter = {}) {
  if (!filter || typeof filter !== 'object') {
    return [];
  }
  const keys = normalizeLectureKeyArray(filter.lectureKeys);
  if (keys.length) {
    return keys;
  }
  const legacy = typeof filter.lectureKey === 'string' ? filter.lectureKey.trim() : '';
  return legacy ? [legacy] : [];
}

function setFilterWeeks(targetFilter, weeks = []) {
  if (!targetFilter || typeof targetFilter !== 'object') return;
  targetFilter.weeks = normalizeWeekArray(weeks);
  if ('week' in targetFilter) {
    targetFilter.week = '';
  }
}

function setFilterLectureKeys(targetFilter, keys = []) {
  if (!targetFilter || typeof targetFilter !== 'object') return;
  targetFilter.lectureKeys = normalizeLectureKeyArray(keys);
  if ('lectureKey' in targetFilter) {
    targetFilter.lectureKey = '';
  }
}

function deriveItemGroupKeys(item) {
  const groups = [];
  const lectures = Array.isArray(item?.lectures) ? item.lectures : [];
  if (lectures.length) {
    lectures.forEach(lecture => {
      const blockKey = lecture.blockId ? `block:${lecture.blockId}` : 'block:__';
      const lectureId = lecture.id != null ? `lec:${lecture.id}` : '';
      const lectureName = lecture.name ? `name:${lecture.name}` : '';
      const week = Number.isFinite(lecture.week) ? `week:${lecture.week}` : '';
      const key = [blockKey, week, lectureId || lectureName].filter(Boolean).join('|');
      groups.push(key || blockKey);
    });
  } else if (Array.isArray(item?.blocks) && item.blocks.length) {
    item.blocks.forEach(blockId => {
      groups.push(`block-only:${blockId}`);
    });
  }
  if (!groups.length) {
    groups.push(`kind:${item?.kind || 'concept'}`);
  }
  return groups;
}

function parseGroupKey(key = '') {
  const info = { block: '__', week: '__', lecture: key || '__' };
  if (!key) {
    return info;
  }
  const parts = String(key).split('|');
  parts.forEach(part => {
    if (part.startsWith('block:')) {
      const value = part.slice(6);
      info.block = value || '__';
    } else if (part.startsWith('block-only:')) {
      const value = part.slice(11);
      info.block = value || '__';
    } else if (part.startsWith('week:')) {
      const value = part.slice(5);
      info.week = value || '__';
    } else if (part.startsWith('lec:')) {
      const value = part.slice(4);
      info.lecture = value || info.lecture;
    } else if (part.startsWith('name:') && (info.lecture === key || info.lecture === '__')) {
      const value = part.slice(5);
      info.lecture = value || info.lecture;
    }
  });
  if (!info.lecture || info.lecture === '__') {
    info.lecture = key || '__';
  }
  return info;
}

function getPrimaryGroupKey(item, keys = deriveItemGroupKeys(item)) {
  if (Array.isArray(keys) && keys.length) {
    return keys[0];
  }
  return `kind:${item?.kind || 'concept'}`;
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
    filter: { blockId: '', weeks: [], lectureKeys: [] }
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

function updateSearchSuggestions(query) {
  const container = mapState.searchSuggestionsEl;
  if (!container) return;
  if (mapState.searchSuggestionTimer) {
    clearTimeout(mapState.searchSuggestionTimer);
    mapState.searchSuggestionTimer = null;
  }
  container.innerHTML = '';
  mapState.searchSuggestions = [];
  mapState.searchActiveIndex = -1;
  const field = mapState.searchFieldEl;
  const trimmed = (query || '').trim();
  if (!trimmed) {
    container.classList.remove('visible');
    if (field) field.classList.remove('has-suggestions');
    return;
  }
  const lower = trimmed.toLowerCase();
  const items = (mapState.visibleItems || [])
    .map(item => ({ id: item.id, label: titleOf(item) || '' }))
    .filter(entry => entry.label && entry.label.toLowerCase().includes(lower));
  if (!items.length) {
    container.classList.remove('visible');
    if (field) field.classList.remove('has-suggestions');
    return;
  }
  const seen = new Set();
  const unique = [];
  items.forEach(entry => {
    if (!entry.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    unique.push(entry);
  });
  unique.sort((a, b) => {
    const aIndex = a.label.toLowerCase().indexOf(lower);
    const bIndex = b.label.toLowerCase().indexOf(lower);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.label.localeCompare(b.label);
  });
  const limited = unique.slice(0, 6);
  if (!limited.length) {
    container.classList.remove('visible');
    if (field) field.classList.remove('has-suggestions');
    return;
  }
  mapState.searchSuggestions = limited;
  limited.forEach((entry, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'map-search-suggestion';
    option.textContent = entry.label;
    option.addEventListener('mousedown', evt => {
      evt.preventDefault();
    });
    option.addEventListener('click', () => {
      applySearchSuggestion(index);
    });
    container.appendChild(option);
  });
  container.classList.add('visible');
  if (field) field.classList.add('has-suggestions');
}

function clearSearchSuggestions() {
  const container = mapState.searchSuggestionsEl;
  if (mapState.searchSuggestionTimer) {
    clearTimeout(mapState.searchSuggestionTimer);
    mapState.searchSuggestionTimer = null;
  }
  if (container) {
    container.innerHTML = '';
    container.classList.remove('visible');
  }
  mapState.searchSuggestions = [];
  mapState.searchActiveIndex = -1;
  const field = mapState.searchFieldEl;
  if (field) {
    field.classList.remove('has-suggestions');
  }
}

function highlightSearchSuggestion(index) {
  const container = mapState.searchSuggestionsEl;
  if (!container) return;
  const options = Array.from(container.querySelectorAll('.map-search-suggestion'));
  if (!options.length) return;
  const clamped = ((index % options.length) + options.length) % options.length;
  options.forEach((option, i) => {
    option.classList.toggle('active', i === clamped);
    if (i === clamped) {
      option.scrollIntoView({ block: 'nearest' });
    }
  });
  mapState.searchActiveIndex = clamped;
}

function applySearchSuggestion(index) {
  const suggestion = mapState.searchSuggestions?.[index];
  if (!suggestion) return;
  if (mapState.searchInput) {
    mapState.searchInput.value = suggestion.label;
    mapState.searchValue = suggestion.label;
    mapState.searchInput.focus();
  }
  clearSearchSuggestions();
  handleSearchSubmit(suggestion.label);
}

function setSearchInputState({ notFound = false } = {}) {
  const input = mapState.searchInput;
  if (input) {
    input.classList.toggle('not-found', Boolean(notFound));
  }
  if (mapState.searchFieldEl) {
    mapState.searchFieldEl.classList.toggle('not-found', Boolean(notFound));
  }
}

function createMapTabsPanel(activeTab) {
  const config = mapState.mapConfig || { tabs: [] };
  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'map-tabs';

  const header = document.createElement('div');
  header.className = 'map-tabs-header';

  const heading = document.createElement('div');
  heading.className = 'map-tabs-heading';
  const title = document.createElement('h2');
  title.className = 'map-tabs-title';
  title.textContent = 'Concept maps';
  heading.appendChild(title);
  const subtitle = document.createElement('p');
  subtitle.className = 'map-tabs-subtitle';
  subtitle.textContent = 'Jump between saved layouts or spin up a fresh canvas.';
  heading.appendChild(subtitle);
  header.appendChild(heading);

  const actions = document.createElement('div');
  actions.className = 'map-tab-actions';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'map-pill-btn map-tab-add';
  addBtn.setAttribute('aria-label', 'Create new map tab');
  addBtn.innerHTML = `${ICONS.plus}<span>New map</span>`;
  addBtn.addEventListener('click', () => {
    createMapTab();
  });
  actions.appendChild(addBtn);

  header.appendChild(actions);
  tabsWrap.appendChild(header);

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

  const field = document.createElement('div');
  field.className = 'map-search-field';

  const icon = document.createElement('span');
  icon.className = 'map-search-icon';
  icon.innerHTML = ICONS.search;
  field.appendChild(icon);

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
    updateSearchSuggestions(input.value);
  });
  input.addEventListener('focus', () => {
    if (mapState.searchSuggestionTimer) {
      clearTimeout(mapState.searchSuggestionTimer);
      mapState.searchSuggestionTimer = null;
    }
    updateSearchSuggestions(input.value);
  });
  input.addEventListener('blur', () => {
    if (mapState.searchSuggestionTimer) {
      clearTimeout(mapState.searchSuggestionTimer);
    }
    mapState.searchSuggestionTimer = setTimeout(() => {
      clearSearchSuggestions();
    }, 120);
  });
  input.addEventListener('keydown', evt => {
    if (!mapState.searchSuggestions || mapState.searchSuggestions.length === 0) return;
    if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      const next = (mapState.searchActiveIndex + 1) % mapState.searchSuggestions.length;
      highlightSearchSuggestion(next);
    } else if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      const total = mapState.searchSuggestions.length;
      const next = (mapState.searchActiveIndex - 1 + total) % total;
      highlightSearchSuggestion(next);
    } else if (evt.key === 'Enter') {
      if (mapState.searchActiveIndex >= 0 && mapState.searchActiveIndex < mapState.searchSuggestions.length) {
        evt.preventDefault();
        applySearchSuggestion(mapState.searchActiveIndex);
      }
    } else if (evt.key === 'Escape') {
      clearSearchSuggestions();
    }
  });
  field.appendChild(input);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'map-search-submit';
  submit.innerHTML = `${ICONS.arrowRight}<span class="sr-only">Search</span>`;
  field.appendChild(submit);

  form.appendChild(field);

  const suggestions = document.createElement('div');
  suggestions.className = 'map-search-suggestions';
  form.appendChild(suggestions);

  searchWrap.appendChild(form);

  const feedback = document.createElement('div');
  feedback.className = 'map-search-feedback';
  searchWrap.appendChild(feedback);

  mapState.searchInput = input;
  mapState.searchFieldEl = field;
  mapState.searchFeedbackEl = feedback;
  mapState.searchSuggestionsEl = suggestions;
  mapState.searchSuggestions = [];
  mapState.searchActiveIndex = -1;
  applyStoredSearchFeedback();
  updateSearchSuggestions(input.value);

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
      setFilterWeeks(activeTab.filter, []);
      setFilterLectureKeys(activeTab.filter, []);
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
  blockWrap.className = 'map-control map-control-group';
  const blockLabel = document.createElement('span');
  blockLabel.className = 'map-control-label';
  blockLabel.textContent = 'Block';
  blockWrap.appendChild(blockLabel);
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
    setFilterWeeks(activeTab.filter, []);
    setFilterLectureKeys(activeTab.filter, []);
    await persistMapConfig();
    await renderMap(mapState.root);
  });
  blockWrap.appendChild(blockSelect);
  filterRow.appendChild(blockWrap);

  const makeChip = ({ label, active = false, onToggle, disabled = false, title }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'map-chip' + (active ? ' active' : '');
    chip.textContent = label;
    chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (title) {
      chip.title = title;
    }
    if (disabled) {
      chip.disabled = true;
      chip.classList.add('disabled');
    } else if (typeof onToggle === 'function') {
      chip.addEventListener('click', onToggle);
    }
    return chip;
  };

  const selectedWeeks = new Set(getFilterWeeks(activeTab.filter));
  const selectedLectures = new Set(getFilterLectureKeys(activeTab.filter));
  const weekBlock = blocks.find(b => b.blockId === blockSelect.value);
  const filtersDisabled = Boolean(activeTab.manualMode);
  const hasBlock = Boolean(blockSelect.value);

  const weekWrap = document.createElement('div');
  weekWrap.className = 'map-control map-control-group';
  const weekLabel = document.createElement('div');
  weekLabel.className = 'map-control-label';
  weekLabel.textContent = 'Weeks';
  weekWrap.appendChild(weekLabel);
  const weekList = document.createElement('div');
  weekList.className = 'map-chip-list';
  weekWrap.appendChild(weekList);

  const applyWeeks = async nextWeeks => {
    setFilterWeeks(activeTab.filter, nextWeeks);
    setFilterLectureKeys(activeTab.filter, []);
    await persistMapConfig();
    await renderMap(mapState.root);
  };

  if (!hasBlock || filtersDisabled) {
    const message = document.createElement('div');
    message.className = 'map-chip-empty';
    message.textContent = filtersDisabled ? 'Disabled in manual mode.' : 'Choose a block to filter weeks.';
    weekList.appendChild(message);
  } else {
    const weekNumbers = new Set();
    if (weekBlock) {
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
    }
    const sortedWeeks = Array.from(weekNumbers).sort((a, b) => a - b);
    weekList.appendChild(
      makeChip({
        label: 'All weeks',
        active: selectedWeeks.size === 0,
        onToggle: () => applyWeeks([])
      })
    );
    if (!sortedWeeks.length) {
      const empty = document.createElement('div');
      empty.className = 'map-chip-empty';
      empty.textContent = 'No weeks found for this block.';
      weekList.appendChild(empty);
    } else {
      sortedWeeks.forEach(num => {
        weekList.appendChild(
          makeChip({
            label: `Week ${num}`,
            active: selectedWeeks.has(num),
            onToggle: () => {
              const next = new Set(selectedWeeks);
              if (next.has(num)) {
                next.delete(num);
              } else {
                next.add(num);
              }
              applyWeeks(Array.from(next).sort((a, b) => a - b));
            }
          })
        );
      });
    }
  }
  filterRow.appendChild(weekWrap);

  const lectureWrap = document.createElement('div');
  lectureWrap.className = 'map-control map-control-group';
  const lectureLabel = document.createElement('div');
  lectureLabel.className = 'map-control-label';
  lectureLabel.textContent = 'Lectures';
  lectureWrap.appendChild(lectureLabel);
  const lectureList = document.createElement('div');
  lectureList.className = 'map-chip-list';
  lectureWrap.appendChild(lectureList);

  const applyLectures = async nextKeys => {
    setFilterLectureKeys(activeTab.filter, nextKeys);
    await persistMapConfig();
    await renderMap(mapState.root);
  };

  if (!hasBlock || filtersDisabled) {
    const message = document.createElement('div');
    message.className = 'map-chip-empty';
    message.textContent = filtersDisabled ? 'Disabled in manual mode.' : 'Choose a block first.';
    lectureList.appendChild(message);
  } else {
    const lectures = Array.isArray(weekBlock?.lectures) ? weekBlock.lectures : [];
    const filteredLectures = lectures
      .filter(lec => !selectedWeeks.size || selectedWeeks.has(Number(lec.week)))
      .sort((a, b) => {
        const weekA = Number(a.week) || 0;
        const weekB = Number(b.week) || 0;
        if (weekA !== weekB) return weekA - weekB;
        const idA = Number(a.id) || 0;
        const idB = Number(b.id) || 0;
        return idA - idB;
      });

    lectureList.appendChild(
      makeChip({
        label: 'All lectures',
        active: selectedLectures.size === 0,
        onToggle: () => applyLectures([])
      })
    );

    if (!filteredLectures.length) {
      const empty = document.createElement('div');
      empty.className = 'map-chip-empty';
      empty.textContent = selectedWeeks.size
        ? 'No lectures match the selected weeks.'
        : 'No lectures found for this block.';
      lectureList.appendChild(empty);
    } else {
      filteredLectures.forEach(lec => {
        const key = `${weekBlock.blockId}|${lec.id}`;
        const label = lec.name ? lec.name : `Lecture ${lec.id}`;
        const weekLabel = Number.isFinite(lec.week) ? `Week ${lec.week}` : '';
        lectureList.appendChild(
          makeChip({
            label: weekLabel ? `${label} · ${weekLabel}` : label,
            title: weekLabel ? `${label} (${weekLabel})` : label,
            active: selectedLectures.has(key),
            onToggle: () => {
              const next = new Set(selectedLectures);
              if (next.has(key)) {
                next.delete(key);
              } else {
                next.add(key);
              }
              applyLectures(Array.from(next));
            }
          })
        );
      });
    }
  }
  filterRow.appendChild(lectureWrap);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn map-reset-filters';
  resetBtn.textContent = 'Clear filters';
  resetBtn.disabled = Boolean(activeTab.manualMode);
  resetBtn.addEventListener('click', async () => {
    activeTab.filter.blockId = '';
    setFilterWeeks(activeTab.filter, []);
    setFilterLectureKeys(activeTab.filter, []);
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
  clearSearchSuggestions();
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
    mapState.updateViewBox({ immediate: true });
  }
  mapState.selectionIds = [id];
  updateSelectionHighlight();
  return true;
}

function matchesFilter(item, filter = {}) {
  if (!filter) return true;
  const blockId = filter.blockId || '';
  const weeks = getFilterWeeks(filter);
  const lectureKeys = getFilterLectureKeys(filter);
  if (blockId) {
    const inBlock = (item.blocks || []).includes(blockId) || (item.lectures || []).some(lec => lec.blockId === blockId);
    if (!inBlock) return false;
  }
  if (weeks.length) {
    const satisfiesWeek = weeks.some(weekNum => {
      if (!Number.isFinite(weekNum)) return false;
      if (blockId) {
        const inLectures = (item.lectures || []).some(lec => lec.blockId === blockId && Number(lec.week) === weekNum);
        const inWeeks = Array.isArray(item.weeks) && item.weeks.includes(weekNum);
        return inLectures || inWeeks;
      }
      const directWeek = Array.isArray(item.weeks) && item.weeks.includes(weekNum);
      if (directWeek) return true;
      return (item.lectures || []).some(lec => Number(lec.week) === weekNum);
    });
    if (!satisfiesWeek) return false;
  }
  if (lectureKeys.length) {
    const satisfiesLecture = lectureKeys.some(rawKey => {
      if (!rawKey) return false;
      const [blk, lecStr] = String(rawKey).split('|');
      const lecId = Number(lecStr);
      if (!Number.isFinite(lecId)) return false;
      const blockMatch = blk || blockId || '';
      return (item.lectures || []).some(lec => {
        if (!Number.isFinite(lec?.id)) return false;
        if (blockMatch) {
          return lec.blockId === blockMatch && lec.id === lecId;
        }
        return lec.id === lecId;
      });
    });
    if (!satisfiesLecture) return false;
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
    onEdit: () => openItemEditor(itemId),
    onColorChange: color => updateItemColor(itemId, color)
  });
}

function openItemEditor(itemId) {
  const item = mapState.itemMap?.[itemId];
  if (!item) return;
  openEditor(item.kind, async () => {
    await renderMap(mapState.root);
  }, item);
}

async function updateItemColor(itemId, color) {
  const item = await getItem(itemId);
  if (!item) return;
  const normalized = typeof color === 'string' && color ? color : '';
  if (normalized) {
    item.color = normalized;
  } else if (item.color) {
    delete item.color;
  }
  await upsertItem(item);
  if (!mapState.itemMap) {
    mapState.itemMap = {};
  }
  const cached = mapState.itemMap[itemId];
  if (cached) {
    if (normalized) {
      cached.color = normalized;
    } else {
      delete cached.color;
    }
  }
  if (Array.isArray(mapState.visibleItems)) {
    const visible = mapState.visibleItems.find(it => it.id === itemId);
    if (visible) {
      if (normalized) {
        visible.color = normalized;
      } else {
        delete visible.color;
      }
    }
  }
  refreshNodeColor(itemId);
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
  mapState.edgeDrag = null;
  mapState.selectionRect = null;
  mapState.previewSelection = null;
  mapState.nodeWasDragged = false;
  mapState.justCompletedSelection = false;
  mapState.edgeDragJustCompleted = false;
  mapState.viewPointerId = null;
  mapState.searchInput = null;
  mapState.searchFieldEl = null;
  mapState.searchFeedbackEl = null;
  mapState.searchSuggestions = [];
  mapState.searchSuggestionsEl = null;
  mapState.searchActiveIndex = -1;
  if (mapState.searchSuggestionTimer) {
    clearTimeout(mapState.searchSuggestionTimer);
    mapState.searchSuggestionTimer = null;
  }
  stopToolboxDrag();
  mapState.toolboxEl = null;
  mapState.toolboxContainer = null;
  mapState.cursorOverride = null;
  mapState.hoveredEdge = null;
  mapState.hoveredEdgePointer = { x: 0, y: 0 };
  if (mapState.lineMarkers) {
    mapState.lineMarkers.clear();
  } else {
    mapState.lineMarkers = new Map();
  }
  if (mapState.edgeRefs) {
    mapState.edgeRefs.clear();
  } else {
    mapState.edgeRefs = new Map();
  }
  if (mapState.allEdges) {
    mapState.allEdges.clear();
  } else {
    mapState.allEdges = new Set();
  }
  stopAutoPan();
  setAreaInteracting(false);
  mapState.edgeLayer = null;
  mapState.nodeLayer = null;
  flushNodePositionUpdates({ cancelFrame: true });
  if (mapState.pendingNodeUpdates) {
    mapState.pendingNodeUpdates.clear();
  }

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

  const itemGroupCache = new Map();
  visibleItems.forEach(it => {
    itemGroupCache.set(it.id, deriveItemGroupKeys(it));
  });

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
  container.addEventListener('pointerdown', e => {
    if (mapState.tool === TOOL.AREA) return;
    if (e.button !== 0) return;
    if (e.target !== container) return;
    if (beginViewDrag(e)) {
      e.preventDefault();
    }
  });

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
  const panelHeader = document.createElement('div');
  panelHeader.className = 'map-menu-header';
  const panelTitle = document.createElement('div');
  panelTitle.className = 'map-menu-title';
  panelTitle.textContent = 'Map controls';
  panelHeader.appendChild(panelTitle);
  panelHeader.appendChild(closeBtn);
  panel.appendChild(panelHeader);

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

  const commitViewBox = (options = {}) => {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    const { forceScale = false } = options;
    if (forceScale) {
      mapState.lastScaleSize = { w: viewBox.w, h: viewBox.h };
      adjustScale();
      return;
    }
    const prev = mapState.lastScaleSize;
    const sizeChanged =
      !prev || Math.abs(prev.w - viewBox.w) > 0.5 || Math.abs(prev.h - viewBox.h) > 0.5;
    if (sizeChanged) {
      mapState.lastScaleSize = { w: viewBox.w, h: viewBox.h };
      adjustScale();
    }
  };

  const updateViewBox = (options = {}) => {
    const pending = {
      ...(mapState.pendingViewBoxOptions || {}),
      forceScale: Boolean(options.forceScale) || Boolean(mapState.pendingViewBoxOptions?.forceScale)
    };
    mapState.pendingViewBoxOptions = pending;
    const immediate = Boolean(options.immediate) || typeof window === 'undefined';
    if (immediate) {
      if (mapState.viewBoxFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(mapState.viewBoxFrame);
      }
      mapState.viewBoxFrame = null;
      const commitOptions = mapState.pendingViewBoxOptions;
      mapState.pendingViewBoxOptions = null;
      commitViewBox(commitOptions || {});
      return;
    }
    if (mapState.viewBoxFrame) {
      return;
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      const commitOptions = mapState.pendingViewBoxOptions;
      mapState.pendingViewBoxOptions = null;
      commitViewBox(commitOptions || {});
      return;
    }
    mapState.viewBoxFrame = window.requestAnimationFrame(() => {
      const commitOptions = mapState.pendingViewBoxOptions;
      mapState.pendingViewBoxOptions = null;
      mapState.viewBoxFrame = null;
      commitViewBox(commitOptions || {});
    });
  };

  mapState.updateViewBox = updateViewBox;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const edgeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgeLayer.classList.add('map-layer', 'map-layer--edges');
  const nodeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodeLayer.classList.add('map-layer', 'map-layer--nodes');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  buildLineMarkers(defs);
  g.appendChild(edgeLayer);
  g.appendChild(nodeLayer);
  svg.appendChild(defs);
  svg.appendChild(g);
  mapState.g = g;
  mapState.edgeLayer = edgeLayer;
  mapState.nodeLayer = nodeLayer;

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

  const nodeRadii = new Map();
  visibleItems.forEach(it => {
    const degree = linkCounts[it.id] || 0;
    const baseRadius = minRadius + ((maxRadius - minRadius) * degree) / maxLinks;
    nodeRadii.set(it.id, baseRadius);
  });
  mapState.nodeRadii = nodeRadii;

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
    const groups = itemGroupCache.get(it.id) || deriveItemGroupKeys(it);
    const primaryGroup = getPrimaryGroupKey(it, groups);
    newItems.push({ item: it, primaryGroup, degree: linkCounts[it.id] || 0 });
  });

  const existingGroupInfo = new Map();
  Object.entries(positions).forEach(([id, pos]) => {
    if (!pos) return;
    const groups = itemGroupCache.get(id) || [];
    groups.forEach(key => {
      const info = existingGroupInfo.get(key) || {
        minX: pos.x,
        maxX: pos.x,
        minY: pos.y,
        maxY: pos.y,
        count: 0
      };
      info.count += 1;
      info.minX = Math.min(info.minX, pos.x);
      info.maxX = Math.max(info.maxX, pos.x);
      info.minY = Math.min(info.minY, pos.y);
      info.maxY = Math.max(info.maxY, pos.y);
      existingGroupInfo.set(key, info);
    });
  });

  const pendingCounts = new Map();
  newItems.forEach(entry => {
    pendingCounts.set(entry.primaryGroup, (pendingCounts.get(entry.primaryGroup) || 0) + 1);
  });

  const clusterOrigins = new Map();
  const seenGroups = new Set();
  const newGroupOrder = [];
  newItems.forEach(entry => {
    const key = entry.primaryGroup;
    if (existingGroupInfo.has(key)) return;
    if (seenGroups.has(key)) return;
    seenGroups.add(key);
    newGroupOrder.push(key);
  });

  const blockAggregates = new Map();
  const weekAggregates = new Map();
  const lecturesByWeek = new Map();
  const lectureCenters = new Map();
  existingGroupInfo.forEach((info, key) => {
    const parsed = parseGroupKey(key);
    const blockKey = parsed.block || '__';
    const weekId = parsed.week || '__';
    const weekKey = `${blockKey}::${weekId}`;
    const centerX = (info.minX + info.maxX) / 2;
    const centerY = (info.minY + info.maxY) / 2;
    const blockAgg = blockAggregates.get(blockKey) || { x: 0, y: 0, count: 0 };
    blockAgg.x += centerX;
    blockAgg.y += centerY;
    blockAgg.count += 1;
    blockAggregates.set(blockKey, blockAgg);
    const weekAgg = weekAggregates.get(weekKey) || { x: 0, y: 0, count: 0 };
    weekAgg.x += centerX;
    weekAgg.y += centerY;
    weekAgg.count += 1;
    weekAggregates.set(weekKey, weekAgg);
    const lectureList = lecturesByWeek.get(weekKey) || [];
    lectureList.push({ x: centerX, y: centerY });
    lecturesByWeek.set(weekKey, lectureList);
    const lectureKey = `${weekKey}::${parsed.lecture || key}`;
    if (!lectureCenters.has(lectureKey)) {
      lectureCenters.set(lectureKey, { x: centerX, y: centerY });
    }
  });

  const blockCenters = new Map();
  const blockPositionList = [];
  blockAggregates.forEach((agg, blockKey) => {
    if (!agg.count) return;
    const point = { x: agg.x / agg.count, y: agg.y / agg.count };
    blockCenters.set(blockKey, point);
    blockPositionList.push(point);
  });

  const weekCenters = new Map();
  const weekPositionsByBlock = new Map();
  weekAggregates.forEach((agg, weekKey) => {
    if (!agg.count) return;
    const point = { x: agg.x / agg.count, y: agg.y / agg.count };
    weekCenters.set(weekKey, point);
    const [blockKey] = weekKey.split('::');
    const list = weekPositionsByBlock.get(blockKey) || [];
    list.push(point);
    weekPositionsByBlock.set(blockKey, list);
  });

  const BLOCK_SPACING = 920;
  const WEEK_SPACING = 440;
  const LECTURE_SPACING = 240;

  function ensureBlockCenter(blockKey) {
    if (blockCenters.has(blockKey)) return blockCenters.get(blockKey);
    const base = { x: center, y: center };
    const candidate = pickClusterPosition(blockPositionList, BLOCK_SPACING, base);
    blockCenters.set(blockKey, candidate);
    blockPositionList.push(candidate);
    return candidate;
  }

  function ensureWeekCenter(blockKey, weekId, blockCenter) {
    const weekKey = `${blockKey}::${weekId}`;
    if (weekCenters.has(weekKey)) return weekCenters.get(weekKey);
    const existing = weekPositionsByBlock.get(blockKey) || [];
    const candidate = pickClusterPosition(existing, WEEK_SPACING, blockCenter);
    weekCenters.set(weekKey, candidate);
    existing.push(candidate);
    weekPositionsByBlock.set(blockKey, existing);
    return candidate;
  }

  function ensureLectureCenter(blockKey, weekId, lectureId, weekCenter) {
    const weekKey = `${blockKey}::${weekId}`;
    const lectureKey = `${weekKey}::${lectureId}`;
    if (lectureCenters.has(lectureKey)) return lectureCenters.get(lectureKey);
    const existing = lecturesByWeek.get(weekKey) || [];
    const candidate = pickClusterPosition(existing, LECTURE_SPACING, weekCenter);
    lectureCenters.set(lectureKey, candidate);
    existing.push(candidate);
    lecturesByWeek.set(weekKey, existing);
    return candidate;
  }

  newGroupOrder.forEach(key => {
    const parsed = parseGroupKey(key);
    const blockKey = parsed.block || '__';
    const weekId = parsed.week || '__';
    const lectureId = parsed.lecture || key;
    const blockCenter = ensureBlockCenter(blockKey);
    const weekCenter = ensureWeekCenter(blockKey, weekId, blockCenter);
    const lectureCenter = ensureLectureCenter(blockKey, weekId, lectureId, weekCenter);
    clusterOrigins.set(key, lectureCenter);
  });

  const groupPlacement = new Map();

  function ensureGroupPlacement(key) {
    if (groupPlacement.has(key)) {
      return groupPlacement.get(key);
    }
    const existing = existingGroupInfo.get(key);
    const pending = pendingCounts.get(key) || 0;
    const total = (existing?.count || 0) + pending;
    const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(total, 1))));
    const rows = Math.max(1, Math.ceil(Math.max(total, 1) / columns));
    const origin = existing
      ? {
          x: (existing.minX + existing.maxX) / 2,
          y: (existing.minY + existing.maxY) / 2
        }
      : clusterOrigins.get(key) || { x: center, y: center };
    let spacing = 150;
    if (existing?.count > 1) {
      const spread = Math.max(existing.maxX - existing.minX, existing.maxY - existing.minY);
      spacing = Math.max(130, spread / Math.max(1, existing.count - 1) + 70);
    } else if (existing?.count === 1) {
      spacing = 140;
    } else if (clusterOrigins.has(key)) {
      spacing = 160;
    }
    const info = { origin, columns, rows, spacing, index: existing?.count || 0 };
    groupPlacement.set(key, info);
    return info;
  }

  function allocateGroupPosition(key) {
    const info = ensureGroupPlacement(key);
    const maxAttempts = 400;
    for (let offset = 0; offset < maxAttempts; offset += 1) {
      const idx = info.index + offset;
      const col = idx % info.columns;
      const row = Math.floor(idx / info.columns);
      const neededRows = Math.max(info.rows, row + 1);
      const colCenter = (info.columns - 1) / 2;
      const rowCenter = (neededRows - 1) / 2;
      const x = info.origin.x + (col - colCenter) * info.spacing;
      const y = info.origin.y + (row - rowCenter) * info.spacing;
      let collision = false;
      for (const existingId in positions) {
        const other = positions[existingId];
        if (!other) continue;
        if (Math.hypot(other.x - x, other.y - y) < info.spacing * 0.7) {
          collision = true;
          break;
        }
      }
      if (!collision) {
        info.index = idx + 1;
        info.rows = Math.max(info.rows, neededRows);
        groupPlacement.set(key, info);
        return { x, y };
      }
    }
    info.index += maxAttempts;
    groupPlacement.set(key, info);
    return {
      x: info.origin.x + (Math.random() - 0.5) * info.spacing,
      y: info.origin.y + (Math.random() - 0.5) * info.spacing
    };
  }

  newItems.sort((a, b) => b.degree - a.degree);
  newItems.forEach(entry => {
    const pos = allocateGroupPosition(entry.primaryGroup);
    positions[entry.item.id] = pos;
    if (layout) {
      layout[entry.item.id] = { ...pos };
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
  const edgeLayerRef = mapState.edgeLayer || g;
  const nodeLayerRef = mapState.nodeLayer || g;
  visibleItems.forEach(it => {
    (it.links || []).forEach(l => {
      if (l.hidden) return;
      if (!positions[l.id]) return;
      const key = it.id < l.id ? `${it.id}|${l.id}` : `${l.id}|${it.id}`;
      if (drawn.has(key)) return;
      drawn.add(key);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', calcPath(it.id, l.id, path, l));
      path.setAttribute('fill', 'none');
      path.setAttribute('class', 'map-edge');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      applyLineStyle(path, l);
      path.dataset.a = it.id;
      path.dataset.b = l.id;
      path.dataset.label = l.name || '';
      registerEdgeElement(path, it.id, l.id);
      path.addEventListener('pointerdown', evt => {
        if (evt.button !== 0) return;
        if (mapState.tool !== TOOL.NAVIGATE) return;
        mapState.suppressNextClick = false;
        evt.stopPropagation();
        const pointerId = evt.pointerId;
        const existingCurve = Number(path.dataset.curve);
        const initialCurve = Number.isFinite(existingCurve)
          ? existingCurve
          : Number.isFinite(Number(l.curve))
            ? Number(l.curve)
            : 0;
        const existingAnchor = normalizeAnchorValue(
          Object.prototype.hasOwnProperty.call(path.dataset || {}, 'anchor')
            ? path.dataset.anchor
            : Object.prototype.hasOwnProperty.call(l || {}, 'curveAnchor')
              ? l.curveAnchor
              : DEFAULT_CURVE_ANCHOR
        ) ?? DEFAULT_CURVE_ANCHOR;
        const pointerMap = clientToMap(evt.clientX, evt.clientY);
        const geometryForHandle = getLineGeometry(it.id, l.id, {
          line: path,
          curve: initialCurve,
          anchor: existingAnchor
        });
        let handle = 'mid';
        let anchorValue = existingAnchor;
        if (geometryForHandle && pointerMap) {
          const startPoint = { x: geometryForHandle.startX, y: geometryForHandle.startY };
          const endPoint = { x: geometryForHandle.endX, y: geometryForHandle.endY };
          const startDist = Math.hypot(pointerMap.x - startPoint.x, pointerMap.y - startPoint.y);
          const endDist = Math.hypot(pointerMap.x - endPoint.x, pointerMap.y - endPoint.y);
          const threshold = Math.max(36, (geometryForHandle.trimmedLength || 0) * 0.12);
          if (startDist <= threshold) {
            handle = 'start';
            anchorValue = normalizeAnchorValue(existingAnchor < 0.45 ? existingAnchor : 0.22) ?? 0.22;
          } else if (endDist <= threshold) {
            handle = 'end';
            anchorValue = normalizeAnchorValue(existingAnchor > 0.55 ? existingAnchor : 0.78) ?? 0.78;
          }
        }
        mapState.edgeDrag = {
          pointerId,
          line: path,
          aId: it.id,
          bId: l.id,
          startCurve: initialCurve,
          currentCurve: initialCurve,
          moved: false,
          captureTarget: evt.currentTarget || path,
          handle,
          anchor: anchorValue,
          startAnchor: anchorValue
        };
        if (mapState.edgeDrag.captureTarget?.setPointerCapture) {
          try {
            mapState.edgeDrag.captureTarget.setPointerCapture(pointerId);
          } catch {}
        }
      });
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
      edgeLayerRef.appendChild(path);
    });
  });

  visibleItems.forEach(it => {
    const pos = positions[it.id];
    if (!pos) return;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    const cachedRadius = mapState.nodeRadii?.get(it.id);
    const baseR = typeof cachedRadius === 'number'
      ? cachedRadius
      : minRadius + ((maxRadius - minRadius) * (linkCounts[it.id] || 0)) / maxLinks;
    circle.setAttribute('r', baseR);
    circle.dataset.radius = baseR;
    circle.setAttribute('class', 'map-node');
    circle.dataset.id = it.id;
    circle.setAttribute('fill', getNodeFill(it));

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
          offset: { x: x - current.x, y: y - current.y },
          pointerId: e.pointerId,
          captureTarget: e.currentTarget || circle
        };
        if (mapState.nodeDrag.captureTarget?.setPointerCapture) {
          try {
            mapState.nodeDrag.captureTarget.setPointerCapture(e.pointerId);
          } catch {}
        }
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
          moved: false,
          pointerId: e.pointerId,
          captureTarget: e.currentTarget || circle
        };
        if (mapState.areaDrag.captureTarget?.setPointerCapture) {
          try {
            mapState.areaDrag.captureTarget.setPointerCapture(e.pointerId);
          } catch {}
        }
        mapState.nodeWasDragged = false;
        setAreaInteracting(true);
      }
      refreshCursor({ keepOverride: false });
    };

    circle.addEventListener('pointerdown', handleNodePointerDown);

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

    nodeLayerRef.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y - (baseR + 12));
    text.setAttribute('class', 'map-label');
    text.setAttribute('font-size', '16');
    text.dataset.id = it.id;
    text.textContent = it.name || it.concept || '?';
    text.addEventListener('pointerdown', handleNodePointerDown);
    text.addEventListener('click', async e => {
      e.stopPropagation();
      if (mapState.suppressNextClick) {
        mapState.suppressNextClick = false;
        mapState.nodeWasDragged = false;
        return;
      }
      if (mapState.tool === TOOL.NAVIGATE && !mapState.nodeWasDragged) {
        openItemPopup(it.id);
      } else if (mapState.tool === TOOL.HIDE) {
        if (confirm(`Remove ${titleOf(it)} from the map?`)) {
          await setNodeHidden(it.id, true);
          await renderMap(root);
        }
      } else if (mapState.tool === TOOL.ADD_LINK) {
        await handleAddLinkClick(it.id);
      }
      mapState.nodeWasDragged = false;
    });
    nodeLayerRef.appendChild(text);

    mapState.elements.set(it.id, { circle, label: text });
  });

  updateSelectionHighlight();
  updatePendingHighlight();

  updateViewBox({ forceScale: true, immediate: true });
  refreshCursor();
}

function ensureListeners() {
  if (mapState.listenersAttached || typeof window === 'undefined') return;
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);
  mapState.listenersAttached = true;
  if (!window._mapResizeAttached) {
    window.addEventListener('resize', () => {
      invalidateSvgRect();
      adjustScale();
    });
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
      viewBox: '0 0 6 6',
      refX: 4.6,
      refY: 3,
      markerWidth: 4.6,
      markerHeight: 4.6,
      path: 'M0,0 L4.6,3 L0,6 Z',
      units: 'strokeWidth',
      scaleMode: 'stroke'
    },
    {
      id: 'arrow-start',
      viewBox: '0 0 6 6',
      refX: 1.4,
      refY: 3,
      markerWidth: 4.6,
      markerHeight: 4.6,
      path: 'M4.6,0 L0,3 L4.6,6 Z',
      units: 'strokeWidth',
      scaleMode: 'stroke'
    }
  ];
  if (!mapState.lineMarkers) {
    mapState.lineMarkers = new Map();
  } else {
    mapState.lineMarkers.clear();
  }
  configs.forEach(cfg => {
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', cfg.id);
    marker.setAttribute('viewBox', cfg.viewBox);
    marker.dataset.baseRefX = String(cfg.refX);
    marker.dataset.baseRefY = String(cfg.refY);
    marker.dataset.baseWidth = String(cfg.markerWidth);
    marker.dataset.baseHeight = String(cfg.markerHeight);
    marker.dataset.scaleMode = cfg.scaleMode || 'absolute';
    marker.setAttribute('refX', String(cfg.refX));
    marker.setAttribute('refY', String(cfg.refY));
    marker.setAttribute('markerWidth', String(cfg.markerWidth));
    marker.setAttribute('markerHeight', String(cfg.markerHeight));
    marker.setAttribute('orient', 'auto-start-reverse');
    marker.setAttribute('markerUnits', cfg.units || 'userSpaceOnUse');
    marker.setAttribute('class', 'map-marker');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', cfg.path);
    path.setAttribute('fill', 'context-stroke');
    path.setAttribute('stroke', 'context-stroke');
    path.setAttribute('stroke-linejoin', 'round');
    marker.appendChild(path);
    defs.appendChild(marker);
    mapState.lineMarkers.set(cfg.id, marker);
  });
  updateMarkerSizes();
}

function updateMarkerSizes() {
  const markers = mapState.lineMarkers;
  if (!markers || markers.size === 0) return;
  const { zoomRatio = 1, lineScale = 1 } = getCurrentScales();
  const ratio = Number.isFinite(zoomRatio) && zoomRatio > 0 ? zoomRatio : 1;
  const strokeScale = Number.isFinite(lineScale) && lineScale > 0 ? lineScale : 1;
  markers.forEach(marker => {
    const baseWidth = Number(marker.dataset.baseWidth) || 12;
    const baseHeight = Number(marker.dataset.baseHeight) || 12;
    const baseRefX = Number(marker.dataset.baseRefX) || 0;
    const baseRefY = Number(marker.dataset.baseRefY) || 0;
    const scaleMode = marker.dataset.scaleMode || 'absolute';
    if (scaleMode === 'stroke') {
      marker.setAttribute('markerWidth', String(baseWidth));
      marker.setAttribute('markerHeight', String(baseHeight));
      marker.setAttribute('refX', String(baseRefX));
      marker.setAttribute('refY', String(baseRefY));
    } else {
      const width = baseWidth * ratio * strokeScale;
      const height = baseHeight * ratio * strokeScale;
      marker.setAttribute('markerWidth', String(width));
      marker.setAttribute('markerHeight', String(height));
      marker.setAttribute('refX', String(baseRefX * ratio * strokeScale));
      marker.setAttribute('refY', String(baseRefY * ratio * strokeScale));
    }
  });
}

function beginViewDrag(e) {
  if (!mapState.svg || !mapState.viewBox) return false;
  if (e.button !== 0) return false;
  mapState.justCompletedSelection = false;
  getSvgRect({ force: true });
  const startMap = clientToMap(e.clientX, e.clientY);
  mapState.draggingView = true;
  mapState.viewPointerId = e.pointerId;
  mapState.lastPointer = {
    x: e.clientX,
    y: e.clientY,
    mapX: startMap.x,
    mapY: startMap.y
  };
  if (e.currentTarget?.setPointerCapture) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }
  setAreaInteracting(true);
  refreshCursor({ keepOverride: false });
  return true;
}

function attachSvgEvents(svg) {
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target !== svg) return;
    mapState.justCompletedSelection = false;
    getSvgRect({ force: true });
    if (mapState.tool !== TOOL.AREA) {
      e.preventDefault();
      beginViewDrag(e);
    } else {
      e.preventDefault();
      mapState.selectionRect = {
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        currentClient: { x: e.clientX, y: e.clientY },
        startMap: clientToMap(e.clientX, e.clientY),
        currentMap: clientToMap(e.clientX, e.clientY)
      };
      mapState.selectionBox.classList.remove('hidden');
      if (svg.setPointerCapture) {
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {}
      }
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
    if (!mapState.viewBox) return;
    const rect = getSvgRect({ force: true });
    if (!rect || !rect.width || !rect.height) return;
    const pixelMode = e.deltaMode === 0;
    const wantsZoom = e.ctrlKey || e.metaKey || e.altKey || !pixelMode;
    if (!wantsZoom) {
      const scaleX = rect.width ? (mapState.viewBox.w / rect.width) : 0;
      const scaleY = rect.height ? (mapState.viewBox.h / rect.height) : 0;
      mapState.viewBox.x += e.deltaX * scaleX * PAN_ACCELERATION;
      mapState.viewBox.y += e.deltaY * scaleY * PAN_ACCELERATION;
      constrainViewBox();
      mapState.updateViewBox({ immediate: true });
      return;
    }
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    const mx = mapState.viewBox.x + ratioX * mapState.viewBox.w;
    const my = mapState.viewBox.y + ratioY * mapState.viewBox.h;
    let deltaY = e.deltaY;
    if (e.deltaMode === 1) {
      deltaY *= 16;
    } else if (e.deltaMode === 2) {
      deltaY *= rect.height;
    }
    const rawFactor = Math.exp(deltaY * ZOOM_INTENSITY);
    const factor = Number.isFinite(rawFactor) && rawFactor > 0 ? rawFactor : 1;
    const maxSize = mapState.sizeLimit || 2000;
    const minSize = mapState.minView || 100;
    const nextW = clamp(mapState.viewBox.w * factor, minSize, maxSize);
    mapState.viewBox.w = nextW;
    mapState.viewBox.h = nextW;
    mapState.viewBox.x = mx - ratioX * nextW;
    mapState.viewBox.y = my - ratioY * nextW;
    constrainViewBox();
    mapState.updateViewBox();
  }, { passive: false });
}

function handlePointerMove(e) {
  if (!mapState.svg) return;

  if (mapState.toolboxDrag) {
    moveToolboxDrag(e.clientX, e.clientY);
    return;
  }

  if (mapState.menuDrag) {
    updateMenuDragPosition(e.clientX, e.clientY);
    return;
  }

  if (mapState.edgeDrag && mapState.edgeDrag.pointerId === e.pointerId) {
    const drag = mapState.edgeDrag;
    if (!drag.line) return;
    const geometry = getLineGeometry(drag.aId, drag.bId, { line: drag.line, curve: drag.currentCurve, anchor: drag.anchor });
    if (!geometry) return;
    const pointer = clientToMap(e.clientX, e.clientY);
    const dx = geometry.endX - geometry.startX;
    const dy = geometry.endY - geometry.startY;
    const lenSq = Math.max(dx * dx + dy * dy, 1);
    const projection = ((pointer.x - geometry.startX) * dx + (pointer.y - geometry.startY) * dy) / lenSq;
    const range = getAnchorRange(drag.handle);
    drag.anchor = clamp(projection, range.min, range.max);
    const anchorPoint = {
      x: geometry.startX + dx * drag.anchor,
      y: geometry.startY + dy * drag.anchor
    };
    const normal = { x: -geometry.uy, y: geometry.ux };
    const offset = (pointer.x - anchorPoint.x) * normal.x + (pointer.y - anchorPoint.y) * normal.y;
    const length = Math.max(geometry.trimmedLength || Math.hypot(dx, dy) || 1, 1);
    const normalized = clamp(offset / length, -3.5, 3.5);
    drag.currentCurve = normalized;
    const curveDelta = Math.abs((drag.startCurve ?? 0) - normalized);
    const anchorDelta = Math.abs((drag.startAnchor ?? DEFAULT_CURVE_ANCHOR) - drag.anchor);
    if (curveDelta > 0.002 || anchorDelta > 0.01) {
      drag.moved = true;
      applyLineStyle(drag.line, { curve: normalized, anchor: drag.anchor });
    }
    return;
  }

  if (mapState.nodeDrag && mapState.nodeDrag.pointerId === e.pointerId) {
    const entry = mapState.elements.get(mapState.nodeDrag.id);
    if (!entry || !entry.circle) return;
    const { x, y } = clientToMap(e.clientX, e.clientY);
    const nx = x - mapState.nodeDrag.offset.x;
    const ny = y - mapState.nodeDrag.offset.y;
    scheduleNodePositionUpdate(mapState.nodeDrag.id, { x: nx, y: ny });
    mapState.nodeWasDragged = true;
    return;
  }

  if (mapState.areaDrag && mapState.areaDrag.pointerId === e.pointerId) {
    updateAutoPanFromPointer(e.clientX, e.clientY);
    const { x, y } = clientToMap(e.clientX, e.clientY);
    const dx = x - mapState.areaDrag.start.x;
    const dy = y - mapState.areaDrag.start.y;
    mapState.areaDrag.moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    mapState.areaDrag.origin.forEach(({ id, pos }) => {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      scheduleNodePositionUpdate(id, { x: nx, y: ny });
    });
    mapState.nodeWasDragged = true;
    return;
  }

  if (mapState.draggingView && mapState.viewPointerId === e.pointerId) {
    const prev = Number.isFinite(mapState.lastPointer.mapX)
      ? { x: mapState.lastPointer.mapX, y: mapState.lastPointer.mapY }
      : clientToMap(mapState.lastPointer.x, mapState.lastPointer.y);
    const current = clientToMap(e.clientX, e.clientY);
    if (typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    mapState.viewBox.x += (prev.x - current.x) * PAN_ACCELERATION;
    mapState.viewBox.y += (prev.y - current.y) * PAN_ACCELERATION;
    constrainViewBox();
    mapState.lastPointer = { x: e.clientX, y: e.clientY, mapX: current.x, mapY: current.y };
    mapState.updateViewBox({ immediate: true });
    if (mapState.selectionRect) {
      refreshSelectionRectFromClients();
    }
    return;
  }

  if (mapState.selectionRect && mapState.selectionRect.pointerId === e.pointerId) {
    updateAutoPanFromPointer(e.clientX, e.clientY);
    mapState.selectionRect.currentClient = { x: e.clientX, y: e.clientY };
    mapState.selectionRect.currentMap = clientToMap(e.clientX, e.clientY);
    updateSelectionBox();
  }
}

async function handlePointerUp(e) {
  if (!mapState.svg) return;

  flushNodePositionUpdates({ cancelFrame: true });

  if (mapState.toolboxDrag) {
    stopToolboxDrag();
  }

  if (mapState.menuDrag) {
    await finishMenuDrag(e.clientX, e.clientY);
    return;
  }

  let cursorNeedsRefresh = false;

  if (mapState.edgeDrag && mapState.edgeDrag.pointerId === e.pointerId) {
    const drag = mapState.edgeDrag;
    mapState.edgeDrag = null;
    if (drag.captureTarget?.releasePointerCapture) {
      try {
        drag.captureTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (drag.moved && Number.isFinite(drag.currentCurve)) {
      const anchorValue = Number.isFinite(drag.anchor) ? clamp(drag.anchor, 0.1, 0.9) : undefined;
      const patch = {
        curve: drag.currentCurve,
        ...(Number.isFinite(anchorValue) ? { curveAnchor: anchorValue } : {})
      };
      await updateLink(drag.aId, drag.bId, patch);
      applyLineStyle(drag.line, { curve: drag.currentCurve, anchor: anchorValue });
      applyLinkPatchToState(drag.aId, drag.bId, patch);
      mapState.edgeDragJustCompleted = true;
      setTimeout(() => {
        mapState.edgeDragJustCompleted = false;
      }, 0);
    }
    cursorNeedsRefresh = true;
  }

  if (mapState.nodeDrag && mapState.nodeDrag.pointerId === e.pointerId) {
    const id = mapState.nodeDrag.id;
    if (mapState.nodeDrag.captureTarget?.releasePointerCapture) {
      try {
        mapState.nodeDrag.captureTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
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

  if (mapState.areaDrag && mapState.areaDrag.pointerId === e.pointerId) {
    const moved = mapState.areaDrag.moved;
    const ids = mapState.areaDrag.ids;
    if (mapState.areaDrag.captureTarget?.releasePointerCapture) {
      try {
        mapState.areaDrag.captureTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
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

  if (mapState.draggingView && mapState.viewPointerId === e.pointerId) {
    mapState.draggingView = false;
    mapState.viewPointerId = null;
    if (mapState.svg?.releasePointerCapture) {
      try {
        mapState.svg.releasePointerCapture(e.pointerId);
      } catch {}
    }
    cursorNeedsRefresh = true;
    setAreaInteracting(false);
  }

  if (mapState.selectionRect && mapState.selectionRect.pointerId === e.pointerId) {
    const selected = computeSelectionFromRect();
    mapState.selectionIds = selected;
    mapState.previewSelection = null;
    mapState.selectionRect = null;
    mapState.selectionBox.classList.add('hidden');
    updateSelectionHighlight();
    stopAutoPan();
    setAreaInteracting(false);
    mapState.justCompletedSelection = true;
    if (mapState.svg?.releasePointerCapture) {
      try {
        mapState.svg.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }

  if (cursorNeedsRefresh) {
    refreshCursor({ keepOverride: true });
  }
}

function scheduleNodePositionUpdate(id, pos) {
  if (!id || !pos) return;
  if (!mapState.pendingNodeUpdates) {
    mapState.pendingNodeUpdates = new Map();
  }
  mapState.positions[id] = pos;
  mapState.pendingNodeUpdates.set(id, pos);
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    flushNodePositionUpdates();
    return;
  }
  if (mapState.nodeUpdateFrame) {
    return;
  }
  mapState.nodeUpdateFrame = window.requestAnimationFrame(() => {
    mapState.nodeUpdateFrame = null;
    flushNodePositionUpdates();
  });
}

function flushNodePositionUpdates({ cancelFrame = false } = {}) {
  if (cancelFrame && mapState.nodeUpdateFrame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(mapState.nodeUpdateFrame);
    mapState.nodeUpdateFrame = null;
  }
  const updates = mapState.pendingNodeUpdates;
  if (!updates || !updates.size) return;
  updates.forEach((_, id) => {
    const entry = mapState.elements.get(id);
    if (!entry) return;
    updateNodeGeometry(id, entry);
    updateEdgesFor(id);
  });
  updates.clear();
}

function getNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function invalidateSvgRect() {
  mapState.svgRect = null;
  mapState.svgRectTime = 0;
}

function getSvgRect(options = {}) {
  const svg = mapState.svg;
  if (!svg) return null;
  const { force = false } = options;
  if (force) {
    mapState.svgRect = svg.getBoundingClientRect();
    mapState.svgRectTime = getNow();
    return mapState.svgRect;
  }
  const now = getNow();
  if (!mapState.svgRect || !mapState.svgRectTime || now - mapState.svgRectTime > 100) {
    mapState.svgRect = svg.getBoundingClientRect();
    mapState.svgRectTime = now;
  }
  return mapState.svgRect;
}

function constrainViewBox() {
  const viewBox = mapState.viewBox;
  if (!viewBox) return;
  const maxSize = mapState.sizeLimit || 0;
  if (maxSize > 0) {
    const maxX = Math.max(0, maxSize - viewBox.w);
    const maxY = Math.max(0, maxSize - viewBox.h);
    viewBox.x = clamp(viewBox.x, 0, maxX);
    viewBox.y = clamp(viewBox.y, 0, maxY);
  }
}

function clientToMap(clientX, clientY) {
  const viewBox = mapState.viewBox;
  if (!mapState.svg || !viewBox) return { x: 0, y: 0 };
  const rect = getSvgRect();
  if (!rect || !rect.width || !rect.height) {
    return { x: viewBox.x, y: viewBox.y };
  }
  const ratioX = (clientX - rect.left) / rect.width;
  const ratioY = (clientY - rect.top) / rect.height;
  return {
    x: viewBox.x + ratioX * viewBox.w,
    y: viewBox.y + ratioY * viewBox.h
  };
}

function updateSelectionBox() {
  if (!mapState.selectionRect || !mapState.selectionBox || !mapState.svg) return;
  const { startClient, currentClient, startMap, currentMap } = mapState.selectionRect;
  if (!startClient || !currentClient) return;
  const rect = getSvgRect();
  if (!rect) return;
  const left = Math.min(startClient.x, currentClient.x) - rect.left;
  const top = Math.min(startClient.y, currentClient.y) - rect.top;
  const width = Math.abs(startClient.x - currentClient.x);
  const height = Math.abs(startClient.y - currentClient.y);
  mapState.selectionBox.style.left = `${left}px`;
  mapState.selectionBox.style.top = `${top}px`;
  mapState.selectionBox.style.width = `${width}px`;
  mapState.selectionBox.style.height = `${height}px`;

  if (!startMap || !currentMap) return;
  const minX = Math.min(startMap.x, currentMap.x);
  const maxX = Math.max(startMap.x, currentMap.x);
  const minY = Math.min(startMap.y, currentMap.y);
  const maxY = Math.max(startMap.y, currentMap.y);
  const preview = [];
  Object.entries(mapState.positions).forEach(([id, pos]) => {
    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
      preview.push(id);
    }
  });
  mapState.previewSelection = preview;
  updateSelectionHighlight();
}

function refreshSelectionRectFromClients({ updateStart = false } = {}) {
  if (!mapState.selectionRect) return;
  const rect = mapState.selectionRect;
  if (updateStart && rect.startClient) {
    rect.startMap = clientToMap(rect.startClient.x, rect.startClient.y);
  }
  if (rect.currentClient) {
    rect.currentMap = clientToMap(rect.currentClient.x, rect.currentClient.y);
  }
  updateSelectionBox();
}

function pickClusterPosition(existing = [], spacing = 200, base = { x: 0, y: 0 }) {
  const baseX = Number.isFinite(base?.x) ? base.x : 0;
  const baseY = Number.isFinite(base?.y) ? base.y : 0;
  const minDistance = Math.max(spacing * 0.72, spacing - 140);
  for (let radius = 0; radius <= 6; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = {
          x: baseX + dx * spacing,
          y: baseY + dy * spacing
        };
        let collision = false;
        for (const pos of existing) {
          if (!pos) continue;
          const dist = Math.hypot((pos.x ?? 0) - candidate.x, (pos.y ?? 0) - candidate.y);
          if (dist < minDistance) {
            collision = true;
            break;
          }
        }
        if (!collision) {
          return candidate;
        }
      }
    }
  }
  return {
    x: baseX + (Math.random() - 0.5) * spacing,
    y: baseY + (Math.random() - 0.5) * spacing
  };
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
  const rect = getSvgRect();
  if (!rect) return null;
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
  const rect = getSvgRect();
  if (!rect || !rect.width || !rect.height) return;
  const scaleX = mapState.viewBox.w / rect.width;
  const scaleY = mapState.viewBox.h / rect.height;
  mapState.viewBox.x += vector.dx * scaleX;
  mapState.viewBox.y += vector.dy * scaleY;
  mapState.updateViewBox({ immediate: true });
  if (mapState.selectionRect) {
    refreshSelectionRectFromClients();
  }
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
    const fontSize = Math.max(14, 16 * labelScale);
    label.setAttribute('font-size', fontSize);
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

const EDGE_NODE_KEY = Symbol('edgeNodes');

function ensureEdgeRegistry() {
  if (!mapState.edgeRefs) {
    mapState.edgeRefs = new Map();
  }
  if (!mapState.allEdges) {
    mapState.allEdges = new Set();
  }
}

function registerEdgeElement(edge, aId, bId) {
  if (!edge) return;
  ensureEdgeRegistry();
  mapState.allEdges.add(edge);
  edge[EDGE_NODE_KEY] = { aId, bId };
  [aId, bId].forEach(id => {
    if (!id) return;
    let set = mapState.edgeRefs.get(id);
    if (!set) {
      set = new Set();
      mapState.edgeRefs.set(id, set);
    }
    set.add(edge);
  });
}

function unregisterEdgeElement(edge) {
  if (!edge) return;
  const info = edge[EDGE_NODE_KEY];
  if (info) {
    [info.aId, info.bId].forEach(id => {
      const set = mapState.edgeRefs?.get(id);
      if (!set) return;
      set.delete(edge);
      if (!set.size) {
        mapState.edgeRefs.delete(id);
      }
    });
    delete edge[EDGE_NODE_KEY];
  }
  if (mapState.allEdges) {
    mapState.allEdges.delete(edge);
  }
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
  if (!mapState.edgeRefs) return;
  const edges = mapState.edgeRefs.get(id);
  if (!edges || !edges.size) return;
  const stale = [];
  edges.forEach(edge => {
    if (!edge || !edge.isConnected || !edge.ownerSVGElement) {
      stale.push(edge);
      return;
    }
    edge.setAttribute('d', calcPath(edge.dataset.a, edge.dataset.b, edge));
    syncLineDecoration(edge);
  });
  if (stale.length) {
    stale.forEach(unregisterEdgeElement);
  }
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
  const rect = getSvgRect({ force: true });
  if (!rect) return;
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
  if (mapState.edgeDragJustCompleted) {
    mapState.edgeDragJustCompleted = false;
    return;
  }
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
  const parts = vb.split(/\s+/).map(Number);
  const [, , w, h] = parts;
  if (!Number.isFinite(w) || w <= 0) return;
  const height = Number.isFinite(h) && h > 0 ? h : w;
  const defaultSize = Number.isFinite(mapState.defaultViewSize) ? mapState.defaultViewSize : w;
  const zoomRatio = w / defaultSize;
  const nodeScale = clamp(Math.pow(zoomRatio, 0.02), 0.85, 1.35);
  const labelScale = clamp(Math.pow(zoomRatio, 0.18), 0.95, 2.6);
  const lineScale = clamp(Math.pow(zoomRatio, 0.04), 0.92, 1.28);

  mapState.lastScaleSize = { w, h: height };
  mapState.currentScales = { nodeScale, labelScale, lineScale, zoomRatio };
  updateMarkerSizes();

  mapState.elements.forEach((entry, id) => {
    updateNodeGeometry(id, entry);
  });

  const allEdges = mapState.allEdges;
  if (allEdges && allEdges.size) {
    const stale = [];
    allEdges.forEach(line => {
      if (!line || !line.isConnected || !line.ownerSVGElement) {
        stale.push(line);
        return;
      }
      if (line.dataset.a && line.dataset.b) {
        line.setAttribute('d', calcPath(line.dataset.a, line.dataset.b, line));
      }
      updateLineStrokeWidth(line);
      syncLineDecoration(line);
    });
    if (stale.length) {
      stale.forEach(unregisterEdgeElement);
    }
  } else {
    const edgeContainer = mapState.edgeLayer || svg;
    edgeContainer.querySelectorAll('.map-edge').forEach(line => {
      if (line.dataset.a && line.dataset.b) {
        line.setAttribute('d', calcPath(line.dataset.a, line.dataset.b, line));
      }
      updateLineStrokeWidth(line);
      syncLineDecoration(line);
    });
  }
}

function getNodeBaseRadius(id) {
  if (mapState.nodeRadii && mapState.nodeRadii.has(id)) {
    return mapState.nodeRadii.get(id);
  }
  const entry = mapState.elements?.get(id);
  if (entry?.circle) {
    return Number(entry.circle.dataset.radius) || 20;
  }
  return 20;
}

function getNodeRadius(id) {
  const base = getNodeBaseRadius(id);
  const scales = getCurrentScales();
  return base * (scales.nodeScale || 1);
}

function getNodeFill(item) {
  if (!item || typeof item !== 'object') {
    return 'var(--gray)';
  }
  if (item.color && typeof item.color === 'string') {
    return item.color;
  }
  return KIND_FALLBACK_COLORS[item.kind] || 'var(--gray)';
}

function refreshNodeColor(id) {
  const entry = mapState.elements?.get(id);
  const item = mapState.itemMap?.[id];
  if (entry?.circle && item) {
    entry.circle.setAttribute('fill', getNodeFill(item));
  }
}

function computeTrimmedSegment(aId, bId, options = {}) {
  const positions = mapState.positions || {};
  const a = positions[aId];
  const b = positions[bId];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!len) return null;
  const ux = dx / len;
  const uy = dy / len;
  const extraA = Number(options.trimA) || 0;
  const extraB = Number(options.trimB) || 0;
  const trimA = Math.min(getNodeRadius(aId) + 6 + extraA, len / 2);
  const trimB = Math.min(getNodeRadius(bId) + 6 + extraB, len / 2);
  const startX = a.x + ux * trimA;
  const startY = a.y + uy * trimA;
  const endX = b.x - ux * trimB;
  const endY = b.y - uy * trimB;
  const trimmedLength = Math.hypot(endX - startX, endY - startY);
  return {
    startX,
    startY,
    endX,
    endY,
    ux,
    uy,
    trimmedLength: trimmedLength || 0
  };
}

function getPairCurveSeed(aId, bId) {
  const key = [String(aId ?? ''), String(bId ?? '')].sort().join('|');
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  return normalized * 2 - 1;
}

function signedDistanceToLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return ((px - x1) * dy - (py - y1) * dx) / len;
}

function computeCurveOffset(aId, bId, segment, manualCurve) {
  const trimmedLength = segment.trimmedLength || Math.hypot(segment.endX - segment.startX, segment.endY - segment.startY) || 1;
  if (Number.isFinite(manualCurve)) {
    const normalized = clamp(manualCurve, -3.5, 3.5);
    return normalized * trimmedLength;
  }
  return 0;
}

function computeStyleTrim(style, baseWidth) {
  const arrowAllowance = Math.max(12, baseWidth * 2.7);
  const inhibitAllowance = Math.max(10, baseWidth * 2.2);
  let trimA = 0;
  let trimB = 0;
  if (style === 'arrow-start' || style === 'arrow-both') {
    trimA += arrowAllowance;
  }
  if (style === 'arrow-end' || style === 'arrow-both') {
    trimB += arrowAllowance;
  }
  if (style === 'inhibit') {
    trimB += inhibitAllowance;
  }
  return { trimA, trimB };
}

function computeCurveControlPoint(aId, bId, segment, manualCurve, manualAnchor) {
  const { startX, startY, endX, endY, ux, uy } = segment;
  const nx = -uy;
  const ny = ux;
  const anchor = clamp(Number.isFinite(Number(manualAnchor)) ? Number(manualAnchor) : DEFAULT_CURVE_ANCHOR, 0.1, 0.9);
  const baseX = startX + (endX - startX) * anchor;
  const baseY = startY + (endY - startY) * anchor;
  const offset = computeCurveOffset(aId, bId, segment, manualCurve);
  const cx = baseX + nx * offset;
  const cy = baseY + ny * offset;
  return { cx, cy, anchor };
}

function getLineGeometry(aId, bId, options = {}) {
  const line = options.line || null;
  const style = normalizeLineStyle(options.style ?? line?.dataset?.style);
  const thicknessKey = options.thickness ?? line?.dataset?.thickness ?? DEFAULT_LINE_THICKNESS;
  const baseWidth = getLineThicknessValue(thicknessKey);
  const trims = computeStyleTrim(style, baseWidth);
  const segment = computeTrimmedSegment(aId, bId, trims);
  if (!segment) return null;
  let curveOverride;
  if (Object.prototype.hasOwnProperty.call(options, 'curve')) {
    const manual = Number(options.curve);
    curveOverride = Number.isFinite(manual) ? clamp(manual, -3.5, 3.5) : undefined;
  } else if (Object.prototype.hasOwnProperty.call(options, 'curveAnchor') && !Object.prototype.hasOwnProperty.call(options, 'curve')) {
    // when only anchor is provided we still allow dataset curve to persist
  } else if (line && Object.prototype.hasOwnProperty.call(line.dataset || {}, 'curve')) {
    const manual = Number(line.dataset.curve);
    curveOverride = Number.isFinite(manual) ? clamp(manual, -3.5, 3.5) : undefined;
  }

  let anchorOverride;
  if (Object.prototype.hasOwnProperty.call(options, 'anchor')) {
    anchorOverride = normalizeAnchorValue(options.anchor);
  } else if (Object.prototype.hasOwnProperty.call(options, 'curveAnchor')) {
    anchorOverride = normalizeAnchorValue(options.curveAnchor);
  } else if (line && Object.prototype.hasOwnProperty.call(line.dataset || {}, 'anchor')) {
    anchorOverride = normalizeAnchorValue(line.dataset.anchor);
  }

  const { cx, cy, anchor } = computeCurveControlPoint(aId, bId, segment, curveOverride, anchorOverride);
  return { ...segment, cx, cy, style, baseWidth, anchor: anchor ?? DEFAULT_CURVE_ANCHOR };
}

function getQuadraticPoint(start, control, end, t) {
  const mt = 1 - t;
  const x = mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x;
  const y = mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y;
  return { x, y };
}

function getQuadraticTangent(start, control, end, t) {
  const mt = 1 - t;
  const dx = 2 * mt * (control.x - start.x) + 2 * t * (end.x - control.x);
  const dy = 2 * mt * (control.y - start.y) + 2 * t * (end.y - control.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function calcPath(aId, bId, line = null, info = {}) {
  const geometry = getLineGeometry(aId, bId, { ...info, line });
  if (!geometry) return '';
  const { startX, startY, endX, endY, cx, cy } = geometry;
  return `M${startX} ${startY} Q${cx} ${cy} ${endX} ${endY}`;
}

function applyLineStyle(line, info = {}) {
  const previousColor = line.dataset.color;
  const previousStyle = line.dataset.style;
  const previousThickness = line.dataset.thickness;
  const previousLabel = line.dataset.label;
  const hadCurveAttr = Object.prototype.hasOwnProperty.call(line.dataset || {}, 'curve');
  const previousCurve = hadCurveAttr ? Number(line.dataset.curve) : undefined;
  const hasCurveOverride = Object.prototype.hasOwnProperty.call(info, 'curve');
  const hadAnchorAttr = Object.prototype.hasOwnProperty.call(line.dataset || {}, 'anchor');
  const previousAnchor = hadAnchorAttr ? Number(line.dataset.anchor) : undefined;
  const hasAnchorOverride =
    Object.prototype.hasOwnProperty.call(info, 'anchor') || Object.prototype.hasOwnProperty.call(info, 'curveAnchor');
  let curve = hasCurveOverride ? Number(info.curve) : previousCurve;
  if (!Number.isFinite(curve)) {
    curve = undefined;
  }
  if (hasCurveOverride) {
    if (Number.isFinite(curve)) {
      line.dataset.curve = String(curve);
    } else {
      delete line.dataset.curve;
    }
  }

  let anchor = hasAnchorOverride
    ? normalizeAnchorValue(Object.prototype.hasOwnProperty.call(info, 'anchor') ? info.anchor : info.curveAnchor)
    : normalizeAnchorValue(previousAnchor);
  if (!Number.isFinite(anchor)) {
    anchor = undefined;
  }
  if (hasAnchorOverride) {
    if (Number.isFinite(anchor)) {
      line.dataset.anchor = String(anchor);
    } else {
      delete line.dataset.anchor;
    }
  }

  const color = info.color ?? previousColor ?? DEFAULT_LINK_COLOR;
  const style = normalizeLineStyle(info.style ?? previousStyle);
  const thickness = info.thickness ?? previousThickness ?? DEFAULT_LINE_THICKNESS;
  const label = info.name ?? previousLabel ?? '';

  line.dataset.color = color;
  line.dataset.style = style;
  line.dataset.thickness = thickness;
  line.dataset.baseWidth = String(getLineThicknessValue(thickness));
  line.dataset.label = label;

  LINE_STYLE_CLASSNAMES.forEach(cls => line.classList.remove(cls));
  if (style) {
    line.classList.add(`map-edge--${style}`);
  }

  line.style.stroke = color;
  line.style.color = color;
  line.setAttribute('stroke', color);
  line.setAttribute('color', color);
  line.style.filter = '';
  line.removeAttribute('marker-start');
  line.removeAttribute('marker-end');
  line.removeAttribute('marker-mid');
  line.removeAttribute('stroke-dasharray');
  line.classList.remove('edge-glow');

  const effectiveAnchor = Number.isFinite(anchor) ? anchor : normalizeAnchorValue(line.dataset.anchor) ?? DEFAULT_CURVE_ANCHOR;
  const geometryInfo = {
    ...info,
    curve,
    anchor: effectiveAnchor,
    curveAnchor: effectiveAnchor
  };
  if (line.dataset.a && line.dataset.b) {
    line.setAttribute('d', calcPath(line.dataset.a, line.dataset.b, line, geometryInfo));
  }

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

function normalizeAnchorValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return clamp(num, 0.1, 0.9);
}

function getAnchorRange(handle) {
  if (handle === 'start') {
    return { min: 0.1, max: 0.45 };
  }
  if (handle === 'end') {
    return { min: 0.55, max: 0.9 };
  }
  return { min: 0.3, max: 0.7 };
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
  } else if (style === 'inhibit') {
    const overlay = ensureLineOverlay(line);
    if (overlay) updateInhibitOverlay(line, overlay);
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

function normalizeVector(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function updateBlockedOverlay(line, overlay) {
  if (!line || !overlay) return;
  const geometry = getLineGeometry(line.dataset.a, line.dataset.b, { line });
  if (!geometry) return;
  const start = { x: geometry.startX, y: geometry.startY };
  const control = { x: geometry.cx, y: geometry.cy };
  const end = { x: geometry.endX, y: geometry.endY };
  const mid = getQuadraticPoint(start, control, end, 0.5);
  const tangent = getQuadraticTangent(start, control, end, 0.5);
  const normal = { x: -tangent.y, y: tangent.x };
  const diag1 = normalizeVector(tangent.x + normal.x, tangent.y + normal.y);
  const diag2 = normalizeVector(tangent.x - normal.x, tangent.y - normal.y);
  const { lineScale = 1 } = getCurrentScales();
  const scaledWidth = geometry.baseWidth * lineScale;
  const armLength = Math.max(26, scaledWidth * 3.8);
  const pathData =
    `M${mid.x - diag1.x * armLength} ${mid.y - diag1.y * armLength}`
    + ` L${mid.x + diag1.x * armLength} ${mid.y + diag1.y * armLength}`
    + ` M${mid.x - diag2.x * armLength} ${mid.y - diag2.y * armLength}`
    + ` L${mid.x + diag2.x * armLength} ${mid.y + diag2.y * armLength}`;
  overlay.setAttribute('d', pathData);
  const overlayBase = Math.max(geometry.baseWidth * 1.35, 2.8);
  overlay.dataset.baseWidth = String(overlayBase);
  overlay.dataset.decoration = 'blocked';
  overlay.setAttribute('stroke', '#f43f5e');
  overlay.style.stroke = '#f43f5e';
  overlay.setAttribute('stroke-width', overlayBase * lineScale);
}

function updateInhibitOverlay(line, overlay) {
  if (!line || !overlay) return;
  const geometry = getLineGeometry(line.dataset.a, line.dataset.b, { line });
  if (!geometry) return;
  const start = { x: geometry.startX, y: geometry.startY };
  const control = { x: geometry.cx, y: geometry.cy };
  const end = { x: geometry.endX, y: geometry.endY };
  const tangent = getQuadraticTangent(start, control, end, 1);
  const { lineScale = 1 } = getCurrentScales();
  const scaledWidth = geometry.baseWidth * lineScale;
  const stemLength = Math.max(24, scaledWidth * 4.4);
  const barLength = Math.max(22, scaledWidth * 3.2);
  const retreat = Math.max(8, scaledWidth * 1.35);
  const tip = { x: end.x, y: end.y };
  const stemStart = { x: tip.x - tangent.x * stemLength, y: tip.y - tangent.y * stemLength };
  const mid = { x: tip.x - tangent.x * retreat, y: tip.y - tangent.y * retreat };
  const normal = { x: -tangent.y, y: tangent.x };
  const halfBar = barLength / 2;
  const barA = { x: mid.x + normal.x * halfBar, y: mid.y + normal.y * halfBar };
  const barB = { x: mid.x - normal.x * halfBar, y: mid.y - normal.y * halfBar };
  overlay.setAttribute(
    'd',
    `M${stemStart.x} ${stemStart.y} L${tip.x} ${tip.y} M${barA.x} ${barA.y} L${barB.x} ${barB.y}`
  );
  const overlayBase = Math.max(geometry.baseWidth * 0.95, 2.6);
  overlay.dataset.baseWidth = String(overlayBase);
  overlay.dataset.decoration = 'inhibit';
  const color = line.dataset.color || line.getAttribute('stroke') || DEFAULT_LINK_COLOR;
  overlay.setAttribute('stroke', color);
  overlay.style.stroke = color;
  overlay.setAttribute('stroke-width', overlayBase * lineScale);
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

function applyLinkPatchToState(aId, bId, patch = {}) {
  const apply = (item, otherId) => {
    if (!item || !Array.isArray(item.links)) return;
    const link = item.links.find(x => x.id === otherId);
    if (link) Object.assign(link, patch);
  };
  apply(mapState.itemMap?.[aId], bId);
  apply(mapState.itemMap?.[bId], aId);
}
