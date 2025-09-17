import {
  listExams,
  upsertExam,
  deleteExam,
  listExamSessions,
  upsertExamSession,
  deleteExamSession
} from '../../storage/storage.js';
import { state, setExamSession } from '../../state.js';
import { uid } from '../../utils.js';
import { confirmModal } from './confirm.js';

const DEFAULT_SECONDS = 60;
const TIMER_TICK_MS = 250;

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
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
  const { exam: snapshot } = ensureExamShape(exam);
  const now = Date.now();
  const sessionId = uid();
  const sess = {
    mode: 'taking',
    exam: snapshot,
    idx: 0,
    answers: {},
    flagged: {},
    revealed: {},
    startedAt: now,
    resumedAt: now,
    elapsedMs: 0,
    sessionId,
    persistedId: null,
    persistedCreatedAt: now
  };
  if (snapshot.timerMode === 'timed') {
    sess.timer = createTimerState(snapshot, now);
  }
  return sess;
}

function resumeTakingSession(saved) {
  if (!saved || !saved.exam) return null;
  const { exam } = ensureExamShape(saved.exam);
  const now = Date.now();
  const sessionId = saved.id || uid();
  const questionCount = exam.questions?.length || 0;
  const idx = Math.min(Math.max(saved.idx || 0, 0), Math.max(0, questionCount - 1));
  const sess = {
    mode: 'taking',
    exam,
    idx,
    answers: saved.answers || {},
    flagged: saved.flagged || {},
    revealed: saved.revealed || {},
    startedAt: saved.startedAt || now,
    resumedAt: now,
    elapsedMs: saved.elapsedMs || 0,
    sessionId,
    persistedId: sessionId,
    persistedCreatedAt: saved.createdAt || saved.startedAt || now
  };
  if (exam.timerMode === 'timed') {
    const remainingMs = saved.timer?.remainingMs;
    const totalMs = saved.timer?.totalMs;
    sess.timer = createTimerState(exam, now, remainingMs, totalMs);
  }
  return sess;
}

function createTimerState(exam, now, remainingMs, totalMs) {
  const questionCount = exam.questions?.length || 0;
  const secondsPerQuestion = exam.secondsPerQuestion || DEFAULT_SECONDS;
  const total = typeof totalMs === 'number'
    ? Math.max(0, totalMs)
    : Math.max(0, questionCount * secondsPerQuestion * 1000);
  const remaining = typeof remainingMs === 'number'
    ? Math.max(0, Math.min(total || remainingMs, remainingMs))
    : total;
  return {
    totalMs: total,
    remainingMs: remaining,
    deadline: now + remaining,
    interval: null,
    expired: false
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

  const stored = await listExams();
  const exams = [];
  for (const raw of stored) {
    const { exam, changed } = ensureExamShape(raw);
    exams.push(exam);
    if (changed) await upsertExam(exam);
  }
  exams.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const sessions = await listExamSessions();
  const sessionMap = new Map();
  for (const sess of sessions) {
    if (!sess || !sess.examId) continue;
    if (!sessionMap.has(sess.examId)) sessionMap.set(sess.examId, []);
    sessionMap.get(sess.examId).push(sess);
  }
  for (const arr of sessionMap.values()) {
    arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
    const session = sessionMap.get(exam.id)?.[0] || null;
    grid.appendChild(buildExamCard(exam, render, session));
  });
  root.appendChild(grid);
}

