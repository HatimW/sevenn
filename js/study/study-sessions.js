import { state, setStudySessions, setStudySessionEntry, clearStudySessionsState } from '../state.js';
import { listStudySessions, saveStudySessionRecord, deleteStudySessionRecord, clearAllStudySessionRecords } from '../storage/storage.js';

let pendingLoad = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
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
          map[entry.mode] = entry;
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
    session: clone(payload?.session ?? {}),
    cohort: clone(payload?.cohort ?? []),
    metadata: clone(payload?.metadata ?? {})
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
