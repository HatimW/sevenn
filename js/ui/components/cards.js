import { createItemCard } from './cardlist.js';
import { listBlocks } from '../../storage/storage.js';

/**
 * Render lecture-based decks combining all item types.
 * @param {HTMLElement} container
 * @param {import('../../types.js').Item[]} items
 * @param {Function} onChange
 */
export async function renderCards(container, items, onChange){
  container.innerHTML = '';

  const blocks = await listBlocks();
  const blockMap = new Map(blocks.map(b => [b.blockId, b]));

  const hierarchy = buildHierarchy(items, blockMap);

  const layout = document.createElement('div');
  layout.className = 'cards-layout';
  container.appendChild(layout);

  const tree = document.createElement('div');
  tree.className = 'cards-hierarchy';
  layout.appendChild(tree);

  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer hidden';
  layout.appendChild(viewer);

  if (!hierarchy.length){
    const empty = document.createElement('div');
    empty.className = 'cards-empty';
    empty.textContent = 'No cards match your filters yet.';
    tree.appendChild(empty);
    return;
  }

  hierarchy.forEach(block => {
    const section = document.createElement('section');
    section.className = 'cards-block';
    if (block.color) section.style.setProperty('--block-accent', block.color);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'cards-block-header';
    header.setAttribute('aria-expanded', 'true');

    const heading = document.createElement('div');
    heading.className = 'cards-block-heading';
    const title = document.createElement('h3');
    title.textContent = block.title;
    heading.appendChild(title);
    if (block.subtitle){
      const subtitle = document.createElement('span');
      subtitle.className = 'cards-block-subtitle';
      subtitle.textContent = block.subtitle;
      heading.appendChild(subtitle);
    }
    header.appendChild(heading);

    const count = document.createElement('span');
    count.className = 'cards-count';
    count.textContent = `${block.total} card${block.total === 1 ? '' : 's'}`;
    header.appendChild(count);

    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'cards-block-content';
    section.appendChild(body);

    header.addEventListener('click', () => {
      const expanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      body.classList.toggle('collapsed', expanded);
    });

    if (!block.weeks.length){
      const emptyWeek = document.createElement('div');
      emptyWeek.className = 'cards-week-empty';
      emptyWeek.textContent = 'No lectures assigned yet.';
      body.appendChild(emptyWeek);
    } else {
      block.weeks.forEach(week => {
        const weekSection = document.createElement('section');
        weekSection.className = 'cards-week';

        const weekHeader = document.createElement('button');
        weekHeader.type = 'button';
        weekHeader.className = 'cards-week-header';
        weekHeader.setAttribute('aria-expanded', 'true');

        const weekTitle = document.createElement('span');
        weekTitle.className = 'cards-week-title';
        weekTitle.textContent = week.title;
        weekHeader.appendChild(weekTitle);

        const weekMeta = document.createElement('span');
        weekMeta.className = 'cards-count';
        weekMeta.textContent = `${week.total} card${week.total === 1 ? '' : 's'}`;
        weekHeader.appendChild(weekMeta);

        weekSection.appendChild(weekHeader);

        const lecturesWrap = document.createElement('div');
        lecturesWrap.className = 'cards-week-content';
        weekSection.appendChild(lecturesWrap);

        weekHeader.addEventListener('click', () => {
          const expanded = weekHeader.getAttribute('aria-expanded') === 'true';
          weekHeader.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          lecturesWrap.classList.toggle('collapsed', expanded);
        });

        if (!week.lectures.length){
          const emptyLect = document.createElement('div');
          emptyLect.className = 'cards-week-empty';
          emptyLect.textContent = 'No lectures for this week yet.';
          lecturesWrap.appendChild(emptyLect);
        } else {
          const grid = document.createElement('div');
          grid.className = 'cards-lecture-grid';
          lecturesWrap.appendChild(grid);

          week.lectures.forEach(lecture => {
            const deck = createLectureDeck(lecture);
            deck.addEventListener('click', () => openDeck(lecture));
            grid.appendChild(deck);
          });
        }

        body.appendChild(weekSection);
      });
    }

    tree.appendChild(section);
  });

  function openDeck(lecture){
    tree.classList.add('hidden');
    viewer.classList.remove('hidden');
    viewer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'deck-viewer-header';
    viewer.appendChild(header);

    const crumb = document.createElement('div');
    crumb.className = 'deck-viewer-crumb';
    const crumbs = [lecture.blockTitle, lecture.weekTitle].filter(Boolean);
    crumb.textContent = crumbs.join(' • ');
    header.appendChild(crumb);

    const title = document.createElement('h2');
    title.textContent = lecture.title;
    header.appendChild(title);

    const headerMeta = document.createElement('span');
    headerMeta.className = 'deck-viewer-count';
    headerMeta.textContent = `${lecture.items.length} card${lecture.items.length === 1 ? '' : 's'}`;
    header.appendChild(headerMeta);

    const cardHolder = document.createElement('div');
    cardHolder.className = 'deck-viewer-card';
    viewer.appendChild(cardHolder);

    const controls = document.createElement('div');
    controls.className = 'deck-viewer-controls';
    viewer.appendChild(controls);

    const prev = document.createElement('button');
    prev.className = 'deck-prev';
    prev.setAttribute('aria-label', 'Previous card');
    prev.innerHTML = '&#9664;';
    controls.appendChild(prev);

    const next = document.createElement('button');
    next.className = 'deck-next';
    next.setAttribute('aria-label', 'Next card');
    next.innerHTML = '&#9654;';
    controls.appendChild(next);

    const toggle = document.createElement('button');
    toggle.className = 'deck-related-toggle btn subtle';
    toggle.textContent = 'Show related';
    viewer.appendChild(toggle);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related hidden';
    viewer.appendChild(relatedWrap);

    const close = document.createElement('button');
    close.className = 'deck-close btn ghost';
    close.textContent = 'Back to decks';
    viewer.appendChild(close);

    let idx = 0;
    let showRelated = false;

    function renderCard(){
      cardHolder.innerHTML = '';
      cardHolder.appendChild(createItemCard(lecture.items[idx], onChange));
      renderRelated();
    }

    function renderRelated(){
      relatedWrap.innerHTML = '';
      if (!showRelated) return;
      const current = lecture.items[idx];
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
      idx = (idx - 1 + lecture.items.length) % lecture.items.length;
      renderCard();
    });

    next.addEventListener('click', () => {
      idx = (idx + 1) % lecture.items.length;
      renderCard();
    });

    toggle.addEventListener('click', () => {
      showRelated = !showRelated;
      toggle.textContent = showRelated ? 'Hide related' : 'Show related';
      relatedWrap.classList.toggle('hidden', !showRelated);
      renderRelated();
    });

    close.addEventListener('click', () => {
      document.removeEventListener('keydown', keyHandler);
      viewer.classList.add('hidden');
      viewer.innerHTML = '';
      tree.classList.remove('hidden');
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

function buildHierarchy(items, blockMap){
  const blocks = new Map();

  function ensureBlock(blockId, title, options = {}){
    if (!blocks.has(blockId)) {
      blocks.set(blockId, {
        key: blockId,
        title,
        subtitle: options.subtitle || '',
        color: options.color || '',
        order: typeof options.order === 'number' ? options.order : Number.POSITIVE_INFINITY,
        weeks: new Map(),
        ids: new Set()
      });
    }
    return blocks.get(blockId);
  }

  function ensureWeek(block, weekKey, title, order){
    if (!block.weeks.has(weekKey)) {
      block.weeks.set(weekKey, {
        key: weekKey,
        title,
        order,
        lectures: new Map(),
        ids: new Set()
      });
    }
    return block.weeks.get(weekKey);
  }

  function ensureLecture(week, lectureKey, lectureTitle, meta){
    if (!week.lectures.has(lectureKey)) {
      week.lectures.set(lectureKey, {
        key: lectureKey,
        title: lectureTitle,
        blockTitle: meta.blockTitle,
        weekTitle: meta.weekTitle,
        order: meta.order,
        preview: meta.preview,
        items: []
      });
    }
    return week.lectures.get(lectureKey);
  }

  const fallbackBlockId = '__unassigned';

  items.forEach(item => {
    let placed = false;
    if (item.lectures && item.lectures.length){
      item.lectures.forEach(ref => {
        const blockDef = blockMap.get(ref.blockId);
        const weeksLabel = typeof blockDef?.weeks === 'number'
          ? `${blockDef.weeks} week${blockDef.weeks === 1 ? '' : 's'}`
          : '';
        const block = ensureBlock(
          ref.blockId || fallbackBlockId,
          blockDef?.title || ref.blockId || 'Unassigned',
          {
            subtitle: weeksLabel,
            color: blockDef?.color,
            order: blockDef?.order
          }
        );
        const weekLabel = typeof ref.week === 'number' ? `Week ${ref.week}` : 'General';
        const week = ensureWeek(
          block,
          typeof ref.week === 'number' ? `week-${ref.week}` : 'general',
          weekLabel,
          typeof ref.week === 'number' ? ref.week : Number.POSITIVE_INFINITY
        );

        const lectureDef = blockDef?.lectures?.find(l => l.id === ref.id);
        const lectureTitle = lectureDef?.name || ref.name || `Lecture ${ref.id ?? ''}`.trim() || 'Lecture';
        const lectureKey = `${ref.blockId || 'blockless'}|${ref.id ?? lectureTitle}`;
        const lecture = ensureLecture(week, lectureKey, lectureTitle, {
          blockTitle: block.title,
          weekTitle: week.title,
          order: typeof lectureDef?.week === 'number'
            ? lectureDef.week * 1000 + (lectureDef.id ?? 0)
            : (typeof ref.week === 'number' ? ref.week : Number.POSITIVE_INFINITY),
          preview: lectureDef?.name || lectureTitle
        });
        lecture.items.push(item);
        week.ids.add(item.id);
        block.ids.add(item.id);
        placed = true;
      });
    }

    if (!placed){
      const blockIds = item.blocks && item.blocks.length ? item.blocks : [fallbackBlockId];
      const weeks = item.weeks && item.weeks.length ? item.weeks : [null];
      blockIds.forEach(blockId => {
        const blockDef = blockMap.get(blockId);
        const weeksLabel = typeof blockDef?.weeks === 'number'
          ? `${blockDef.weeks} week${blockDef.weeks === 1 ? '' : 's'}`
          : '';
        const block = ensureBlock(
          blockDef?.blockId || blockId || fallbackBlockId,
          blockDef?.title || blockId || 'Unassigned',
          {
            subtitle: weeksLabel,
            color: blockDef?.color,
            order: blockDef?.order
          }
        );
        weeks.forEach(weekNum => {
          const isNumber = typeof weekNum === 'number' && Number.isFinite(weekNum);
          const week = ensureWeek(
            block,
            isNumber ? `week-${weekNum}` : 'general',
            isNumber ? `Week ${weekNum}` : 'General',
            isNumber ? weekNum : Number.POSITIVE_INFINITY
          );
          const lectureKey = `${block.key}|week-${weekNum ?? 'general'}`;
          const lecture = ensureLecture(week, lectureKey, 'General deck', {
            blockTitle: block.title,
            weekTitle: week.title,
            order: week.order,
            preview: item.name || item.concept || 'Card'
          });
          lecture.items.push(item);
          week.ids.add(item.id);
          block.ids.add(item.id);
        });
      });
    }
  });

  const blockList = Array.from(blocks.values()).map(block => {
    const total = block.ids.size;
    const weekList = Array.from(block.weeks.values())
      .map(week => {
        const weekTotal = week.ids.size;
        const lectureList = Array.from(week.lectures.values())
          .sort((a, b) => {
            const orderA = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY;
            const orderB = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY;
            if (orderA !== orderB) return orderA - orderB;
            return a.title.localeCompare(b.title);
          });
        const { ids, ...restWeek } = week;
        return { ...restWeek, total: weekTotal, lectures: lectureList };
      })
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title);
      });
    const { ids, ...restBlock } = block;
    return { ...restBlock, total, weeks: weekList };
  });

  return blockList.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });
}

