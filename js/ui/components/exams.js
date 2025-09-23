import { listExams, upsertExam, deleteExam, listExamSessions, loadExamSession, saveExamSessionProgress, deleteExamSessionProgress } from '../../storage/storage.js';
import { state, setExamSession, setExamAttemptExpanded } from '../../state.js';
import { uid, setToggleState } from '../../utils.js';
import { confirmModal } from './confirm.js';

const DEFAULT_SECONDS = 60;

const timerHandles = new WeakMap();
let keyHandler = null;
let keyHandlerSession = null;
let lastExamStatusMessage = '';

function ensureQuestionStats(sess) {
  const questionCount = sess?.exam?.questions?.length || 0;
  if (!sess) return;
  if (!Array.isArray(sess.questionStats)) {
    sess.questionStats = Array.from({ length: questionCount }, () => ({
      timeMs: 0,
      changes: [],
      enteredAt: null,
      initialAnswer: null,
      initialAnswerAt: null
    }));
    return;
  }
  if (sess.questionStats.length !== questionCount) {
    const next = Array.from({ length: questionCount }, (_, idx) => {
      const prev = sess.questionStats[idx] || {};
      return {
        timeMs: Number.isFinite(prev.timeMs) ? prev.timeMs : 0,
        changes: Array.isArray(prev.changes) ? [...prev.changes] : [],
        enteredAt: null,
        initialAnswer: prev.initialAnswer ?? null,
        initialAnswerAt: prev.initialAnswerAt ?? null
      };
    });
    sess.questionStats = next;
    return;
  }
  sess.questionStats.forEach(stat => {
    if (!stat) return;
    if (!Array.isArray(stat.changes)) stat.changes = [];
    if (!Number.isFinite(stat.timeMs)) stat.timeMs = 0;
    if (stat.enteredAt == null) stat.enteredAt = null;
    if (!('initialAnswer' in stat)) stat.initialAnswer = null;
    if (!('initialAnswerAt' in stat)) stat.initialAnswerAt = null;
  });
}

function beginQuestionTiming(sess, idx) {
  if (!sess || sess.mode !== 'taking') return;
  ensureQuestionStats(sess);
  const stat = sess.questionStats?.[idx];
  if (!stat) return;
  if (stat.enteredAt == null) {
    stat.enteredAt = Date.now();
  }
}

function finalizeQuestionTiming(sess, idx) {
  if (!sess || sess.mode !== 'taking') return;
  ensureQuestionStats(sess);
  const stat = sess.questionStats?.[idx];
  if (!stat || stat.enteredAt == null) return;
  const now = Date.now();
  const delta = Math.max(0, now - stat.enteredAt);
  stat.timeMs = (Number.isFinite(stat.timeMs) ? stat.timeMs : 0) + delta;
  stat.enteredAt = null;
}

function finalizeActiveQuestionTiming(sess) {
  if (!sess || typeof sess.idx !== 'number') return;
  finalizeQuestionTiming(sess, sess.idx);
}

function ensureScrollPositions(sess) {
  if (!sess) return;
  if (!sess.scrollPositions || typeof sess.scrollPositions !== 'object') {
    sess.scrollPositions = {};
  }
}

function storeScrollPosition(sess, idx, value) {
  if (!sess || typeof idx !== 'number') return;
  ensureScrollPositions(sess);
  const numeric = Number.isFinite(value) ? value : 0;
  sess.scrollPositions[idx] = numeric;
}

function getStoredScroll(sess, idx) {
  if (!sess || typeof idx !== 'number') return null;
  const store = sess.scrollPositions;
  if (!store || typeof store !== 'object') return null;
  const value = store[idx];
  return Number.isFinite(value) ? value : null;
}

function navigateToQuestion(sess, nextIdx, render) {
  if (!sess || typeof nextIdx !== 'number') return;
  const total = sess.exam?.questions?.length || 0;
  if (!total) return;
  const clamped = Math.min(Math.max(nextIdx, 0), Math.max(0, total - 1));
  if (clamped === sess.idx) return;
  if (typeof window !== 'undefined' && typeof sess.idx === 'number') {
    storeScrollPosition(sess, sess.idx, window.scrollY || 0);
  }
  if (sess.mode === 'taking') {
    finalizeActiveQuestionTiming(sess);
  }
  sess.idx = clamped;
  if (sess.mode === 'taking') {
    beginQuestionTiming(sess, clamped);
  }
  render();
}

function recordAnswerChange(sess, idx, question, nextAnswer) {
  if (!sess || sess.mode !== 'taking') return;
  ensureQuestionStats(sess);
  const stat = sess.questionStats?.[idx];
  if (!stat) return;
  const prev = sess.answers?.[idx];
  if (prev === nextAnswer) return;
  if (prev == null) {
    if (nextAnswer != null && stat.initialAnswer == null) {
      stat.initialAnswer = nextAnswer;
      stat.initialAnswerAt = Date.now();
    }
    return;
  }
  const change = {
    at: Date.now(),
    from: prev ?? null,
    to: nextAnswer ?? null
  };
  if (prev != null) change.fromCorrect = prev === question.answer;
  if (nextAnswer != null) change.toCorrect = nextAnswer === question.answer;
  if (!Array.isArray(stat.changes)) stat.changes = [];
  stat.changes.push(change);
}

function snapshotQuestionStats(sess) {
  ensureQuestionStats(sess);
  return (sess.questionStats || []).map(stat => ({
    timeMs: Number.isFinite(stat?.timeMs) ? stat.timeMs : 0,
    changes: Array.isArray(stat?.changes) ? stat.changes.map(change => ({ ...change })) : [],
    initialAnswer: stat?.initialAnswer ?? null,
    initialAnswerAt: stat?.initialAnswerAt ?? null
  }));
}

function analyzeAnswerChange(stat, question, finalAnswer) {
  if (!question) {
    return {
      initialAnswer: null,
      finalAnswer: null,
      initialCorrect: null,
      finalCorrect: null,
      changed: false,
      direction: null
    };
  }

  const answerId = question.answer;
  const changes = Array.isArray(stat?.changes) ? stat.changes : [];

  const firstRecorded = changes.find(change => change && change.to != null) || null;
  let lastRecorded = null;
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    const change = changes[i];
    if (change && change.to != null) {
      lastRecorded = change;
      break;
    }
  }

  const storedInitialAnswer = stat?.initialAnswer ?? null;
  const initialAnswer = storedInitialAnswer != null
    ? storedInitialAnswer
    : firstRecorded?.to ?? null;
  const resolvedFinalAnswer = finalAnswer != null
    ? finalAnswer
    : lastRecorded?.to ?? initialAnswer;

  const initialCorrect = initialAnswer != null ? initialAnswer === answerId : null;
  const finalCorrect = resolvedFinalAnswer != null ? resolvedFinalAnswer === answerId : null;

  const changed =
    initialAnswer != null &&
    resolvedFinalAnswer != null &&
    initialAnswer !== resolvedFinalAnswer;

  let direction = null;
  if (changed) {
    if (initialCorrect === true && finalCorrect === false) {
      direction = 'right-to-wrong';
    } else if (initialCorrect === false && finalCorrect === true) {
      direction = 'wrong-to-right';
    } else {
      direction = 'neutral';
    }
  }

  return {
    initialAnswer,
    finalAnswer: resolvedFinalAnswer,
    initialCorrect,
    finalCorrect,
    changed,
    direction
  };
}

function countMeaningfulAnswerChanges(stat) {
  if (!stat || !Array.isArray(stat.changes)) return 0;
  let count = 0;
  stat.changes.forEach(change => {
    if (!change) return;
    const from = change.from ?? null;
    const to = change.to ?? null;
    if (from == null) return;
    if (from === to) return;
    count += 1;
  });
  return count;
}

function answerForIndex(answers, idx) {
  if (answers == null) return null;
  const numericIdx = Number(idx);
  if (Number.isInteger(numericIdx) && numericIdx >= 0) {
    if (Array.isArray(answers)) {
      return answers[numericIdx] ?? null;
    }
    if (typeof Map !== 'undefined' && answers instanceof Map) {
      if (answers.has(numericIdx)) return answers.get(numericIdx);
      if (answers.has(String(numericIdx))) return answers.get(String(numericIdx));
      return null;
    }
    if (typeof answers === 'object') {
      if (numericIdx in answers && answers[numericIdx] != null) return answers[numericIdx];
      const key = String(numericIdx);
      if (key in answers && answers[key] != null) return answers[key];
    }
  }
  return null;
}

