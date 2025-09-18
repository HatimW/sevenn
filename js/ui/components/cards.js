import { listBlocks } from '../../storage/storage.js';
import { createItemCard } from './cardlist.js';

const UNASSIGNED_KEY = '__unassigned';

/**
 * @param {import('../../types.js').Item} item
 */
function titleOf(item){
  return item.name || item.concept || 'Untitled card';
}

function createStack(cards, accent){
  const stack = document.createElement('div');
  stack.className = 'card-deck-stack';
  const preview = cards.slice(0, 5);
  stack.style.setProperty('--count', String(preview.length || 1));
  if (accent) stack.style.setProperty('--stack-accent', accent);
  preview.forEach((card, index) => {
    const tile = document.createElement('div');
    tile.className = 'card-stack-card';
    tile.textContent = titleOf(card);
    tile.title = titleOf(card);
    tile.style.setProperty('--index', String(index));
    const offset = index - (preview.length - 1) / 2;
    tile.style.setProperty('--offset', String(offset));
    stack.appendChild(tile);
  });
  return stack;
}

/**
 * Render lecture-based decks combining all item types with grouping by block and week.
 * @param {HTMLElement} container
 * @param {import('../../types.js').Item[]} items
 * @param {Function} onChange
 */
export async function renderCards(container, items, onChange){
  container.innerHTML = '';

  const blocks = await listBlocks();
  const blockIndex = new Map(blocks.map((block, idx) => [block.blockId, { block, order: idx }]));

  const blockRecords = new Map();

  function ensureBlock(blockId){
    const key = blockId || UNASSIGNED_KEY;
    if (!blockRecords.has(key)) {
      const def = blockId ? blockIndex.get(blockId)?.block : null;
      const order = blockId ? (blockIndex.get(blockId)?.order ?? Number.MAX_SAFE_INTEGER - 10) : Number.MAX_SAFE_INTEGER;
      const title = def?.title || (blockId || 'Unassigned');
      blockRecords.set(key, {
        key,
        blockId: blockId || null,
        title,
        color: def?.color || null,
        order,
        weeks: new Map(),
        itemIds: new Set()
      });
    }
    return blockRecords.get(key);
  }

  function ensureWeek(blockRec, weekValue, options = {}){
    const key = typeof weekValue === 'number' ? `week-${weekValue}` : options.key || 'general';
    if (!blockRec.weeks.has(key)) {
      const label = options.label || (typeof weekValue === 'number' ? `Week ${weekValue}` : 'General');
      const order = typeof weekValue === 'number' ? weekValue : options.order ?? Number.MAX_SAFE_INTEGER - 5;
      blockRec.weeks.set(key, {
        key,
        week: typeof weekValue === 'number' ? weekValue : null,
        label,
        order,
        lectures: new Map(),
        itemIds: new Set()
      });
    }
    return blockRec.weeks.get(key);
  }

  function ensureLecture(weekRec, lectureId, info){
    if (!weekRec.lectures.has(lectureId)) {
      weekRec.lectures.set(lectureId, {
        id: lectureId,
        title: info.name || info.title || 'Lecture',
        subtitle: info.subtitle || '',
        order: info.order ?? Number.MAX_SAFE_INTEGER,
        accent: info.accent || null,
        items: [],
        itemIds: new Set(),
        meta: info.meta || {}
      });
    }
    return weekRec.lectures.get(lectureId);
  }

  function registerItem(blockRec, weekRec, lectureRec, item){
    if (!lectureRec.itemIds.has(item.id)) {
      lectureRec.itemIds.add(item.id);
      lectureRec.items.push(item);
    }
    if (!weekRec.itemIds.has(item.id)) weekRec.itemIds.add(item.id);
    if (!blockRec.itemIds.has(item.id)) blockRec.itemIds.add(item.id);
  }

  function addToLecture(blockId, weekValue, lectureInfo, item){
    const blockRec = ensureBlock(blockId);
    const weekRec = ensureWeek(blockRec, weekValue, lectureInfo.weekOptions || {});
    const lectureRec = ensureLecture(weekRec, lectureInfo.id, lectureInfo);
    registerItem(blockRec, weekRec, lectureRec, item);
  }

  items.forEach(item => {
    let handled = false;
    if (Array.isArray(item.lectures) && item.lectures.length) {
      item.lectures.forEach(lecture => {
        const infoBlock = lecture.blockId || null;
        const blockDef = infoBlock ? blockIndex.get(infoBlock)?.block : null;
        const blockColor = blockDef?.color || null;
        const blockLectures = blockDef?.lectures || [];
        const lectureOrder = blockLectures.findIndex(l => l.id === lecture.id);
        addToLecture(infoBlock, lecture.week, {
          id: `lecture-${infoBlock || 'na'}-${lecture.id}`,
          name: lecture.name || `Lecture ${lecture.id}`,
          subtitle: lecture.week != null ? `Week ${lecture.week}` : '',
          order: lectureOrder >= 0 ? lectureOrder : Number.MAX_SAFE_INTEGER - 2,
          accent: blockColor,
          meta: {
            blockTitle: blockDef?.title || infoBlock || 'Unassigned',
            weekLabel: lecture.week != null ? `Week ${lecture.week}` : 'General',
            lectureName: lecture.name || `Lecture ${lecture.id}`
          }
        }, item);
        handled = true;
      });
    }

    if (!handled && Array.isArray(item.blocks) && item.blocks.length) {
      const weeks = Array.isArray(item.weeks) && item.weeks.length ? item.weeks : [null];
      item.blocks.forEach(blockId => {
        const def = blockIndex.get(blockId)?.block;
        const accent = def?.color || null;
        weeks.forEach(weekValue => {
          const weekOptions = {
            label: typeof weekValue === 'number' ? `Week ${weekValue}` : 'General',
            order: typeof weekValue === 'number' ? weekValue : Number.MAX_SAFE_INTEGER - 4,
            key: typeof weekValue === 'number' ? `week-${weekValue}` : 'general'
          };
          addToLecture(blockId, weekValue, {
            id: `block-${blockId}-${weekValue ?? 'general'}`,
            name: typeof weekValue === 'number' ? 'Week Highlights' : 'Block Highlights',
            subtitle: def?.title || blockId,
            order: Number.MAX_SAFE_INTEGER - 3,
            accent,
            weekOptions,
            meta: {
              blockTitle: def?.title || blockId,
              weekLabel: weekOptions.label,
              lectureName: typeof weekValue === 'number' ? `${def?.title || blockId} • Week ${weekValue}` : `${def?.title || blockId} Highlights`
            }
          }, item);
        });
      });
      handled = true;
    }

    if (!handled) {
      addToLecture(null, null, {
        id: 'unassigned',
        name: 'Unassigned Cards',
        subtitle: '',
        order: Number.MAX_SAFE_INTEGER - 1,
        meta: {
          blockTitle: 'Unassigned',
          weekLabel: 'General',
          lectureName: 'Unassigned Cards'
        }
      }, item);
    }
  });

  const blockEntries = Array.from(blockRecords.values())
    .filter(block => block.itemIds.size)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  if (!blockEntries.length) {
    const empty = document.createElement('div');
    empty.className = 'cards-empty';
    empty.textContent = 'No cards match your filters yet. Add lectures or remove filters to see decks.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'cards-browser';
  container.appendChild(list);

  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer hidden';
  container.appendChild(viewer);

  function openDeck(blockRec, weekRec, lectureRec){
    list.classList.add('hidden');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'deck-viewer-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'deck-viewer-title';
    const heading = document.createElement('h2');
    heading.textContent = lectureRec.title;
    titleWrap.appendChild(heading);

    const subtitle = document.createElement('div');
    subtitle.className = 'deck-viewer-meta';
    const trail = [lectureRec.meta?.blockTitle || blockRec.title, lectureRec.meta?.weekLabel || weekRec.label]
      .filter(Boolean)
      .join(' • ');
    subtitle.textContent = `${trail}${trail ? ' • ' : ''}${lectureRec.items.length} cards`;
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);

    const controls = document.createElement('div');
    controls.className = 'deck-viewer-controls';

    const counter = document.createElement('span');
    counter.className = 'deck-viewer-counter';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'deck-nav-btn deck-nav-prev';
    prev.innerHTML = '<span aria-hidden="true">‹</span><span class="sr-only">Previous card</span>';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'deck-nav-btn deck-nav-next';
    next.innerHTML = '<span aria-hidden="true">›</span><span class="sr-only">Next card</span>';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'deck-related-toggle';
    toggle.textContent = 'Related cards';
    toggle.setAttribute('aria-pressed', 'false');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'deck-close';
    close.textContent = 'Back to decks';

    controls.appendChild(prev);
    controls.appendChild(counter);
    controls.appendChild(next);
    controls.appendChild(toggle);
    controls.appendChild(close);
    header.appendChild(controls);
    viewer.appendChild(header);

    const cardHolder = document.createElement('div');
    cardHolder.className = 'deck-card';
    viewer.appendChild(cardHolder);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related hidden';
    viewer.appendChild(relatedWrap);

    let idx = 0;
    let showRelated = false;

    function renderRelated(current){
      relatedWrap.innerHTML = '';
      if (!showRelated) return;
      (current.links || []).forEach(link => {
        const item = items.find(it => it.id === link.id);
        if (item) {
          const el = createItemCard(item, onChange);
          el.classList.add('related-card');
          relatedWrap.appendChild(el);
          requestAnimationFrame(() => el.classList.add('visible'));
        }
      });
    }

    function renderCard(){
      const current = lectureRec.items[idx];
      counter.textContent = `${idx + 1} / ${lectureRec.items.length}`;
      cardHolder.innerHTML = '';
      cardHolder.appendChild(createItemCard(current, onChange));
      renderRelated(current);
    }

    prev.addEventListener('click', () => {
      idx = (idx - 1 + lectureRec.items.length) % lectureRec.items.length;
      renderCard();
    });
    next.addEventListener('click', () => {
      idx = (idx + 1) % lectureRec.items.length;
      renderCard();
    });

    toggle.addEventListener('click', () => {
      showRelated = !showRelated;
      toggle.classList.toggle('active', showRelated);
      relatedWrap.classList.toggle('hidden', !showRelated);
      toggle.textContent = showRelated ? 'Hide related' : 'Related cards';
      toggle.setAttribute('aria-pressed', showRelated.toString());
      renderRelated(lectureRec.items[idx]);
    });

    function closeViewer(){
      document.removeEventListener('keydown', keyHandler);
      viewer.classList.add('hidden');
      viewer.innerHTML = '';
      list.classList.remove('hidden');
    }

    close.addEventListener('click', closeViewer);

    function keyHandler(e){
      if (e.key === 'ArrowLeft') prev.click();
      if (e.key === 'ArrowRight') next.click();
      if (e.key === 'Escape') closeViewer();
    }
    document.addEventListener('keydown', keyHandler);

    renderCard();
  }

  function createDeck(blockRec, weekRec, lectureRec){
    const deck = document.createElement('div');
    deck.className = 'card-deck';
    deck.setAttribute('role', 'button');
    deck.setAttribute('tabindex', '0');
    deck.setAttribute('aria-label', `${lectureRec.title} – ${lectureRec.items.length} cards`);
    if (lectureRec.accent) deck.style.setProperty('--deck-accent', lectureRec.accent);

    const stack = createStack(lectureRec.items, lectureRec.accent);
    deck.appendChild(stack);

    const info = document.createElement('div');
    info.className = 'card-deck-info';

    const title = document.createElement('h3');
    title.className = 'card-deck-title';
    title.textContent = lectureRec.title;
    info.appendChild(title);

    if (lectureRec.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.className = 'card-deck-subtitle';
      subtitle.textContent = lectureRec.subtitle;
      info.appendChild(subtitle);
    }

    const meta = document.createElement('div');
    meta.className = 'card-deck-meta';
    const bits = [];
    if (weekRec.label) bits.push(weekRec.label);
    bits.push(`${lectureRec.items.length} ${lectureRec.items.length === 1 ? 'card' : 'cards'}`);
    meta.textContent = bits.join(' • ');
    info.appendChild(meta);

    deck.appendChild(info);

    const activate = () => openDeck(blockRec, weekRec, lectureRec);
    deck.addEventListener('click', activate);
    deck.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });

    return deck;
  }

  blockEntries.forEach(blockRec => {
    const blockSection = document.createElement('section');
    blockSection.className = 'card-block';
    if (blockRec.color) blockSection.style.setProperty('--block-accent', blockRec.color);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'card-block-header';
    header.setAttribute('aria-expanded', 'true');

    const title = document.createElement('div');
    title.className = 'card-block-title';
    title.textContent = blockRec.title;
    header.appendChild(title);

    if (blockRec.blockId) {
      const badge = document.createElement('span');
      badge.className = 'card-block-badge';
      badge.textContent = blockRec.blockId;
      if (blockRec.color) badge.style.setProperty('--badge-accent', blockRec.color);
      header.appendChild(badge);
    }

    const count = document.createElement('span');
    count.className = 'card-block-count';
    count.textContent = `${blockRec.itemIds.size} ${blockRec.itemIds.size === 1 ? 'card' : 'cards'}`;
    header.appendChild(count);

    header.addEventListener('click', () => {
      const expanded = blockSection.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', (!expanded).toString());
    });
    blockSection.appendChild(header);

    const body = document.createElement('div');
    body.className = 'card-block-body';
    blockSection.appendChild(body);

    const weekEntries = Array.from(blockRec.weeks.values())
      .filter(week => week.itemIds.size)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

    weekEntries.forEach(weekRec => {
      const weekSection = document.createElement('section');
      weekSection.className = 'card-week';

      const weekHeader = document.createElement('button');
      weekHeader.type = 'button';
      weekHeader.className = 'card-week-header';
      weekHeader.setAttribute('aria-expanded', 'true');

      const weekTitle = document.createElement('div');
      weekTitle.className = 'card-week-title';
      weekTitle.textContent = weekRec.label;
      weekHeader.appendChild(weekTitle);

      const weekCount = document.createElement('span');
      weekCount.className = 'card-week-count';
      const deckCount = weekRec.lectures.size;
      weekCount.textContent = `${weekRec.itemIds.size} ${weekRec.itemIds.size === 1 ? 'card' : 'cards'} • ${deckCount} ${deckCount === 1 ? 'deck' : 'decks'}`;
      weekHeader.appendChild(weekCount);

      weekHeader.addEventListener('click', () => {
        const collapsed = weekSection.classList.toggle('collapsed');
        weekHeader.setAttribute('aria-expanded', (!collapsed).toString());
      });

      weekSection.appendChild(weekHeader);

      const weekBody = document.createElement('div');
      weekBody.className = 'card-week-body';
      weekSection.appendChild(weekBody);

      const grid = document.createElement('div');
      grid.className = 'card-deck-grid';
      weekBody.appendChild(grid);

      const lectureEntries = Array.from(weekRec.lectures.values())
        .filter(lecture => lecture.items.length)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

      lectureEntries.forEach(lectureRec => {
        grid.appendChild(createDeck(blockRec, weekRec, lectureRec));
      });

      body.appendChild(weekSection);
    });

    list.appendChild(blockSection);
  });
}
