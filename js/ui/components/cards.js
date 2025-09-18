import { createItemCard } from './cardlist.js';
import { listBlocks } from '../../storage/storage.js';

const collapsedBlockSections = new Set();
const collapsedWeekSections = new Set();

function blockKey(blockId = 'unassigned') {
  return blockId || 'unassigned';
}

function weekKey(blockId, week) {
  return `${blockKey(blockId)}::${week ?? 'general'}`;
}

function ensureGroup(groups, blockId, meta) {
  const key = blockKey(blockId);
  if (!groups.has(key)) {
    const fallbackName = blockId ? blockId : 'Unassigned';
    groups.set(key, {
      id: key,
      blockId,
      label: meta ? `${meta.blockId} • ${meta.title}` : fallbackName,
      title: meta?.title || (blockId ? meta?.title || blockId : 'Unassigned'),
      color: meta?.color || null,
      order: typeof meta?.order === 'number' ? meta.order : Number.MAX_SAFE_INTEGER,
      weeks: new Map(),
    });
  }
  return groups.get(key);
}

function ensureWeek(group, rawWeek) {
  const key = weekKey(group.blockId, rawWeek);
  if (!group.weeks.has(key)) {
    const hasWeekNumber = typeof rawWeek === 'number' && !Number.isNaN(rawWeek);
    group.weeks.set(key, {
      key,
      raw: hasWeekNumber ? rawWeek : null,
      label: hasWeekNumber ? `Week ${rawWeek}` : 'General',
      order: hasWeekNumber ? rawWeek : Number.MAX_SAFE_INTEGER - 1,
      decks: new Map(),
    });
  }
  return group.weeks.get(key);
}

function ensureDeck(week, key, title, meta = {}) {
  if (!week.decks.has(key)) {
    week.decks.set(key, {
      key,
      title,
      meta,
      cards: [],
    });
  }
  return week.decks.get(key);
}