function summarizeAnswerChanges(questionStats, exam, answers = {}) {
  let rightToWrong = 0;
  let wrongToRight = 0;
  let switched = 0;
  let endedDifferent = 0;
  questionStats.forEach((stat, idx) => {
    const question = exam?.questions?.[idx];
    if (!question) return;
    const finalAnswer = answerForIndex(answers, idx);
    const details = analyzeAnswerChange(stat, question, finalAnswer);
    const meaningfulChanges = countMeaningfulAnswerChanges(stat);
    if (meaningfulChanges > 0) {
      switched += 1;
    }
    if (details.changed) {
      endedDifferent += 1;
      if (details.direction === 'right-to-wrong') rightToWrong += 1;
      if (details.direction === 'wrong-to-right') wrongToRight += 1;
    }
  });
  return {
    rightToWrong,
    wrongToRight,
    switched,
    endedDifferent,
    returnedToOriginal: Math.max(0, switched - endedDifferent),
    totalChanges: switched
  };
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function totalExamTimeMs(exam) {
  const seconds = typeof exam.secondsPerQuestion === 'number' ? exam.secondsPerQuestion : DEFAULT_SECONDS;
  return seconds * (exam.questions?.length || 0) * 1000;
}

function stopTimer(sess) {
  finalizeActiveQuestionTiming(sess);
  const handle = timerHandles.get(sess);
  if (handle) {
    clearInterval(handle);
    timerHandles.delete(sess);
  }
  if (sess?.startedAt) {
    const now = Date.now();
    const delta = Math.max(0, now - sess.startedAt);
    sess.elapsedMs = (sess.elapsedMs || 0) + delta;
    if (sess.exam?.timerMode === 'timed' && typeof sess.remainingMs === 'number') {
      sess.remainingMs = Math.max(0, sess.remainingMs - delta);
    }
    sess.startedAt = null;
  }
}

function trackTimerDisplay(sess, element, variant = 'compact') {
  if (!sess || !element) return;
  if (!Array.isArray(sess.__timerDisplays)) {
    sess.__timerDisplays = [];
  } else {
    sess.__timerDisplays = sess.__timerDisplays.filter(entry => {
      const el = entry?.element;
      return el && typeof el === 'object' && 'isConnected' in el ? el.isConnected : Boolean(el);
    });
  }
  sess.__timerDisplays.push({ element, variant });
}

function updateTimerDisplays(sess) {
  if (!sess || !Array.isArray(sess.__timerDisplays) || !sess.__timerDisplays.length) return;
  const remainingBase = typeof sess.remainingMs === 'number'
    ? Math.max(0, sess.remainingMs)
    : totalExamTimeMs(sess.exam);
  const formatted = formatCountdown(remainingBase);
  sess.__timerDisplays = sess.__timerDisplays.filter(entry => {
    const el = entry?.element;
    if (!el || typeof el !== 'object') return false;
    if ('isConnected' in el && !el.isConnected) return false;
    if ('innerHTML' in el) {
      if (entry.variant === 'detailed') {
        el.innerHTML = `<strong>Time Remaining:</strong> ${formatted}`;
      } else {
        el.textContent = formatted;
      }
    }
    return true;
  });
}

function ensureTimer(sess, render) {
  if (!sess || sess.mode !== 'taking' || sess.exam.timerMode !== 'timed') return;
  if (timerHandles.has(sess)) return;
  if (typeof sess.remainingMs !== 'number') {
    sess.remainingMs = totalExamTimeMs(sess.exam);
  }
  if (typeof sess.elapsedMs !== 'number') sess.elapsedMs = 0;
  sess.startedAt = Date.now();
  const handle = setInterval(() => {
    const now = Date.now();
    const last = sess.startedAt || now;
    const delta = Math.max(0, now - last);
    sess.startedAt = now;
    sess.elapsedMs = (sess.elapsedMs || 0) + delta;
    sess.remainingMs = Math.max(0, (sess.remainingMs ?? 0) - delta);
    if (sess.remainingMs <= 0) {
      stopTimer(sess);
      finalizeExam(sess, render, { autoSubmit: true });
    } else {
      updateTimerDisplays(sess);
    }
  }, 1000);
  timerHandles.set(sess, handle);
}

function teardownKeyboardNavigation() {
  if (keyHandler) {
    window.removeEventListener('keydown', keyHandler);
    keyHandler = null;
    keyHandlerSession = null;
  }
}

function setupKeyboardNavigation(sess, render) {
  if (!sess || sess.mode === 'summary') {
    teardownKeyboardNavigation();
    return;
  }
  if (keyHandler && keyHandlerSession === sess) return;
  teardownKeyboardNavigation();
  keyHandlerSession = sess;
  keyHandler = event => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
    }
    if (event.key === 'ArrowRight') {
      if (sess.idx < sess.exam.questions.length - 1) {
        event.preventDefault();
        navigateToQuestion(sess, sess.idx + 1, render);
      }
    } else if (event.key === 'ArrowLeft') {
      if (sess.idx > 0) {
        event.preventDefault();
        navigateToQuestion(sess, sess.idx - 1, render);
      }
    }
  };
  window.addEventListener('keydown', keyHandler);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return [hours, minutes, seconds].map(val => String(val).padStart(2, '0')).join(':');
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function currentElapsedMs(sess) {
  const base = sess?.elapsedMs || 0;
  if (sess?.startedAt) {
    return base + Math.max(0, Date.now() - sess.startedAt);
  }
  return base;
}

function slugify(text) {
  const lowered = (text || '').toLowerCase();
  const normalized = lowered.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'exam';
}