function buildExamCard(exam, render, savedSession) {
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

  const actions = document.createElement('div');
  actions.className = 'exam-card-actions';

  const startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = savedSession ? 'Start New Attempt' : 'Start Exam';
  startBtn.disabled = exam.questions.length === 0;
  startBtn.addEventListener('click', async () => {
    if (savedSession) {
      const confirm = await confirmModal('A saved attempt exists. Starting a new attempt will discard it. Continue?');
      if (!confirm) return;
      await deleteExamSession(savedSession.id);
    }
    setExamSession(createTakingSession(exam));
    render();
  });
  actions.appendChild(startBtn);

  if (savedSession) {
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn secondary';
    resumeBtn.textContent = 'Resume Saved Attempt';
    resumeBtn.addEventListener('click', () => {
      const session = resumeTakingSession(savedSession);
      if (session) {
        setExamSession(session);
        render();
      }
    });
    actions.appendChild(resumeBtn);
  }

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
    exportExam(exam);
  });
  actions.appendChild(exportBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn danger';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', async () => {
    const ok = await confirmModal(`Delete "${exam.examTitle}"? This will remove all attempts.`);
    if (!ok) return;
    await deleteExam(exam.id);
    render();
  });
  actions.appendChild(delBtn);

  card.appendChild(actions);

  if (savedSession) {
    const inProgress = document.createElement('div');
    inProgress.className = 'exam-card-session-note';
    const totalQuestions = exam.questions.length;
    const answered = Object.keys(savedSession.answers || {}).length;
    inProgress.textContent = `Saved attempt in progress — ${answered}/${totalQuestions} answered`;
    card.appendChild(inProgress);
  }

  const attemptsWrap = document.createElement('details');
  attemptsWrap.className = 'exam-attempts';
  attemptsWrap.open = Boolean(exam.results.length);
  const summary = document.createElement('summary');
  summary.className = 'exam-attempts-summary';
  summary.textContent = `Attempts (${exam.results.length})`;
  attemptsWrap.appendChild(summary);

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
  if (!ms) return '—';
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

  const answers = sess.mode === 'review' ? sess.result.answers || {} : sess.answers || {};
  const flaggedSet = new Set(sess.mode === 'review'
    ? (sess.result.flagged || [])
    : Object.entries(sess.flagged || {}).filter(([_, v]) => v).map(([idx]) => Number(idx)));

  sess.exam.questions.forEach((_, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(idx + 1);
    btn.className = 'palette-button';
    if (sess.idx === idx) btn.classList.add('active');
    if (answers[idx] != null) btn.classList.add('answered');
    if (flaggedSet.has(idx)) btn.classList.add('flagged');
    btn.addEventListener('click', () => {
      sess.idx = idx;
      render();
    });
    grid.appendChild(btn);
  });

  palette.appendChild(grid);
  sidebar.appendChild(palette);
}

