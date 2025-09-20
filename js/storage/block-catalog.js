import { listBlocks } from './storage.js';

let cache = null;
let pending = null;

function cloneBlock(block) {
  if (!block || typeof block !== 'object') return block;
  return { ...block };
}

function cloneLecture(lecture) {
  if (!lecture || typeof lecture !== 'object') return lecture;
  return { ...lecture };
}

function cloneLectureIndex(index) {
  const copy = {};
  for (const [blockId, lectures] of Object.entries(index || {})) {
    const next = {};
    for (const [lectureId, lecture] of Object.entries(lectures || {})) {
      next[lectureId] = cloneLecture(lecture);
    }
    copy[blockId] = next;
  }
  return copy;
}

function sortLectures(a, b) {
  const aw = a?.week ?? 0;
  const bw = b?.week ?? 0;
  if (aw !== bw) return aw - bw;
  const an = (a?.name || '').toLowerCase();
  const bn = (b?.name || '').toLowerCase();
  if (an !== bn) return an.localeCompare(bn);
  const ai = a?.id ?? 0;
  const bi = b?.id ?? 0;
  return ai - bi;
}

function buildLectureLists(index) {
  const map = {};
  for (const [blockId, lectures] of Object.entries(index || {})) {
    const list = Object.values(lectures || {}).map(cloneLecture);
    list.sort(sortLectures);
    map[blockId] = list;
  }
  return map;
}

function snapshotCatalog(source) {
  return {
    blocks: (source?.blocks || []).map(cloneBlock),
    lectureIndex: cloneLectureIndex(source?.lectureIndex || {}),
    lectureLists: Object.fromEntries(
      Object.entries(source?.lectureLists || {}).map(([blockId, list]) => [
        blockId,
        list.map(cloneLecture)
      ])
    )
  };
}

export async function loadBlockCatalog(options = {}) {
  if (!pending || options.force) {
    pending = (async () => {
      const { blocks, lectureIndex } = await listBlocks();
      const normalizedBlocks = (blocks || []).map(cloneBlock);
      const normalizedIndex = cloneLectureIndex(lectureIndex || {});
      const lectureLists = buildLectureLists(normalizedIndex);
      cache = { blocks: normalizedBlocks, lectureIndex: normalizedIndex, lectureLists };
      return snapshotCatalog(cache);
    })();
  }
  return pending;
}

export function getBlockCatalog() {
  if (!cache) return { blocks: [], lectureIndex: {}, lectureLists: {} };
  return snapshotCatalog(cache);
}

export function getLecturesForBlock(blockId) {
  if (!cache) return [];
  const list = cache.lectureLists?.[blockId];
  return Array.isArray(list) ? list.map(cloneLecture) : [];
}

export function getLectureIndex() {
  if (!cache) return {};
  return cloneLectureIndex(cache.lectureIndex || {});
}

export function invalidateBlockCatalog() {
  cache = null;
  pending = null;
}