function triggerExamDownload(exam) {
  try {
    const data = JSON.stringify(exam, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(exam.examTitle || 'exam')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch (err) {
    console.warn('Failed to export exam', err);
    return false;
  }
}


function ensureExamShape(exam) {
  const next = clone(exam) || {};
  let changed = false;

  if (!next.id) { next.id = uid(); changed = true; }
  if (!next.examTitle) { next.examTitle = 'Untitled Exam'; changed = true; }
  if (next.timerMode !== 'timed') {
    if (next.timerMode !== 'untimed') changed = true;
    next.timerMode = 'untimed';
  }
  if (typeof next.secondsPerQuestion !== 'number' || next.secondsPerQuestion <= 0) {
    next.secondsPerQuestion = DEFAULT_SECONDS;
    changed = true;
  }
  if (!Array.isArray(next.questions)) {
    next.questions = [];
    changed = true;
  }
  next.questions = next.questions.map(q => {
    const question = { ...q };
    if (!question.id) { question.id = uid(); changed = true; }
    question.stem = question.stem ? String(question.stem) : '';
    if (!Array.isArray(question.options)) {
      question.options = [];
      changed = true;
    }
    question.options = question.options.map(opt => {
      const option = { ...opt };
      if (!option.id) { option.id = uid(); changed = true; }
      option.text = option.text ? String(option.text) : '';
      return option;
    });
    if (!question.answer || !question.options.some(opt => opt.id === question.answer)) {
      question.answer = question.options[0]?.id || '';
      changed = true;
    }
    if (question.explanation == null) { question.explanation = ''; changed = true; }
    if (!Array.isArray(question.tags)) {
      if (question.tags == null) question.tags = [];
      else question.tags = Array.isArray(question.tags) ? question.tags : [String(question.tags)];
      changed = true;
    }
    question.tags = question.tags.map(t => String(t)).filter(Boolean);
    if (question.media == null) { question.media = ''; changed = true; }
    return question;
  });

  if (!Array.isArray(next.results)) {
    next.results = [];
    changed = true;
  }
  next.results = next.results.map(res => {
    const result = { ...res };
    if (!result.id) { result.id = uid(); changed = true; }
    if (typeof result.when !== 'number') { result.when = Date.now(); changed = true; }
    if (typeof result.correct !== 'number') { result.correct = Number(result.correct) || 0; changed = true; }
    if (typeof result.total !== 'number') { result.total = Number(result.total) || (next.questions?.length ?? 0); changed = true; }
    if (!result.answers || typeof result.answers !== 'object') { result.answers = {}; changed = true; }
    if (!Array.isArray(result.flagged)) { result.flagged = []; changed = true; }
    if (typeof result.durationMs !== 'number') { result.durationMs = 0; changed = true; }
    if (typeof result.answered !== 'number') { result.answered = Object.keys(result.answers || {}).length; changed = true; }
    return result;
  });

  return { exam: next, changed };
}

function createBlankQuestion() {
  return {
    id: uid(),
    stem: '',
    options: [1, 2, 3, 4].map(() => ({ id: uid(), text: '' })),
    answer: '',
    explanation: '',
    tags: [],
    media: ''
  };
}

function createTakingSession(exam) {
  const snapshot = clone(exam);
  const totalMs = snapshot.timerMode === 'timed' ? totalExamTimeMs(snapshot) : null;
  return {
    mode: 'taking',
    exam: snapshot,
    idx: 0,
    answers: {},
    flagged: {},
    checked: {},
    startedAt: Date.now(),
    elapsedMs: 0,
    remainingMs: totalMs,
    questionStats: snapshot.questions.map(() => ({ timeMs: 0, changes: [], enteredAt: null }))
  };
}

function hydrateSavedSession(saved, fallbackExam) {
  const baseExam = saved?.exam ? ensureExamShape(saved.exam).exam : fallbackExam;
  const exam = clone(baseExam);
  const questionCount = exam.questions.length;
  const idx = Math.min(Math.max(Number(saved?.idx) || 0, 0), Math.max(0, questionCount - 1));
  const remaining = typeof saved?.remainingMs === 'number'
    ? Math.max(0, saved.remainingMs)
    : (exam.timerMode === 'timed' ? totalExamTimeMs(exam) : null);
  const elapsed = Math.max(0, Number(saved?.elapsedMs) || 0);
  return {
    mode: 'taking',
    exam,
    idx,
    answers: saved?.answers ? { ...saved.answers } : {},
    flagged: saved?.flagged ? { ...saved.flagged } : {},
    checked: saved?.checked ? { ...saved.checked } : {},
    startedAt: Date.now(),
    elapsedMs: elapsed,
    remainingMs: remaining,
    questionStats: exam.questions.map((_, questionIdx) => {
      const stat = saved?.questionStats?.[questionIdx] || {};
      return {
        timeMs: Number.isFinite(stat.timeMs) ? stat.timeMs : 0,
        changes: Array.isArray(stat.changes) ? stat.changes.map(change => ({ ...change })) : [],
        enteredAt: null
      };
    })
  };
}

export async function renderExams(root, render) {
  root.innerHTML = '';
  root.className = 'exam-view';

  const controls = document.createElement('div');
  controls.className = 'exam-controls';

  const heading = document.createElement('div');
  heading.className = 'exam-heading';
  heading.innerHTML = '<h1>Exams</h1><p>Import exams, take them, and review your attempts.</p>';
  controls.appendChild(heading);

  const actions = document.createElement('div');
  actions.className = 'exam-control-actions';

  const status = document.createElement('div');
  status.className = 'exam-status';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { exam } = ensureExamShape(parsed);
      await upsertExam({ ...exam, updatedAt: Date.now() });
      render();
    } catch (err) {
      console.warn('Failed to import exam', err);
      status.textContent = 'Unable to import exam — invalid JSON structure.';
    } finally {
      fileInput.value = '';
    }
  });

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn secondary';
  importBtn.textContent = 'Import Exam';
  importBtn.addEventListener('click', () => fileInput.click());
  actions.appendChild(importBtn);

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn';
  newBtn.textContent = 'New Exam';
  newBtn.addEventListener('click', () => openExamEditor(null, render));
  actions.appendChild(newBtn);

  controls.appendChild(actions);
  controls.appendChild(status);

  root.appendChild(controls);
  root.appendChild(fileInput);

  if (lastExamStatusMessage) {
    status.textContent = lastExamStatusMessage;
    lastExamStatusMessage = '';
  } else {
    status.textContent = '';
  }

  const stored = await listExams();
  const exams = [];
  for (const raw of stored) {
    const { exam, changed } = ensureExamShape(raw);
    exams.push(exam);
    if (changed) await upsertExam(exam);
  }
  exams.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const savedSessions = await listExamSessions();
  const sessionMap = new Map();
  for (const sess of savedSessions) {
    if (sess?.examId) sessionMap.set(sess.examId, sess);
  }

  // Clean up orphaned sessions for removed exams
  for (const sess of savedSessions) {
    if (!exams.find(ex => ex.id === sess.examId)) {
      await deleteExamSessionProgress(sess.examId);
    }
  }

  if (!exams.length) {
    const empty = document.createElement('div');
    empty.className = 'exam-empty';
    empty.innerHTML = '<p>No exams yet. Import a JSON exam or create one from scratch.</p>';
    root.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'exam-grid';
  exams.forEach(exam => {
    grid.appendChild(buildExamCard(exam, render, sessionMap.get(exam.id), status));
  });
  root.appendChild(grid);
}

function buildExamCard(exam, render, savedSession, statusEl) {
  const card = document.createElement('article');
  card.className = 'card exam-card';

  const title = document.createElement('h2');
  title.className = 'exam-card-title';
  title.textContent = exam.examTitle;
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'exam-card-meta';
  const questionCount = document.createElement('span');
  questionCount.textContent = `${exam.questions.length} question${exam.questions.length === 1 ? '' : 's'}`;
  meta.appendChild(questionCount);
  if (exam.timerMode === 'timed') {
    const timed = document.createElement('span');
    timed.textContent = `Timed • ${exam.secondsPerQuestion}s/question`;
    meta.appendChild(timed);
  } else {
    const timed = document.createElement('span');
    timed.textContent = 'Untimed';
    meta.appendChild(timed);
  }
  card.appendChild(meta);

  const stats = document.createElement('div');
  stats.className = 'exam-card-stats';
  stats.appendChild(createStat('Attempts', String(exam.results.length)));
  const last = latestResult(exam);
  if (last) {
    stats.appendChild(createStat('Last Score', formatScore(last)));
    const best = bestResult(exam);
    if (best) stats.appendChild(createStat('Best Score', formatScore(best)));
  } else {
    stats.appendChild(createStat('Last Score', '—'));
    stats.appendChild(createStat('Best Score', '—'));
  }
  card.appendChild(stats);

  if (savedSession) {
    const banner = document.createElement('div');
    banner.className = 'exam-saved-banner';
    const updated = savedSession.updatedAt ? new Date(savedSession.updatedAt).toLocaleString() : null;
    banner.textContent = updated ? `Saved attempt • ${updated}` : 'Saved attempt available';
    card.appendChild(banner);
  }

  const actions = document.createElement('div');
  actions.className = 'exam-card-actions';

  if (savedSession) {
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn';
    resumeBtn.textContent = 'Resume Attempt';
    resumeBtn.disabled = exam.questions.length === 0;
    resumeBtn.addEventListener('click', async () => {
      const latest = await loadExamSession(exam.id);
      if (!latest) {
        if (statusEl) statusEl.textContent = 'Saved attempt could not be found.';
        render();
        return;
      }
      const session = hydrateSavedSession(latest, exam);
      setExamSession(session);
      render();
    });
    actions.appendChild(resumeBtn);
  }

  const startBtn = document.createElement('button');
  startBtn.className = savedSession ? 'btn secondary' : 'btn';
  startBtn.textContent = savedSession ? 'Start Fresh' : 'Start Exam';
  startBtn.disabled = exam.questions.length === 0;
  startBtn.addEventListener('click', async () => {
    if (savedSession) {
      const confirm = await confirmModal('Start a new attempt and discard saved progress?');
      if (!confirm) return;
      await deleteExamSessionProgress(exam.id);
    }
    setExamSession(createTakingSession(exam));
    render();
  });
  actions.appendChild(startBtn);

  if (last) {
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn secondary';
    reviewBtn.textContent = 'Review Last Attempt';
    reviewBtn.addEventListener('click', () => {
      setExamSession({ mode: 'review', exam: clone(exam), result: clone(last), idx: 0 });
      render();
    });
    actions.appendChild(reviewBtn);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'btn secondary';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openExamEditor(exam, render));
  actions.appendChild(editBtn);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn secondary';
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', () => {
    const ok = triggerExamDownload(exam);
    if (!ok && statusEl) {
      statusEl.textContent = 'Unable to export exam.';
    } else if (ok && statusEl) {
      statusEl.textContent = 'Exam exported.';
    }
  });
  actions.appendChild(exportBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn danger';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', async () => {
    const ok = await confirmModal(`Delete "${exam.examTitle}"? This will remove all attempts.`);
    if (!ok) return;
    await deleteExamSessionProgress(exam.id).catch(() => {});
    await deleteExam(exam.id);
    render();
  });
  actions.appendChild(delBtn);

  card.appendChild(actions);

  const attemptsWrap = document.createElement('div');
  attemptsWrap.className = 'exam-attempts';
  const attemptsHeader = document.createElement('div');
  attemptsHeader.className = 'exam-attempts-header';
  const attemptsTitle = document.createElement('h3');
  attemptsTitle.textContent = 'Attempts';
  attemptsHeader.appendChild(attemptsTitle);

  const expandedState = state.examAttemptExpanded[exam.id];
  const isExpanded = expandedState != null ? expandedState : true;
  if (exam.results.length) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'exam-attempt-toggle';
    toggle.textContent = isExpanded ? 'Hide Attempts' : 'Show Attempts';
    toggle.addEventListener('click', () => {
      setExamAttemptExpanded(exam.id, !isExpanded);
      render();
    });
    attemptsHeader.appendChild(toggle);
  }

  attemptsWrap.appendChild(attemptsHeader);
  attemptsWrap.classList.toggle('collapsed', !isExpanded && exam.results.length > 0);

  if (!exam.results.length) {
    const none = document.createElement('p');
    none.className = 'exam-attempt-empty';
    none.textContent = 'No attempts yet.';
    attemptsWrap.appendChild(none);
  } else {
    const list = document.createElement('div');
    list.className = 'exam-attempt-list';
    [...exam.results]
      .sort((a, b) => b.when - a.when)
      .forEach(result => {
        list.appendChild(buildAttemptRow(exam, result, render));
      });
    attemptsWrap.appendChild(list);
  }

  card.appendChild(attemptsWrap);
  return card;
}