export function renderExamRunner(root, render) {
  const sess = state.examSession;
  if (!sess) return;
  root.innerHTML = '';
  root.className = 'exam-session';

  if (sess.mode === 'summary') {
    detachKeyboard(sess);
    renderSummary(root, render, sess);
    return;
  }

  const questionCount = sess.exam.questions.length;
  if (!questionCount) {
    const empty = document.createElement('div');
    empty.className = 'exam-empty';
    empty.innerHTML = '<p>This exam does not contain any questions.</p>';
    const back = document.createElement('button');
    back.className = 'btn';
    back.textContent = 'Back to Exams';
    back.addEventListener('click', () => {
      cleanupSession(sess);
      setExamSession(null);
      render();
    });
    empty.appendChild(back);
    root.appendChild(empty);
    return;
  }

  if (sess.idx < 0) sess.idx = 0;
  if (sess.idx >= questionCount) sess.idx = questionCount - 1;

  attachKeyboard(sess, render, questionCount);

  const container = document.createElement('div');
  container.className = 'exam-runner';
  root.appendChild(container);

  const main = document.createElement('section');
  main.className = 'exam-main';
  container.appendChild(main);

  const sidebar = document.createElement('aside');
  sidebar.className = 'exam-sidebar';
  container.appendChild(sidebar);

  const isTaking = sess.mode === 'taking';
  const isTimed = sess.exam.timerMode === 'timed';
  const isUntimedCheck = isTaking && !isTimed;
  const timerTargets = [];

  const question = sess.exam.questions[sess.idx];
  const answers = sess.mode === 'review' ? sess.result.answers || {} : sess.answers || {};
  const selected = answers[sess.idx];
  const reveal = isUntimedCheck && Boolean(sess.revealed?.[sess.idx]);
  const showReviewDetails = sess.mode === 'review' || reveal;

  const top = document.createElement('div');
  top.className = 'exam-topbar';

  const topLeft = document.createElement('div');
  topLeft.className = 'exam-top-left';
  const progress = document.createElement('div');
  progress.className = 'exam-progress';
  progress.textContent = `${sess.exam.examTitle} • Question ${sess.idx + 1} of ${questionCount}`;
  topLeft.appendChild(progress);

  if (isTaking && isTimed) {
    const timerDisplay = createTimerDisplay('Time left');
    topLeft.appendChild(timerDisplay.root);
    timerTargets.push(timerDisplay.value);
  }

  top.appendChild(topLeft);

  const flagBtn = document.createElement('button');
  flagBtn.type = 'button';
  flagBtn.className = 'flag-btn';
  const isFlagged = sess.mode === 'review'
    ? (sess.result.flagged || []).includes(sess.idx)
    : Boolean(sess.flagged?.[sess.idx]);
  flagBtn.classList.toggle('active', isFlagged);
  flagBtn.textContent = isFlagged ? '🚩 Flagged' : 'Flag question';
  if (isTaking) {
    flagBtn.addEventListener('click', () => {
      if (!sess.flagged) sess.flagged = {};
      sess.flagged[sess.idx] = !isFlagged;
      render();
    });
  } else {
    flagBtn.disabled = true;
  }
  top.appendChild(flagBtn);
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
    const choice = document.createElement(isTaking ? 'button' : 'div');
    if (isTaking) choice.type = 'button';
    choice.className = 'exam-option';
    if (!isTaking || reveal) choice.classList.add('review');
    choice.textContent = opt.text || '(Empty option)';
    if (isTaking) {
      if (selected === opt.id) choice.classList.add('selected');
      choice.addEventListener('click', () => {
        sess.answers[sess.idx] = opt.id;
        render();
      });
      if (reveal) {
        const cls = answerClass(question, selected, opt.id);
        if (cls) choice.classList.add(cls);
        if (selected === opt.id) choice.classList.add('chosen');
      }
    } else {
      const cls = answerClass(question, selected, opt.id);
      if (cls) choice.classList.add(cls);
      if (selected === opt.id) choice.classList.add('chosen');
    }
    optionsWrap.appendChild(choice);
  });

  main.appendChild(optionsWrap);

  if (showReviewDetails) {
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
    verdict.textContent = verdictText;
    main.appendChild(verdict);

    const answerSummary = document.createElement('div');
    answerSummary.className = 'exam-answer-summary';
    const your = optionText(question, selected);
    const correct = optionText(question, question.answer);
    answerSummary.innerHTML = `<div><strong>Your answer:</strong> ${your || '—'}</div><div><strong>Correct answer:</strong> ${correct || '—'}</div>`;
    main.appendChild(answerSummary);

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

  renderPalette(sidebar, sess, render);
  renderSidebarMeta(sidebar, sess, timerTargets);

  const nav = document.createElement('div');
  nav.className = 'exam-nav';

  const prev = document.createElement('button');
  prev.className = 'btn secondary';
  prev.textContent = 'Previous';
  prev.disabled = sess.idx === 0;
  prev.addEventListener('click', () => {
    if (sess.idx > 0) {
      sess.idx -= 1;
      render();
    }
  });
  nav.appendChild(prev);

  if (isTaking) {
    if (isUntimedCheck) {
      const checkBtn = document.createElement('button');
      checkBtn.className = 'btn secondary';
      checkBtn.textContent = reveal ? 'Answer Shown' : 'Check Answer';
      checkBtn.disabled = reveal || selected == null;
      checkBtn.addEventListener('click', () => {
        if (!sess.revealed) sess.revealed = {};
        sess.revealed[sess.idx] = true;
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
        sess.idx += 1;
        render();
      }
    });
    nav.appendChild(nextBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn secondary';
    saveBtn.textContent = 'Save & Exit';
    saveBtn.addEventListener('click', async () => {
      await saveSessionAndExit(sess, render);
    });
    nav.appendChild(saveBtn);

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
        sess.idx += 1;
        render();
      }
    });
    nav.appendChild(nextBtn);

    const exit = document.createElement('button');
    exit.className = 'btn';
    if (sess.fromSummary) {
      exit.textContent = 'Back to Summary';
      exit.addEventListener('click', () => {
        detachKeyboard(sess);
        setExamSession({ mode: 'summary', exam: sess.exam, latestResult: sess.fromSummary });
        render();
      });
    } else {
      exit.textContent = 'Back to Exams';
      exit.addEventListener('click', () => {
        cleanupSession(sess);
        setExamSession(null);
        render();
      });
    }
    nav.appendChild(exit);
  }

  root.appendChild(nav);

  if (isTaking && isTimed && timerTargets.length) {
    ensureTimerRunning(sess, render, timerTargets);
  }
}

function renderSidebarMeta(sidebar, sess, timerTargets) {
  const info = document.createElement('div');
  info.className = 'exam-sidebar-info';

  const attempts = document.createElement('div');
  attempts.innerHTML = `<strong>Attempts:</strong> ${sess.exam.results?.length || 0}`;
  info.appendChild(attempts);

  if (sess.mode === 'review' && sess.result.durationMs) {
    const duration = document.createElement('div');
    duration.innerHTML = `<strong>Duration:</strong> ${formatDuration(sess.result.durationMs)}`;
    info.appendChild(duration);
  } else if (sess.mode === 'taking') {
    const timerMode = document.createElement('div');
    if (sess.exam.timerMode === 'timed') {
      timerMode.innerHTML = `<strong>Timer:</strong> Timed (${sess.exam.secondsPerQuestion}s/question)`;
      const remaining = document.createElement('div');
      remaining.innerHTML = '<strong>Time Remaining:</strong> <span class="exam-timer-inline"></span>';
      const span = remaining.querySelector('span');
      timerTargets.push(span);
      info.appendChild(timerMode);
      info.appendChild(remaining);
    } else {
      timerMode.innerHTML = '<strong>Timer:</strong> Untimed';
      info.appendChild(timerMode);
    }
  }

  sidebar.appendChild(info);
}

