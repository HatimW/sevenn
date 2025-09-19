import { state, setQuizSession, setSubtab, setStudySelectedMode } from '../../state.js';
import { renderRichText } from './rich-text.js';
import { persistStudySession, removeStudySession } from '../../study/study-sessions.js';
import { sectionsForItem } from './section-utils.js';
import { REVIEW_RATINGS, DEFAULT_REVIEW_STEPS } from '../../review/constants.js';
import { getReviewDurations, rateSection } from '../../review/scheduler.js';
import { upsertItem } from '../../storage/storage.js';


const RATING_LABELS = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy'
};

const RATING_CLASS = {
  again: 'danger',
  hard: 'secondary',
  good: '',
  easy: ''
};

function titleOf(item) {
  return item?.name || item?.concept || '';
}

function ratingKey(item, sectionKey) {
  const id = item?.id || 'item';
  return `${id}::${sectionKey}`;
}

function ensureSessionDefaults(session) {
  if (!session) return;
  if (!Array.isArray(session.pool)) session.pool = [];
  if (!session.dict) {
    session.dict = session.pool.map(it => ({
      id: it.id,
      title: titleOf(it),
      lower: titleOf(it).toLowerCase()
    }));
  }
  if (!session.answers || typeof session.answers !== 'object') {
    session.answers = {};
  }
  if (!session.ratings || typeof session.ratings !== 'object') {
    session.ratings = {};
  }
}

function computeScore(answers) {
  if (!answers) return 0;
  return Object.values(answers).filter(entry => entry && entry.isCorrect).length;
}

function renderCompletion(root, session, redraw) {
  removeStudySession('quiz').catch(err => console.warn('Failed to clear quiz session', err));
  const wrap = document.createElement('section');
  wrap.className = 'card quiz-summary';

  const heading = document.createElement('h2');
  heading.textContent = 'Quiz complete';
  wrap.appendChild(heading);

  const score = document.createElement('p');
  const total = Array.isArray(session.pool) ? session.pool.length : 0;
  score.textContent = `Score ${session.score}/${total}`;
  wrap.appendChild(score);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Back to builder';
  btn.addEventListener('click', () => {
    setQuizSession(null);
    setStudySelectedMode('Quiz');
    setSubtab('Study', 'Builder');
    redraw();
  });
  wrap.appendChild(btn);

  root.appendChild(wrap);
}

