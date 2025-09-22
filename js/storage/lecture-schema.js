import {
  DEFAULT_PASS_PLAN,
  normalizePassPlan,
  normalizeLecturePasses,
  calculateNextDue,
  deriveLectureStatus,
  normalizePlannerDefaults
} from '../lectures/scheduler.js';
export { DEFAULT_PASS_PLAN } from '../lectures/scheduler.js';

const KEY_SEPARATOR = '|';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_LECTURE_STATUS = {
  state: 'pending',
  completedPasses: 0,
  lastCompletedAt: null
};

export function lectureKey(blockId, lectureId) {
  return `${blockId}${KEY_SEPARATOR}${lectureId}`;
}

export function cloneDefaultPassPlan() {
  return deepClone(DEFAULT_PASS_PLAN);
}

export function cloneDefaultStatus() {
  return deepClone(DEFAULT_LECTURE_STATUS);
}

export function normalizeLectureRecord(blockId, lecture, now = Date.now()) {
  if (!lecture || blockId == null || lecture.id == null) return null;
  const key = lecture.key || lectureKey(blockId, lecture.id);
  const name = typeof lecture.name === 'string' ? lecture.name : '';
  const weekRaw = lecture.week;
  let week = null;
  if (typeof weekRaw === 'number' && Number.isFinite(weekRaw)) {
    week = weekRaw;
  } else if (typeof weekRaw === 'string' && weekRaw.trim()) {
    const parsed = Number(weekRaw);
    if (!Number.isNaN(parsed)) week = parsed;
  }
  const startRaw = lecture.startAt;
  let startAt = null;
  if (Number.isFinite(startRaw)) {
    startAt = startRaw;
  } else if (typeof startRaw === 'string' && startRaw.trim()) {
    const parsedStart = Number(startRaw);
    if (!Number.isNaN(parsedStart)) {
      startAt = parsedStart;
    }
  }
  if (!Number.isFinite(startAt)) {
    startAt = Number.isFinite(lecture.createdAt) ? lecture.createdAt : now;
  }

  const tags = Array.isArray(lecture.tags)
    ? lecture.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim())
    : [];
  const passPlan = lecture.passPlan
    ? normalizePassPlan({ ...cloneDefaultPassPlan(), ...lecture.passPlan })
    : normalizePassPlan(cloneDefaultPassPlan());

  const plannerDefaults = normalizePlannerDefaults(lecture.plannerDefaults || {});
  const passes = normalizeLecturePasses({
    plan: passPlan,
    passes: lecture.passes,
    plannerDefaults,
    startAt,
    now
  });

  const statusBase = lecture.status
    ? { ...cloneDefaultStatus(), ...lecture.status }
    : cloneDefaultStatus();
  const status = deriveLectureStatus(passes, statusBase);
  const nextDueAt = calculateNextDue(passes);
  const createdAt = typeof lecture.createdAt === 'number' ? lecture.createdAt : now;
  const updatedAt = now;

  return {
    key,
    blockId,
    id: lecture.id,
    name,
    week,
    tags,
    passes,
    passPlan,
    plannerDefaults,
    status,
    nextDueAt,
    startAt,
    createdAt,
    updatedAt
  };
}

