import { getSettings } from '../storage/storage.js';
import { sectionDefsForKind, allSectionDefs } from '../ui/components/sections.js';
import { DEFAULT_REVIEW_STEPS, REVIEW_RATINGS, RETIRE_RATING } from './constants.js';
import { normalizeReviewSteps } from './settings.js';
import { SR_VERSION, defaultSectionState, normalizeSectionRecord, normalizeSrRecord } from './sr-data.js';

const UNASSIGNED_LECTURE_TOKEN = '__unassigned|__none';

function digestContent(value) {
  if (value == null) return null;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (!str) return null;
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  }
  return hash.toString(16);
}

function normalizeLectureScope(scope) {
  if (!Array.isArray(scope) || !scope.length) return [];
  const normalized = scope
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(normalized)).sort();
}

function computeLectureScope(item) {
  if (!item || !Array.isArray(item.lectures) || !item.lectures.length) {
    return [UNASSIGNED_LECTURE_TOKEN];
  }
  const tokens = item.lectures.map(lecture => {
    if (!lecture || typeof lecture !== 'object') return '';
    const blockId = lecture.blockId == null ? '' : String(lecture.blockId);
    const id = lecture.id == null ? '' : String(lecture.id);
    return `${blockId}|${id}`.trim();
  });
  return normalizeLectureScope(tokens);
}

function computeSectionDigest(item, key) {
  if (!item || !key) return null;
  const raw = item[key];
  return digestContent(raw);
}

let cachedDurations = null;

export async function getReviewDurations() {
  if (cachedDurations) return cachedDurations;
  try {
    const settings = await getSettings();
    cachedDurations = normalizeReviewSteps(settings?.reviewSteps);
  } catch (err) {
    console.warn('Failed to load review settings, using defaults', err);
    cachedDurations = { ...DEFAULT_REVIEW_STEPS };
  }
  return cachedDurations;
}

export function invalidateReviewDurationsCache() {
  cachedDurations = null;
}

export function ensureItemSr(item) {
  if (!item || typeof item !== 'object') return { version: SR_VERSION, sections: {} };
  const sr = item.sr && typeof item.sr === 'object' ? item.sr : { version: SR_VERSION, sections: {} };
  if (sr.version !== SR_VERSION || typeof sr.sections !== 'object' || !sr.sections) {
    item.sr = normalizeSrRecord(sr);
    return item.sr;
  }
  item.sr.sections = item.sr.sections || {};
  return item.sr;
}

export function ensureSectionState(item, key) {
  const sr = ensureItemSr(item);
  if (!sr.sections[key] || typeof sr.sections[key] !== 'object') {
    sr.sections[key] = defaultSectionState();
  } else {
    sr.sections[key] = normalizeSectionRecord(sr.sections[key]);
  }
  return sr.sections[key];
}

export function getSectionStateSnapshot(item, key) {
  const sr = item?.sr;
  if (!sr || typeof sr !== 'object') return null;
  const entry = sr.sections && typeof sr.sections === 'object' ? sr.sections[key] : null;
  if (!entry || typeof entry !== 'object') return null;
  const normalized = normalizeSectionRecord(entry);
  const digest = computeSectionDigest(item, key);
  const scope = computeLectureScope(item);
  const storedDigest = normalized.contentDigest;
  const storedScope = normalizeLectureScope(normalized.lectureScope);
  const removedLectures = storedScope.length ? storedScope.some(token => !scope.includes(token)) : false;
  const contentChanged = storedDigest != null && digest != null && storedDigest !== digest;
  if (contentChanged || removedLectures) {
    const nowTs = Date.now();
    normalized.streak = 0;
    normalized.lastRating = null;
    normalized.last = nowTs;
    normalized.due = nowTs;
    normalized.retired = false;
  }
  normalized.contentDigest = digest;
  normalized.lectureScope = scope;
  sr.sections[key] = normalized;
  return normalized;
}

export function rateSection(item, key, rating, durations, now = Date.now()) {
  if (!item || !key) return null;
  const steps = normalizeReviewSteps(durations);
  if (rating === RETIRE_RATING) {
    const section = ensureSectionState(item, key);
    section.streak = 0;
    section.lastRating = RETIRE_RATING;
    section.last = now;
    section.due = Number.MAX_SAFE_INTEGER;
    section.retired = true;
    section.contentDigest = computeSectionDigest(item, key);
    section.lectureScope = computeLectureScope(item);
    return section;
  }
  const normalizedRating = REVIEW_RATINGS.includes(rating) ? rating : 'good';
  const section = ensureSectionState(item, key);
  section.contentDigest = computeSectionDigest(item, key);
  section.lectureScope = computeLectureScope(item);
  let streak = Number.isFinite(section.streak) ? section.streak : 0;
  switch (normalizedRating) {
    case 'again':
      streak = 0;
      break;
    case 'hard':
      streak = Math.max(1, streak || 0);
      break;
    case 'good':
      streak = (streak || 0) + 1;
      break;
    case 'easy':
      streak = (streak || 0) + 2;
      break;
    default:
      streak = (streak || 0) + 1;
      break;
  }
  const baseMinutes = steps[normalizedRating] ?? DEFAULT_REVIEW_STEPS[normalizedRating];
  const multiplier = normalizedRating === 'again' ? 1 : Math.max(1, streak || 1);
  const intervalMinutes = baseMinutes * multiplier;
  section.streak = streak;
  section.lastRating = normalizedRating;
  section.last = now;
  section.retired = false;
  section.due = now + Math.round(intervalMinutes * 60 * 1000);
  return section;
}

export function hasContentForSection(item, key) {
  if (!item || !key) return false;
  const defs = sectionDefsForKind(item.kind);
  if (!defs.find(def => def.key === key)) return false;
  const raw = item[key];
  if (raw === null || raw === undefined) return false;
  const text = String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length > 0;
}

function collectReviewEntries(items, { now = Date.now(), predicate } = {}) {
  const results = [];
  if (!Array.isArray(items) || !items.length) return results;
  const defsMap = allSectionDefs();
  for (const item of items) {
    const defs = defsMap[item?.kind] || [];
    for (const def of defs) {
      if (!hasContentForSection(item, def.key)) continue;
      const snapshot = getSectionStateSnapshot(item, def.key);
      if (!snapshot || snapshot.retired) continue;
      if (typeof predicate === 'function' && !predicate(snapshot, now, item, def)) continue;
      results.push({
        item,
        itemId: item.id,
        sectionKey: def.key,
        sectionLabel: def.label,
        due: snapshot.due
      });
    }
  }
  results.sort((a, b) => a.due - b.due);
  return results;
}

export function collectDueSections(items, { now = Date.now() } = {}) {
  return collectReviewEntries(items, {
    now,
    predicate: (snapshot, currentNow) => Boolean(snapshot.last) && snapshot.due <= currentNow
  });
}

export function collectUpcomingSections(items, { now = Date.now(), limit = 50 } = {}) {
  const entries = collectReviewEntries(items, {
    now,
    predicate: (snapshot, currentNow) => {
      if (!snapshot.last) return false;
      const due = snapshot.due;
      if (!Number.isFinite(due)) return false;
      if (due === Number.MAX_SAFE_INTEGER) return false;
      return due > currentNow;
    }
  });
  if (Number.isFinite(limit) && limit > 0) {
    return entries.slice(0, limit);
  }
  return entries;
}
