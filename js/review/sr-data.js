import { REVIEW_RATINGS, RETIRE_RATING } from './constants.js';

export const SR_VERSION = 2;

function sanitizeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num;
}

export function defaultSectionState() {
  return {
    streak: 0,
    lastRating: null,
    last: 0,
    due: 0,
    retired: false,
    contentDigest: null,
    lectureScope: []
  };
}

export function normalizeSectionRecord(record) {
  const base = defaultSectionState();
  if (!record || typeof record !== 'object') return base;
  if (typeof record.streak === 'number' && Number.isFinite(record.streak) && record.streak > 0) {
    base.streak = Math.max(0, Math.round(record.streak));
  }
  if (typeof record.lastRating === 'string') {
    const rating = record.lastRating;
    if (REVIEW_RATINGS.includes(rating) || rating === RETIRE_RATING) {
      base.lastRating = rating;
    }
  }
  base.last = sanitizeNumber(record.last, 0);
  base.due = sanitizeNumber(record.due, 0);
  base.retired = Boolean(record.retired);
  if (typeof record.contentDigest === 'string' && record.contentDigest) {
    base.contentDigest = record.contentDigest;
  }
  if (Array.isArray(record.lectureScope) && record.lectureScope.length) {
    const normalizedScope = record.lectureScope
      .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    base.lectureScope = Array.from(new Set(normalizedScope)).sort();
  }
  return base;
}

export function normalizeSrRecord(sr) {
  const normalized = { version: SR_VERSION, sections: {} };
  if (!sr || typeof sr !== 'object') return normalized;
  const sections = sr.sections && typeof sr.sections === 'object' ? sr.sections : {};
  for (const [key, value] of Object.entries(sections)) {
    if (!key) continue;
    normalized.sections[key] = normalizeSectionRecord(value);
  }
  return normalized;
}