function buildAttemptRow(exam, result, render) {
  const row = document.createElement('div');
  row.className = 'exam-attempt-row';

  const info = document.createElement('div');
  info.className = 'exam-attempt-info';

  const title = document.createElement('div');
  title.className = 'exam-attempt-score';
  title.textContent = formatScore(result);
  info.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'exam-attempt-meta';
  const date = new Date(result.when).toLocaleString();
  const answeredText = `${result.answered}/${result.total} answered`;
  const flaggedText = `${result.flagged.length} flagged`;
  const durationText = result.durationMs ? formatDuration(result.durationMs) : '—';
  meta.textContent = `${date} • ${answeredText} • ${flaggedText} • ${durationText}`;
  info.appendChild(meta);

  row.appendChild(info);

  const review = document.createElement('button');
  review.className = 'btn secondary';
  review.textContent = 'Review';
  review.addEventListener('click', () => {
    setExamSession({ mode: 'review', exam: clone(exam), result: clone(result), idx: 0 });
    render();
  });
  row.appendChild(review);

  return row;
}

function createStat(label, value) {
  const wrap = document.createElement('div');
  wrap.className = 'exam-stat';
  const lbl = document.createElement('div');
  lbl.className = 'exam-stat-label';
  lbl.textContent = label;
  const val = document.createElement('div');
  val.className = 'exam-stat-value';
  val.textContent = value;
  wrap.appendChild(lbl);
  wrap.appendChild(val);
  return wrap;
}

function latestResult(exam) {
  if (!exam.results?.length) return null;
  return exam.results.reduce((acc, res) => (acc == null || res.when > acc.when ? res : acc), null);
}

function bestResult(exam) {
  if (!exam.results?.length) return null;
  return exam.results.reduce((acc, res) => {
    const pct = res.total ? res.correct / res.total : 0;
    const bestPct = acc?.total ? acc.correct / acc.total : -1;
    if (!acc || pct > bestPct) return res;
    return acc;
  }, null);
}

function formatScore(result) {
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  return `${result.correct}/${result.total} • ${pct}%`;
}

function formatDuration(ms) {
  if (ms == null) return '—';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function optionText(question, id) {
  return question.options.find(opt => opt.id === id)?.text || '';
}

function mediaElement(source) {
  if (!source) return null;
  const wrap = document.createElement('div');
  wrap.className = 'exam-media';
  const lower = source.toLowerCase();
  if (lower.startsWith('data:video') || /\.(mp4|webm|ogg)$/i.test(lower)) {
    const video = document.createElement('video');
    video.controls = true;
    video.src = source;
    wrap.appendChild(video);
  } else if (lower.startsWith('data:audio') || /\.(mp3|wav|ogg)$/i.test(lower)) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = source;
    wrap.appendChild(audio);
  } else {
    const img = document.createElement('img');
    img.src = source;
    img.alt = 'Question media';
    wrap.appendChild(img);
  }
  return wrap;
}

function answerClass(question, selectedId, optionId) {
  const isCorrect = optionId === question.answer;
  if (selectedId == null) return isCorrect ? 'correct-answer' : '';
  if (selectedId === optionId) {
    return selectedId === question.answer ? 'correct-answer' : 'incorrect-answer';
  }
  return isCorrect ? 'correct-answer' : '';
}

function renderPalette(sidebar, sess, render) {
  const palette = document.createElement('div');
  palette.className = 'exam-palette';
  const title = document.createElement('h3');
  title.textContent = 'Question Map';
  palette.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'exam-palette-grid';

  const isReview = sess.mode === 'review';
  const answersSource = isReview ? sess.result?.answers : sess.answers;
  const statsList = isReview
    ? (Array.isArray(sess.result?.questionStats) ? sess.result.questionStats : [])
    : (Array.isArray(sess.questionStats) ? sess.questionStats : []);
  const summary = isReview ? summarizeAnswerChanges(statsList, sess.exam, answersSource) : null;
  if (isReview && sess.result) {
    sess.result.changeSummary = summary;
  }
  const flaggedSet = new Set(sess.mode === 'review'
    ? (sess.result.flagged || [])
    : Object.entries(sess.flagged || {}).filter(([_, v]) => v).map(([idx]) => Number(idx)));

  sess.exam.questions.forEach((question, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(idx + 1);
    btn.className = 'palette-button';
    setToggleState(btn, sess.idx === idx);
    const answer = answerForIndex(answersSource, idx);
    const answered = answer != null && question.options.some(opt => opt.id === answer);

    const tooltipParts = [];
    let status = 'unanswered';

    if (isReview) {
      if (answered) {
        const isCorrect = answer === question.answer;
        status = isCorrect ? 'correct' : 'incorrect';
        tooltipParts.push(isCorrect ? 'Answered correctly' : 'Answered incorrectly');
      } else {
        status = 'review-unanswered';
        tooltipParts.push('Not answered');
      }

      const stat = statsList[idx];
      const changeDetails = analyzeAnswerChange(stat, question, answer);
      const meaningfulChanges = countMeaningfulAnswerChanges(stat);
      if (changeDetails.changed) {
        let changeTitle = 'Changed answer';
        if (changeDetails.direction === 'right-to-wrong') {
          changeTitle = 'Changed from correct to incorrect';
          btn.dataset.changeDirection = 'right-to-wrong';
        } else if (changeDetails.direction === 'wrong-to-right') {
          changeTitle = 'Changed from incorrect to correct';
          btn.dataset.changeDirection = 'wrong-to-right';
        } else {
          btn.dataset.changeDirection = 'changed';
        }
        tooltipParts.push(changeTitle);
      } else if (meaningfulChanges > 0) {
        tooltipParts.push('Changed answers but returned to start');
      }
    } else {
      status = answered ? 'answered' : 'unanswered';
      tooltipParts.push(answered ? 'Answered' : 'Not answered');
    }

    if (status === 'correct') {
      btn.classList.add('correct');
    } else if (status === 'incorrect') {
      btn.classList.add('incorrect');
    } else if (status === 'answered') {
      btn.classList.add('answered');
    } else if (status === 'review-unanswered') {
      btn.classList.add('unanswered', 'review-unanswered');
    } else {
      btn.classList.add('unanswered');
    }

    btn.dataset.status = status;
    btn.dataset.mode = sess.mode || '';

    if (flaggedSet.has(idx)) {
      btn.classList.add('flagged');
      btn.dataset.flagged = 'true';
    } else {
      btn.dataset.flagged = 'false';
    }
    if (tooltipParts.length) {
      btn.title = tooltipParts.join(' · ');
    }
    btn.addEventListener('click', () => {
      navigateToQuestion(sess, idx, render);
    });
    grid.appendChild(btn);
  });

  palette.appendChild(grid);
  if (summary) {
    const meta = document.createElement('div');
    meta.className = 'exam-palette-summary';

    const metaTitle = document.createElement('div');
    metaTitle.className = 'exam-palette-summary-title';
    metaTitle.textContent = 'Answer changes';
    meta.appendChild(metaTitle);

    const metaStats = document.createElement('div');
    metaStats.className = 'exam-palette-summary-stats';
    metaStats.innerHTML = `
      <span><strong>${summary.switched}</strong> switched</span>
      <span><strong>${summary.returnedToOriginal}</strong> returned</span>
      <span><strong>${summary.rightToWrong}</strong> right → wrong</span>
      <span><strong>${summary.wrongToRight}</strong> wrong → right</span>
    `;
    meta.appendChild(metaStats);

    palette.appendChild(meta);
  }
  sidebar.appendChild(palette);
  return summary;
}

