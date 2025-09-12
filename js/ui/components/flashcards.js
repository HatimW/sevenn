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

  const card = document.createElement('section');
  card.className = 'card flashcard';
  card.tabIndex = 0;

  const title = document.createElement('h2');
  title.textContent = item.name || item.concept || '';
  card.appendChild(title);

  sectionsFor(item).forEach(([label, field]) => {
    const sec = document.createElement('div');
    sec.className = 'flash-section';
    const head = document.createElement('div');
    head.className = 'flash-heading';
    head.textContent = label;
    const body = document.createElement('div');
    body.className = 'flash-body';
    body.textContent = item[field] || '';
    sec.appendChild(head);
    sec.appendChild(body);
    sec.addEventListener('click', () => { sec.classList.toggle('revealed'); });
    card.appendChild(sec);
  });

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
    if (e.key === 'ArrowRight') {
      next.click();
    } else if (e.key === 'ArrowLeft') {
      prev.click();
    }
  });
}

function sectionsFor(item) {
  const map = {
    disease: [
      ['Etiology', 'etiology'],
      ['Pathophys', 'pathophys'],
      ['Clinical Presentation', 'clinical'],
      ['Diagnosis', 'diagnosis'],
      ['Treatment', 'treatment'],
      ['Complications', 'complications'],
      ['Mnemonic', 'mnemonic']
    ],
    drug: [
      ['Mechanism', 'moa'],
      ['Uses', 'uses'],
      ['Side Effects', 'sideEffects'],
      ['Contraindications', 'contraindications'],
      ['Mnemonic', 'mnemonic']
    ],
    concept: [
      ['Definition', 'definition'],
      ['Mechanism', 'mechanism'],
      ['Clinical Relevance', 'clinicalRelevance'],
      ['Example', 'example'],
      ['Mnemonic', 'mnemonic']
    ]
  };
  return map[item.kind] || [];
}
