import { deepClone } from '../utils.js';

const DAY_MINUTES = 24 * 60;
const MINUTE_MS = 60 * 1000;

export const DEFAULT_PASS_COLORS = [
  '#38bdf8',
  '#22d3ee',
  '#34d399',
  '#4ade80',
  '#fbbf24',
  '#fb923c',
  '#f472b6',
  '#a855f7',
  '#6366f1',
  '#14b8a6'
];

const clone = deepClone;

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeLabel(label, order) {
  if (typeof label === 'string' && label.trim()) return label.trim();
  return `Pass ${order}`;
}

function sanitizeAction(action) {
  if (typeof action === 'string') {
    const trimmed = action.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function inferAnchor(offsetMinutes) {
  if (!Number.isFinite(offsetMinutes)) return 'today';
  if (offsetMinutes < DAY_MINUTES) return 'today';
  if (offsetMinutes < DAY_MINUTES * 2) return 'tomorrow';
  return 'upcoming';
}

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function computeAnchoredDue(startAt, step, plannerDefaults) {
  const offsetMinutes = toNumber(step?.offsetMinutes, 0);
  const base = startAt + Math.round(offsetMinutes * MINUTE_MS);
  if (!plannerDefaults || typeof plannerDefaults !== 'object') return base;
  const anchorName = typeof step?.anchor === 'string' && step.anchor.trim()
    ? step.anchor.trim()
    : inferAnchor(offsetMinutes);
  const anchorOffsets = plannerDefaults.anchorOffsets || {};
  const anchorMinutes = toNumber(anchorOffsets[anchorName], null);
  if (anchorMinutes == null) return base;
  const anchorBase = startOfDay(base) + Math.round(anchorMinutes * MINUTE_MS);
  if (!Number.isFinite(anchorBase)) return base;
  if (offsetMinutes >= 0 && anchorBase < base) {
    return base;
  }
  return anchorBase;
}

export const DEFAULT_PASS_PLAN = {
  id: 'default',
  schedule: [
    { order: 1, label: 'Pass 1', offsetMinutes: 0, anchor: 'today', action: 'Notes' },
    { order: 2, label: 'Pass 2', offsetMinutes: 24 * 60, anchor: 'tomorrow', action: 'Review' },
    { order: 3, label: 'Pass 3', offsetMinutes: 72 * 60, anchor: 'upcoming', action: 'Quiz' }
  ]
};

export const DEFAULT_PLANNER_DEFAULTS = {
  anchorOffsets: {
    today: 0,
    tomorrow: 8 * 60,
    upcoming: 8 * 60
  },
  passes: DEFAULT_PASS_PLAN.schedule.map(entry => ({
    order: entry.order,
    label: entry.label,
    offsetMinutes: entry.offsetMinutes,
    anchor: entry.anchor
  })),
  passColors: DEFAULT_PASS_COLORS
};

export function normalizePassPlan(plan) {
  const source = plan && typeof plan === 'object' ? plan : {};
  const mergedSchedule = Array.isArray(source.schedule)
    ? source.schedule
    : DEFAULT_PASS_PLAN.schedule;
  const normalizedSchedule = (Array.isArray(mergedSchedule) ? mergedSchedule : [])
    .map((step, index) => {
      const order = toNumber(step?.order, index + 1);
      const offsetMinutes = toNumber(step?.offsetMinutes, DEFAULT_PASS_PLAN.schedule[index]?.offsetMinutes ?? 0);
      const anchor = typeof step?.anchor === 'string' && step.anchor.trim()
        ? step.anchor.trim()
        : inferAnchor(offsetMinutes);
      const label = sanitizeLabel(step?.label, order);
      const action = sanitizeAction(step?.action ?? DEFAULT_PASS_PLAN.schedule[index]?.action);
      return { order, offsetMinutes, anchor, label, action };
    })
    .sort((a, b) => a.order - b.order);
  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : DEFAULT_PASS_PLAN.id,
    schedule: normalizedSchedule
  };
}

export function normalizePlannerDefaults(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const anchorOffsets = {};
  const defaultAnchors = DEFAULT_PLANNER_DEFAULTS.anchorOffsets;
  const incomingAnchors = source.anchorOffsets && typeof source.anchorOffsets === 'object'
    ? source.anchorOffsets
    : {};
  const allKeys = new Set([
    ...Object.keys(defaultAnchors),
    ...Object.keys(incomingAnchors)
  ]);
  for (const key of allKeys) {
    const fallback = defaultAnchors[key] ?? 0;
    const value = incomingAnchors[key];
    anchorOffsets[key] = toNumber(value, fallback);
  }

  const passesSource = Array.isArray(source.passes)
    ? source.passes
    : DEFAULT_PLANNER_DEFAULTS.passes;
  const normalizedPlan = normalizePassPlan({ schedule: passesSource });

  const paletteSource = Array.isArray(source.passColors) && source.passColors.length
    ? source.passColors
    : DEFAULT_PASS_COLORS;
  const passColors = paletteSource.map((color, index) => {
    if (typeof color === 'string') {
      const trimmed = color.trim();
      if (trimmed) return trimmed;
    }
    return DEFAULT_PASS_COLORS[index % DEFAULT_PASS_COLORS.length];
  });
  const palette = passColors.length ? passColors : DEFAULT_PASS_COLORS.slice();

  return {
    anchorOffsets,
    passes: normalizedPlan.schedule.map(step => ({
      order: step.order,
      label: step.label,
      offsetMinutes: step.offsetMinutes,
      anchor: step.anchor,
      action: step.action
    })),
    passColors: palette
  };
}

function sanitizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(att => att != null)
    .map(att => (typeof att === 'object' ? deepClone(att) : att));
}

