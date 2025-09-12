import { createItemCard } from './cardlist.js';

/**
 * Render lecture-based decks combining all item types.
 * @param {HTMLElement} container
 * @param {import('../../types.js').Item[]} items
 * @param {Function} onChange
 */
export function renderCards(container, items, onChange){
  const decks = new Map();
  items.forEach(it => {
    if (it.lectures && it.lectures.length){
      it.lectures.forEach(l => {
        const key = l.name || `Lecture ${l.id}`;
        if (!decks.has(key)) decks.set(key, []);
        decks.get(key).push(it);
      });
    } else {
      if (!decks.has('Unassigned')) decks.set('Unassigned', []);
      decks.get('Unassigned').push(it);
    }
  });

  const list = document.createElement('div');
  list.className = 'deck-list';
  container.appendChild(list);

  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer hidden';
  container.appendChild(viewer);

  decks.forEach((cards, lecture) => {
    const deck = document.createElement('div');
    deck.className = 'deck';
    const title = document.createElement('div');
    title.className = 'deck-title';
    title.textContent = lecture;
    const meta = document.createElement('div');
    meta.className = 'deck-meta';
    const blocks = Array.from(new Set(cards.flatMap(c => c.blocks || []))).join(', ');
    const weeks = Array.from(new Set(cards.flatMap(c => c.weeks || []))).join(', ');
    meta.textContent = `${blocks}${blocks && weeks ? ' • ' : ''}${weeks ? 'Week ' + weeks : ''}`;
    deck.appendChild(title);
    deck.appendChild(meta);
    deck.addEventListener('click', () => { stopPreview(deck); openDeck(lecture, cards); });
    let hoverTimer;
    deck.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => startPreview(deck, cards), 1000);
    });
    deck.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      stopPreview(deck);
    });
    list.appendChild(deck);
  });

  function startPreview(deckEl, cards){
    if (deckEl._preview) return;
    const overlay = document.createElement('div');
    overlay.className = 'deck-preview';
    deckEl.appendChild(overlay);
    let i = 0;
    overlay.textContent = cards[i].name || cards[i].concept || '';
    const interval = setInterval(() => {
      i = (i + 1) % cards.length;
      overlay.textContent = cards[i].name || cards[i].concept || '';
    }, 800);
    deckEl._preview = { overlay, interval };
  }

  function stopPreview(deckEl){
    const prev = deckEl._preview;
    if (prev){
      clearInterval(prev.interval);
      prev.overlay.remove();
      deckEl._preview = null;
    }
  }

  function openDeck(title, cards){
    list.classList.add('hidden');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '';

    const header = document.createElement('h2');
    header.textContent = title;
    viewer.appendChild(header);

    const cardHolder = document.createElement('div');
    cardHolder.className = 'deck-card';
    viewer.appendChild(cardHolder);

    const prev = document.createElement('button');
    prev.className = 'deck-prev';
    prev.textContent = '◀';
    const next = document.createElement('button');
    next.className = 'deck-next';
    next.textContent = '▶';
    viewer.appendChild(prev);
    viewer.appendChild(next);

    const toggle = document.createElement('button');
    toggle.className = 'deck-related-toggle btn';
    toggle.textContent = 'Show Related';
    viewer.appendChild(toggle);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related hidden';
    viewer.appendChild(relatedWrap);

    const close = document.createElement('button');
    close.className = 'deck-close btn';
    close.textContent = 'Close';
    viewer.appendChild(close);

    let idx = 0;
    let showRelated = false;

    function renderCard(){
      cardHolder.innerHTML = '';
      cardHolder.appendChild(createItemCard(cards[idx], onChange));
      renderRelated();
    }

    function renderRelated(){
      relatedWrap.innerHTML = '';
      if (!showRelated) return;
      const current = cards[idx];
      (current.links || []).forEach(l => {
        const item = items.find(it => it.id === l.id);
        if (item) {
          const el = createItemCard(item, onChange);
          el.classList.add('related-card');
          relatedWrap.appendChild(el);
          requestAnimationFrame(() => el.classList.add('visible'));
        }
      });
    }

    prev.addEventListener('click', () => {
      idx = (idx - 1 + cards.length) % cards.length;
      renderCard();
    });
    next.addEventListener('click', () => {
      idx = (idx + 1) % cards.length;
      renderCard();
    });

    toggle.addEventListener('click', () => {
      showRelated = !showRelated;
      toggle.textContent = showRelated ? 'Hide Related' : 'Show Related';
      relatedWrap.classList.toggle('hidden', !showRelated);
      renderRelated();
    });

    close.addEventListener('click', () => {
      document.removeEventListener('keydown', keyHandler);
      viewer.classList.add('hidden');
      viewer.innerHTML = '';
      list.classList.remove('hidden');
    });

    function keyHandler(e){
      if (e.key === 'ArrowLeft') prev.click();
      if (e.key === 'ArrowRight') next.click();
      if (e.key === 'Escape') close.click();
    }
    document.addEventListener('keydown', keyHandler);

    renderCard();
  }
}