function createLectureDeck(lecture){
  const deck = document.createElement('button');
  deck.type = 'button';
  deck.className = 'cards-deck';

  const stack = document.createElement('div');
  stack.className = 'cards-deck-stack';
  deck.appendChild(stack);

  const layers = Math.max(3, Math.min(lecture.items.length, 4));
  for (let i = 0; i < layers; i++) {
    const layer = document.createElement('div');
    layer.className = 'cards-deck-layer';
    layer.style.setProperty('--layer', `${i}`);
    if (i === 0) {
      const label = document.createElement('div');
      label.className = 'cards-deck-layer-label';
      label.textContent = lecture.items[0]?.name || lecture.items[0]?.concept || 'Card';
      layer.appendChild(label);
    }
    stack.appendChild(layer);
  }

  const info = document.createElement('div');
  info.className = 'cards-deck-info';

  const title = document.createElement('h4');
  title.className = 'cards-deck-title';
  title.textContent = lecture.title;
  info.appendChild(title);

  if (lecture.weekTitle) {
    const meta = document.createElement('div');
    meta.className = 'cards-deck-meta';
    meta.textContent = lecture.weekTitle;
    info.appendChild(meta);
  }

  const count = document.createElement('div');
  count.className = 'cards-deck-count';
  count.textContent = `${lecture.items.length} card${lecture.items.length === 1 ? '' : 's'}`;
  info.appendChild(count);

  deck.appendChild(info);
  return deck;
}