export function renderExamRunner(root, render) {
  const sess = state.examSession;
  if (!sess) {
    teardownKeyboardNavigation();
    return;
  }
  const hasWindow = typeof window !== 'undefined';
  const prevIdx = sess.__lastRenderedIdx;
  const prevMode = sess.__lastRenderedMode;
  const prevScrollX = hasWindow ? window.scrollX : 0;
  const prevScrollY = hasWindow ? window.scrollY : 0;
  if (hasWindow) {
    if (typeof prevIdx === 'number') {
      storeScrollPosition(sess, prevIdx, prevScrollY);
    } else if (typeof sess.idx === 'number') {
      storeScrollPosition(sess, sess.idx, prevScrollY);
    }
  }
  root.innerHTML = '';
  root.className = 'exam-session';

  if (sess.mode === 'summary') {
    teardownKeyboardNavigation();
    renderSummary(root, render, sess);
    return;
  }

  ensureScrollPositions(sess);
  setupKeyboardNavigation(sess, render);

  if (!sess.answers) sess.answers = {};
  if (!sess.flagged) sess.flagged = {};
  if (!sess.checked) sess.checked = {};
  if (typeof sess.elapsedMs !== 'number') sess.elapsedMs = 0;
  if (sess.exam.timerMode === 'timed' && typeof sess.remainingMs !== 'number') {
    sess.remainingMs = totalExamTimeMs(sess.exam);
  }
  if (!sess.startedAt) sess.startedAt = Date.now();

  const questionCount = sess.exam.questions.length;
  if (!questionCount) {
    const empty = document.createElement('div');
    empty.className = 'exam-empty';
    empty.innerHTML = '<p>This exam does not contain any questions.</p>';
    const back = document.createElement('button');
    back.className = 'btn';
    back.textContent = 'Back to Exams';
    back.addEventListener('click', () => { teardownKeyboardNavigation(); setExamSession(null); render(); });
    empty.appendChild(back);
    root.appendChild(empty);
    return;
  }

  if (sess.mode === 'taking' && sess.exam.timerMode === 'timed') {
    ensureTimer(sess, render);
  }

  if (sess.idx < 0) sess.idx = 0;
  if (sess.idx >= questionCount) sess.idx = questionCount - 1;

  ensureQuestionStats(sess);
  if (sess.mode === 'taking') {
    beginQuestionTiming(sess, sess.idx);
  }

  const container = document.createElement('div');
  container.className = 'exam-runner';
  root.appendChild(container);

  const main = document.createElement('section');
  main.className = 'exam-main';
  container.appendChild(main);

  const sidebar = document.createElement('aside');
  sidebar.className = 'exam-sidebar';
  container.appendChild(sidebar);

  const question = sess.exam.questions[sess.idx];
  const answersSource = sess.mode === 'review' ? sess.result?.answers : sess.answers;
  const selected = answerForIndex(answersSource, sess.idx);
  const isInstantCheck = sess.mode === 'taking' && sess.exam.timerMode !== 'timed' && Boolean(sess.checked?.[sess.idx]);
  const showReview = sess.mode === 'review' || isInstantCheck;

  const top = document.createElement('div');
  top.className = 'exam-topbar';
  const progress = document.createElement('div');
  progress.className = 'exam-progress';
  progress.textContent = `${sess.exam.examTitle} • Question ${sess.idx + 1} of ${questionCount}`;
  top.appendChild(progress);

  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'flag-btn';
  const isFlagged = sess.mode === 'review'
    ? (sess.result.flagged || []).includes(sess.idx)
    : Boolean(sess.flagged?.[sess.idx]);
  setToggleState(flagBtn, isFlagged);
  flagBtn.textContent = isFlagged ? '🚩 Flagged' : 'Flag question';
  if (sess.mode === 'taking') {
    flagBtn.addEventListener('click', () => {
      if (!sess.flagged) sess.flagged = {};
      sess.flagged[sess.idx] = !isFlagged;
      render();
    });
  } else {
    flagBtn.disabled = true;
  }
  top.appendChild(flagBtn);

  if (sess.mode === 'taking' && sess.exam.timerMode === 'timed') {
    const timerEl = document.createElement('div');
    timerEl.className = 'exam-timer';
    const remainingMs = typeof sess.remainingMs === 'number' ? sess.remainingMs : totalExamTimeMs(sess.exam);
    timerEl.textContent = formatCountdown(remainingMs);
    trackTimerDisplay(sess, timerEl, 'compact');
    top.appendChild(timerEl);
  }
  main.appendChild(top);

  const stem = document.createElement('div');
  stem.className = 'exam-stem';
  stem.textContent = question.stem || '(No prompt)';
  main.appendChild(stem);

  const media = mediaElement(question.media);
  if (media) main.appendChild(media);

  if (question.tags?.length) {
    const tagWrap = document.createElement('div');
    tagWrap.className = 'exam-tags';
    question.tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'exam-tag';
      chip.textContent = tag;
      tagWrap.appendChild(chip);
    });
    main.appendChild(tagWrap);
  }

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'exam-options';
  if (!question.options.length) {
    const warn = document.createElement('p');
    warn.className = 'exam-warning';
    warn.textContent = 'This question has no answer options.';
    optionsWrap.appendChild(warn);
  }

  question.options.forEach(opt => {
    const choice = document.createElement(sess.mode === 'taking' ? 'button' : 'div');
    if (sess.mode === 'taking') choice.type = 'button';
    choice.className = 'exam-option';
    if (sess.mode === 'review') choice.classList.add('review');

    const indicator = document.createElement('span');
    indicator.className = 'option-indicator';
    choice.appendChild(indicator);

    const label = document.createElement('span');
    label.className = 'option-text';
    label.textContent = opt.text || '(Empty option)';
    choice.appendChild(label);
    const isSelected = selected === opt.id;
    if (sess.mode === 'taking') {
      setToggleState(choice, isSelected, 'selected');
      choice.addEventListener('click', () => {
        recordAnswerChange(sess, sess.idx, question, opt.id);
        sess.answers[sess.idx] = opt.id;
        if (sess.exam.timerMode !== 'timed' && sess.checked) {
          delete sess.checked[sess.idx];
        }
        render();
      });
      if (isInstantCheck) {
        const cls = answerClass(question, selected, opt.id);
        if (cls) choice.classList.add(cls);
        if (isSelected) choice.classList.add('chosen');
      }
    } else {
      const cls = answerClass(question, selected, opt.id);
      if (cls) choice.classList.add(cls);
      if (isSelected) choice.classList.add('chosen');
    }
    optionsWrap.appendChild(choice);
  });

  main.appendChild(optionsWrap);

  if (showReview) {
    const verdict = document.createElement('div');
    verdict.className = 'exam-verdict';
    let verdictText = 'Not answered';
    let verdictClass = 'neutral';
    if (selected != null) {
      if (selected === question.answer) {
        verdictText = 'Correct';
        verdictClass = 'correct';
      } else {
        verdictText = 'Incorrect';
        verdictClass = 'incorrect';
      }
    }
    verdict.classList.add(verdictClass);
    verdict.textContent = sess.mode === 'review' ? verdictText : `Checked: ${verdictText}`;
    main.appendChild(verdict);

    const answerSummary = document.createElement('div');
    answerSummary.className = 'exam-answer-summary';
    const your = optionText(question, selected);
    const correct = optionText(question, question.answer);
    answerSummary.innerHTML = `<div><strong>Your answer:</strong> ${your || '—'}</div><div><strong>Correct answer:</strong> ${correct || '—'}</div>`;
    main.appendChild(answerSummary);

    if (sess.mode === 'review') {
      const stats = sess.result?.questionStats?.[sess.idx];
      if (stats) {
        const insights = document.createElement('div');
        insights.className = 'exam-review-insights';
        const timeSpent = document.createElement('div');
        timeSpent.innerHTML = `<strong>Time spent:</strong> ${formatDuration(stats.timeMs)}`;
        insights.appendChild(timeSpent);

        const meaningfulChanges = countMeaningfulAnswerChanges(stats);
        const finalAnswer = sess.result?.answers?.[sess.idx];
        const changeDetails = analyzeAnswerChange(stats, question, finalAnswer);

        if (meaningfulChanges > 0) {
          const changeInfo = document.createElement('div');
          if (changeDetails.changed) {
            let message = 'You changed your answer.';
            if (changeDetails.direction === 'right-to-wrong') {
              message = 'You changed your answer from correct to incorrect.';
            } else if (changeDetails.direction === 'wrong-to-right') {
              message = 'You changed your answer from incorrect to correct.';
            } else if (changeDetails.initialCorrect === false && changeDetails.finalCorrect === false) {
              message = 'You changed your answer but it remained incorrect.';
            }
            changeInfo.innerHTML = `<strong>Answer change:</strong> ${message}`;
          } else {
            changeInfo.innerHTML = '<strong>Answer change:</strong> You changed answers but ended on your original choice.';
          }
          insights.appendChild(changeInfo);
        }
        main.appendChild(insights);
      }
    }

    if (question.explanation) {
      const explain = document.createElement('div');
      explain.className = 'exam-explanation';
      const title = document.createElement('h3');
      title.textContent = 'Explanation';
      const body = document.createElement('p');
      body.textContent = question.explanation;
      explain.appendChild(title);
      explain.appendChild(body);
      main.appendChild(explain);
    }
  }

  const paletteSummary = renderPalette(sidebar, sess, render);
  renderSidebarMeta(sidebar, sess, paletteSummary);

  const nav = document.createElement('div');
  nav.className = 'exam-nav';

  const prev = document.createElement('button');
  prev.className = 'btn secondary';
  prev.textContent = 'Previous';
  prev.disabled = sess.idx === 0;
  prev.addEventListener('click', () => {
    if (sess.idx > 0) {
      navigateToQuestion(sess, sess.idx - 1, render);
    }
  });
  nav.appendChild(prev);

  if (sess.mode === 'taking') {
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn secondary';
    saveBtn.textContent = 'Save & Exit';
    saveBtn.addEventListener('click', async () => {
      await saveProgressAndExit(sess, render);
    });
    nav.appendChild(saveBtn);

    if (sess.exam.timerMode !== 'timed') {
      const checkBtn = document.createElement('button');
      checkBtn.className = 'btn secondary';
      checkBtn.textContent = isInstantCheck ? 'Hide Check' : 'Check Answer';
      checkBtn.disabled = question.options.length === 0;
      checkBtn.addEventListener('click', () => {
        if (!sess.checked) sess.checked = {};
        if (isInstantCheck) {
          delete sess.checked[sess.idx];
        } else {
          sess.checked[sess.idx] = true;
        }
        render();
      });
      nav.appendChild(checkBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn secondary';
    nextBtn.textContent = 'Next Question';
    nextBtn.disabled = sess.idx >= questionCount - 1;
    nextBtn.addEventListener('click', () => {
      if (sess.idx < questionCount - 1) {
        navigateToQuestion(sess, sess.idx + 1, render);
      }
    });
    nav.appendChild(nextBtn);

    const submit = document.createElement('button');
    submit.className = 'btn';
    submit.textContent = 'Submit Exam';
    submit.addEventListener('click', async () => {
      await finalizeExam(sess, render);
    });
    nav.appendChild(submit);
  } else {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn secondary';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = sess.idx >= questionCount - 1;
    nextBtn.addEventListener('click', () => {
      if (sess.idx < questionCount - 1) {
        navigateToQuestion(sess, sess.idx + 1, render);
      }
    });
    nav.appendChild(nextBtn);

    const exit = document.createElement('button');
    exit.className = 'btn';
    if (sess.fromSummary) {
      exit.textContent = 'Back to Summary';
      exit.addEventListener('click', () => {
        setExamSession({ mode: 'summary', exam: sess.exam, latestResult: sess.fromSummary });
        render();
      });
    } else {
      exit.textContent = 'Back to Exams';
      exit.addEventListener('click', () => { teardownKeyboardNavigation(); setExamSession(null); render(); });
    }
    nav.appendChild(exit);
  }

  root.appendChild(nav);

  const sameQuestion = prevIdx === sess.idx && prevMode === sess.mode;
  sess.__lastRenderedIdx = sess.idx;
  sess.__lastRenderedMode = sess.mode;
  if (hasWindow && typeof window.scrollTo === 'function') {
    const storedScroll = getStoredScroll(sess, sess.idx);
    const targetY = sameQuestion ? prevScrollY : (storedScroll ?? 0);
    const targetX = sameQuestion ? prevScrollX : 0;
    if (typeof sess.idx === 'number') {
      storeScrollPosition(sess, sess.idx, targetY);
    }
    const restore = () => {
      window.scrollTo({ left: targetX, top: targetY, behavior: 'auto' });
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(restore);
    } else {
      setTimeout(restore, 0);
    }
  }
}
function renderSidebarMeta(sidebar, sess, changeSummary) {
  const info = document.createElement('div');
  info.className = 'exam-sidebar-info';

  const attempts = document.createElement('div');
  attempts.innerHTML = `<strong>Attempts:</strong> ${sess.exam.results?.length || 0}`;
  info.appendChild(attempts);

  if (sess.mode === 'review') {
    if (sess.result.durationMs) {
      const duration = document.createElement('div');
      duration.innerHTML = `<strong>Duration:</strong> ${formatDuration(sess.result.durationMs)}`;
      info.appendChild(duration);
    }
    const summary = changeSummary
      || (sess.result ? summarizeAnswerChanges(sess.result.questionStats || [], sess.exam, sess.result.answers) : null);
    if (summary) {
      const changeMeta = document.createElement('div');
      changeMeta.innerHTML = `<strong>Answer switches:</strong> ${summary.switched || 0} (Returned: ${summary.returnedToOriginal || 0}, Right → Wrong: ${summary.rightToWrong || 0}, Wrong → Right: ${summary.wrongToRight || 0})`;
      info.appendChild(changeMeta);
    }
  } else if (sess.mode === 'taking') {
    if (sess.exam.timerMode === 'timed') {
      const remaining = typeof sess.remainingMs === 'number' ? sess.remainingMs : totalExamTimeMs(sess.exam);
      const timer = document.createElement('div');
      timer.innerHTML = `<strong>Time Remaining:</strong> ${formatCountdown(remaining)}`;
      trackTimerDisplay(sess, timer, 'detailed');
      info.appendChild(timer);

      const pace = document.createElement('div');
      pace.innerHTML = `<strong>Pace:</strong> ${sess.exam.secondsPerQuestion}s/question`;
      info.appendChild(pace);
    } else {
      const timerMode = document.createElement('div');
      timerMode.innerHTML = '<strong>Timer:</strong> Untimed';
      info.appendChild(timerMode);

      const elapsed = document.createElement('div');
      elapsed.innerHTML = `<strong>Elapsed:</strong> ${formatDuration(currentElapsedMs(sess))}`;
      info.appendChild(elapsed);
    }
  }

  sidebar.appendChild(info);
}

async function saveProgressAndExit(sess, render) {
  stopTimer(sess);
  const questionStats = snapshotQuestionStats(sess);
  const payload = {
    examId: sess.exam.id,
    exam: clone(sess.exam),
    idx: sess.idx,
    answers: { ...(sess.answers || {}) },
    flagged: { ...(sess.flagged || {}) },
    checked: { ...(sess.checked || {}) },
    remainingMs: typeof sess.remainingMs === 'number' ? Math.max(0, sess.remainingMs) : null,
    elapsedMs: sess.elapsedMs || 0,
    mode: 'taking',
    questionStats
  };
  await saveExamSessionProgress(payload);
  lastExamStatusMessage = 'Attempt saved. You can resume later.';
  teardownKeyboardNavigation();
  setExamSession(null);
  render();
}

async function finalizeExam(sess, render, options = {}) {
  const isAuto = Boolean(options.autoSubmit);
  stopTimer(sess);

  const unanswered = sess.exam.questions
    .map((_, idx) => (sess.answers[idx] == null ? idx + 1 : null))
    .filter(Number.isFinite);
  if (!isAuto && unanswered.length) {
    const list = unanswered.join(', ');
    const confirm = await confirmModal(`You have ${unanswered.length} unanswered question${unanswered.length === 1 ? '' : 's'} (Question${unanswered.length === 1 ? '' : 's'}: ${list}). Submit anyway?`);
    if (!confirm) return;
  }

  const answers = {};
  let correct = 0;
  let answeredCount = 0;
  sess.exam.questions.forEach((question, idx) => {
    const ans = sess.answers[idx];
    if (ans != null) {
      answers[idx] = ans;
      answeredCount += 1;
      if (ans === question.answer) correct += 1;
    }
  });

  const flagged = Object.entries(sess.flagged || {})
    .filter(([_, val]) => Boolean(val))
    .map(([idx]) => Number(idx));

  const questionStats = snapshotQuestionStats(sess);
  const changeSummary = summarizeAnswerChanges(questionStats, sess.exam, answers);

  const result = {
    id: uid(),
    when: Date.now(),
    correct,
    total: sess.exam.questions.length,
    answers,
    flagged,
    durationMs: sess.elapsedMs || 0,
    answered: answeredCount,
    questionStats,
    changeSummary
  };

  const updatedExam = clone(sess.exam);
  updatedExam.results = [...(updatedExam.results || []), result];
  updatedExam.updatedAt = Date.now();
  await upsertExam(updatedExam);
  await deleteExamSessionProgress(updatedExam.id).catch(() => {});

  if (isAuto) {
    lastExamStatusMessage = 'Time expired. Attempt submitted automatically.';
  }

  teardownKeyboardNavigation();
  setExamSession({ mode: 'summary', exam: updatedExam, latestResult: result });
  render();
}

function renderSummary(root, render, sess) {
  const wrap = document.createElement('div');
  wrap.className = 'exam-summary';

  const title = document.createElement('h2');
  title.textContent = `${sess.exam.examTitle} — Results`;
  wrap.appendChild(title);

  const score = document.createElement('div');
  score.className = 'exam-summary-score';
  const pct = sess.latestResult.total ? Math.round((sess.latestResult.correct / sess.latestResult.total) * 100) : 0;
  score.innerHTML = `<span class="score-number">${sess.latestResult.correct}/${sess.latestResult.total}</span><span class="score-percent">${pct}%</span>`;
  wrap.appendChild(score);

  const metrics = document.createElement('div');
  metrics.className = 'exam-summary-metrics';
  metrics.appendChild(createStat('Answered', `${sess.latestResult.answered}/${sess.latestResult.total}`));
  metrics.appendChild(createStat('Flagged', String(sess.latestResult.flagged.length)));
  metrics.appendChild(createStat('Duration', formatDuration(sess.latestResult.durationMs)));
  wrap.appendChild(metrics);

  const actions = document.createElement('div');
  actions.className = 'exam-summary-actions';

  const reviewBtn = document.createElement('button');
  reviewBtn.className = 'btn';
  reviewBtn.textContent = 'Review Attempt';
  reviewBtn.addEventListener('click', () => {
    setExamSession({
      mode: 'review',
      exam: clone(sess.exam),
      result: clone(sess.latestResult),
      idx: 0,
      fromSummary: clone(sess.latestResult)
    });
    render();
  });
  actions.appendChild(reviewBtn);

  const retake = document.createElement('button');
  retake.className = 'btn secondary';
  retake.textContent = 'Retake Exam';
  retake.addEventListener('click', () => {
    setExamSession(createTakingSession(sess.exam));
    render();
  });
  actions.appendChild(retake);

  const exit = document.createElement('button');
  exit.className = 'btn';
  exit.textContent = 'Back to Exams';
  exit.addEventListener('click', () => { setExamSession(null); render(); });
  actions.appendChild(exit);

  wrap.appendChild(actions);
  root.appendChild(wrap);
}

function openExamEditor(existing, render) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';

  const form = document.createElement('form');
  form.className = 'card modal-form exam-editor';

  let dirty = false;
  const markDirty = () => { dirty = true; };

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close exam editor');
  closeBtn.innerHTML = '&times;';
  form.appendChild(closeBtn);

  const removeOverlay = () => {
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  const { exam } = ensureExamShape(existing || {
    id: uid(),
    examTitle: 'New Exam',
    timerMode: 'untimed',
    secondsPerQuestion: DEFAULT_SECONDS,
    questions: [],
    results: []
  });

  const heading = document.createElement('h2');
  heading.textContent = existing ? 'Edit Exam' : 'Create Exam';
  form.appendChild(heading);

  const error = document.createElement('div');
  error.className = 'exam-error';
  form.appendChild(error);

  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Title';
  const titleInput = document.createElement('input');
  titleInput.className = 'input';
  titleInput.value = exam.examTitle;
  titleInput.addEventListener('input', () => { exam.examTitle = titleInput.value; markDirty(); });
  titleLabel.appendChild(titleInput);
  form.appendChild(titleLabel);

  const timerRow = document.createElement('div');
  timerRow.className = 'exam-timer-row';

  const modeLabel = document.createElement('label');
  modeLabel.textContent = 'Timer Mode';
  const modeSelect = document.createElement('select');
  modeSelect.className = 'input';
  ['untimed', 'timed'].forEach(mode => {
    const opt = document.createElement('option');
    opt.value = mode;
    opt.textContent = mode === 'timed' ? 'Timed' : 'Untimed';
    modeSelect.appendChild(opt);
  });
  modeSelect.value = exam.timerMode;
  modeSelect.addEventListener('change', () => {
    exam.timerMode = modeSelect.value;
    secondsLabel.style.display = exam.timerMode === 'timed' ? 'flex' : 'none';
    markDirty();
  });
  modeLabel.appendChild(modeSelect);
  timerRow.appendChild(modeLabel);

  const secondsLabel = document.createElement('label');
  secondsLabel.textContent = 'Seconds per question';
  const secondsInput = document.createElement('input');
  secondsInput.type = 'number';
  secondsInput.min = '10';
  secondsInput.className = 'input';
  secondsInput.value = String(exam.secondsPerQuestion);
  secondsInput.addEventListener('input', () => {
    const val = Number(secondsInput.value);
    if (!Number.isNaN(val) && val > 0) {
      exam.secondsPerQuestion = val;
      markDirty();
    }
  });
  secondsLabel.appendChild(secondsInput);
  secondsLabel.style.display = exam.timerMode === 'timed' ? 'flex' : 'none';
  timerRow.appendChild(secondsLabel);

  form.appendChild(timerRow);

  const questionSection = document.createElement('div');
  questionSection.className = 'exam-question-section';
  form.appendChild(questionSection);

  const questionsHeader = document.createElement('div');
  questionsHeader.className = 'exam-question-header';
  const qTitle = document.createElement('h3');
  qTitle.textContent = 'Questions';
  const addQuestion = document.createElement('button');
  addQuestion.type = 'button';
  addQuestion.className = 'btn secondary';
  addQuestion.textContent = 'Add Question';
  addQuestion.addEventListener('click', () => {
    exam.questions.push(createBlankQuestion());
    markDirty();
    renderQuestions();
  });
  questionsHeader.appendChild(qTitle);
  questionsHeader.appendChild(addQuestion);
  form.appendChild(questionsHeader);

  function renderQuestions() {
    questionSection.innerHTML = '';
    if (!exam.questions.length) {
      const empty = document.createElement('p');
      empty.className = 'exam-question-empty';
      empty.textContent = 'No questions yet. Add your first question to get started.';
      questionSection.appendChild(empty);
      return;
    }

    exam.questions.forEach((question, idx) => {
      const card = document.createElement('div');
      card.className = 'exam-question-editor';

      question.tags = Array.isArray(question.tags) ? question.tags : [];
      if (!Array.isArray(question.options)) question.options = [];

      const header = document.createElement('div');
      header.className = 'exam-question-editor-header';
      const title = document.createElement('h4');
      title.textContent = `Question ${idx + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost-btn';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        exam.questions.splice(idx, 1);
        markDirty();
        renderQuestions();
      });
      header.appendChild(title);
      header.appendChild(remove);
      card.appendChild(header);

      const stemLabel = document.createElement('label');
      stemLabel.textContent = 'Prompt';
      const stemInput = document.createElement('textarea');
      stemInput.className = 'input';
      stemInput.value = question.stem;
      stemInput.addEventListener('input', () => { question.stem = stemInput.value; markDirty(); });
      stemLabel.appendChild(stemInput);
      card.appendChild(stemLabel);

      const mediaLabel = document.createElement('label');
      mediaLabel.textContent = 'Media (URL or upload)';
      const mediaInput = document.createElement('input');
      mediaInput.className = 'input';
      mediaInput.placeholder = 'https://example.com/image.png';
      mediaInput.value = question.media || '';
      mediaInput.addEventListener('input', () => { question.media = mediaInput.value.trim(); updatePreview(); markDirty(); });
      mediaLabel.appendChild(mediaInput);

      const mediaUpload = document.createElement('input');
      mediaUpload.type = 'file';
      mediaUpload.accept = 'image/*,video/*,audio/*';
      mediaUpload.addEventListener('change', () => {
        const file = mediaUpload.files?.[0];
        if (!file) return;
        markDirty();
        const reader = new FileReader();
        reader.onload = () => {
          question.media = typeof reader.result === 'string' ? reader.result : '';
          mediaInput.value = question.media;
          updatePreview();
          markDirty();
        };
        reader.readAsDataURL(file);
      });
      mediaLabel.appendChild(mediaUpload);

      const clearMedia = document.createElement('button');
      clearMedia.type = 'button';
      clearMedia.className = 'ghost-btn';
      clearMedia.textContent = 'Remove media';
      clearMedia.addEventListener('click', () => {
        question.media = '';
        mediaInput.value = '';
        mediaUpload.value = '';
        updatePreview();
        markDirty();
      });
      mediaLabel.appendChild(clearMedia);
      card.appendChild(mediaLabel);

      const preview = document.createElement('div');
      preview.className = 'exam-media-preview';
      function updatePreview() {
        preview.innerHTML = '';
        const el = mediaElement(question.media);
        if (el) preview.appendChild(el);
      }
      updatePreview();
      card.appendChild(preview);

      const tagsLabel = document.createElement('label');
      tagsLabel.textContent = 'Tags (comma separated)';
      const tagsInput = document.createElement('input');
      tagsInput.className = 'input';
      tagsInput.value = question.tags.join(', ');
      tagsInput.addEventListener('input', () => {
        question.tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
        markDirty();
      });
      tagsLabel.appendChild(tagsInput);
      card.appendChild(tagsLabel);

      const explanationLabel = document.createElement('label');
      explanationLabel.textContent = 'Explanation';
      const explanationInput = document.createElement('textarea');
      explanationInput.className = 'input';
      explanationInput.value = question.explanation || '';
      explanationInput.addEventListener('input', () => { question.explanation = explanationInput.value; markDirty(); });
      explanationLabel.appendChild(explanationInput);
      card.appendChild(explanationLabel);

      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'exam-option-editor-list';

      function renderOptions() {
        optionsWrap.innerHTML = '';
        question.options.forEach((opt, optIdx) => {
          const row = document.createElement('div');
          row.className = 'exam-option-editor';

          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = `correct-${question.id}`;
          radio.checked = question.answer === opt.id;
          radio.addEventListener('change', () => { question.answer = opt.id; markDirty(); });

          const text = document.createElement('input');
          text.className = 'input';
          text.type = 'text';
          text.placeholder = `Option ${optIdx + 1}`;
          text.value = opt.text;
          text.addEventListener('input', () => { opt.text = text.value; markDirty(); });

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'ghost-btn';
          removeBtn.textContent = 'Remove';
          removeBtn.disabled = question.options.length <= 2;
          removeBtn.addEventListener('click', () => {
            question.options.splice(optIdx, 1);
            if (question.answer === opt.id) {
              question.answer = question.options[0]?.id || '';
            }
            markDirty();
            renderOptions();
          });

          row.appendChild(radio);
          row.appendChild(text);
          row.appendChild(removeBtn);
          optionsWrap.appendChild(row);
        });
      }

      renderOptions();

      const addOption = document.createElement('button');
      addOption.type = 'button';
      addOption.className = 'btn secondary';
      addOption.textContent = 'Add Option';
      addOption.addEventListener('click', () => {
        const opt = { id: uid(), text: '' };
        question.options.push(opt);
        markDirty();
        renderOptions();
      });

      card.appendChild(optionsWrap);
      card.appendChild(addOption);

      questionSection.appendChild(card);
    });
  }

  renderQuestions();

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn';
  save.textContent = 'Save Exam';
  actions.appendChild(save);

  form.appendChild(actions);

  async function persistExam() {
    error.textContent = '';

    const title = titleInput.value.trim();
    if (!title) {
      error.textContent = 'Exam title is required.';
      return false;
    }

    if (!exam.questions.length) {
      error.textContent = 'Add at least one question.';
      return false;
    }

    for (let i = 0; i < exam.questions.length; i++) {
      const question = exam.questions[i];
      question.stem = question.stem.trim();
      question.explanation = question.explanation?.trim() || '';
      question.media = question.media?.trim() || '';
      question.options = question.options.map(opt => ({ id: opt.id, text: opt.text.trim() })).filter(opt => opt.text);
      if (question.options.length < 2) {
        error.textContent = `Question ${i + 1} needs at least two answer options.`;
        return false;
      }
      if (!question.answer || !question.options.some(opt => opt.id === question.answer)) {
        error.textContent = `Select a correct answer for question ${i + 1}.`;
        return false;
      }
      question.tags = question.tags.map(t => t.trim()).filter(Boolean);
    }

    const payload = {
      ...exam,
      examTitle: title,
      updatedAt: Date.now()
    };

    await upsertExam(payload);
    return true;
  }

  async function saveAndClose() {
    const ok = await persistExam();
    if (!ok) return false;
    dirty = false;
    removeOverlay();
    render();
    return true;
  }

  function promptSaveChoice() {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'modal';

      const card = document.createElement('div');
      card.className = 'card';

      const message = document.createElement('p');
      message.textContent = 'Save changes before closing?';
      card.appendChild(message);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'modal-actions';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => { cleanup(); resolve('save'); });

      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'btn secondary';
      discardBtn.textContent = 'Discard';
      discardBtn.addEventListener('click', () => { cleanup(); resolve('discard'); });

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ghost-btn';
      cancelBtn.textContent = 'Keep Editing';
      cancelBtn.addEventListener('click', () => { cleanup(); resolve('cancel'); });

      actionsRow.appendChild(saveBtn);
      actionsRow.appendChild(discardBtn);
      actionsRow.appendChild(cancelBtn);
      card.appendChild(actionsRow);
      modal.appendChild(card);

      modal.addEventListener('click', e => {
        if (e.target === modal) {
          cleanup();
          resolve('cancel');
        }
      });

      document.body.appendChild(modal);
      saveBtn.focus();

      function cleanup() {
        if (modal.parentNode) document.body.removeChild(modal);
      }
    });
  }

  async function attemptClose() {
    if (!dirty) {
      removeOverlay();
      return;
    }
    const choice = await promptSaveChoice();
    if (choice === 'cancel') return;
    if (choice === 'discard') {
      dirty = false;
      removeOverlay();
      return;
    }
    if (choice === 'save') {
      await saveAndClose();
    }
  }

  closeBtn.addEventListener('click', attemptClose);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    await saveAndClose();
  });

  overlay.appendChild(form);

  document.body.appendChild(overlay);
  titleInput.focus();
}

