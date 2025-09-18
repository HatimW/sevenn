import { state, setFlashSession } from '../../state.js';
import { setToggleState } from '../../utils.js';
import { sectionDefsForKind } from './sections.js';
import { renderRichText } from './rich-text.js';

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
    sec.setAttribute('role', 'button');
    sec.tabIndex = 0;
    const head = document.createElement('div');
    head.className = 'flash-heading';
    head.textContent = label;
    const body = document.createElement('div');
    body.className = 'flash-body';
    renderRichText(body, item[field] || '');
    sec.appendChild(head);
    sec.appendChild(body);
    setToggleState(sec, false, 'revealed');
    const toggleReveal = () => {
      const next = sec.dataset.active !== 'true';
      setToggleState(sec, next, 'revealed');
    };
    sec.addEventListener('click', toggleReveal);
    sec.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleReveal();
      }
    });
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
  return sectionDefsForKind(item.kind).map(def => [def.label, def.key]);
}
