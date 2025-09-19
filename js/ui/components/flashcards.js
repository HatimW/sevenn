import { state, setFlashSession, setSubtab, setStudySelectedMode } from '../../state.js';
import { setToggleState } from '../../utils.js';
import { renderRichText } from './rich-text.js';
import { sectionsForItem } from './section-utils.js';
import { REVIEW_RATINGS, DEFAULT_REVIEW_STEPS } from '../../review/constants.js';
import { getReviewDurations, rateSection, getSectionStateSnapshot } from '../../review/scheduler.js';
import { upsertItem } from '../../storage/storage.js';
import { persistStudySession, removeStudySession } from '../../study/study-sessions.js';


const RATING_LABELS = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy'
};

const RATING_CLASS = {
  again: 'danger',
  hard: 'secondary',
  good: '',
  easy: ''
};

function queueStatusLabel(snapshot) {
  if (!snapshot || snapshot.retired) return 'Already in review queue';
  const rating = snapshot.lastRating;
  if (rating && RATING_LABELS[rating]) {
    return `In review (${RATING_LABELS[rating]})`;
  }
  return 'Already in review queue';
}

function ratingKey(item, sectionKey) {
  const id = item?.id || 'item';
  return `${id}::${sectionKey}`;
}

function sessionEntryAt(session, idx) {
  const pool = Array.isArray(session.pool) ? session.pool : [];
  return pool[idx] || null;
}

function normalizeFlashSession(session, fallbackPool, defaultMode = 'study') {
  const source = session && typeof session === 'object' ? session : {};
  const next = { ...source };
  let changed = !session || typeof session !== 'object';
  const fallback = Array.isArray(fallbackPool) ? fallbackPool : [];
  const pool = Array.isArray(source.pool) && source.pool.length ? source.pool : fallback;
  if (source.pool !== pool) {
    next.pool = pool;
    changed = true;
  }
  const ratings = source.ratings && typeof source.ratings === 'object' ? source.ratings : {};
  if (source.ratings !== ratings) {
    next.ratings = ratings;
    changed = true;
  }
  let idx = typeof source.idx === 'number' && Number.isFinite(source.idx) ? Math.floor(source.idx) : 0;
  if (idx < 0) idx = 0;
  const maxIdx = pool.length ? pool.length - 1 : 0;
  if (idx > maxIdx) idx = maxIdx;
  if (idx !== source.idx) {
    next.idx = idx;
    changed = true;
  }
  const mode = source.mode === 'review' ? 'review' : defaultMode;
  if (source.mode !== mode) {
    next.mode = mode;
    changed = true;
  }
  return changed ? next : session;
}

