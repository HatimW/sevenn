import { listBlocks } from '../../storage/storage.js';
import { renderRichText } from './rich-text.js';

const UNASSIGNED_BLOCK_KEY = '__unassigned__';
const MISC_LECTURE_KEY = '__misc__';

const KIND_COLORS = {
  disease: 'var(--pink)',
  drug: 'var(--blue)',
  concept: 'var(--green)'
};

const KIND_FIELDS = {
  disease: [
    ['etiology', 'Etiology', '🧬'],
    ['pathophys', 'Pathophys', '⚙️'],
    ['clinical', 'Clinical', '🩺'],
    ['diagnosis', 'Diagnosis', '🔎'],
    ['treatment', 'Treatment', '💊'],
    ['complications', 'Complications', '⚠️'],
    ['mnemonic', 'Mnemonic', '🧠']
  ],
  drug: [
    ['class', 'Class', '🏷️'],
    ['source', 'Source', '🌱'],
    ['moa', 'MOA', '⚙️'],
    ['uses', 'Uses', '💊'],
    ['sideEffects', 'Side Effects', '⚠️'],
    ['contraindications', 'Contraindications', '🚫'],
    ['mnemonic', 'Mnemonic', '🧠']
  ],
  concept: [
    ['type', 'Type', '🏷️'],
    ['definition', 'Definition', '📖'],
    ['mechanism', 'Mechanism', '⚙️'],
    ['clinicalRelevance', 'Clinical Relevance', '🩺'],
    ['example', 'Example', '📝'],
    ['mnemonic', 'Mnemonic', '🧠']
  ]
};

function formatWeekLabel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `Week ${value}`;
  }
  return 'Unscheduled';
}

