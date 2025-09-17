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
  builder: { blocks:[], weeks:[], lectures:[], types:["disease","drug","concept"], tags:[], onlyFav:false, manualPicks:[] },
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