export function normalizeLecturePasses({
  plan,
  passes,
  plannerDefaults,
  startAt,
  now = Date.now()
} = {}) {
  const normalizedPlan = normalizePassPlan(plan || DEFAULT_PASS_PLAN);
  const schedule = normalizedPlan.schedule;
  const existingList = Array.isArray(passes) ? passes : [];
  const existingByOrder = new Map();
  existingList.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const order = toNumber(entry.order, index + 1);
    if (!existingByOrder.has(order)) {
      existingByOrder.set(order, entry);
    }
  });
  const planner = normalizePlannerDefaults(plannerDefaults || {});
  const anchorConfig = {
    anchorOffsets: planner.anchorOffsets,
    schedule: planner.passes
  };
  const startTimestamp = Number.isFinite(startAt) ? startAt : now;
  const normalizedPasses = schedule.map((step, index) => {
    const existing = existingByOrder.get(step.order) || existingList[index] || {};
    const dueCandidate = Number.isFinite(existing?.due) ? existing.due : null;
    const due = dueCandidate != null
      ? dueCandidate
      : computeAnchoredDue(startTimestamp, step, anchorConfig);
    const completedAt = Number.isFinite(existing?.completedAt) ? existing.completedAt : null;
    const label = sanitizeLabel(existing?.label ?? step.label, step.order);
    const anchor = typeof (existing?.anchor ?? step.anchor) === 'string'
      ? (existing?.anchor ?? step.anchor)
      : inferAnchor(step.offsetMinutes);
    const attachments = sanitizeAttachments(existing.attachments);
    const action = sanitizeAction(existing?.action ?? step.action);
    return {
      order: step.order,
      label,
      offsetMinutes: step.offsetMinutes,
      anchor,
      due,
      completedAt,
      attachments,
      action
    };
  });
  return normalizedPasses;
}

export function calculateNextDue(passes) {
  if (!Array.isArray(passes) || !passes.length) return null;
  const dueTimes = passes
    .filter(pass => pass && !pass.completedAt)
    .map(pass => Number.isFinite(pass.due) ? pass.due : null)
    .filter(due => due != null)
    .sort((a, b) => a - b);
  return dueTimes.length ? dueTimes[0] : null;
}

export function deriveLectureStatus(passes, base = {}) {
  const total = Array.isArray(passes) ? passes.length : 0;
  const completed = Array.isArray(passes)
    ? passes.filter(pass => Number.isFinite(pass?.completedAt)).length
    : 0;
  const lastCompletedAt = Array.isArray(passes)
    ? passes.reduce((max, pass) => {
        const ts = Number.isFinite(pass?.completedAt) ? pass.completedAt : null;
        if (ts == null) return max;
        return max == null ? ts : Math.max(max, ts);
      }, null)
    : null;
  let state = 'pending';
  if (total === 0) {
    state = 'unscheduled';
  } else if (completed === 0) {
    state = 'pending';
  } else if (completed < total) {
    state = 'in-progress';
  } else {
    state = 'complete';
  }
  const merged = {
    ...base,
    completedPasses: completed,
    lastCompletedAt,
    state
  };
  return merged;
}

export function markPassCompleted(lecture, passIndex, completedAt = Date.now()) {
  if (!lecture || typeof lecture !== 'object') return null;
  const passes = Array.isArray(lecture.passes) ? lecture.passes.map(pass => ({ ...pass })) : [];
  if (!Number.isFinite(passIndex)) return { ...lecture, passes, nextDueAt: calculateNextDue(passes), status: deriveLectureStatus(passes, lecture.status) };
  if (passes.length === 0) {
    return { ...lecture, passes, nextDueAt: calculateNextDue(passes), status: deriveLectureStatus(passes, lecture.status) };
  }
  const clamped = Math.floor(passIndex);
  if (clamped < 0 || clamped >= passes.length) {
    return { ...lecture, passes, nextDueAt: calculateNextDue(passes), status: deriveLectureStatus(passes, lecture.status) };
  }
  if (passes[clamped]) {
    passes[clamped].completedAt = completedAt;
  }
  const status = deriveLectureStatus(passes, lecture.status);
  const nextDueAt = calculateNextDue(passes);
  return {
    ...lecture,
    passes,
    status,
    nextDueAt
  };
}