function titleFromItem(item) {
  return item?.name || item?.concept || 'Untitled Card';
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureExtras(item) {
  if (Array.isArray(item?.extras) && item.extras.length) {
    return item.extras;
  }
  if (item?.facts && item.facts.length) {
    return [{
      id: 'legacy-facts',
      title: 'Highlights',
      body: `<ul>${item.facts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
    }];
  }
  return [];
}

function getItemAccent(item) {
  if (item?.color) return item.color;
  if (item?.kind && KIND_COLORS[item.kind]) return KIND_COLORS[item.kind];
  return 'var(--accent)';
}

function collectLectureColors(cards, limit = 5) {
  if (!Array.isArray(cards) || !cards.length) {
    return ['var(--accent)'];
  }
  const seen = new Set();
  const colors = [];
  cards.forEach(card => {
    const accent = getItemAccent(card);
    if (!seen.has(accent)) {
      seen.add(accent);
      colors.push(accent);
    }
  });
  if (!colors.length) colors.push('var(--accent)');
  return colors.slice(0, Math.max(1, limit));
}

function buildGradient(colors) {
  const palette = colors && colors.length ? colors : ['var(--accent)'];
  if (palette.length === 1) {
    const single = palette[0];
    return `linear-gradient(135deg, ${single} 0%, color-mix(in srgb, ${single} 38%, transparent) 100%)`;
  }
  const stops = palette.map((color, idx) => {
    const pct = palette.length === 1 ? 0 : Math.round((idx / (palette.length - 1)) * 100);
    return `${color} ${pct}%`;
  });
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

function getLecturePalette(cards) {
  const colors = collectLectureColors(cards);
  return {
    accent: colors[0] || 'var(--accent)',
    colors,
    gradient: buildGradient(colors)
  };
}

function getLectureAccent(cards) {
  return getLecturePalette(cards).accent;
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

  const blockDefs = await listBlocks();
  const blockLookup = new Map(blockDefs.map(def => [def.blockId, def]));
  const blockOrder = new Map(blockDefs.map((def, idx) => [def.blockId, idx]));

  const itemLookup = new Map(items.map(item => [item.id, item]));
  /** @type {Map<string, Array<{ block: any, week: any, lecture: any }>>} */
  const deckContextLookup = new Map();


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

  blockSections.forEach(block => {
    block.weeks.forEach(week => {
      week.lectures.forEach(lecture => {
        lecture.cards.forEach(card => {
          if (!deckContextLookup.has(card.id)) {
            deckContextLookup.set(card.id, []);
          }
          deckContextLookup.get(card.id).push({ block, week, lecture });
        });
      });
    });
  });

  const gridPayload = new WeakMap();
  const activeGrids = new Set();
  let gridPumpHandle = 0;
  const getTime = typeof performance === 'object' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

  const deckTileObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          deckTileObserver.unobserve(entry.target);
          startGridRender(entry.target);
        }
      });
    }, { rootMargin: '200px 0px' })
    : null;

  function scheduleGridPump() {
    if (gridPumpHandle) return;
    gridPumpHandle = requestAnimationFrame(() => {
      gridPumpHandle = 0;
      pumpGridRenders();
    });
  }

  function startGridRender(grid) {
    if (!grid || grid.dataset.rendered === 'true') return;
    activeGrids.add(grid);
    scheduleGridPump();
  }

  function renderGridChunk(grid) {
    const payload = gridPayload.get(grid);
    if (!payload) {
      grid.dataset.rendered = 'true';
      grid.classList.remove('is-loading');
      return;
    }
    const { entries } = payload;
    let { index = 0 } = payload;
    const frag = document.createDocumentFragment();
    const chunkStart = getTime();
    let elapsed = 0;
    while (index < entries.length && elapsed < 6) {
      const { block, week, lecture } = entries[index++];
      frag.appendChild(createDeckTile(block, week, lecture));
      elapsed = getTime() - chunkStart;
    }
    payload.index = index;
    grid.appendChild(frag);
    if (index > 0) {
      grid.classList.remove('is-loading');
    }
    if (index >= entries.length) {
      grid.dataset.rendered = 'true';
      grid.classList.remove('is-loading');
      gridPayload.delete(grid);
    }
  }

  function pumpGridRenders() {
    if (!activeGrids.size) return;
    const iterator = Array.from(activeGrids);
    const frameStart = getTime();
    for (const grid of iterator) {
      renderGridChunk(grid);
      if (grid.dataset.rendered === 'true') {
        activeGrids.delete(grid);
      }
      if (getTime() - frameStart > 14) break;
    }
    if (activeGrids.size) {
      scheduleGridPump();
    }
  }

  function registerGrid(grid, entries) {
    grid.dataset.rendered = 'false';
    grid.classList.add('is-loading');
    gridPayload.set(grid, { entries, index: 0 });
    if (deckTileObserver) {
      requestAnimationFrame(() => {
        if (grid.dataset.rendered === 'true') return;
        deckTileObserver.observe(grid);
      });
    } else {
      startGridRender(grid);
    }
  }

  function ensureGridRendered(grid) {
    if (!grid || grid.dataset.rendered === 'true') return;
    if (deckTileObserver) {
      deckTileObserver.unobserve(grid);
    }
    startGridRender(grid);
  }

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
  let persistRelatedVisibility = false;

  function closeDeck() {
    overlay.dataset.active = 'false';
    viewer.innerHTML = '';
    if (activeKeyHandler) {
      document.removeEventListener('keydown', activeKeyHandler);
      activeKeyHandler = null;
    }
    persistRelatedVisibility = false;
  }

  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) closeDeck();
  });

  function openDeck(context, targetCardId = null) {
    const { block, week, lecture } = context;
    overlay.dataset.active = 'true';
    viewer.innerHTML = '';
    if (activeKeyHandler) {
      document.removeEventListener('keydown', activeKeyHandler);
      activeKeyHandler = null;
    }

    const baseContext = { block, week, lecture };

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


    const progress = document.createElement('div');
    progress.className = 'deck-progress';
    const progressFill = document.createElement('span');
    progressFill.className = 'deck-progress-fill';
    progress.appendChild(progressFill);
    header.appendChild(progress);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'deck-close';
    closeBtn.innerHTML = '<span aria-hidden="true">×</span><span class="sr-only">Close deck</span>';
    closeBtn.addEventListener('click', closeDeck);
    header.appendChild(closeBtn);

    viewer.appendChild(header);

    const stage = document.createElement('div');
    stage.className = 'deck-stage';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'deck-nav deck-prev';
    prev.innerHTML = '<span class="sr-only">Previous card</span><svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';


    const slideHolder = document.createElement('div');
    slideHolder.className = 'deck-card-stage';


    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'deck-nav deck-next';
    next.innerHTML = '<span class="sr-only">Next card</span><svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    stage.appendChild(prev);

    stage.appendChild(slideHolder);
    stage.appendChild(next);
    viewer.appendChild(stage);

    const footer = document.createElement('div');
    footer.className = 'deck-footer';


    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'deck-related-toggle';
    toggle.dataset.active = 'false';
    toggle.textContent = 'Show related cards';

    footer.appendChild(toggle);

    viewer.appendChild(footer);


    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'deck-related';
    relatedWrap.dataset.visible = 'false';
    viewer.appendChild(relatedWrap);

    let idx = 0;
    if (targetCardId != null) {
      const initialIdx = lecture.cards.findIndex(card => card.id === targetCardId);
      if (initialIdx >= 0) idx = initialIdx;
    }

    let showRelated = persistRelatedVisibility;



    function updateToggle(current) {
      const linkCount = Array.isArray(current?.links) ? current.links.length : 0;
      toggle.disabled = linkCount === 0;
      toggle.dataset.active = showRelated && linkCount ? 'true' : 'false';
      toggle.textContent = linkCount
        ? `${showRelated ? 'Hide' : 'Show'} related (${linkCount})`
        : 'No related cards';
    }

    function renderRelated(current) {

      relatedWrap.innerHTML = '';
      if (!showRelated) {
        relatedWrap.dataset.visible = 'false';
        return;
      }

      const links = Array.isArray(current?.links) ? current.links : [];
      links.forEach(link => {
        const related = itemLookup.get(link.id);
        if (related) {
          relatedWrap.appendChild(createRelatedCard(related, baseContext));
        }
      });
      relatedWrap.dataset.visible = relatedWrap.children.length ? 'true' : 'false';
    }

    function renderCard() {

      const current = lecture.cards[idx];
      slideHolder.innerHTML = '';
      slideHolder.appendChild(createDeckSlide(current, baseContext));
      const accent = getItemAccent(current);
      viewer.style.setProperty('--deck-current-accent', accent);
      counter.textContent = `Card ${idx + 1} of ${lecture.cards.length}`;
      const progressValue = ((idx + 1) / lecture.cards.length) * 100;
      progressFill.style.width = `${progressValue}%`;
      updateToggle(current);
      renderRelated(current);

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
      if (toggle.disabled) return;
      showRelated = !showRelated;
      persistRelatedVisibility = showRelated;

      updateToggle(lecture.cards[idx]);
      renderRelated(lecture.cards[idx]);

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

  const FAN_DELAY_MS = 900;

  function enableDelayedFan(tile) {
    let fanTimer = 0;
    const cancel = () => {
      if (fanTimer) {
        clearTimeout(fanTimer);
        fanTimer = 0;
      }
      tile.classList.remove('is-fanned');
    };
    const arm = () => {
      if (fanTimer) return;
      fanTimer = setTimeout(() => {
        tile.classList.add('is-fanned');
        fanTimer = 0;
      }, FAN_DELAY_MS);
    };
    tile.addEventListener('pointerenter', arm);
    tile.addEventListener('pointerleave', cancel);
    tile.addEventListener('pointercancel', cancel);
    tile.addEventListener('focus', arm);
    tile.addEventListener('blur', cancel);
  }

  function createDeckTile(block, week, lecture) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'deck-tile';
    tile.setAttribute('aria-label', `${lecture.title} (${lecture.cards.length} cards)`);


    const palette = getLecturePalette(lecture.cards);
    const accent = palette.accent;


    const stack = document.createElement('div');
    stack.className = 'deck-stack';
    stack.style.setProperty('--deck-accent', accent);
    stack.style.setProperty('--deck-gradient', palette.gradient);
    const preview = lecture.cards.slice(0, 4);

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
    tile.style.setProperty('--deck-accent', accent);
    tile.style.setProperty('--deck-gradient', palette.gradient);
    tile.appendChild(stack);

    const info = document.createElement('div');
    info.className = 'deck-info';

    const count = document.createElement('span');
    count.className = 'deck-count-pill';
    count.textContent = `${lecture.cards.length} card${lecture.cards.length === 1 ? '' : 's'}`;

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

    enableDelayedFan(tile);

    return tile;
  }

  function createMetaChip(text, icon) {
    const chip = document.createElement('span');
    chip.className = 'deck-chip';
    if (icon) {
      const iconEl = document.createElement('span');
      iconEl.className = 'deck-chip-icon';
      iconEl.textContent = icon;
      chip.appendChild(iconEl);
    }
    const label = document.createElement('span');
    label.className = 'deck-chip-label';
    label.textContent = text;
    chip.appendChild(label);
    return chip;
  }

  function createDeckSlide(item, context) {
    const slide = document.createElement('article');
    slide.className = 'deck-slide';
    const accent = getItemAccent(item);
    slide.style.setProperty('--slide-accent', accent);

    const heading = document.createElement('header');
    heading.className = 'deck-slide-header';

    const crumb = document.createElement('div');
    crumb.className = 'deck-slide-crumb';
    const crumbPieces = [];
    if (context.block?.title) crumbPieces.push(context.block.title);
    if (context.week?.label) crumbPieces.push(context.week.label);
    crumb.textContent = crumbPieces.join(' • ');
    heading.appendChild(crumb);

    const title = document.createElement('h3');
    title.className = 'deck-slide-title';
    title.textContent = titleFromItem(item);
    heading.appendChild(title);

    const kind = document.createElement('span');
    kind.className = 'deck-slide-kind';
    kind.textContent = item.kind ? item.kind.toUpperCase() : 'CARD';
    heading.appendChild(kind);

    slide.appendChild(heading);

    const meta = document.createElement('div');
    meta.className = 'deck-slide-meta';
    const seen = new Set();
    const addMeta = (text, icon) => {
      if (!text || seen.has(text)) return;
      seen.add(text);
      meta.appendChild(createMetaChip(text, icon));
    };
    if (context.block?.title) addMeta(context.block.title, '🧭');
    if (context.week?.label) addMeta(context.week.label, '📆');
    (item.blocks || []).forEach(blockId => {
      const label = blockLookup.get(blockId)?.title || blockId;
      addMeta(label, '🧱');
    });
    (item.weeks || []).forEach(weekValue => addMeta(`Week ${weekValue}`, '📅'));
    (item.lectures || []).forEach(lec => addMeta(lec.name || (lec.id != null ? `Lecture ${lec.id}` : ''), '📚'));
    if (meta.children.length) slide.appendChild(meta);

    const sections = document.createElement('div');
    sections.className = 'deck-slide-sections';
    const defs = KIND_FIELDS[item.kind] || [];
    defs.forEach(([field, label, icon]) => {
      const value = item[field];
      if (!value) return;
      const section = document.createElement('section');
      section.className = 'deck-section';
      section.style.setProperty('--section-accent', accent);
      const sectionTitle = document.createElement('h4');
      sectionTitle.className = 'deck-section-title';
      if (icon) {
        const iconEl = document.createElement('span');
        iconEl.className = 'deck-section-icon';
        iconEl.textContent = icon;
        sectionTitle.appendChild(iconEl);
      }
      const labelNode = document.createElement('span');
      labelNode.textContent = label;
      sectionTitle.appendChild(labelNode);
      section.appendChild(sectionTitle);
      const content = document.createElement('div');
      content.className = 'deck-section-content';
      renderRichText(content, value);
      section.appendChild(content);
      sections.appendChild(section);
    });

    ensureExtras(item).forEach(extra => {
      if (!extra?.body) return;
      const section = document.createElement('section');
      section.className = 'deck-section deck-section-extra';
      section.style.setProperty('--section-accent', accent);
      const sectionTitle = document.createElement('h4');
      sectionTitle.className = 'deck-section-title';
      const labelNode = document.createElement('span');
      labelNode.textContent = extra.title || 'Additional Notes';
      sectionTitle.appendChild(labelNode);
      section.appendChild(sectionTitle);
      const content = document.createElement('div');
      content.className = 'deck-section-content';
      renderRichText(content, extra.body);
      section.appendChild(content);
      sections.appendChild(section);
    });

    if (!sections.children.length) {
      const empty = document.createElement('p');
      empty.className = 'deck-section-empty';
      empty.textContent = 'No detailed content yet for this card.';
      sections.appendChild(empty);
    }

    slide.appendChild(sections);

    return slide;
  }

  function resolveDeckContext(item, origin) {
    const contexts = deckContextLookup.get(item.id);
    if (!contexts || !contexts.length) return null;
    if (origin?.lecture?.key) {
      const lectureMatch = contexts.find(ctx => ctx.lecture.key === origin.lecture.key);
      if (lectureMatch) return lectureMatch;
    }
    if (origin?.block?.key) {
      const blockMatch = contexts.find(ctx => ctx.block.key === origin.block.key);
      if (blockMatch) return blockMatch;
    }
    return contexts[0];
  }

  function createRelatedCard(item, originContext) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'related-card-chip';
    const accent = getItemAccent(item);
    entry.style.setProperty('--related-accent', accent);
    entry.title = titleFromItem(item);

    const heading = document.createElement('strong');
    heading.className = 'related-card-title';
    heading.textContent = titleFromItem(item);
    entry.appendChild(heading);

    const kind = document.createElement('span');
    kind.className = 'related-card-kind';
    kind.textContent = item.kind ? item.kind.toUpperCase() : '';
    entry.appendChild(kind);

    const target = resolveDeckContext(item, originContext);
    if (!target) {
      entry.disabled = true;
      entry.classList.add('is-disabled');
    } else {
      entry.addEventListener('click', () => {
        openDeck(target, item.id);
      });
    }

    return entry;
  }

  function buildBlockSection(block) {
    const section = document.createElement('section');
    section.className = 'card-block-section';
    const firstLecture = block.weeks.find(week => week.lectures.length)?.lectures.find(lec => lec.cards.length);
    const blockAccent = block.accent || getLectureAccent(firstLecture?.cards || []);
    if (blockAccent) section.style.setProperty('--block-accent', blockAccent);


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

    block.weeks.forEach(week => {
      const weekSection = document.createElement('div');
      weekSection.className = 'card-week-section';

      const weekAccent = getLectureAccent(week.lectures.find(lec => lec.cards.length)?.cards || []);
      if (weekAccent) weekSection.style.setProperty('--week-accent', weekAccent);


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
      registerGrid(deckGrid, week.lectures.map(lecture => ({ block, week, lecture })));

      weekSection.appendChild(weekHeader);
      weekSection.appendChild(deckGrid);

      body.appendChild(weekSection);

      weekHeader.addEventListener('click', () => {
        const collapsed = weekSection.classList.toggle('is-collapsed');
        weekHeader.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (!collapsed) {
          ensureGridRendered(deckGrid);
        }
      });
    });

    section.appendChild(body);

    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    return section;
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

  const renderQueue = blockSections.slice();

  function pump() {
    const start = getTime();
    while (renderQueue.length && getTime() - start < 12) {
      catalog.appendChild(buildBlockSection(renderQueue.shift()));
    }
    if (renderQueue.length) {
      requestAnimationFrame(pump);
    }
  }

  pump();

}
