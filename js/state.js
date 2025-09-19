export const state = {
  tab: "Diseases",
  subtab: {
    Diseases: "Browse",
    Drugs: "Browse",
    Concepts: "Browse",
    Study: "Flashcards",
    Exams: "", // placeholder
    Map: "",
    Settings: ""
  },
  query: "",
  filters: { types:["disease","drug","concept"], block:"", week:"", onlyFav:false, sort:"updated" },
  entryLayout: { mode: 'list', columns: 3, scale: 1, controlsVisible: false },
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
  blockMode: { section:"", assignments:{}, reveal:{}, order:{} }
};

export function setTab(t){ state.tab = t; }
export function setSubtab(tab, sub){ state.subtab[tab] = sub; }
export function setQuery(q){ state.query = q; }
export function setFilters(patch){ Object.assign(state.filters, patch); }
export function setBuilder(patch){ Object.assign(state.builder, patch); }
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