export async function renderCards(container, items, onChange) {
  container.innerHTML = '';
  container.classList.add('cards-workspace');

  const blockMeta = await listBlocks();
  const blockMap = new Map(blockMeta.map((block, idx) => [block.blockId, { ...block, index: idx }]));

  const groups = new Map();

  items.forEach((item) => {
    const lectures = Array.isArray(item.lectures) ? item.lectures : [];
    if (lectures.length) {
      lectures.forEach((lecture) => {
        const block = ensureGroup(groups, lecture.blockId, blockMap.get(lecture.blockId));
        const week = ensureWeek(block, lecture.week);
        const deckTitle = lecture.name || (lecture.id ? `Lecture ${lecture.id}` : 'Lecture');
        const deck = ensureDeck(week, `lecture-${lecture.id ?? deckTitle}`, deckTitle, {
          lectureId: lecture.id,
          week: lecture.week,
          blockId: lecture.blockId,
        });
        if (!deck.cards.some(card => card.id === item.id)) deck.cards.push(item);
      });
      return;
    }

    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    if (blocks.length) {
      blocks.forEach((blockId) => {
        const block = ensureGroup(groups, blockId, blockMap.get(blockId));
        const derivedWeek = Array.isArray(item.weeks) && item.weeks.length ? Number(item.weeks[0]) : null;
        const week = ensureWeek(block, Number.isFinite(derivedWeek) ? derivedWeek : null);
        const deck = ensureDeck(week, 'block-items', 'Block entries', { blockId });
        if (!deck.cards.some(card => card.id === item.id)) deck.cards.push(item);
      });
      return;
    }

    const block = ensureGroup(groups, null, null);
    const week = ensureWeek(block, null);
    const deck = ensureDeck(week, 'unassigned', 'Unsorted entries');
    if (!deck.cards.some(card => card.id === item.id)) deck.cards.push(item);
  });

  const browser = document.createElement('div');
  browser.className = 'cards-browser';
  container.appendChild(browser);

  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer cards-viewer hidden';
  container.appendChild(viewer);

  const sortedBlocks = Array.from(groups.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const aIndex = blockMap.get(a.blockId)?.index ?? Number.MAX_SAFE_INTEGER;
    const bIndex = blockMap.get(b.blockId)?.index ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.label.localeCompare(b.label);
  });

  if (!sortedBlocks.length) {
    const empty = document.createElement('p');
    empty.className = 'cards-empty';
    empty.textContent = 'No cards yet. Add entries to start building decks.';
    browser.appendChild(empty);
    return;
  }

  sortedBlocks.forEach((blockGroup) => {
    const blockSection = document.createElement('section');
    blockSection.className = 'cards-block';
    if (blockGroup.color) blockSection.style.setProperty('--block-accent', blockGroup.color);
    const blockCollapsed = collapsedBlockSections.has(blockGroup.id);
    if (blockCollapsed) blockSection.classList.add('collapsed');

    const header = document.createElement('header');
    header.className = 'cards-block-header';
    blockSection.appendChild(header);

    const info = document.createElement('div');
    info.className = 'cards-block-info';
    const title = document.createElement('h2');
    title.textContent = blockGroup.blockId ? `${blockGroup.blockId} • ${blockGroup.title}` : 'Unassigned';
    info.appendChild(title);
    const meta = document.createElement('p');
    meta.className = 'cards-block-meta';
    const totalCards = Array.from(blockGroup.weeks.values()).reduce((sum, wk) => sum + Array.from(wk.decks.values()).reduce((inner, deck) => inner + deck.cards.length, 0), 0);
    meta.textContent = `${blockGroup.weeks.size} ${blockGroup.weeks.size === 1 ? 'section' : 'sections'} • ${totalCards} ${totalCards === 1 ? 'card' : 'cards'}`;
    info.appendChild(meta);
    header.appendChild(info);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'icon-btn ghost cards-collapse-btn';
    toggleBtn.textContent = blockCollapsed ? '▸' : '▾';
    toggleBtn.title = blockCollapsed ? 'Expand block' : 'Collapse block';
    toggleBtn.setAttribute('aria-expanded', blockCollapsed ? 'false' : 'true');
    toggleBtn.addEventListener('click', () => {
      blockSection.classList.toggle('collapsed');
      const collapsed = blockSection.classList.contains('collapsed');
      toggleBtn.textContent = collapsed ? '▸' : '▾';
      toggleBtn.title = collapsed ? 'Expand block' : 'Collapse block';
      toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      content.hidden = collapsed;
      if (collapsed) collapsedBlockSections.add(blockGroup.id);
      else collapsedBlockSections.delete(blockGroup.id);
    });
    header.appendChild(toggleBtn);

    const content = document.createElement('div');
    content.className = 'cards-block-content';
    if (blockCollapsed) content.hidden = true;
    blockSection.appendChild(content);

    const sortedWeeks = Array.from(blockGroup.weeks.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });

    sortedWeeks.forEach((week) => {
      const weekSection = document.createElement('section');
      weekSection.className = 'cards-week';
      const wkCollapsed = collapsedWeekSections.has(week.key);
      if (wkCollapsed) weekSection.classList.add('collapsed');

      const weekHeader = document.createElement('div');
      weekHeader.className = 'cards-week-header';
      const weekTitle = document.createElement('h3');
      weekTitle.textContent = week.label;
      weekHeader.appendChild(weekTitle);
      const weekMeta = document.createElement('span');
      const weekCardCount = Array.from(week.decks.values()).reduce((sum, deck) => sum + deck.cards.length, 0);
      weekMeta.className = 'cards-week-meta';
      weekMeta.textContent = `${week.decks.size} ${week.decks.size === 1 ? 'deck' : 'decks'} • ${weekCardCount} cards`;
      weekHeader.appendChild(weekMeta);
      const weekToggle = document.createElement('button');
      weekToggle.className = 'icon-btn ghost cards-collapse-btn';
      weekToggle.textContent = wkCollapsed ? '▸' : '▾';
      weekToggle.title = wkCollapsed ? 'Expand week' : 'Collapse week';
      weekToggle.setAttribute('aria-expanded', wkCollapsed ? 'false' : 'true');
      weekToggle.addEventListener('click', () => {
        weekSection.classList.toggle('collapsed');
        const collapsed = weekSection.classList.contains('collapsed');
        weekToggle.textContent = collapsed ? '▸' : '▾';
        weekToggle.title = collapsed ? 'Expand week' : 'Collapse week';
        weekToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (collapsed) collapsedWeekSections.add(week.key);
        else collapsedWeekSections.delete(week.key);
        weekContent.hidden = collapsed;
      });
      weekHeader.appendChild(weekToggle);
      weekSection.appendChild(weekHeader);

      const weekContent = document.createElement('div');
      weekContent.className = 'cards-week-content';
      weekContent.hidden = wkCollapsed;
      weekSection.appendChild(weekContent);

      const decks = Array.from(week.decks.values()).sort((a, b) => a.title.localeCompare(b.title));
      decks.forEach((deck) => {
        if (!deck.cards.length) return;
        const deckCard = document.createElement('button');
        deckCard.type = 'button';
        deckCard.className = 'cards-deck';
        const deckTitleEl = document.createElement('span');
        deckTitleEl.className = 'cards-deck-title';
        deckTitleEl.textContent = deck.title;
        const deckCount = document.createElement('span');
        deckCount.className = 'cards-deck-count';
        deckCount.textContent = `${deck.cards.length}`;
        deckCard.append(deckTitleEl, deckCount);
        deckCard.addEventListener('click', () => {
          openDeck(blockGroup, week, deck);
        });
        weekContent.appendChild(deckCard);
      });

      content.appendChild(weekSection);
    });

    browser.appendChild(blockSection);
  });

  function openDeck(blockGroup, week, deck) {
    browser.classList.add('hidden');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cards-viewer-header';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn secondary cards-viewer-back';
    back.textContent = 'Back to collection';
    back.addEventListener('click', closeDeck);
    header.appendChild(back);

    const title = document.createElement('h2');
    title.textContent = deck.title;
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'cards-viewer-meta';
    const parts = [];
    if (blockGroup.blockId) parts.push(`${blockGroup.blockId} • ${blockGroup.title}`);
    else parts.push('Unassigned');
    if (week.raw != null) parts.push(`Week ${week.raw}`);
    subtitle.textContent = parts.join(' • ');
    header.appendChild(subtitle);

    viewer.appendChild(header);

    const cardHolder = document.createElement('div');
    cardHolder.className = 'deck-card';
    viewer.appendChild(cardHolder);

    const prev = document.createElement('button');
    prev.className = 'deck-nav deck-prev';
    prev.textContent = '◀';
    const next = document.createElement('button');
    next.className = 'deck-nav deck-next';
    next.textContent = '▶';
    viewer.appendChild(prev);
    viewer.appendChild(next);

    const toggleRelated = document.createElement('button');
    toggleRelated.className = 'btn subtle deck-related-toggle';
    toggleRelated.textContent = 'Show related';
    viewer.appendChild(toggleRelated);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related hidden';
    viewer.appendChild(relatedWrap);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn secondary deck-close';
    closeBtn.textContent = 'Close deck';
    closeBtn.addEventListener('click', closeDeck);
    viewer.appendChild(closeBtn);

    let index = 0;
    let showRelated = false;

    function renderCard() {
      cardHolder.innerHTML = '';
      cardHolder.appendChild(createItemCard(deck.cards[index], onChange));
      renderRelated();
    }

    function renderRelated() {
      relatedWrap.innerHTML = '';
      if (!showRelated) return;
      const current = deck.cards[index];
      (current.links || []).forEach((link) => {
        const item = items.find((it) => it.id === link.id);
        if (item) {
          const el = createItemCard(item, onChange);
          el.classList.add('related-card');
          relatedWrap.appendChild(el);
          requestAnimationFrame(() => el.classList.add('visible'));
        }
      });
    }

    function step(offset) {
      index = (index + offset + deck.cards.length) % deck.cards.length;
      renderCard();
    }

    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));

    toggleRelated.addEventListener('click', () => {
      showRelated = !showRelated;
      toggleRelated.textContent = showRelated ? 'Hide related' : 'Show related';
      relatedWrap.classList.toggle('hidden', !showRelated);
      renderRelated();
    });

    function closeDeck() {
      document.removeEventListener('keydown', handleKeys);
      viewer.classList.add('hidden');
      viewer.innerHTML = '';
      browser.classList.remove('hidden');
    }

    function handleKeys(event) {
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'Escape') closeDeck();
    }

    document.addEventListener('keydown', handleKeys);

    renderCard();
  }
}
