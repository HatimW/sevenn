import { listBlocks } from '../../storage/storage.js';
import { createItemCard } from './cardlist.js';

const KIND_COLORS = { disease: 'var(--pink)', drug: 'var(--blue)', concept: 'var(--green)' };

const UNASSIGNED_BLOCK_KEY = '__unassigned__';
const MISC_LECTURE_KEY = '__misc__';

function formatWeekLabel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `Week ${value}`;
  }
  return 'Unscheduled';
}

function titleFromItem(item) {
  return item?.name || item?.concept || 'Untitled Card';
}

function deckColorFromCards(cards = []) {
  for (const card of cards) {
    if (card?.color) return card.color;
  }
  for (const card of cards) {
    if (card?.kind && KIND_COLORS[card.kind]) return KIND_COLORS[card.kind];
  }
  return 'var(--accent)';
}

/**
 * Render lecture-based decks combining all item types with block/week groupings.
 * @param {HTMLElement} container
 * @param {import('../../types.js').Item[]} items
 * @param {Function} onChange
 */
export async function renderCards(container, items, onChange) {
  container.innerHTML = '';
  container.classList.add('cards-tab');

  const itemLookup = new Map(items.filter(it => it && it.id != null).map(it => [it.id, it]));
  const overlayCardCache = new Map();

  const blockDefs = await listBlocks();
  const blockLookup = new Map(blockDefs.map(def => [def.blockId, def]));
  const blockOrder = new Map(blockDefs.map((def, idx) => [def.blockId, idx]));

  /** @type {Map<string, { key:string, blockId:string|null, title:string, accent?:string|null, order:number, weeks:Map<string, any> }>} */
  const blockBuckets = new Map();

  function ensureBlock(blockId) {
    const key = blockId || UNASSIGNED_BLOCK_KEY;
    if (!blockBuckets.has(key)) {
      const def = blockLookup.get(blockId);
      const order = typeof blockId === 'string' ? (blockOrder.get(blockId) ?? 999) : 1200;
      blockBuckets.set(key, {
        key,
        blockId: blockId || null,
        title: def?.title || (blockId ? blockId : 'Unassigned'),
        accent: def?.color || null,
        order,
        weeks: new Map()
      });
    }
    return blockBuckets.get(key);
  }

  function ensureWeek(blockBucket, weekValue) {
    const weekKey = weekValue == null ? 'none' : String(weekValue);
    if (!blockBucket.weeks.has(weekKey)) {
      blockBucket.weeks.set(weekKey, {
        key: weekKey,
        value: typeof weekValue === 'number' && Number.isFinite(weekValue) ? weekValue : null,
        label: formatWeekLabel(weekValue),
        order: typeof weekValue === 'number' && Number.isFinite(weekValue) ? weekValue : 999,
        lectures: new Map()
      });
    }
    return blockBucket.weeks.get(weekKey);
  }

  function ensureLecture(weekBucket, lectureKey, lectureName) {
    if (!weekBucket.lectures.has(lectureKey)) {
      weekBucket.lectures.set(lectureKey, {
        key: lectureKey,
        title: lectureName || 'Lecture',
        cards: []
      });
    }
    return weekBucket.lectures.get(lectureKey);
  }

  items.forEach(item => {
    const lectureRefs = Array.isArray(item.lectures) ? item.lectures : [];
    if (lectureRefs.length) {
      lectureRefs.forEach(ref => {
        const blockBucket = ensureBlock(ref.blockId);
        const weekBucket = ensureWeek(blockBucket, ref.week);
        const lectureKeyParts = [ref.blockId || blockBucket.key];
        if (ref.id != null) lectureKeyParts.push(`lec-${ref.id}`);
        if (ref.name) lectureKeyParts.push(ref.name);
        const lectureKey = lectureKeyParts.join('::') || `${blockBucket.key}-${titleFromItem(item)}`;
        const lecture = ensureLecture(weekBucket, lectureKey, ref.name || (ref.id != null ? `Lecture ${ref.id}` : 'Lecture'));
        if (!lecture.cards.includes(item)) {
          lecture.cards.push(item);
        }
      });
    } else if (Array.isArray(item.blocks) && item.blocks.length) {
      item.blocks.forEach(blockId => {
        const blockBucket = ensureBlock(blockId);
        const weeks = Array.isArray(item.weeks) && item.weeks.length ? item.weeks : [null];
        weeks.forEach(weekVal => {
          const weekBucket = ensureWeek(blockBucket, weekVal);
          const lecture = ensureLecture(weekBucket, `${blockBucket.key}::${MISC_LECTURE_KEY}`, 'Ungrouped Items');
          lecture.cards.push(item);
        });
      });
    } else {
      const blockBucket = ensureBlock(null);
      const weekBucket = ensureWeek(blockBucket, null);
      const lecture = ensureLecture(weekBucket, `${blockBucket.key}::${MISC_LECTURE_KEY}`, 'Unassigned Items');
      lecture.cards.push(item);
    }
  });

  const blockSections = Array.from(blockBuckets.values())
    .map(block => {
      const weeks = Array.from(block.weeks.values())
        .map(week => {
          const lectures = Array.from(week.lectures.values())
            .map(lec => ({
              ...lec,
              cards: lec.cards.slice().sort((a, b) => titleFromItem(a).localeCompare(titleFromItem(b)))
            }))
            .filter(lec => lec.cards.length > 0)
            .sort((a, b) => a.title.localeCompare(b.title));
          const totalCards = lectures.reduce((sum, lec) => sum + lec.cards.length, 0);
          return {
            ...week,
            lectures,
            totalCards,
            lectureCount: lectures.length
          };
        })
        .filter(week => week.totalCards > 0)
        .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
      const totalCards = weeks.reduce((sum, week) => sum + week.totalCards, 0);
      const lectureCount = weeks.reduce((sum, week) => sum + week.lectureCount, 0);
      return {
        ...block,
        weeks,
        totalCards,
        lectureCount
      };
    })
    .filter(block => block.totalCards > 0)
    .sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));

  const catalog = document.createElement('div');
  catalog.className = 'card-catalog';
  container.appendChild(catalog);

  const overlay = document.createElement('div');
  overlay.className = 'deck-overlay';
  overlay.dataset.active = 'false';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer';
  overlay.appendChild(viewer);
  container.appendChild(overlay);

  let activeKeyHandler = null;

  function closeDeck() {
    overlay.dataset.active = 'false';
    viewer.innerHTML = '';
    if (activeKeyHandler) {
      document.removeEventListener('keydown', activeKeyHandler);
      activeKeyHandler = null;
    }
  }

  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) closeDeck();
  });

  function openDeck(context) {
    const { block, week, lecture } = context;
    overlay.dataset.active = 'true';
    viewer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'deck-viewer-header';

    const crumb = document.createElement('div');
    crumb.className = 'deck-viewer-crumb';
    const crumbPieces = [];
    if (block.title) crumbPieces.push(block.title);
    if (week?.label) crumbPieces.push(week.label);
    crumb.textContent = crumbPieces.join(' • ');
    header.appendChild(crumb);

    const title = document.createElement('h2');
    title.className = 'deck-viewer-title';
    title.textContent = lecture.title;
    header.appendChild(title);

    const counter = document.createElement('div');
    counter.className = 'deck-counter';
    header.appendChild(counter);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'deck-close';
    closeBtn.innerHTML = '<span aria-hidden="true">×</span><span class="sr-only">Close deck</span>';
    closeBtn.addEventListener('click', closeDeck);
    header.appendChild(closeBtn);

    viewer.appendChild(header);

    const accent = deckColorFromCards(lecture.cards);
    viewer.style.setProperty('--deck-accent', accent);
    overlay.style.setProperty('--deck-accent', accent);

    const stage = document.createElement('div');
    stage.className = 'deck-stage';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'deck-nav deck-prev';
    prev.innerHTML = '<span class="sr-only">Previous card</span><svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const cardHolder = document.createElement('div');
    cardHolder.className = 'deck-card-stage';
    cardHolder.tabIndex = -1;

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'deck-nav deck-next';
    next.innerHTML = '<span class="sr-only">Next card</span><svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    stage.appendChild(prev);
    stage.appendChild(cardHolder);
    stage.appendChild(next);
    viewer.appendChild(stage);

    const toolbar = document.createElement('div');
    toolbar.className = 'deck-toolbar';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'deck-related-toggle';
    toggle.dataset.active = 'false';
    toggle.textContent = 'Show related cards';
    toolbar.appendChild(toggle);

    viewer.appendChild(toolbar);

    const filmstrip = document.createElement('div');
    filmstrip.className = 'deck-filmstrip';
    const chipButtons = lecture.cards.map((cardItem, cardIndex) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'deck-chip';
      chip.textContent = titleFromItem(cardItem);
      chip.addEventListener('click', () => {
        idx = cardIndex;
        renderCard();
        try {
          cardHolder.focus({ preventScroll: true });
        } catch (err) {
          cardHolder.focus();
        }
      });
      filmstrip.appendChild(chip);
      return chip;
    });
    if (lecture.cards.length <= 1) {
      filmstrip.dataset.single = 'true';
    }
    viewer.appendChild(filmstrip);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related';
    relatedWrap.dataset.visible = 'false';
    viewer.appendChild(relatedWrap);

    let idx = 0;
    let showRelated = false;

    function renderRelated() {
      relatedWrap.innerHTML = '';
      if (!showRelated) {
        relatedWrap.dataset.visible = 'false';
        return;
      }
      const current = lecture.cards[idx];
      const seen = new Set();
      (current.links || []).forEach(link => {
        const linkId = link?.id;
        if (linkId == null || seen.has(linkId)) return;
        const related = itemLookup.get(linkId);
        if (related) {
          seen.add(linkId);
          const card = createItemCard(related, onChange);
          card.classList.add('related-card');
          relatedWrap.appendChild(card);
        }
      });
      relatedWrap.dataset.visible = relatedWrap.children.length ? 'true' : 'false';
    }

    function renderCard() {
      cardHolder.innerHTML = '';
      const item = lecture.cards[idx];
      const cacheKey = item?.id ?? `${lecture.key || lecture.title}-${idx}`;
      let card = overlayCardCache.get(cacheKey);
      if (!card) {
        card = createItemCard(item, onChange, { variant: 'overlay' });
        overlayCardCache.set(cacheKey, card);
      }
      cardHolder.appendChild(card);
      counter.textContent = `Card ${idx + 1} of ${lecture.cards.length}`;
      renderRelated();
      chipButtons.forEach((chip, chipIndex) => {
        const active = chipIndex === idx;
        chip.dataset.active = active ? 'true' : 'false';
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    prev.addEventListener('click', () => {
      idx = (idx - 1 + lecture.cards.length) % lecture.cards.length;
      renderCard();
    });

    next.addEventListener('click', () => {
      idx = (idx + 1) % lecture.cards.length;
      renderCard();
    });

    toggle.addEventListener('click', () => {
      showRelated = !showRelated;
      toggle.dataset.active = showRelated ? 'true' : 'false';
      toggle.textContent = showRelated ? 'Hide related cards' : 'Show related cards';
      renderRelated();
    });

    const keyHandler = event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prev.click();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        next.click();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeDeck();
      }
    };

    document.addEventListener('keydown', keyHandler);
    activeKeyHandler = keyHandler;

    renderCard();
    requestAnimationFrame(() => closeBtn.focus());
  }

  function createCollapseIcon() {
    const icon = document.createElement('span');
    icon.className = 'card-collapse-icon';
    icon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 8L10 12L14 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return icon;
  }

  function createDeckTile(block, week, lecture) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'deck-tile';
    tile.setAttribute('aria-label', `${lecture.title} (${lecture.cards.length} cards)`);

    const accent = deckColorFromCards(lecture.cards);
    tile.style.setProperty('--deck-color', accent);

    const stack = document.createElement('div');
    stack.className = 'deck-stack';
    stack.style.setProperty('--deck-color', accent);
    const preview = lecture.cards.slice(0, 5);
    stack.style.setProperty('--spread', preview.length > 0 ? (preview.length - 1) / 2 : 0);
    if (!preview.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'stack-card stack-card-empty';
      placeholder.style.setProperty('--index', '0');
      placeholder.textContent = 'No cards yet';
      stack.appendChild(placeholder);
    } else {
      preview.forEach((card, idx) => {
        const mini = document.createElement('div');
        mini.className = 'stack-card';
        mini.style.setProperty('--index', String(idx));
        mini.textContent = titleFromItem(card);
        stack.appendChild(mini);
      });
    }
    tile.appendChild(stack);

    const info = document.createElement('div');
    info.className = 'deck-info';

    const count = document.createElement('span');
    count.className = 'deck-count-pill';
    count.textContent = `${lecture.cards.length} card${lecture.cards.length === 1 ? '' : 's'}`;
    count.style.setProperty('--deck-color', accent);
    info.appendChild(count);

    const label = document.createElement('h3');
    label.className = 'deck-title';
    label.textContent = lecture.title;
    info.appendChild(label);

    const meta = document.createElement('div');
    meta.className = 'deck-meta';
    const pieces = [];
    if (block.title) pieces.push(block.title);
    if (week?.label) pieces.push(week.label);
    meta.textContent = pieces.join(' • ');
    info.appendChild(meta);

    tile.appendChild(info);

    const open = () => openDeck({ block, week, lecture });
    tile.addEventListener('click', open);
    tile.addEventListener('keydown', evt => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        open();
      }
    });

    return tile;
  }

  if (!blockSections.length) {
    const empty = document.createElement('div');
    empty.className = 'cards-empty';
    const heading = document.createElement('h3');
    heading.textContent = 'No cards match your filters yet';
    empty.appendChild(heading);
    const body = document.createElement('p');
    body.textContent = 'Assign lectures, blocks, or create new entries to populate this view.';
    empty.appendChild(body);
    catalog.appendChild(empty);
    return;
  }

  const blockFragment = document.createDocumentFragment();

  blockSections.forEach(block => {
    const section = document.createElement('section');
    section.className = 'card-block-section';
    if (block.accent) section.style.setProperty('--block-accent', block.accent);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'card-block-header';
    header.setAttribute('aria-expanded', 'true');

    const heading = document.createElement('div');
    heading.className = 'card-block-heading';

    const swatch = document.createElement('span');
    swatch.className = 'card-block-mark';
    heading.appendChild(swatch);

    const title = document.createElement('span');
    title.className = 'card-block-title';
    title.textContent = block.title;
    heading.appendChild(title);

    header.appendChild(heading);

    const stats = document.createElement('span');
    stats.className = 'card-block-stats';
    stats.textContent = `${block.lectureCount} lecture${block.lectureCount === 1 ? '' : 's'} • ${block.totalCards} card${block.totalCards === 1 ? '' : 's'}`;
    header.appendChild(stats);

    const icon = createCollapseIcon();
    header.appendChild(icon);

    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'card-block-body';

    const weekFragment = document.createDocumentFragment();

    block.weeks.forEach(week => {
      const weekSection = document.createElement('div');
      weekSection.className = 'card-week-section';

      const weekHeader = document.createElement('button');
      weekHeader.type = 'button';
      weekHeader.className = 'card-week-header';
      weekHeader.setAttribute('aria-expanded', 'true');

      const weekTitle = document.createElement('span');
      weekTitle.className = 'card-week-title';
      weekTitle.textContent = week.label;
      weekHeader.appendChild(weekTitle);

      const weekStats = document.createElement('span');
      weekStats.className = 'card-week-stats';
      weekStats.textContent = `${week.lectureCount} lecture${week.lectureCount === 1 ? '' : 's'} • ${week.totalCards} card${week.totalCards === 1 ? '' : 's'}`;
      weekHeader.appendChild(weekStats);

      weekHeader.appendChild(createCollapseIcon());

      const deckGrid = document.createElement('div');
      deckGrid.className = 'deck-grid';

      const deckFragment = document.createDocumentFragment();
      week.lectures.forEach(lecture => {
        deckFragment.appendChild(createDeckTile(block, week, lecture));
      });
      deckGrid.appendChild(deckFragment);

      weekSection.appendChild(weekHeader);
      weekSection.appendChild(deckGrid);

      weekFragment.appendChild(weekSection);

      weekHeader.addEventListener('click', () => {
        const collapsed = weekSection.classList.toggle('is-collapsed');
        weekHeader.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    });

    body.appendChild(weekFragment);

    section.appendChild(body);

    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    blockFragment.appendChild(section);
  });

  catalog.appendChild(blockFragment);
}
