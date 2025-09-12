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
        const key = `${l.blockId}|${l.id}`;
        if (!decks.has(key)) decks.set(key, { lecture: l, cards: [] });
        decks.get(key).cards.push(it);
      });
    } else {
      if (!decks.has('Unassigned')) decks.set('Unassigned', { lecture: { name:'Unassigned', blockId:'', week:'' }, cards: [] });
      decks.get('Unassigned').cards.push(it);
    }
  });

  const list = document.createElement('div');
  list.className = 'deck-list';
  container.appendChild(list);

  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer hidden';
  container.appendChild(viewer);

  decks.forEach(({lecture, cards}) => {
    const deck = document.createElement('div');
    deck.className = 'deck';

    const nameEl = document.createElement('div');
    nameEl.className = 'deck-name';
    nameEl.textContent = lecture.name || `Lecture ${lecture.id}`;
    deck.appendChild(nameEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'deck-meta';
    const blk = lecture.blockId || '';
    const wk = lecture.week != null ? `Week ${lecture.week}` : '';
    metaEl.textContent = [blk, wk].filter(Boolean).join(' · ');
    deck.appendChild(metaEl);

    deck.addEventListener('click', () => openDeck(nameEl.textContent, cards));

    let previewTimer;
    deck.addEventListener('mouseenter', () => {
      previewTimer = setTimeout(() => showPreview(deck, cards), 1500);
    });
    deck.addEventListener('mouseleave', () => {
      clearTimeout(previewTimer);
      hidePreview(deck);
    });

    list.appendChild(deck);
  });

  function showPreview(deck, cards){
    const preview = document.createElement('div');
    preview.className = 'deck-preview';
    cards.forEach((c,i) => {
      const pc = document.createElement('div');
      pc.className = 'preview-card';
      pc.textContent = c.name || c.concept || 'Untitled';
      pc.style.animationDelay = `${i * 0.05}s`;
      preview.appendChild(pc);
    });
    deck.appendChild(preview);
    deck.classList.add('previewing');
  }

  function hidePreview(deck){
    const p = deck.querySelector('.deck-preview');
    if (p) p.remove();
    deck.classList.remove('previewing');
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
