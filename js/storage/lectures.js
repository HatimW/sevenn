import { openDB } from './idb.js';
import { lectureKey, normalizeLectureRecord } from './lecture-schema.js';

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function prom(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lectureStore(mode = 'readonly') {
  const db = await openDB();
  return db.transaction('lectures', mode).objectStore('lectures');
}

async function fetchLecturesForBlock(storeRef, blockId) {
  if (!blockId) return [];
  try {
    if (typeof storeRef.index === 'function') {
      const idx = storeRef.index('by_block');
      if (idx && typeof idx.getAll === 'function') {
        const results = await prom(idx.getAll(blockId));
        return Array.isArray(results) ? results : [];
      }
    }
  } catch (err) {
    console.warn('Failed to use lecture block index, falling back to scan', err);
  }
  const all = await prom(storeRef.getAll());
  return (Array.isArray(all) ? all : []).filter(entry => entry?.blockId === blockId);
}

function buildNormalizedLecture(blockId, input, existing, now) {
  const lectureId = input?.id ?? existing?.id;
  if (blockId == null || lectureId == null) return null;
  const tags = Array.isArray(input?.tags)
    ? input.tags
    : Array.isArray(existing?.tags)
      ? existing.tags
      : undefined;
  const passes = Array.isArray(input?.passes)
    ? input.passes
    : Array.isArray(existing?.passes)
      ? existing.passes
      : undefined;
  const passPlan = input?.passPlan
    ? { ...(existing?.passPlan || {}), ...input.passPlan }
    : existing?.passPlan;
  const status = input?.status
    ? { ...(existing?.status || {}), ...input.status }
    : existing?.status;
  const plannerDefaults = input?.plannerDefaults
    ? { ...(existing?.plannerDefaults || {}), ...input.plannerDefaults }
    : existing?.plannerDefaults;
  const nextDueAt = input?.nextDueAt !== undefined
    ? input.nextDueAt
    : existing?.nextDueAt;

  const composite = {
    ...(existing || {}),
    ...(input || {}),
    blockId,
    id: lectureId,
    key: lectureKey(blockId, lectureId),
    tags,
    passes,
    passPlan,
    plannerDefaults,
    status,
    nextDueAt
  };

  const normalized = normalizeLectureRecord(blockId, composite, now);
  if (existing?.createdAt != null) normalized.createdAt = existing.createdAt;
  if (existing && !input?.passPlan && existing.passPlan) normalized.passPlan = clone(existing.passPlan);
  if (existing && !input?.status && existing.status) normalized.status = clone(existing.status);
  if (existing && !Array.isArray(input?.passes) && Array.isArray(existing.passes)) {
    normalized.passes = clone(existing.passes);
  }
  if (existing && !Array.isArray(input?.tags) && Array.isArray(existing.tags)) {
    normalized.tags = clone(existing.tags);
  }
  if (existing && input?.nextDueAt === undefined && existing.nextDueAt !== undefined) {
    normalized.nextDueAt = existing.nextDueAt ?? null;
  }
  return normalized;
}

export async function listLecturesByBlock(blockId) {
  try {
    const store = await lectureStore();
    const rows = await fetchLecturesForBlock(store, blockId);
    return rows.map(clone);
  } catch (err) {
    console.warn('listLecturesByBlock failed', err);
    return [];
  }
}

export async function listAllLectures() {
  try {
    const store = await lectureStore();
    const rows = await prom(store.getAll());
    return Array.isArray(rows) ? rows.map(clone) : [];
  } catch (err) {
    console.warn('listAllLectures failed', err);
    return [];
  }
}

export async function saveLecture(lecture) {
  if (!lecture || lecture.blockId == null || lecture.id == null) {
    throw new Error('Missing lecture identity for save');
  }
  const store = await lectureStore('readwrite');
  const key = lectureKey(lecture.blockId, lecture.id);
  const existing = await prom(store.get(key));
  const now = Date.now();
  const normalized = buildNormalizedLecture(lecture.blockId, lecture, existing, now);
  if (!normalized) throw new Error('Failed to normalize lecture payload');
  await prom(store.put(normalized));
  return clone(normalized);
}

export async function deleteLectureRecord(blockId, lectureId) {
  if (blockId == null || lectureId == null) return;
  const store = await lectureStore('readwrite');
  await prom(store.delete(lectureKey(blockId, lectureId)));
}

export async function removeLecturesForBlock(blockId) {
  if (!blockId) return;
  const store = await lectureStore('readwrite');
  const rows = await fetchLecturesForBlock(store, blockId);
  for (const row of rows) {
    await prom(store.delete(row.key));
  }
}

export async function bulkUpdateLectureStatus(updates) {
  if (!Array.isArray(updates) || !updates.length) return;
  const store = await lectureStore('readwrite');
  const now = Date.now();
  for (const update of updates) {
    if (!update || update.blockId == null || update.lectureId == null) continue;
    const key = lectureKey(update.blockId, update.lectureId);
    const existing = await prom(store.get(key));
    if (!existing) continue;
    const normalized = buildNormalizedLecture(
      update.blockId,
      {
        id: update.lectureId,
        status: update.status,
        passes: update.passes,
        nextDueAt: update.nextDueAt,
        passPlan: update.passPlan,
        tags: update.tags
      },
      existing,
      now
    );
    if (!normalized) continue;
    await prom(store.put(normalized));
  }
}

export {
  DEFAULT_PASS_PLAN,
  DEFAULT_LECTURE_STATUS,
  lectureKey
} from './lecture-schema.js';