export function renderFlashcards(root, redraw) {
  const fallbackPool = Array.isArray(state.cohort) ? state.cohort : [];
  let active = state.flashSession;
  if (active) {
    const normalized = normalizeFlashSession(active, fallbackPool, active.mode === 'review' ? 'review' : 'study');
    if (normalized !== active) {
      setFlashSession(normalized);
      active = normalized;
    }
  } else {
    active = normalizeFlashSession({ idx: 0, pool: fallbackPool, ratings: {}, mode: 'study' }, fallbackPool, 'study');
  }
  active.ratings = active.ratings || {};
  const items = Array.isArray(active.pool) && active.pool.length ? active.pool : fallbackPool;

  const resolvePool = () => (Array.isArray(active.pool) && active.pool.length ? active.pool : items);
  const commitSession = (patch = {}) => {
    const pool = resolvePool();
    const next = { ...active, pool, ...patch };
    if (patch.ratings) {
      next.ratings = { ...patch.ratings };
    } else {
      next.ratings = { ...active.ratings };
    }
    active = next;
    setFlashSession(next);
  };

  const isReview = active.mode === 'review';

  root.innerHTML = '';

  if (!items.length) {
    const msg = document.createElement('div');
    msg.textContent = 'No items in cohort.';
    root.appendChild(msg);
    return;
  }

  if (active.idx >= items.length) {

    setFlashSession(null);
    setStudySelectedMode('Flashcards');
    setSubtab('Study', isReview ? 'Review' : 'Builder');
    if (isReview) {
      removeStudySession('review').catch(err => console.warn('Failed to clear review session', err));
    } else {
      removeStudySession('flashcards').catch(err => console.warn('Failed to clear flashcard session', err));
    }
    redraw();
    return;
  }

  const entry = sessionEntryAt(active, active.idx);
  const item = entry && entry.item ? entry.item : entry;
  if (!item) {
    setFlashSession(null);
    redraw();
    return;
  }

  const allowedSections = entry && entry.sections ? entry.sections : null;
  const sections = sectionsForItem(item, allowedSections);

  const card = document.createElement('section');
  card.className = 'card flashcard';
  card.tabIndex = 0;

  const title = document.createElement('h2');
  title.textContent = item.name || item.concept || '';
  card.appendChild(title);

  const durationsPromise = getReviewDurations().catch(() => ({ ...DEFAULT_REVIEW_STEPS }));
  const ratedSections = new Map();

  const sectionBlocks = sections.length ? sections : [];
  const sectionRequirements = new Map();
  if (!sectionBlocks.length) {
    const empty = document.createElement('div');
    empty.className = 'flash-empty';
    empty.textContent = 'No content available for this card.';
    card.appendChild(empty);
  }

  sectionBlocks.forEach(({ key, label }) => {
    const ratingId = ratingKey(item, key);
    const previousRating = active.ratings[ratingId] || null;
    if (previousRating) {
      ratedSections.set(key, previousRating);
    }

    const snapshot = getSectionStateSnapshot(item, key);
    const alreadyQueued = !isReview && Boolean(snapshot && snapshot.last && !snapshot.retired);
    const requiresRating = isReview || !alreadyQueued;
    sectionRequirements.set(key, requiresRating);
    if (!requiresRating && !ratedSections.has(key)) {
      const recorded = snapshot?.lastRating || 'queued';
      ratedSections.set(key, recorded);
    }

    const sec = document.createElement('div');
    sec.className = 'flash-section';
    sec.setAttribute('role', 'button');
    sec.tabIndex = 0;

    const head = document.createElement('div');
    head.className = 'flash-heading';
    head.textContent = label;

    const body = document.createElement('div');
    body.className = 'flash-body';
    renderRichText(body, item[key] || '');

    const ratingRow = document.createElement('div');
    ratingRow.className = 'flash-rating';

    const ratingButtons = document.createElement('div');
    ratingButtons.className = 'flash-rating-options';

    const status = document.createElement('span');
    status.className = 'flash-rating-status';

    const selectRating = (value) => {
      ratedSections.set(key, value);
      active.ratings[ratingId] = value;
      Array.from(ratingButtons.querySelectorAll('button')).forEach(btn => {
        const btnValue = btn.dataset.value;
        const isSelected = btnValue === value;
        btn.classList.toggle('is-selected', isSelected);
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
      status.classList.remove('is-error');
      commitSession({ ratings: { ...active.ratings } });
      updateNextState();
    };

    const handleRating = async (value) => {
      if (!requiresRating) return;
      const durations = await durationsPromise;
      setToggleState(sec, true, 'revealed');
      ratingRow.classList.add('is-saving');
      status.textContent = 'Saving…';
      status.classList.remove('is-error');
      try {
        rateSection(item, key, value, durations, Date.now());
        await upsertItem(item);
        selectRating(value);
        status.textContent = 'Saved';
        status.classList.remove('is-error');
      } catch (err) {
        console.error('Failed to record rating', err);
        status.textContent = 'Save failed';
        status.classList.add('is-error');
      } finally {
        ratingRow.classList.remove('is-saving');
      }
    };

    if (requiresRating) {
      REVIEW_RATINGS.forEach(value => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.value = value;
        btn.className = 'btn flash-rating-btn';
        const variant = RATING_CLASS[value];
        if (variant) btn.classList.add(variant);
        btn.textContent = RATING_LABELS[value];
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          handleRating(value);
        });
        btn.addEventListener('keydown', (event) => {
          event.stopPropagation();
        });
        ratingButtons.appendChild(btn);
      });

      if (previousRating) {
        selectRating(previousRating);
        status.textContent = 'Saved';
      }
    } else {
      ratingRow.classList.add('is-locked');
      ratingButtons.hidden = true;
      status.textContent = queueStatusLabel(snapshot);
    }

    ratingRow.appendChild(ratingButtons);
    ratingRow.appendChild(status);

    setToggleState(sec, false, 'revealed');
    const toggleReveal = () => {
      if (sec.classList.contains('flash-section-disabled')) return;
      if (sec.contains(document.activeElement) && document.activeElement?.tagName === 'BUTTON') return;
      const next = sec.dataset.active !== 'true';
      setToggleState(sec, next, 'revealed');
    };
    sec.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('.flash-rating')) return;
      toggleReveal();
    });
    sec.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('.flash-rating')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleReveal();
      }
    });

    sec.appendChild(head);
    sec.appendChild(body);
    sec.appendChild(ratingRow);
    card.appendChild(sec);
  });

  const controls = document.createElement('div');
  controls.className = 'row flash-controls';

  const prev = document.createElement('button');
  prev.className = 'btn';
  prev.textContent = 'Prev';
  prev.disabled = active.idx === 0;
  prev.addEventListener('click', () => {
    if (active.idx > 0) {
      commitSession({ idx: active.idx - 1 });
      redraw();
    }
  });
  controls.appendChild(prev);

  const next = document.createElement('button');
  next.className = 'btn';
  const isLast = active.idx >= items.length - 1;

  next.textContent = isLast ? (isReview ? 'Finish review' : 'Finish') : 'Next';
  const hasRatingRequirement = sectionBlocks.some(sec => sectionRequirements.get(sec.key));
  next.disabled = hasRatingRequirement;
  next.addEventListener('click', () => {
    const idx = active.idx + 1;
    if (idx >= items.length) {
      setFlashSession(null);
    } else {
      commitSession({ idx });
    }
    redraw();
  });
  controls.appendChild(next);

  if (!isReview) {
    const saveExit = document.createElement('button');
    saveExit.className = 'btn secondary';
    saveExit.textContent = 'Save & close';
    saveExit.addEventListener('click', async () => {
      const original = saveExit.textContent;
      saveExit.disabled = true;
      saveExit.textContent = 'Saving…';
      try {
        const pool = resolvePool();
        await persistStudySession('flashcards', {
          session: { ...active, idx: active.idx, pool, ratings: { ...(active.ratings || {}) } },
          cohort: pool
        });
        setFlashSession(null);
        setStudySelectedMode('Flashcards');
        setSubtab('Study', 'Builder');
        redraw();
      } catch (err) {
        console.error('Failed to save flashcard progress', err);
        saveExit.textContent = 'Save failed';
        setTimeout(() => { saveExit.textContent = original; }, 2000);
      } finally {
        saveExit.disabled = false;
      }
    });
    controls.appendChild(saveExit);
  } else {

    const saveExit = document.createElement('button');
    saveExit.className = 'btn secondary';
    saveExit.textContent = 'Pause & save';
    saveExit.addEventListener('click', async () => {
      const original = saveExit.textContent;
      saveExit.disabled = true;
      saveExit.textContent = 'Saving…';
      try {
        const pool = resolvePool();
        await persistStudySession('review', {
          session: { ...active, idx: active.idx, pool, ratings: { ...(active.ratings || {}) } },
          cohort: state.cohort,
          metadata: active.metadata || { label: 'Review session' }
        });
        setFlashSession(null);
        setSubtab('Study', 'Review');
        redraw();
      } catch (err) {
        console.error('Failed to save review session', err);
        saveExit.textContent = 'Save failed';
        setTimeout(() => { saveExit.textContent = original; }, 2000);
      } finally {
        saveExit.disabled = false;
      }
    });
    controls.appendChild(saveExit);
  }


  card.appendChild(controls);
  root.appendChild(card);

  card.focus();
  card.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      next.click();
    } else if (e.key === 'ArrowLeft') {
      prev.click();
    }
  });

  updateNextState();

  function updateNextState() {
    if (!sectionBlocks.length) {
      next.disabled = false;
      return;
    }
    const needsRating = sectionBlocks.some(sec => sectionRequirements.get(sec.key));
    if (!needsRating) {
      next.disabled = false;
      return;
    }
    const ready = sectionBlocks.every(sec => {
      if (!sectionRequirements.get(sec.key)) return true;
      return Boolean(ratedSections.get(sec.key));
    });
    next.disabled = !ready;
  }
}
