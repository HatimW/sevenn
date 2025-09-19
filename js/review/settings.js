import { DEFAULT_REVIEW_STEPS, REVIEW_RATINGS } from './constants.js';

export function normalizeReviewSteps(raw) {
  const normalized = { ...DEFAULT_REVIEW_STEPS };
  if (!raw || typeof raw !== 'object') return normalized;
  for (const key of REVIEW_RATINGS) {
    const value = raw[key];
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      normalized[key] = num;
    }
  }
  return normalized;
}
