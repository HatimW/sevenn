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
  const groups = buildCardGroups(items, blockMap);

  const collection = document.createElement('div');
  collection.className = 'cards-collection';
  container.appendChild(collection);

  const viewer = createDeckViewer();
  container.appendChild(viewer.element);

  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'cards-empty';
    empty.textContent = 'No cards match your filters just yet.';
    collection.appendChild(empty);
    return;
  }

  groups.forEach(group => {
    const blockSection = document.createElement('details');
    blockSection.className = 'cards-block';
    blockSection.open = true;

    const summary = document.createElement('summary');
    summary.className = 'cards-block-header';
    const accent = document.createElement('span');
    accent.className = 'cards-block-accent';
    accent.style.setProperty('--accent', group.color);
    summary.appendChild(accent);

    const text = document.createElement('div');
    text.className = 'cards-block-text';
    const title = document.createElement('h3');
    title.textContent = group.title;
    text.appendChild(title);
    const meta = document.createElement('span');
    meta.className = 'cards-block-meta';
    meta.textContent = `${group.count} card${group.count === 1 ? '' : 's'}`;
    text.appendChild(meta);
    summary.appendChild(text);

    blockSection.appendChild(summary);

    const weekContainer = document.createElement('div');
    weekContainer.className = 'cards-week-container';

    group.weeks.forEach(week => {
      const weekSection = document.createElement('details');
      weekSection.className = 'cards-week';
      weekSection.open = true;

      const weekSummary = document.createElement('summary');
      weekSummary.className = 'cards-week-header';
      weekSummary.textContent = `${week.label} • ${week.count} card${week.count === 1 ? '' : 's'}`;
      weekSection.appendChild(weekSummary);

      const deckGrid = document.createElement('div');
      deckGrid.className = 'cards-deck-grid';

      week.lectures.forEach(lecture => {
        deckGrid.appendChild(createDeckTile({
          title: lecture.label,
          meta: lecture.meta,
          cards: lecture.cards,
          onOpen: viewer.open,
          onPreviewStart: viewer.startPreview,
          onPreviewStop: viewer.stopPreview,
          allItems: items,
          onChange
        }));
      });

      if (week.loose.length) {
        const overviewTitle = week.label === 'Unscheduled' ? 'Unscheduled cards' : `${week.label} overview`;
        deckGrid.appendChild(createDeckTile({
          title: overviewTitle,
          meta: week.meta,
          cards: week.loose,
          onOpen: viewer.open,
          onPreviewStart: viewer.startPreview,
          onPreviewStop: viewer.stopPreview,
          allItems: items,
          onChange
        }));
      }

      weekSection.appendChild(deckGrid);
      weekContainer.appendChild(weekSection);
    });

    if (!group.weeks.length) {
      const noWeeks = document.createElement('div');
      noWeeks.className = 'cards-empty';
      noWeeks.textContent = 'No scheduling information yet.';
      weekContainer.appendChild(noWeeks);
    }

    blockSection.appendChild(weekContainer);
    collection.appendChild(blockSection);
  });

  function createDeckTile({ title, meta, cards, onOpen, onPreviewStart, onPreviewStop, allItems, onChange }) {
    const deck = document.createElement('button');
    deck.type = 'button';
    deck.className = 'cards-deck';

    const heading = document.createElement('div');
    heading.className = 'cards-deck-title';
    heading.textContent = title;
    deck.appendChild(heading);

    if (meta) {
      const sub = document.createElement('div');
      sub.className = 'cards-deck-meta';
      sub.textContent = meta;
      deck.appendChild(sub);
    }

    let previewTimer;

    deck.addEventListener('click', () => {
      onPreviewStop(deck);
      onOpen(title, cards, allItems, onChange);
    });

    deck.addEventListener('mouseenter', () => {
      previewTimer = setTimeout(() => onPreviewStart(deck, cards), 1600);
    });

    deck.addEventListener('mouseleave', () => {
      clearTimeout(previewTimer);
      onPreviewStop(deck);
    });

    return deck;
  }
}

