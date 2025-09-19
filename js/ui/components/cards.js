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

  const expandedDecks = new Set();

  function createCollapseIcon() {
    const icon = document.createElement('span');
    icon.className = 'card-collapse-icon';
    icon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 8L10 12L14 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return icon;
  }

  let deckIdCounter = 0;

  function createDeckTile(block, week, lecture) {
    const wrapper = document.createElement('div');
    wrapper.className = 'deck-entry';
    wrapper.dataset.expanded = 'false';

    const deckId = `deck-${deckIdCounter++}`;

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'deck-tile';
    tile.setAttribute('aria-controls', deckId);
    tile.setAttribute('aria-expanded', 'false');

    const info = document.createElement('div');
    info.className = 'deck-info';

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

    const count = document.createElement('span');
    count.className = 'deck-count-pill';
    count.textContent = `${lecture.cards.length} card${lecture.cards.length === 1 ? '' : 's'}`;
    info.appendChild(count);

    tile.appendChild(info);

    const icon = createCollapseIcon();
    tile.appendChild(icon);

    const cardList = document.createElement('div');
    cardList.className = 'deck-card-list';
    cardList.id = deckId;
    cardList.hidden = true;

    let rendered = false;

    const close = () => {
      if (wrapper.dataset.expanded !== 'true') return;
      wrapper.dataset.expanded = 'false';
      tile.setAttribute('aria-expanded', 'false');
      cardList.hidden = true;
      expandedDecks.delete(close);
    };

    const open = () => {
      if (wrapper.dataset.expanded === 'true') return;
      expandedDecks.forEach(fn => fn());
      expandedDecks.clear();
      if (!rendered) {
        const fragment = document.createDocumentFragment();
        lecture.cards.forEach(card => {
          fragment.appendChild(createDeckCard(card, { block, week, lecture }));
        });
        cardList.appendChild(fragment);
        rendered = true;
      }
      wrapper.dataset.expanded = 'true';
      tile.setAttribute('aria-expanded', 'true');
      cardList.hidden = false;
      expandedDecks.add(close);
    };

    tile.addEventListener('click', () => {
      if (wrapper.dataset.expanded === 'true') {
        close();
      } else {
        open();
      }
    });

    tile.addEventListener('keydown', evt => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        tile.click();
      }
    });

    wrapper.appendChild(tile);
    wrapper.appendChild(cardList);

    return wrapper;
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

  function createDeckCard(item, context) {
    const card = document.createElement('article');
    card.className = 'deck-card';
    const accent = getItemAccent(item);
    card.style.setProperty('--card-accent', accent);

    const header = document.createElement('header');
    header.className = 'deck-card-header';

    const title = document.createElement('h4');
    title.className = 'deck-card-title';
    title.textContent = titleFromItem(item);
    header.appendChild(title);

    if (item.kind) {
      const kind = document.createElement('span');
      kind.className = 'deck-card-kind';
      kind.textContent = item.kind.toUpperCase();
      header.appendChild(kind);
    }

    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'deck-card-meta';
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
    if (meta.children.length) {
      card.appendChild(meta);
    }

    const sections = document.createElement('div');
    sections.className = 'deck-card-sections';
    const defs = KIND_FIELDS[item.kind] || [];
    defs.forEach(([field, label, icon]) => {
      const value = item[field];
      if (!value) return;
      const section = document.createElement('section');
      section.className = 'deck-card-section';
      section.style.setProperty('--section-accent', accent);
      const sectionTitle = document.createElement('h5');
      sectionTitle.className = 'deck-card-section-title';
      if (icon) {
        const iconEl = document.createElement('span');
        iconEl.className = 'deck-card-section-icon';
        iconEl.textContent = icon;
        sectionTitle.appendChild(iconEl);
      }
      const labelNode = document.createElement('span');
      labelNode.textContent = label;
      sectionTitle.appendChild(labelNode);
      section.appendChild(sectionTitle);
      const content = document.createElement('div');
      content.className = 'deck-card-section-content';
      renderRichText(content, value);
      section.appendChild(content);
      sections.appendChild(section);
    });

    ensureExtras(item).forEach(extra => {
      if (!extra?.body) return;
      const section = document.createElement('section');
      section.className = 'deck-card-section deck-card-section-extra';
      section.style.setProperty('--section-accent', accent);
      const sectionTitle = document.createElement('h5');
      sectionTitle.className = 'deck-card-section-title';
      const labelNode = document.createElement('span');
      labelNode.textContent = extra.title || 'Additional Notes';
      sectionTitle.appendChild(labelNode);
      section.appendChild(sectionTitle);
      const content = document.createElement('div');
      content.className = 'deck-card-section-content';
      renderRichText(content, extra.body);
      section.appendChild(content);
      sections.appendChild(section);
    });

    if (!sections.children.length) {
      const empty = document.createElement('p');
      empty.className = 'deck-card-empty';
      empty.textContent = 'No detailed content yet for this card.';
      sections.appendChild(empty);
    }

    card.appendChild(sections);

    return card;
  }

  function buildBlockSection(block) {
    const section = document.createElement('section');
    section.className = 'card-block-section';


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

      week.lectures.forEach(lecture => {
        deckGrid.appendChild(createDeckTile(block, week, lecture));
      });

      weekSection.appendChild(weekHeader);
      weekSection.appendChild(deckGrid);

      body.appendChild(weekSection);

      weekHeader.addEventListener('click', () => {
        const collapsed = weekSection.classList.toggle('is-collapsed');
        weekHeader.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (collapsed) {
          expandedDecks.forEach(fn => fn());
          expandedDecks.clear();
        }
      });
    });

    section.appendChild(body);

    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (collapsed) {
        expandedDecks.forEach(fn => fn());
        expandedDecks.clear();
      }
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
  const getTime = typeof performance === 'object' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

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
