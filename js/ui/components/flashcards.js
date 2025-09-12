import { state, setFlashSession } from '../../state.js';

// Render flashcards session. Uses session.pool if provided, else state.cohort
export function renderFlashcards(root, redraw) {
  const session = state.flashSession || { idx: 0, pool: state.cohort };
  const items = session.pool || state.cohort;
  root.innerHTML = '';

  if (!items.length) {
    const msg = document.createElement('div');
    msg.textContent = 'No items in cohort.';
    root.appendChild(msg);
    return;
  }

  if (session.idx >= items.length) {
    setFlashSession(null);
    redraw();
    return;
  }

  const item = items[session.idx];
  const { question, answer, details } = buildCard(item);

  const card = document.createElement('section');
  card.className = 'card flashcard';
  card.tabIndex = 0;

  const qEl = document.createElement('div');
  qEl.className = 'flash-question';
  qEl.textContent = question;
  card.appendChild(qEl);

  const aEl = document.createElement('div');
  aEl.className = 'flash-answer';
  aEl.textContent = answer + (details ? '\n' + details : '');
  card.appendChild(aEl);

  const controls = document.createElement('div');
  controls.className = 'row';

  const prev = document.createElement('button');
  prev.className = 'btn';
  prev.textContent = 'Prev';
  prev.disabled = session.idx === 0;
  prev.addEventListener('click', () => {
    if (session.idx > 0) {
      setFlashSession({ idx: session.idx - 1, pool: items });
      redraw();
    }
  });
  controls.appendChild(prev);

  const reveal = document.createElement('button');
  reveal.className = 'btn';
  reveal.textContent = 'Reveal';
  reveal.addEventListener('click', () => {
    card.classList.toggle('revealed');
  });
  controls.appendChild(reveal);

  const next = document.createElement('button');
  next.className = 'btn';
  next.textContent = session.idx < items.length - 1 ? 'Next' : 'Finish';
  next.addEventListener('click', () => {
    const idx = session.idx + 1;
    if (idx >= items.length) {
      setFlashSession(null);
    } else {
      setFlashSession({ idx, pool: items });
    }
    redraw();
  });
  controls.appendChild(next);

  const exit = document.createElement('button');
  exit.className = 'btn';
  exit.textContent = 'End';
  exit.addEventListener('click', () => {
    setFlashSession(null);
    redraw();
  });
  controls.appendChild(exit);

  card.appendChild(controls);
  root.appendChild(card);

  card.focus();
  card.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      reveal.click();
    } else if (e.key === 'ArrowRight') {
      next.click();
    } else if (e.key === 'ArrowLeft') {
      prev.click();
    }
  });
}

function buildCard(item) {
  const mainMap = {
    disease: ['pathophys', 'clinical', 'treatment'],
    drug: ['moa', 'uses', 'sideEffects'],
    concept: ['definition', 'mechanism', 'clinicalRelevance']
  };
  const extraMap = {
    disease: ['mnemonic', 'diagnosis', 'complications'],
    drug: ['mnemonic', 'contraindications'],
    concept: ['mnemonic', 'example']
  };

  const fields = mainMap[item.kind] || [];
  let questionField = '';
  for (const f of fields) {
    if (item[f]) { questionField = item[f]; break; }
  }
  let question = questionField || '';
  const answers = [];
  question = question.replace(/{{c\d+::(.*?)}}/g, (_m, p1) => { answers.push(p1); return '_____'; });
  const answer = answers.length ? answers.join(' / ') : (item.name || item.concept || '');

  const detailParts = [];
  fields.filter(f => f !== fields[0]).forEach(f => { if (item[f]) detailParts.push(item[f]); });
  (extraMap[item.kind] || []).forEach(f => { if (item[f]) detailParts.push(item[f]); });
  const details = detailParts.join('\n');
  return { question, answer, details };
}
