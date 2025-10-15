import { state, setStudySessions, setStudySessionEntry, clearStudySessionsState } from '../state.js';
import { listStudySessions, saveStudySessionRecord, deleteStudySessionRecord, clearAllStudySessionRecords } from '../storage/storage.js';
import { deepClone } from '../utils.js';

let pendingLoad = null;

function clone(value) {
  if (value === undefined) return null;
  return deepClone(value);
}

function safeClone(value, fallback = null) {
  try {
    const result = clone(value);
    if (result === null && fallback !== undefined) {
      return clone(fallback ?? null);
    }
    return result;
  } catch (err) {
    console.warn('Failed to clone study session value', err);
    if (fallback === undefined) return null;
    try {
      return clone(fallback ?? null);
    } catch (_) {
      if (Array.isArray(fallback)) return [];
      if (fallback && typeof fallback === 'object') return {};
      return fallback ?? null;
    }
  }
}

function sanitizeRatings(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const next = {};
  Object.entries(map).forEach(([key, value]) => {
    if (typeof key !== 'string') return;
    if (typeof value === 'string') {
      next[key] = value;
    }
  });
  return next;
}

function sanitizeAnswers(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const next = {};
  Object.entries(map).forEach(([key, value]) => {
    if (typeof key !== 'string' || !value || typeof value !== 'object') return;
    const entry = {
      value: typeof value.value === 'string' ? value.value : '',
      isCorrect: Boolean(value.isCorrect),
      checked: Boolean(value.checked),
      revealed: Boolean(value.revealed)
    };
    next[key] = entry;
  });
  return next;
}

function sanitizePoolEntry(entry) {
  if (entry === null || entry === undefined) return null;
  if (typeof entry !== 'object') return entry;
  return safeClone(entry, {});
}

function sanitizeSession(mode, session) {
  const source = safeClone(session, {});
  const next = source && typeof source === 'object' ? source : {};
  delete next.dict;
  if (Array.isArray(next.pool)) {
    next.pool = next.pool.map(item => sanitizePoolEntry(item)).filter(item => item !== null && item !== undefined);
  } else {
    next.pool = [];
  }
  if (typeof next.idx !== 'number' || Number.isNaN(next.idx)) {
    next.idx = 0;
  }
  next.idx = next.pool.length ? Math.max(0, Math.min(Math.floor(next.idx), next.pool.length - 1)) : 0;
  if (next.answers && typeof next.answers === 'object' && !Array.isArray(next.answers)) {
    next.answers = sanitizeAnswers(next.answers);
  } else if (next.answers !== undefined) {
    next.answers = {};
  }
  if (next.ratings && typeof next.ratings === 'object' && !Array.isArray(next.ratings)) {
    next.ratings = sanitizeRatings(next.ratings);
  } else {
    next.ratings = {};
  }
  if (mode === 'review') {
    next.mode = 'review';
  } else if (typeof next.mode !== 'string' || next.mode !== 'review') {
    next.mode = 'study';
  }
  return next;
}

function sanitizeCohort(list) {
  const cloned = safeClone(list, []);
  if (!Array.isArray(cloned)) return [];
  return cloned.map(item => sanitizePoolEntry(item)).filter(item => item !== null && item !== undefined);
}

function sanitizeMetadata(meta) {
  const cloned = safeClone(meta, {});
  return cloned && typeof cloned === 'object' && !Array.isArray(cloned) ? cloned : {};
}

export async function hydrateStudySessions(force = false) {
  if (!force && state.studySessionsLoaded) {
    return state.studySessions || {};
  }
  if (!pendingLoad) {
    pendingLoad = listStudySessions().then(entries => {
      const map = {};
      entries.forEach(entry => {
        if (entry && entry.mode) {
          map[entry.mode] = {
            mode: entry.mode,
            updatedAt: entry.updatedAt || Date.now(),
            session: sanitizeSession(entry.mode, entry.session),
            cohort: sanitizeCohort(entry.cohort),
            metadata: sanitizeMetadata(entry.metadata)
          };
        }
      });
      setStudySessions(map);
      return state.studySessions;
    }).catch(err => {
      console.error('Failed to load study sessions', err);
      clearStudySessionsState();
      setStudySessions({});
      return state.studySessions;
    }).finally(() => {
      pendingLoad = null;
    });
  }
  return pendingLoad;
}

export function getStudySessionEntry(mode) {
  return (state.studySessions && state.studySessions[mode]) || null;
}

export async function persistStudySession(mode, payload) {
  if (!mode) throw new Error('Mode is required to save study session');
  const entry = {
    mode,
    updatedAt: Date.now(),
    session: sanitizeSession(mode, payload?.session ?? {}),
    cohort: sanitizeCohort(payload?.cohort ?? []),
    metadata: sanitizeMetadata(payload?.metadata ?? {})
  };
  await saveStudySessionRecord(entry);
  setStudySessionEntry(mode, entry);
  return entry;
}

export async function removeStudySession(mode) {
  if (!mode) return;
  await deleteStudySessionRecord(mode);
  setStudySessionEntry(mode, null);
}

export async function removeAllStudySessions() {
  await clearAllStudySessionRecords();
  setStudySessions({});
}
