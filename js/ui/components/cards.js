import { createItemCard } from './cardlist.js';
import { listBlocks } from '../../storage/storage.js';

const collapsedBlocks = new Set();
const collapsedWeeks = new Set();

function blockKey(blockId) {
  return blockId || '__unassigned';
}

function weekKey(blockId, weekId) {
  return `${blockKey(blockId)}|${weekId}`;
}

function normalizeWeek(value) {
  if (value == null || value === '' || Number.isNaN(value)) {
    return { key: '__general', label: 'General', order: Number.POSITIVE_INFINITY - 1 };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { key: String(value), label: `Week ${value}`, order: value };
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return { key: String(numeric), label: `Week ${numeric}`, order: numeric };
  }
  const label = String(value);
  return { key: label.toLowerCase(), label, order: Number.POSITIVE_INFINITY }; // custom label sorts last
}

function formatPlural(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function summarizeTypes(items) {
  const counts = new Map();
  items.forEach(item => {
    const kind = item.kind || 'card';
    counts.set(kind, (counts.get(kind) || 0) + 1);
  });
  const labels = { disease: 'Disease', drug: 'Drug', concept: 'Concept' };
  return Array.from(counts.entries())
    .map(([kind, count]) => `${count} ${labels[kind] || 'Card'}${count === 1 ? '' : 's'}`)
    .join(' • ');
}

function createFallbackBlock(blockId) {
  return {
    blockId,
    title: blockId === '__unassigned' ? 'Unassigned' : blockId,
    color: '#475569',
    order: Number.MAX_SAFE_INTEGER,
    weeks: 0
  };
}

function createWeekDecks(weekGroup) {
  const decks = Array.from(weekGroup.lectures.values())
    .sort((a, b) => a.title.localeCompare(b.title));
  if (weekGroup.general.length) {
    decks.push({
      key: `${weekGroup.key}|general`,
      title: 'General content',
      items: weekGroup.general.slice(),
      isGeneral: true
    });
  }
  return decks;
}

export async function renderCards(container, items, onChange) {
  container.innerHTML = '';

  const blockDefs = await listBlocks();
  blockDefs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const blockMeta = new Map();
  blockDefs.forEach((block, index) => {
    blockMeta.set(block.blockId, { ...block, order: block.order ?? index });
  });
  if (!blockMeta.has('__unassigned')) {
    blockMeta.set('__unassigned', { ...createFallbackBlock('__unassigned'), order: Number.MAX_SAFE_INTEGER });
  }

  const grouped = new Map();

  function getBlockGroup(blockId) {
    const key = blockKey(blockId);
    if (!grouped.has(key)) {
      if (!blockMeta.has(key)) {
        blockMeta.set(key, createFallbackBlock(key));
      }
      grouped.set(key, { key, meta: blockMeta.get(key), weeks: new Map(), stats: { deckCount: 0, cardCount: 0 } });
    }
    return grouped.get(key);
  }

  function getWeekGroup(blockGroup, rawWeek) {
    const descriptor = normalizeWeek(rawWeek);
    if (!blockGroup.weeks.has(descriptor.key)) {
      blockGroup.weeks.set(descriptor.key, { ...descriptor, lectures: new Map(), general: [] });
    }
    return blockGroup.weeks.get(descriptor.key);
  }

  items.forEach(item => {
    const lectureRefs = Array.isArray(item.lectures) ? item.lectures.filter(Boolean) : [];
    if (lectureRefs.length) {
      lectureRefs.forEach(lecture => {
        const blockGroup = getBlockGroup(lecture.blockId || (item.blocks?.[0] ?? '__unassigned'));
        const weekGroup = getWeekGroup(blockGroup, lecture.week);
        const lectureKey = `${blockGroup.key}|${lecture.id}`;
        if (!weekGroup.lectures.has(lectureKey)) {
          weekGroup.lectures.set(lectureKey, {
            key: lectureKey,
            lecture,
            title: lecture.name || `Lecture ${lecture.id}`,
            items: []
          });
        }
        weekGroup.lectures.get(lectureKey).items.push(item);
      });
      return;
    }

    const blocks = item.blocks?.length ? item.blocks : ['__unassigned'];
    const weeks = item.weeks?.length ? item.weeks : [null];
    blocks.forEach(blockId => {
      const blockGroup = getBlockGroup(blockId);
      weeks.forEach(weekValue => {
        const weekGroup = getWeekGroup(blockGroup, weekValue);
        if (!weekGroup.general.includes(item)) weekGroup.general.push(item);
      });
    });
  });

  const layout = document.createElement('div');
  layout.className = 'cards-layout';
  container.appendChild(layout);

  const list = document.createElement('div');
  list.className = 'cards-block-list';
  layout.appendChild(list);

  const viewer = document.createElement('div');
  viewer.className = 'cards-viewer hidden';
  layout.appendChild(viewer);

  const blockEntries = Array.from(grouped.values())
    .sort((a, b) => (a.meta.order ?? Number.MAX_SAFE_INTEGER) - (b.meta.order ?? Number.MAX_SAFE_INTEGER)
      || (a.meta.title || '').localeCompare(b.meta.title || ''));

  if (!blockEntries.length) {
    const empty = document.createElement('div');
    empty.className = 'cards-empty';
    empty.textContent = 'No cards match your current filters yet.';
    list.appendChild(empty);
    return;
  }

  blockEntries.forEach(blockGroup => {
    const weeks = Array.from(blockGroup.weeks.values())
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

    const blockSection = document.createElement('section');
    blockSection.className = 'cards-block';
    const blockCollapsed = collapsedBlocks.has(blockGroup.key);
    if (blockCollapsed) blockSection.classList.add('is-collapsed');

    weeks.forEach(weekGroup => {
      weekGroup.decks = createWeekDecks(weekGroup);
      weekGroup.cardCount = weekGroup.decks.reduce((sum, deck) => sum + deck.items.length, 0);
      blockGroup.stats.deckCount += weekGroup.decks.length;
      blockGroup.stats.cardCount += weekGroup.cardCount;
    });

    const header = document.createElement('header');
    header.className = 'cards-block-header';
    const info = document.createElement('div');
    info.className = 'cards-block-info';
    const swatch = document.createElement('span');
    swatch.className = 'cards-block-swatch';
    swatch.style.setProperty('--block-color', blockGroup.meta.color || '#38bdf8');
    info.appendChild(swatch);
    const title = document.createElement('h3');
    title.className = 'cards-block-title';
    title.textContent = blockGroup.meta.title || blockGroup.meta.blockId;
    info.appendChild(title);
    const meta = document.createElement('span');
    meta.className = 'cards-block-meta';
    const weekCount = weeks.length;
    meta.textContent = `${formatPlural(weekCount, 'week')} • ${formatPlural(blockGroup.stats.deckCount, 'deck')} • ${formatPlural(blockGroup.stats.cardCount, 'card')}`;
    info.appendChild(meta);
    header.appendChild(info);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cards-block-toggle';
    toggle.textContent = blockCollapsed ? 'Expand' : 'Collapse';
    toggle.setAttribute('aria-expanded', String(!blockCollapsed));
    toggle.addEventListener('click', () => {
      const collapsed = blockSection.classList.toggle('is-collapsed');
      toggle.textContent = collapsed ? 'Expand' : 'Collapse';
      toggle.setAttribute('aria-expanded', String(!collapsed));
      if (collapsed) collapsedBlocks.add(blockGroup.key);
      else collapsedBlocks.delete(blockGroup.key);
    });
    header.appendChild(toggle);
    blockSection.appendChild(header);

    const weekList = document.createElement('div');
    weekList.className = 'cards-week-list';
    blockSection.appendChild(weekList);

    if (!weeks.length) {
      const empty = document.createElement('div');
      empty.className = 'cards-empty';
      empty.textContent = 'No decks created for this block yet.';
      weekList.appendChild(empty);
    } else {
      weeks.forEach(weekGroup => {
        const decks = weekGroup.decks;
        const weekSection = document.createElement('section');
        weekSection.className = 'cards-week';
        const weekKeyValue = weekKey(blockGroup.key, weekGroup.key);
        const weekCollapsed = collapsedWeeks.has(weekKeyValue);
        if (weekCollapsed) weekSection.classList.add('is-collapsed');

        const weekHeader = document.createElement('div');
        weekHeader.className = 'cards-week-header';
        const label = document.createElement('h4');
        label.className = 'cards-week-title';
        label.textContent = weekGroup.label;
        weekHeader.appendChild(label);
        const weekMeta = document.createElement('span');
        weekMeta.className = 'cards-week-meta';
        weekMeta.textContent = `${formatPlural(decks.length, 'deck')} • ${formatPlural(weekGroup.cardCount, 'card')}`;
        weekHeader.appendChild(weekMeta);
        const weekToggle = document.createElement('button');
        weekToggle.type = 'button';
        weekToggle.className = 'cards-week-toggle';
        weekToggle.textContent = weekCollapsed ? 'Show' : 'Hide';
        weekToggle.setAttribute('aria-expanded', String(!weekCollapsed));
        weekToggle.addEventListener('click', () => {
          const collapsed = weekSection.classList.toggle('is-collapsed');
          weekToggle.textContent = collapsed ? 'Show' : 'Hide';
          weekToggle.setAttribute('aria-expanded', String(!collapsed));
          if (collapsed) collapsedWeeks.add(weekKeyValue);
          else collapsedWeeks.delete(weekKeyValue);
        });
        weekHeader.appendChild(weekToggle);
        weekSection.appendChild(weekHeader);

        const deckGrid = document.createElement('div');
        deckGrid.className = 'cards-lecture-grid';
        weekSection.appendChild(deckGrid);

        if (!decks.length) {
          const empty = document.createElement('div');
          empty.className = 'cards-empty';
          empty.textContent = 'No cards linked yet.';
          deckGrid.appendChild(empty);
        } else {
          decks.forEach(deck => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'cards-deck';
            const heading = document.createElement('h5');
            heading.className = 'cards-deck-title';
            heading.textContent = deck.title;
            button.appendChild(heading);
            const count = document.createElement('span');
            count.className = 'cards-deck-count';
            count.textContent = formatPlural(deck.items.length, 'card');
            button.appendChild(count);
            const summary = document.createElement('span');
            summary.className = 'cards-deck-summary';
            summary.textContent = summarizeTypes(deck.items);
            button.appendChild(summary);
            button.addEventListener('click', () => {
              openDeck({ block: blockGroup.meta, week: weekGroup, deck }, deck.items);
            });
            deckGrid.appendChild(button);
          });
        }

        weekList.appendChild(weekSection);
      });
    }

    list.appendChild(blockSection);
  });

  function openDeck(context, cards) {
    list.classList.add('is-hidden');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'cards-viewer-header';
    const title = document.createElement('h2');
    title.textContent = context.deck.title;
    header.appendChild(title);
    const meta = document.createElement('p');
    meta.className = 'cards-viewer-meta';
    meta.textContent = `${context.block.title || context.block.blockId} • ${context.week.label} • ${formatPlural(cards.length, 'card')}`;
    header.appendChild(meta);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-btn ghost cards-viewer-close';
    close.textContent = '✕';
    header.appendChild(close);
    viewer.appendChild(header);

    const stage = document.createElement('div');
    stage.className = 'cards-viewer-stage';
    viewer.appendChild(stage);

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'cards-nav-btn prev';
    prev.setAttribute('aria-label', 'Previous card');
    prev.textContent = '‹';
    stage.appendChild(prev);

    const cardHolder = document.createElement('div');
    cardHolder.className = 'cards-viewer-card';
    stage.appendChild(cardHolder);

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'cards-nav-btn next';
    next.setAttribute('aria-label', 'Next card');
    next.textContent = '›';
    stage.appendChild(next);

    const controls = document.createElement('div');
    controls.className = 'cards-viewer-controls';
    const toggleRelated = document.createElement('button');
    toggleRelated.type = 'button';
    toggleRelated.className = 'btn subtle cards-related-toggle';
    toggleRelated.textContent = 'Show related';
    controls.appendChild(toggleRelated);
    viewer.appendChild(controls);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'cards-related hidden';
    viewer.appendChild(relatedWrap);

    let idx = 0;
    let showRelated = false;

    function renderCard() {
      cardHolder.innerHTML = '';
      cardHolder.appendChild(createItemCard(cards[idx], onChange));
      renderRelated();
    }

    function renderRelated() {
      relatedWrap.innerHTML = '';
      if (!showRelated) return;
      const current = cards[idx];
      (current.links || []).forEach(link => {
        const item = items.find(it => it.id === link.id);
        if (item) {
          const el = createItemCard(item, onChange);
          el.classList.add('cards-related-card');
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

    toggleRelated.addEventListener('click', () => {
      showRelated = !showRelated;
      toggleRelated.textContent = showRelated ? 'Hide related' : 'Show related';
      relatedWrap.classList.toggle('hidden', !showRelated);
      renderRelated();
    });

    function closeViewer() {
      document.removeEventListener('keydown', keyHandler);
      viewer.classList.add('hidden');
      viewer.innerHTML = '';
      list.classList.remove('is-hidden');
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
}
