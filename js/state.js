export const state = {
  tab: "Block Board",
  subtab: {
    Diseases: "Browse",
    Drugs: "Browse",
    Concepts: "Browse",
    Lists: "Diseases",
    Study: "Builder",
    Exams: "", // placeholder
    Map: "",
    Settings: ""
  },
  query: "",
  filters: { types:["disease","drug","concept"], block:"", week:"", onlyFav:false, sort:"updated-desc" },
  lectures: { query: '', blockId: '', week: '', status: '', tag: '' },
  entryLayout: { mode: 'list', columns: 3, scale: 1, controlsVisible: false },
  blockBoard: { collapsedBlocks: [], hiddenTimelines: [] },
  builder: {
    blocks:[],
    weeks:[],
    lectures:[],
    types:["disease","drug","concept"],
    tags:[],
    onlyFav:false,
    manualPicks:[],
    collapsedBlocks:[],
    collapsedWeeks:[]
  },
  cards: {
    collapsedBlocks: [],
    collapsedWeeks: [],
    initialized: false
  },
  cohort: [],
  review: { count:20, format:"flashcards" },
  quizSession: null,
  flashSession: null,
  examSession: null,
  examAttemptExpanded: {},
  map: { panzoom:false },
  blockMode: { section:"", assignments:{}, reveal:{}, order:{} },
  study: { selectedMode: 'Flashcards' },
  studySessions: {},
  studySessionsLoaded: false
};

export function setTab(t){ state.tab = t; }
export function setSubtab(tab, sub){ state.subtab[tab] = sub; }
export function setQuery(q){ state.query = q; }
export function setFilters(patch){ Object.assign(state.filters, patch); }
export function setBuilder(patch){ Object.assign(state.builder, patch); }
export function setBlockBoardState(patch) {
  if (!patch) return;
  if (!state.blockBoard) {
    state.blockBoard = { collapsedBlocks: [], hiddenTimelines: [], autoCollapsed: [], autoHidden: [] };
  }
  const current = state.blockBoard;
  if (!Array.isArray(current.hiddenTimelines)) {
    current.hiddenTimelines = [];
  }
  if (!Array.isArray(current.autoCollapsed)) {
    current.autoCollapsed = [];
  }
  if (!Array.isArray(current.autoHidden)) {
    current.autoHidden = [];
  }
  if (Array.isArray(patch.collapsedBlocks)) {
    const unique = Array.from(new Set(patch.collapsedBlocks.map(id => String(id))));
    current.collapsedBlocks = unique;
  }
  if (Array.isArray(patch.hiddenTimelines)) {
    const uniqueHidden = Array.from(new Set(patch.hiddenTimelines.map(id => String(id))));
    current.hiddenTimelines = uniqueHidden;
  }
  if (Array.isArray(patch.autoCollapsed)) {
    const autoSet = Array.from(new Set(patch.autoCollapsed.map(id => String(id))));
    current.autoCollapsed = autoSet;
  }
  if (Array.isArray(patch.autoHidden)) {
    const autoHiddenSet = Array.from(new Set(patch.autoHidden.map(id => String(id))));
    current.autoHidden = autoHiddenSet;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'showDensity')) {
    const show = Boolean(patch.showDensity);
    if (show) {
      current.hiddenTimelines = current.hiddenTimelines.filter(id => id !== '__all__');
    } else if (!current.hiddenTimelines.includes('__all__')) {
      current.hiddenTimelines = [...current.hiddenTimelines, '__all__'];
    }
  }
}
export function setLecturesState(patch) {
  if (!patch) return;
  if (!state.lectures) {
    state.lectures = { query: '', blockId: '', week: '', status: '', tag: '' };
  }
  const next = { ...state.lectures };
  if (Object.prototype.hasOwnProperty.call(patch, 'query')) {
    next.query = String(patch.query ?? '');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'blockId')) {
    next.blockId = String(patch.blockId ?? '');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'week')) {
    next.week = String(patch.week ?? '');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    next.status = String(patch.status ?? '');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tag')) {
    next.tag = String(patch.tag ?? '');
  }
  state.lectures = next;
}

export function resetLecturesState() {
  state.lectures = { query: '', blockId: '', week: '', status: '', tag: '' };
}
export function setCardsState(patch){
  if (!patch) return;
  if (!state.cards) {
    state.cards = { collapsedBlocks: [], collapsedWeeks: [], initialized: false };
  }
  const { collapsedBlocks, collapsedWeeks } = patch;
  if (Array.isArray(collapsedBlocks)) {
    const unique = Array.from(new Set(collapsedBlocks.filter(Boolean)));
    state.cards.collapsedBlocks = unique;
  }
  if (Array.isArray(collapsedWeeks)) {
    const unique = Array.from(new Set(collapsedWeeks.filter(Boolean)));
    state.cards.collapsedWeeks = unique;
  }
  state.cards.initialized = true;
}
export function setCohort(items){ state.cohort = items; }
export function resetTransientSessions(){ state.quizSession = null; state.flashSession = null; state.examSession = null; }
export function setFlashSession(sess){ state.flashSession = sess; }
export function setQuizSession(sess){ state.quizSession = sess; }
export function setReviewConfig(patch){ Object.assign(state.review, patch); }
export function setExamSession(sess){ state.examSession = sess; }
export function setExamAttemptExpanded(examId, expanded){
  state.examAttemptExpanded[examId] = expanded;
}
export function setBlockMode(patch){ Object.assign(state.blockMode, patch); }
export function resetBlockMode(){ state.blockMode = { section:"", assignments:{}, reveal:{}, order:{} }; }
export function setEntryLayout(patch){
  if (!patch) return;
  const layout = state.entryLayout;
  if (Object.prototype.hasOwnProperty.call(patch, 'columns')) {
    const cols = Number(patch.columns);
    if (!Number.isNaN(cols)) {
      layout.columns = Math.max(1, Math.min(6, Math.round(cols)));
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'scale')) {
    const scl = Number(patch.scale);
    if (!Number.isNaN(scl)) {
      layout.scale = Math.max(0.6, Math.min(1.4, scl));
    }
  }
  if (patch.mode === 'list' || patch.mode === 'grid') {
    layout.mode = patch.mode;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'controlsVisible')) {
    layout.controlsVisible = Boolean(patch.controlsVisible);
  }
}

export function setStudySelectedMode(mode) {
  if (!state.study) state.study = { selectedMode: 'Flashcards' };
  if (mode === 'Flashcards' || mode === 'Quiz' || mode === 'Blocks') {
    state.study.selectedMode = mode;
  }
}

export function setStudySessions(map) {
  state.studySessions = map ? { ...map } : {};
  state.studySessionsLoaded = true;
}

export function setStudySessionEntry(mode, entry) {
  if (!mode) return;
  const next = { ...(state.studySessions || {}) };
  if (entry) {
    next[mode] = entry;
  } else {
    delete next[mode];
  }
  state.studySessions = next;
}

export function clearStudySessionsState() {
  state.studySessions = {};
  state.studySessionsLoaded = false;
}
