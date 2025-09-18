import { listBlocks } from '../../storage/storage.js';
import { createItemCard } from './cardlist.js';

function createDeckObject({
  id,
  title,
  subtitle = '',
  blockId = null,
  blockLabel = '',
  week = null,
  lectureId = null,
  lectureName = '',
  kind = 'lecture'
}) {
  return { id, title, subtitle, blockId, blockLabel, week, lectureId, lectureName, kind, cards: [] };
}

/**
 * Render lecture-based decks combining all item types with structured navigation.
 * @param {HTMLElement} container
 * @param {import('../../types.js').Item[]} items
 * @param {Function} onChange
 */
export async function renderCards(container, items, onChange) {
  container.innerHTML = '';

  const blocks = await listBlocks();
  const blockOrder = new Map(blocks.map((block, index) => [block.blockId, index]));
  const blockMeta = new Map(blocks.map(block => [block.blockId, block]));

  /** @type {Map<string, any>} */
  const structure = new Map();

  function getBlockGroup(blockId) {
    const key = blockId ?? '__unassigned__';
    if (!structure.has(key)) {
      const meta = blockMeta.get(blockId);
      structure.set(key, {
        id: blockId,
        label: meta?.title || blockId || 'Unassigned',
        color: meta?.color || '',
        order: blockOrder.get(blockId) ?? Number.MAX_SAFE_INTEGER,
        generalDeck: null,
        weeks: new Map(),
      });
    }
    return structure.get(key);
  }

  function ensureBlockGeneralDeck(group) {
    if (!group.generalDeck) {
      const title = group.id ? 'Block overview' : 'Unassigned cards';
      const subtitle = group.id ? 'Cards tagged without a week' : 'Cards without curriculum tags';
      group.generalDeck = createDeckObject({
        id: `${group.id || 'unassigned'}::block`,
        title,
        subtitle,
        blockId: group.id,
        blockLabel: group.label,
        kind: group.id ? 'block' : 'unassigned'
      });
    }
    return group.generalDeck;
  }

  function ensureWeek(group, week) {
    const key = String(week);
    if (!group.weeks.has(key)) {
      group.weeks.set(key, {
        week,
        lectureDecks: new Map(),
        generalDeck: null
      });
    }
    return group.weeks.get(key);
  }

  function ensureWeekGeneralDeck(group, weekGroup) {
    if (!weekGroup.generalDeck) {
      weekGroup.generalDeck = createDeckObject({
        id: `${group.id || 'unassigned'}::week-${weekGroup.week}::general`,
        title: `Week ${weekGroup.week} overview`,
        subtitle: 'Tagged without a lecture',
        blockId: group.id,
        blockLabel: group.label,
        week: weekGroup.week,
        kind: 'week-general'
      });
    }
    return weekGroup.generalDeck;
  }

  function ensureLectureDeck(group, weekGroup, lecture) {
    const key = lecture?.id != null ? String(lecture.id) : lecture?.name || 'general';
    if (!weekGroup.lectureDecks.has(key)) {
      const title = lecture?.name || (lecture?.id != null ? `Lecture ${lecture.id}` : 'Lecture deck');
      weekGroup.lectureDecks.set(key, createDeckObject({
        id: `${group.id || 'unassigned'}::week-${weekGroup.week}::lecture-${key}`,
        title,
        subtitle: group.label,
        blockId: group.id,
        blockLabel: group.label,
        week: weekGroup.week,
        lectureId: lecture?.id ?? null,
        lectureName: lecture?.name || '',
        kind: 'lecture'
      }));
    }
    return weekGroup.lectureDecks.get(key);
  }

  items.forEach(item => {
    const hasLectures = Array.isArray(item.lectures) && item.lectures.length;
    if (hasLectures) {
      item.lectures.forEach(lecture => {
        const blockId = lecture.blockId || (Array.isArray(item.blocks) && item.blocks.length ? item.blocks[0] : null);
        const group = getBlockGroup(blockId);
        const week = Number.isFinite(lecture.week) ? lecture.week : null;
        if (week == null) {
          const deck = ensureBlockGeneralDeck(group);
          deck.cards.push(item);
          return;
        }
        const weekGroup = ensureWeek(group, week);
        const deck = ensureLectureDeck(group, weekGroup, lecture);
        deck.cards.push(item);
      });
    } else {
      const blockIds = Array.isArray(item.blocks) && item.blocks.length ? item.blocks : [null];
      const weeks = Array.isArray(item.weeks) && item.weeks.length ? item.weeks : [null];
      blockIds.forEach(blockId => {
        const group = getBlockGroup(blockId);
        if (!weeks.length || weeks[0] == null) {
          const deck = ensureBlockGeneralDeck(group);
          deck.cards.push(item);
        } else {
          weeks.forEach(week => {
            const weekGroup = ensureWeek(group, week);
            const deck = ensureWeekGeneralDeck(group, weekGroup);
            deck.cards.push(item);
          });
        }
      });
    }
  });

  const blockGroups = Array.from(structure.values()).sort((a, b) => {
    if (a.id == null && b.id != null) return 1;
    if (b.id == null && a.id != null) return -1;
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label);
  });

  const navigation = document.createElement('div');
  navigation.className = 'cards-navigation';
  const viewer = document.createElement('div');
  viewer.className = 'cards-viewer hidden';

  container.append(navigation, viewer);

  blockGroups.forEach(group => {
    navigation.appendChild(renderBlockSection(group));
  });

  function renderBlockSection(group) {
    const section = document.createElement('section');
    section.className = 'cards-block';
    if (group.color) section.style.setProperty('--block-color', group.color);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'cards-block-header';
    header.setAttribute('aria-expanded', 'true');

    const title = document.createElement('span');
    title.className = 'cards-block-title';
    title.textContent = group.label;

    const meta = document.createElement('span');
    meta.className = 'cards-block-meta';
    const weekCount = group.weeks.size;
    const deckCount = countDecks(group);
    const metaParts = [];
    if (weekCount) metaParts.push(`${weekCount} week${weekCount === 1 ? '' : 's'}`);
    if (deckCount) metaParts.push(`${deckCount} deck${deckCount === 1 ? '' : 's'}`);
    meta.textContent = metaParts.join(' • ') || 'No decks yet';

    const chevron = document.createElement('span');
    chevron.className = 'cards-chevron';

    header.append(title, meta, chevron);
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'cards-block-body';
    section.appendChild(body);

    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    if (group.generalDeck && group.generalDeck.cards.length) {
      body.appendChild(renderOverview(group.generalDeck));
    }

    const weeks = Array.from(group.weeks.values()).sort((a, b) => a.week - b.week);
    weeks.forEach(weekGroup => {
      body.appendChild(renderWeekSection(group, weekGroup));
    });

    if (!body.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'cards-empty subtle';
      empty.textContent = group.id ? 'No cards tagged to this block yet.' : 'No unassigned cards found.';
      body.appendChild(empty);
    }

    return section;
  }

  function renderOverview(deck) {
    const wrap = document.createElement('div');
    wrap.className = 'cards-overview';
    const label = document.createElement('div');
    label.className = 'cards-overview-title';
    label.textContent = deck.title;
    const grid = document.createElement('div');
    grid.className = 'cards-deck-grid';
    grid.appendChild(createDeckTile(deck));
    wrap.append(label, grid);
    return wrap;
  }

  function renderWeekSection(group, weekGroup) {
    const section = document.createElement('section');
    section.className = 'cards-week';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'cards-week-header';
    header.setAttribute('aria-expanded', 'true');

    const title = document.createElement('span');
    title.className = 'cards-week-title';
    title.textContent = `Week ${weekGroup.week}`;

    const deckList = [];
    if (weekGroup.generalDeck && weekGroup.generalDeck.cards.length) {
      deckList.push(weekGroup.generalDeck);
    }
    deckList.push(...Array.from(weekGroup.lectureDecks.values()).sort((a, b) => a.title.localeCompare(b.title)));

    const meta = document.createElement('span');
    meta.className = 'cards-week-meta';
    meta.textContent = `${deckList.length} deck${deckList.length === 1 ? '' : 's'}`;

    const chevron = document.createElement('span');
    chevron.className = 'cards-chevron';

    header.append(title, meta, chevron);
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'cards-week-body';
    section.appendChild(body);

    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    if (!deckList.length) {
      const empty = document.createElement('div');
      empty.className = 'cards-empty subtle';
      empty.textContent = 'No decks for this week yet.';
      body.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.className = 'cards-deck-grid';
      deckList.forEach(deck => {
        grid.appendChild(createDeckTile(deck));
      });
      body.appendChild(grid);
    }

    return section;
  }

  function createDeckTile(deck) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'cards-deck';
    tile.dataset.kind = deck.kind;

    const title = document.createElement('span');
    title.className = 'cards-deck-title';
    title.textContent = deck.title;
    tile.appendChild(title);

    if (deck.subtitle) {
      const subtitle = document.createElement('span');
      subtitle.className = 'cards-deck-subtitle';
      subtitle.textContent = deck.subtitle;
      tile.appendChild(subtitle);
    }

    const meta = document.createElement('span');
    meta.className = 'cards-deck-meta';
    const metaParts = [];
    if (deck.week != null && deck.kind !== 'block') {
      metaParts.push(`Week ${deck.week}`);
    }
    metaParts.push(`${deck.cards.length} card${deck.cards.length === 1 ? '' : 's'}`);
    meta.textContent = metaParts.join(' • ');
    tile.appendChild(meta);

    tile.addEventListener('click', () => openDeck(deck));
    return tile;
  }

  function openDeck(deck) {
    navigation.classList.add('hidden');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cards-viewer-header';
    const heading = document.createElement('h2');
    heading.textContent = deck.title;
    header.appendChild(heading);

    const meta = document.createElement('div');
    meta.className = 'cards-viewer-meta';
    const metaParts = [];
    if (deck.blockLabel) metaParts.push(deck.blockLabel);
    if (deck.week != null) metaParts.push(`Week ${deck.week}`);
    metaParts.push(`${deck.cards.length} card${deck.cards.length === 1 ? '' : 's'}`);
    meta.textContent = metaParts.join(' • ');
    header.appendChild(meta);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn secondary cards-viewer-close';
    close.textContent = 'Back to decks';
    header.appendChild(close);

    viewer.appendChild(header);

    const body = document.createElement('div');
    body.className = 'cards-viewer-body';
    viewer.appendChild(body);

    const cardHolder = document.createElement('div');
    cardHolder.className = 'deck-card';
    body.appendChild(cardHolder);

    const prev = document.createElement('button');
    prev.className = 'deck-prev';
    prev.textContent = '◀';
    const next = document.createElement('button');
    next.className = 'deck-next';
    next.textContent = '▶';
    body.append(prev, next);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'deck-related-toggle btn secondary';
    toggle.textContent = 'Show related';
    viewer.appendChild(toggle);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related hidden';
    viewer.appendChild(relatedWrap);

    let idx = 0;
    let showRelated = false;

    function renderCard() {
      cardHolder.innerHTML = '';
      cardHolder.appendChild(createItemCard(deck.cards[idx], onChange));
      renderRelated();
    }

    function renderRelated() {
      relatedWrap.innerHTML = '';
      if (!showRelated) return;
      const current = deck.cards[idx];
      (current.links || []).forEach(link => {
        const item = items.find(candidate => candidate.id === link.id);
        if (item) {
          const el = createItemCard(item, onChange);
          el.classList.add('related-card');
          relatedWrap.appendChild(el);
          requestAnimationFrame(() => el.classList.add('visible'));
        }
      });
    }

    prev.addEventListener('click', () => {
      idx = (idx - 1 + deck.cards.length) % deck.cards.length;
      renderCard();
    });
    next.addEventListener('click', () => {
      idx = (idx + 1) % deck.cards.length;
      renderCard();
    });

    toggle.addEventListener('click', () => {
      showRelated = !showRelated;
      toggle.textContent = showRelated ? 'Hide related' : 'Show related';
      relatedWrap.classList.toggle('hidden', !showRelated);
      renderRelated();
    });

    function closeViewer() {
      document.removeEventListener('keydown', keyHandler);
      viewer.classList.add('hidden');
      viewer.innerHTML = '';
      navigation.classList.remove('hidden');
    }

    close.addEventListener('click', closeViewer);

    function keyHandler(event) {
      if (event.key === 'ArrowLeft') prev.click();
      if (event.key === 'ArrowRight') next.click();
      if (event.key === 'Escape') closeViewer();
    }

    document.addEventListener('keydown', keyHandler);
    renderCard();
  }

  function countDecks(group) {
    let total = 0;
    if (group.generalDeck && group.generalDeck.cards.length) total += 1;
    group.weeks.forEach(weekGroup => {
      if (weekGroup.generalDeck && weekGroup.generalDeck.cards.length) total += 1;
      total += weekGroup.lectureDecks.size;
    });
    return total;
  }
}