export function shiftLecturePasses(lecture, shiftMinutes, { includeCompleted = false } = {}) {
  if (!lecture || typeof lecture !== 'object') return null;
  const shiftMs = Math.round(toNumber(shiftMinutes, 0) * MINUTE_MS);
  const passes = Array.isArray(lecture.passes)
    ? lecture.passes.map(pass => {
        if (!pass || !Number.isFinite(pass.due)) return { ...pass };
        if (!includeCompleted && Number.isFinite(pass.completedAt)) {
          return { ...pass };
        }
        return { ...pass, due: pass.due + shiftMs };
      })
    : [];
  const status = deriveLectureStatus(passes, lecture.status);
  const nextDueAt = calculateNextDue(passes);
  return {
    ...lecture,
    passes,
    status,
    nextDueAt
  };
}

export function recalcLectureSchedule(lecture, { plannerDefaults, startAt, now = Date.now() } = {}) {
  if (!lecture || typeof lecture !== 'object') return null;
  const normalizedPlan = normalizePassPlan(lecture.passPlan || DEFAULT_PASS_PLAN);
  const normalizedPlanner = normalizePlannerDefaults(plannerDefaults || lecture.plannerDefaults || {});
  const passes = normalizeLecturePasses({
    plan: normalizedPlan,
    passes: lecture.passes,
    plannerDefaults: normalizedPlanner,
    startAt,
    now
  });
  const status = deriveLectureStatus(passes, lecture.status);
  const nextDueAt = calculateNextDue(passes);
  return {
    ...lecture,
    passPlan: normalizedPlan,
    plannerDefaults: normalizedPlanner,
    passes,
    status,
    nextDueAt
  };
}

export function groupLectureQueues(lectures, { now = Date.now() } = {}) {
  const result = {
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: []
  };
  if (!Array.isArray(lectures) || !lectures.length) return result;
  const startToday = startOfDay(now);
  const startTomorrow = startToday + DAY_MINUTES * MINUTE_MS;
  const startDayAfter = startTomorrow + DAY_MINUTES * MINUTE_MS;
  const addEntry = (bucket, entry) => {
    result[bucket].push(entry);
  };
  for (const lecture of lectures) {
    if (!lecture || typeof lecture !== 'object') continue;
    const passes = Array.isArray(lecture.passes) ? lecture.passes : [];
    const nextPass = passes.find(pass => pass && !Number.isFinite(pass.completedAt));
    const due = Number.isFinite(nextPass?.due) ? nextPass.due : null;
    const entry = { lecture, pass: nextPass || null, due };
    if (due == null) {
      addEntry('upcoming', entry);
      continue;
    }
    if (due <= now) {
      addEntry('overdue', entry);
    } else if (due < startTomorrow) {
      addEntry('today', entry);
    } else if (due < startDayAfter) {
      addEntry('tomorrow', entry);
    } else {
      addEntry('upcoming', entry);
    }
  }
  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => {
      if (a.due == null && b.due == null) return 0;
      if (a.due == null) return 1;
      if (b.due == null) return -1;
      return a.due - b.due;
    });
  }
  return result;
}

export function clonePlannerDefaults() {
  return clone(DEFAULT_PLANNER_DEFAULTS);
}

export function clonePassPlan(plan = DEFAULT_PASS_PLAN) {
  return clone(plan || DEFAULT_PASS_PLAN);
}

export function plannerDefaultsToPassPlan(defaults) {
  const normalized = normalizePlannerDefaults(defaults || {});
  const schedule = (normalized?.passes || []).map((step, index) => {
    const order = toNumber(step?.order, index + 1);
    const offsetMinutes = toNumber(
      step?.offsetMinutes,
      DEFAULT_PASS_PLAN.schedule[index]?.offsetMinutes ?? 0
    );
    const anchor = typeof step?.anchor === 'string' && step.anchor.trim()
      ? step.anchor.trim()
      : inferAnchor(offsetMinutes);
    const label = sanitizeLabel(step?.label, order);
    const action = sanitizeAction(step?.action ?? DEFAULT_PASS_PLAN.schedule[index]?.action);
    return { order, offsetMinutes, anchor, label, action };
  }).sort((a, b) => a.order - b.order);
  return {
    id: normalized?.id || 'planner-defaults',
    schedule
  };
}

