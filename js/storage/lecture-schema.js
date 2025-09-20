const KEY_SEPARATOR = '|';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_PASS_PLAN = {
  id: 'default',
  schedule: [
    { order: 1, offsetMinutes: 0 },
    { order: 2, offsetMinutes: 1440 },
    { order: 3, offsetMinutes: 4320 }
  ]
};

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
  const tags = Array.isArray(lecture.tags)
    ? lecture.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim())
    : [];
  const passes = Array.isArray(lecture.passes) ? deepClone(lecture.passes) : [];
  const passPlan = lecture.passPlan
    ? { ...cloneDefaultPassPlan(), ...lecture.passPlan }
    : cloneDefaultPassPlan();
  const status = lecture.status
    ? { ...cloneDefaultStatus(), ...lecture.status }
    : cloneDefaultStatus();
  const nextDueAt = lecture.nextDueAt ?? null;
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
    status,
    nextDueAt,
    createdAt,
    updatedAt
  };
}