function buildCardGroups(items, blockMap) {
  const groups = new Map();

  const ensureBlock = (blockId) => {
    const key = blockId || '__unassigned';
    if (!groups.has(key)) {
      const block = blockMap.get(blockId);
      groups.set(key, {
        id: key,
        title: block?.title || block?.blockId || (key === '__unassigned' ? 'Unassigned' : key),
        color: block?.color || 'rgba(56, 189, 248, 0.65)',
        order: block?.order ?? (key === '__unassigned' ? Number.POSITIVE_INFINITY : 0),
        weeks: new Map(),
        itemIds: new Set(),
      });
    }
    return groups.get(key);
  };

  const ensureWeek = (blockGroup, weekKey, weekValue) => {
    if (!blockGroup.weeks.has(weekKey)) {
      blockGroup.weeks.set(weekKey, {
        key: weekKey,
        order: typeof weekValue === 'number' ? weekValue : Number.POSITIVE_INFINITY,
        label: typeof weekValue === 'number' ? `Week ${weekValue}` : 'Unscheduled',
        lectures: new Map(),
        loose: [],
        itemIds: new Set(),
      });
    }
    return blockGroup.weeks.get(weekKey);
  };

  const ensureLecture = (weekGroup, lectureKey, attachment) => {
    if (!weekGroup.lectures.has(lectureKey)) {
      weekGroup.lectures.set(lectureKey, {
        key: lectureKey,
        order: attachment.lectureId ?? Number.POSITIVE_INFINITY,
        label: attachment.lectureName || (attachment.lectureId != null ? `Lecture ${attachment.lectureId}` : 'Lecture'),
        meta: attachment.meta,
        cards: [],
        itemIds: new Set(),
      });
    }
    return weekGroup.lectures.get(lectureKey);
  };

  items.forEach(item => {
    const attachments = extractAttachments(item);
    const seen = new Set();

    attachments.forEach(att => {
      const blockId = att.blockId || '__unassigned';
      const blockGroup = ensureBlock(blockId);
      const weekValue = typeof att.week === 'number' ? att.week : null;
      const weekKey = weekValue === null ? '__unscheduled' : String(weekValue);
      const lectureKey = att.lectureId != null ? `${blockId}|${att.lectureId}` : null;
      const dedupeKey = `${blockId}|${weekKey}|${lectureKey ?? 'week'}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const weekGroup = ensureWeek(blockGroup, weekKey, weekValue);
      blockGroup.itemIds.add(item.id);
      weekGroup.itemIds.add(item.id);

      if (lectureKey) {
        const lectureGroup = ensureLecture(weekGroup, lectureKey, att);
        lectureGroup.cards.push(item);
        lectureGroup.itemIds.add(item.id);
      } else {
        weekGroup.loose.push(item);
      }
    });
  });

  return Array.from(groups.values())
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map(group => ({
      ...group,
      count: group.itemIds.size,
      weeks: Array.from(group.weeks.values())
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
        .map(week => ({
          ...week,
          count: week.itemIds.size,
          meta: week.label === 'Unscheduled'
            ? 'Cards without a planned week'
            : `Cards spanning ${week.label.toLowerCase()}`,
          lectures: Array.from(week.lectures.values())
            .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
            .map(lecture => ({
              ...lecture,
              meta: lecture.meta || `Includes ${lecture.itemIds.size} card${lecture.itemIds.size === 1 ? '' : 's'}`,
            })),
        })),
    }));
}

function extractAttachments(item) {
  const attachments = [];
  if (Array.isArray(item.lectures) && item.lectures.length) {
    item.lectures.forEach(lecture => {
      const parts = [];
      if (typeof lecture.week === 'number') parts.push(`Week ${lecture.week}`);
      if (lecture.name) parts.push(lecture.name);
      attachments.push({
        blockId: lecture.blockId,
        week: lecture.week,
        lectureId: lecture.id,
        lectureName: lecture.name,
        meta: parts.join(' • '),
      });
    });
  } else if (Array.isArray(item.blocks) && item.blocks.length) {
    const weeks = Array.isArray(item.weeks) && item.weeks.length ? item.weeks : [null];
    item.blocks.forEach(blockId => {
      weeks.forEach(week => {
        const numericWeek = typeof week === 'number' ? week : (week != null ? Number(week) : null);
        attachments.push({ blockId, week: Number.isFinite(numericWeek) ? numericWeek : null });
      });
    });
  } else {
    attachments.push({ blockId: '__unassigned', week: null });
  }
  return attachments;
}

function createDeckViewer(){
  const viewer = document.createElement('div');
  viewer.className = 'deck-viewer hidden';

  let teardown = null;

  function open(title, cards, allItems, onChange){
    if (typeof teardown === 'function') teardown();
    viewer.classList.remove('hidden');
    viewer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cards-viewer-header';
    const heading = document.createElement('h2');
    heading.textContent = title;
    header.appendChild(heading);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'deck-close btn secondary';
    closeBtn.textContent = 'Close';
    header.appendChild(closeBtn);
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
    toggle.className = 'deck-related-toggle btn secondary';
    toggle.textContent = 'Show related';
    viewer.appendChild(toggle);

    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related hidden';
    viewer.appendChild(relatedWrap);

    let idx = 0;
    let showRelated = false;

    const renderCard = () => {
      cardHolder.innerHTML = '';
      cardHolder.appendChild(createItemCard(cards[idx], onChange));
      renderRelated();
    };

    const renderRelated = () => {
      relatedWrap.innerHTML = '';
      if (!showRelated) return;
      const current = cards[idx];
      (current.links || []).forEach(link => {
        const linked = allItems.find(it => it.id === link.id);
        if (!linked) return;
        const el = createItemCard(linked, onChange);
        el.classList.add('related-card');
        relatedWrap.appendChild(el);
        requestAnimationFrame(() => el.classList.add('visible'));
      });
    };

    const handlePrev = () => {
      idx = (idx - 1 + cards.length) % cards.length;
      renderCard();
    };

    const handleNext = () => {
      idx = (idx + 1) % cards.length;
      renderCard();
    };

    prev.addEventListener('click', handlePrev);
    next.addEventListener('click', handleNext);

    toggle.addEventListener('click', () => {
      showRelated = !showRelated;
      toggle.textContent = showRelated ? 'Hide related' : 'Show related';
      relatedWrap.classList.toggle('hidden', !showRelated);
      renderRelated();
    });

    const handleClose = () => {
      viewer.classList.add('hidden');
      viewer.innerHTML = '';
      document.removeEventListener('keydown', handleKeys);
      teardown = null;
    };

    const handleKeys = (event) => {
      if (event.key === 'ArrowLeft') handlePrev();
      if (event.key === 'ArrowRight') handleNext();
      if (event.key === 'Escape') handleClose();
    };

    closeBtn.addEventListener('click', handleClose);
    document.addEventListener('keydown', handleKeys);

    teardown = handleClose;
    renderCard();
  }

  function close(){
    if (typeof teardown === 'function') teardown();
  }

  function startPreview(deckEl, cards){
    if (deckEl._preview) return;
    deckEl.classList.add('previewing');
    const fan = document.createElement('div');
    fan.className = 'cards-deck-preview';
    deckEl.appendChild(fan);
    const spread = 16;
    const show = cards.slice(0, 4);
    const offset = (show.length - 1) * spread / 2;
    show.forEach((card, index) => {
      const mini = document.createElement('div');
      mini.className = 'cards-preview-card';
      mini.textContent = card.name || card.concept || '';
      fan.appendChild(mini);
      const angle = -offset + index * spread;
      mini.style.transform = `rotate(${angle}deg) translateY(-64px)`;
      requestAnimationFrame(() => mini.classList.add('visible'));
    });
    deckEl._preview = { fan };
  }

  function stopPreview(deckEl){
    const preview = deckEl._preview;
    if (!preview) return;
    preview.fan.remove();
    deckEl.classList.remove('previewing');
    deckEl._preview = null;
  }

  return { element: viewer, open, close, startPreview, stopPreview };
}