async function finalizeExam(sess, render, options = {}) {
  if (sess.mode !== 'taking') return;
  const { skipConfirm = false } = options;

  if (!skipConfirm) {
    const unanswered = sess.exam.questions.filter((_, idx) => sess.answers[idx] == null);
    if (unanswered.length) {
      const confirm = await confirmModal(`You have ${unanswered.length} unanswered question${unanswered.length === 1 ? '' : 's'}. Submit anyway?`);
      if (!confirm) return;
    }
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

  const durationMs = computeElapsedMs(sess);

  const result = {
    id: uid(),
    when: Date.now(),
    correct,
    total: sess.exam.questions.length,
    answers,
    flagged,
    durationMs,
    answered: answeredCount
  };

  const updatedExam = clone(sess.exam);
  updatedExam.results = [...(updatedExam.results || []), result];
  updatedExam.updatedAt = Date.now();
  await upsertExam(updatedExam);

  if (sess.persistedId) {
    await deleteExamSession(sess.persistedId);
  }

  cleanupSession(sess);
  setExamSession({ mode: 'summary', exam: updatedExam, latestResult: result });
  render();
}

function createTimerDisplay(label) {
  const wrap = document.createElement('div');
  wrap.className = 'exam-timer';
  const lbl = document.createElement('span');
  lbl.className = 'exam-timer-label';
  lbl.textContent = label;
  const value = document.createElement('span');
  value.className = 'exam-timer-count';
  wrap.appendChild(lbl);
  wrap.appendChild(value);
  return { root: wrap, value };
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ensureTimerRunning(sess, render, targets) {
  if (!sess.timer) return;

  const update = () => {
    const now = Date.now();
    const remaining = Math.max(0, (sess.timer.deadline || now) - now);
    sess.timer.remainingMs = remaining;
    targets.forEach(target => {
      if (target) target.textContent = formatCountdown(remaining);
    });
    if (remaining <= 0 && !sess.timer.expired) {
      sess.timer.expired = true;
      stopTimer(sess);
      finalizeExam(sess, render, { skipConfirm: true });
    }
  };

  update();

  if (!sess.timer.interval) {
    sess.timer.interval = setInterval(() => {
      if (state.examSession !== sess) {
        stopTimer(sess);
        return;
      }
      update();
    }, TIMER_TICK_MS);
  }
}

async function saveSessionAndExit(sess, render) {
  if (sess.mode !== 'taking') {
    cleanupSession(sess);
    setExamSession(null);
    render();
    return;
  }

  const payload = prepareSessionForSave(sess);
  await upsertExamSession(payload);
  sess.persistedId = payload.id;
  sess.persistedCreatedAt = payload.createdAt;
  cleanupSession(sess);
  setExamSession(null);
  render();
}

function prepareSessionForSave(sess) {
  const now = Date.now();
  const questionCount = sess.exam.questions?.length || 0;
  const idx = Math.min(Math.max(sess.idx || 0, 0), Math.max(0, questionCount - 1));
  const elapsedMs = computeElapsedMs(sess);

  let timer = null;
  if (sess.exam.timerMode === 'timed' && sess.timer) {
    const remaining = Math.max(0, (sess.timer.deadline || now) - now);
    timer = {
      totalMs: sess.timer.totalMs,
      remainingMs: remaining
    };
    sess.timer.remainingMs = remaining;
  }

  return {
    id: sess.persistedId || sess.sessionId || uid(),
    examId: sess.exam.id,
    exam: clone(sess.exam),
    idx,
    answers: { ...(sess.answers || {}) },
    flagged: { ...(sess.flagged || {}) },
    revealed: { ...(sess.revealed || {}) },
    startedAt: sess.startedAt || now,
    elapsedMs,
    timer,
    createdAt: sess.persistedCreatedAt || sess.startedAt || now
  };
}

function computeElapsedMs(sess) {
  const base = sess.elapsedMs || 0;
  if (!sess.resumedAt) return base;
  const now = Date.now();
  return base + Math.max(0, now - sess.resumedAt);
}

function stopTimer(sess) {
  if (sess?.timer?.interval) {
    clearInterval(sess.timer.interval);
    delete sess.timer.interval;
  }
}

function cleanupSession(sess) {
  stopTimer(sess);
  detachKeyboard(sess);
}

function attachKeyboard(sess, render, questionCount) {
  if (sess.keyboardHandler) return;
  const handler = event => {
    if (!state.examSession || state.examSession !== sess) return;
    const targetTag = event.target?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (sess.idx < questionCount - 1) {
        sess.idx += 1;
        render();
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (sess.idx > 0) {
        sess.idx -= 1;
        render();
      }
    }
  };
  window.addEventListener('keydown', handler);
  sess.keyboardHandler = handler;
}

function detachKeyboard(sess) {
  if (sess?.keyboardHandler) {
    window.removeEventListener('keydown', sess.keyboardHandler);
    delete sess.keyboardHandler;
  }
}

function exportExam(exam) {
  const data = JSON.stringify(exam, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeTitle = (exam.examTitle || 'exam')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'exam';
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeTitle}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  titleInput.addEventListener('input', () => { exam.examTitle = titleInput.value; });
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
    if (!Number.isNaN(val) && val > 0) exam.secondsPerQuestion = val;
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
      stemInput.addEventListener('input', () => { question.stem = stemInput.value; });
      stemLabel.appendChild(stemInput);
      card.appendChild(stemLabel);

      const mediaLabel = document.createElement('label');
      mediaLabel.textContent = 'Media (URL or upload)';
      const mediaInput = document.createElement('input');
      mediaInput.className = 'input';
      mediaInput.placeholder = 'https://example.com/image.png';
      mediaInput.value = question.media || '';
      mediaInput.addEventListener('input', () => { question.media = mediaInput.value.trim(); updatePreview(); });
      mediaLabel.appendChild(mediaInput);

      const mediaUpload = document.createElement('input');
      mediaUpload.type = 'file';
      mediaUpload.accept = 'image/*,video/*,audio/*';
      mediaUpload.addEventListener('change', () => {
        const file = mediaUpload.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          question.media = typeof reader.result === 'string' ? reader.result : '';
          mediaInput.value = question.media;
          updatePreview();
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
      });
      tagsLabel.appendChild(tagsInput);
      card.appendChild(tagsLabel);

      const explanationLabel = document.createElement('label');
      explanationLabel.textContent = 'Explanation';
      const explanationInput = document.createElement('textarea');
      explanationInput.className = 'input';
      explanationInput.value = question.explanation || '';
      explanationInput.addEventListener('input', () => { question.explanation = explanationInput.value; });
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
          radio.addEventListener('change', () => { question.answer = opt.id; });

          const text = document.createElement('input');
          text.className = 'input';
          text.type = 'text';
          text.placeholder = `Option ${optIdx + 1}`;
          text.value = opt.text;
          text.addEventListener('input', () => { opt.text = text.value; });

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

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => document.body.removeChild(overlay));
  actions.appendChild(cancel);

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn';
  save.textContent = 'Save Exam';
  actions.appendChild(save);

  form.appendChild(actions);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    error.textContent = '';

    const title = titleInput.value.trim();
    if (!title) {
      error.textContent = 'Exam title is required.';
      return;
    }

    if (!exam.questions.length) {
      error.textContent = 'Add at least one question.';
      return;
    }

    for (let i = 0; i < exam.questions.length; i++) {
      const question = exam.questions[i];
      question.stem = question.stem.trim();
      question.explanation = question.explanation?.trim() || '';
      question.media = question.media?.trim() || '';
      question.options = question.options.map(opt => ({ id: opt.id, text: opt.text.trim() })).filter(opt => opt.text);
      if (question.options.length < 2) {
        error.textContent = `Question ${i + 1} needs at least two answer options.`;
        return;
      }
      if (!question.answer || !question.options.some(opt => opt.id === question.answer)) {
        error.textContent = `Select a correct answer for question ${i + 1}.`;
        return;
      }
      question.tags = question.tags.map(t => t.trim()).filter(Boolean);
    }

    const payload = {
      ...exam,
      examTitle: title,
      updatedAt: Date.now()
    };

    await upsertExam(payload);
    document.body.removeChild(overlay);
    render();
  });

  overlay.appendChild(form);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) document.body.removeChild(overlay);
  });

  document.body.appendChild(overlay);
  titleInput.focus();
}

