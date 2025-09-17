import { listBlocks } from '../../storage/storage.js';
import { createItemCard } from './cardlist.js';

const collapsedCardBlocks = new Set();
const collapsedCardWeeks = new Set();

/**
 * Render lecture-based decks combining all item types.
 * @param {HTMLElement} container
 * @param {import('../../types.js').Item[]} items
 * @param {Function} onChange
 */
export async function renderCards(container, items, onChange){
  container.innerHTML = '';
  const blocks = await listBlocks();
  const blockOrder = new Map(blocks.map((b,i)=>[b.blockId,i]));
  const blockMeta = new Map(blocks.map(b => [b.blockId, b]));
  const groupMap = new Map();

  function ensureBlock(blockId){
    if (!groupMap.has(blockId)) groupMap.set(blockId, new Map());
    return groupMap.get(blockId);
  }

  function ensureWeek(blockId, week){
    const block = ensureBlock(blockId);
    if (!block.has(week)) block.set(week, new Map());
    return block.get(week);
  }

  function addToDeck(blockId, weekValue, lectureKey, label, card){
    const week = ensureWeek(blockId, weekValue);
    if (!week.has(lectureKey)) {
      week.set(lectureKey, { label, cards: [] });
    }
    week.get(lectureKey).cards.push(card);
  }

  items.forEach(item => {
    if (item.lectures && item.lectures.length){
      item.lectures.forEach(lec => {
        const blockId = lec.blockId || '_';
        const week = Number.isFinite(lec.week) ? lec.week : '_';
        const title = lec.name || `Lecture ${lec.id || ''}`;
        const deckKey = `${lec.blockId || '_'}|${week}|${lec.id || title}`;
        addToDeck(blockId, week, deckKey, title, item);
      });
    } else {
      const blockId = (item.blocks && item.blocks[0]) || '_';
      const week = (item.weeks && item.weeks[0]) || '_';
      const deckKey = 'general';
      addToDeck(blockId, week, deckKey, 'General', item);
    }
  });

  const layout = document.createElement('div');
  layout.className = 'cards-layout';
  container.appendChild(layout);

  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer hidden';
  container.appendChild(viewer);

  const decksById = new Map();

  const sortedBlocks = Array.from(groupMap.keys()).sort((a,b)=>{
    const ao = blockOrder.has(a) ? blockOrder.get(a) : Infinity;
    const bo = blockOrder.has(b) ? blockOrder.get(b) : Infinity;
    if (ao === bo) return String(a).localeCompare(String(b));
    return ao - bo;
  });

  sortedBlocks.forEach(blockId => {
    const blockSection = document.createElement('section');
    blockSection.className = 'card-block';
    const blockHeader = document.createElement('button');
    blockHeader.type = 'button';
    blockHeader.className = 'card-block-header';
    const meta = blockMeta.get(blockId);
    const label = blockId === '_' ? 'Unassigned Block' : `${blockId} • ${meta?.title || ''}`.trim();
    const collapsed = collapsedCardBlocks.has(blockId);
    blockHeader.textContent = `${collapsed ? '▸' : '▾'} ${label}`;
    if (meta?.color) {
      blockHeader.style.background = `linear-gradient(90deg, ${meta.color} 0%, rgba(15,23,42,0.9) 100%)`;
    }
    blockHeader.addEventListener('click', () => {
      if (collapsedCardBlocks.has(blockId)) collapsedCardBlocks.delete(blockId); else collapsedCardBlocks.add(blockId);
      renderCards(container, items, onChange);
    });
    blockSection.appendChild(blockHeader);

    const weeksWrap = document.createElement('div');
    weeksWrap.className = 'card-weeks';
    weeksWrap.hidden = collapsed;
    blockSection.appendChild(weeksWrap);

    const weekMap = groupMap.get(blockId);
    const weekKeys = Array.from(weekMap.keys()).sort((a,b)=>{
      if (a === '_' && b !== '_') return 1;
      if (b === '_' && a !== '_') return -1;
      return Number(a) - Number(b);
    });

    weekKeys.forEach(weekKey => {
      const weekSection = document.createElement('div');
      weekSection.className = 'card-week';
      const weekHeader = document.createElement('button');
      weekHeader.type = 'button';
      weekHeader.className = 'card-week-header';
      const key = `${blockId}__${weekKey}`;
      const weekCollapsed = collapsedCardWeeks.has(key);
      const weekLabel = weekKey === '_' ? 'Unassigned Week' : `Week ${weekKey}`;
      weekHeader.textContent = `${weekCollapsed ? '▸' : '▾'} ${weekLabel}`;
      weekHeader.addEventListener('click', () => {
        if (collapsedCardWeeks.has(key)) collapsedCardWeeks.delete(key); else collapsedCardWeeks.add(key);
        renderCards(container, items, onChange);
      });
      weekSection.appendChild(weekHeader);

      const deckWrap = document.createElement('div');
      deckWrap.className = 'deck-list';
      deckWrap.hidden = weekCollapsed;
      weekSection.appendChild(deckWrap);

      const lectures = Array.from(weekMap.get(weekKey).entries()).sort((a,b)=>{
        return a[1].label.localeCompare(b[1].label);
      });

      lectures.forEach(([deckId, info]) => {
        const deck = document.createElement('button');
        deck.type = 'button';
        deck.className = 'deck';
        deck.innerHTML = `
          <span class="deck-title">${info.label}</span>
          <span class="deck-meta">${info.cards.length} card${info.cards.length === 1 ? '' : 's'}</span>
        `;
        deck.addEventListener('click', () => openDeck(`${blockId}|${weekKey}|${deckId}`, info.label, info.cards));
        deckWrap.appendChild(deck);
        decksById.set(`${blockId}|${weekKey}|${deckId}`, { title: info.label, cards: info.cards });
      });

      weeksWrap.appendChild(weekSection);
    });

    layout.appendChild(blockSection);
  });

  function openDeck(id, title, cards){
    const stored = decksById.get(id);
    if (stored) {
      title = stored.title;
      cards = stored.cards;
    }
    layout.classList.add('hidden');
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
      layout.classList.remove('hidden');
    });

    function keyHandler(e){
      if (e.key === 'ArrowLeft') prev.click();
      if (e.key === 'ArrowRight') next.click();
      if (e.key === 'Escape') close.click();
    }
    document.addEventListener('keydown', keyHandler);

    layout.classList.add('hidden');
    renderCard();
  }
}