export function renderQuiz(root, redraw) {
  const session = state.quizSession;
  if (!session) return;
  ensureSessionDefaults(session);

  const pool = Array.isArray(session.pool) ? session.pool : [];
  root.innerHTML = '';

  if (!pool.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No questions available. Build a study set to begin.';
    root.appendChild(empty);
    return;
  }


  if (session.idx >= pool.length) {
    renderCompletion(root, session, redraw);

    return;
  }

  const item = pool[session.idx];
  if (!item) {
    renderCompletion(root, session, redraw);
    return;
  }

  const answer = session.answers[session.idx] || { value: '', isCorrect: false, checked: false };
  const hasSubmitted = Boolean(answer.checked);
  const wasCorrect = hasSubmitted && answer.isCorrect;

  const card = document.createElement('section');
  card.className = 'card quiz-card';
  root.appendChild(card);

  const header = document.createElement('div');
  header.className = 'quiz-header';

  const progress = document.createElement('div');
  progress.className = 'quiz-progress';
  progress.textContent = `Question ${session.idx + 1} of ${pool.length}`;
  header.appendChild(progress);

  const tally = document.createElement('div');
  tally.className = 'quiz-score';
  tally.textContent = `Score: ${session.score}`;
  header.appendChild(tally);

  card.appendChild(header);

  const prompt = document.createElement('p');
  prompt.className = 'quiz-prompt';
  prompt.textContent = 'Identify the term based on the details below.';
  card.appendChild(prompt);

  const details = document.createElement('div');
  details.className = 'quiz-details';

  const sections = sectionsForItem(item);
  if (!sections.length) {
    const emptySection = document.createElement('div');
    emptySection.className = 'quiz-empty';
    emptySection.textContent = 'No card content available for this entry.';
    details.appendChild(emptySection);
  } else {
    sections.forEach(({ key, label }) => {
      const block = document.createElement('div');
      block.className = 'quiz-section';

      const head = document.createElement('div');
      head.className = 'quiz-section-title';
      head.textContent = label;
      block.appendChild(head);

      const body = document.createElement('div');
      body.className = 'quiz-section-body';
      renderRichText(body, item[key] || '');
      block.appendChild(body);

      details.appendChild(block);
    });
  }

  card.appendChild(details);

  const form = document.createElement('form');
  form.className = 'quiz-answer';

  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = 'Type your answer';
  input.value = answer.value || '';
  form.appendChild(input);

  const suggestions = document.createElement('ul');
  suggestions.className = 'quiz-suggestions';
  form.appendChild(suggestions);

  const feedback = document.createElement('div');
  feedback.className = 'quiz-feedback';
  if (hasSubmitted) {
    feedback.textContent = wasCorrect ? 'Correct!' : `Incorrect • Answer: ${titleOf(item)}`;
    feedback.classList.add(wasCorrect ? 'is-correct' : 'is-incorrect');
  }
  form.appendChild(feedback);

  card.appendChild(form);

  input.addEventListener('input', () => {
    const v = input.value.toLowerCase();
    const existing = session.answers[session.idx];
    if (existing && existing.checked) {
      delete session.answers[session.idx];
      session.score = computeScore(session.answers);
      setQuizSession({ ...session });
      feedback.textContent = '';
      feedback.classList.remove('is-correct', 'is-incorrect');
      tally.textContent = `Score: ${session.score}`;
      updateNavState();
    }
    suggestions.innerHTML = '';
    if (!v) return;
    const starts = session.dict.filter(d => d.lower.startsWith(v));
    const contains = session.dict.filter(d => !d.lower.startsWith(v) && d.lower.includes(v));
    [...starts, ...contains].slice(0, 5).forEach(d => {
      const li = document.createElement('li');
      li.textContent = d.title;
      li.addEventListener('mousedown', () => {
        input.value = d.title;
        suggestions.innerHTML = '';
      });
      suggestions.appendChild(li);
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    gradeAnswer();
  });

  const durationsPromise = getReviewDurations().catch(() => ({ ...DEFAULT_REVIEW_STEPS }));
  const ratingPanel = document.createElement('div');
  ratingPanel.className = 'quiz-rating-panel';
  card.appendChild(ratingPanel);

  const ratingTitle = document.createElement('h3');
  ratingTitle.textContent = 'How well did you know this card?';
  ratingPanel.appendChild(ratingTitle);

  const ratingRow = document.createElement('div');
  ratingRow.className = 'quiz-rating-row';
  ratingPanel.appendChild(ratingRow);

  const ratingLabel = document.createElement('div');
  ratingLabel.className = 'quiz-rating-label';
  ratingLabel.textContent = 'Rate this card';
  ratingRow.appendChild(ratingLabel);

  const options = document.createElement('div');
  options.className = 'quiz-rating-options';
  ratingRow.appendChild(options);

  const status = document.createElement('span');
  status.className = 'quiz-rating-status';
  ratingRow.appendChild(status);

  const ratingId = ratingKey(item, '__overall__');
  let selectedRating = session.ratings[ratingId] || null;

  const updateSelection = (value) => {
    selectedRating = value;
    session.ratings[ratingId] = value;
    setQuizSession({ ...session });
    Array.from(options.querySelectorAll('button')).forEach(btn => {
      const btnValue = btn.dataset.value;
      const isSelected = btnValue === value;
      btn.classList.toggle('is-selected', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
    status.classList.remove('is-error');
    updateNavState();
  };

  const handleRating = async (value) => {
    if (!session.answers[session.idx]) return;
    status.textContent = 'Saving…';
    status.classList.remove('is-error');
    try {
      const durations = await durationsPromise;
      const timestamp = Date.now();
      if (sections.length) {
        sections.forEach(({ key }) => rateSection(item, key, value, durations, timestamp));
        await upsertItem(item);
      }
      session.ratings[ratingId] = value;
      updateSelection(value);
      status.textContent = 'Saved';
    } catch (err) {
      console.error('Failed to record quiz rating', err);
      status.textContent = 'Save failed';
      status.classList.add('is-error');
    }
  };

  REVIEW_RATINGS.forEach(value => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.value = value;
    btn.className = 'btn quiz-rating-btn';
    const variant = RATING_CLASS[value];
    if (variant) btn.classList.add(variant);
    btn.textContent = RATING_LABELS[value];
    btn.disabled = !hasSubmitted;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => handleRating(value));
    options.appendChild(btn);
  });

  if (selectedRating) {
    updateSelection(selectedRating);
    status.textContent = 'Saved';
  }

  if (!sections.length) {
    const note = document.createElement('div');
    note.className = 'quiz-rating-note';
    note.textContent = 'This card has no reviewable sections.';
    ratingPanel.appendChild(note);
  }

  const controls = document.createElement('div');
  controls.className = 'quiz-controls';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn secondary';
  backBtn.textContent = 'Back';
  backBtn.disabled = session.idx === 0;
  backBtn.addEventListener('click', () => {
    setQuizSession({ ...session, idx: Math.max(0, session.idx - 1) });
    redraw();
  });
  controls.appendChild(backBtn);


  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn';
  submitBtn.textContent = hasSubmitted ? 'Resubmit' : 'Submit';
  submitBtn.disabled = !input.value.trim();
  form.addEventListener('input', () => {
    submitBtn.disabled = !input.value.trim();
  });
  controls.appendChild(submitBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn';
  nextBtn.textContent = session.idx === pool.length - 1 ? 'Finish' : 'Next';
  nextBtn.disabled = true;
  nextBtn.addEventListener('click', () => {
    setQuizSession({ ...session, idx: session.idx + 1 });
    redraw();
  });
  controls.appendChild(nextBtn);

  card.appendChild(controls);

  const footer = document.createElement('div');
  footer.className = 'quiz-footer';


  const saveExit = document.createElement('button');
  saveExit.type = 'button';
  saveExit.className = 'btn secondary';
  saveExit.textContent = 'Save & close';
  saveExit.addEventListener('click', async () => {
    const original = saveExit.textContent;
    saveExit.disabled = true;
    saveExit.textContent = 'Saving…';
    try {
      await persistStudySession('quiz', {

        session: {
          ...session,
          idx: session.idx,
          pool,
          answers: session.answers,
          ratings: session.ratings
        },
        cohort: pool

      });
      setQuizSession(null);
      setStudySelectedMode('Quiz');
      setSubtab('Study', 'Builder');
      redraw();
    } catch (err) {
      console.error('Failed to save quiz progress', err);
      saveExit.textContent = 'Save failed';
      setTimeout(() => { saveExit.textContent = original; }, 2000);
    } finally {
      saveExit.disabled = false;
    }
  });

  footer.appendChild(saveExit);

  card.appendChild(footer);

  updateNavState();

  function gradeAnswer() {
    const guess = input.value.trim();
    if (!guess) return;
    const normalized = guess.toLowerCase();
    const correct = titleOf(item).toLowerCase();
    const isCorrect = normalized === correct;
    const answers = { ...session.answers, [session.idx]: { value: guess, isCorrect, checked: true } };
    const nextScore = computeScore(answers);
    session.answers = answers;
    session.score = nextScore;
    setQuizSession({ ...session });
    tally.textContent = `Score: ${session.score}`;
    feedback.textContent = isCorrect ? 'Correct!' : `Incorrect • Answer: ${titleOf(item)}`;
    feedback.classList.remove('is-correct', 'is-incorrect');
    feedback.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');
    updateNavState();
  }

  function updateNavState() {
    const currentAnswer = session.answers[session.idx];
    const answered = Boolean(currentAnswer && currentAnswer.checked);
    const hasRating = !sections.length || Boolean(selectedRating);
    nextBtn.disabled = !(answered && hasRating);
    submitBtn.textContent = answered ? 'Resubmit' : 'Submit';
    Array.from(options.querySelectorAll('button')).forEach(btn => {
      btn.disabled = !answered;
    });
    if (!answered) {
      status.textContent = '';
    }
  }
}
