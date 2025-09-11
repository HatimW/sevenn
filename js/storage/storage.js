import { openDB } from './idb.js';
import { exportJSON, importJSON, exportAnkiCSV } from './export.js';

let dbPromise;

function prom(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await dbPromise;
  return db.transaction(name, mode).objectStore(name);
}

export async function initDB() {
  if (!dbPromise) dbPromise = openDB();
  const s = await store('settings', 'readwrite');
  const existing = await prom(s.get('app'));
  if (!existing) {
    await prom(s.put({ id: 'app', dailyCount: 20, theme: 'dark' }));
  }
}

export async function getSettings() {
  const s = await store('settings');
  const settings = await prom(s.get('app'));
  return settings || { id: 'app', dailyCount: 20, theme: 'dark' };
}

export async function saveSettings(patch) {
  const s = await store('settings', 'readwrite');
  const current = await prom(s.get('app')) || { id: 'app', dailyCount: 20, theme: 'dark' };
  const next = { ...current, ...patch, id: 'app' };
  await prom(s.put(next));
}

export async function listBlocks() {
  try {
    const b = await store('blocks');
    return await prom(b.getAll());
  } catch (err) {
    console.warn('listBlocks failed', err);
    return [];
  }
}

export async function upsertBlock(def) {
  const b = await store('blocks', 'readwrite');
  const existing = await prom(b.get(def.blockId));
  const now = Date.now();
  const next = {
    ...def,
    lectures: def.lectures || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  await prom(b.put(next));
}

export async function deleteBlock(blockId) {
  const b = await store('blocks', 'readwrite');
  await prom(b.delete(blockId));
}

import { buildTokens, tokenize } from '../search.js';
import { cleanItem } from '../validators.js';

export async function listItemsByKind(kind) {
  const i = await store('items');
  const idx = i.index('by_kind');
  return await prom(idx.getAll(kind));
}

function titleOf(item){
  return item.name || item.concept || '';
}

export async function findItemsByFilter(filter) {
  const i = await store('items');
  let items = await prom(i.getAll());

  if (filter.types && filter.types.length) {
    items = items.filter(it => filter.types.includes(it.kind));
  }
  if (filter.block) {
    items = items.filter(it => (it.blocks || []).includes(filter.block));
  }
  if (filter.week) {
    items = items.filter(it => (it.weeks || []).includes(filter.week));
  }
  if (filter.onlyFav) {
    items = items.filter(it => it.favorite);
  }
  if (filter.query && filter.query.trim()) {
    const toks = tokenize(filter.query);
    items = items.filter(it => {
      const t = it.tokens || '';
      return toks.every(tok => t.includes(tok));
    });
  }
  if (filter.sort === 'name') {
    items.sort((a,b) => titleOf(a).localeCompare(titleOf(b)));
  } else {
    items.sort((a,b) => b.updatedAt - a.updatedAt);
  }
  return items;
}

export async function getItem(id) {
  const i = await store('items');
  return await prom(i.get(id));
}

export async function upsertItem(item) {
  const i = await store('items', 'readwrite');
  const existing = await prom(i.get(item.id));
  const now = Date.now();
  const next = cleanItem({
    ...item,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  next.tokens = buildTokens(next);
  // enforce link symmetry (basic)
  for (const link of next.links) {
    const other = await prom(i.get(link.id));
    if (other) {
      other.links = other.links || [];
      if (!other.links.find(l => l.id === next.id)) {
        other.links.push({ id: next.id, type: link.type });
        other.tokens = buildTokens(other);
        await prom(i.put(other));
      }
    }
  }
  await prom(i.put(next));
}

export async function deleteItem(id) {
  const i = await store('items', 'readwrite');
  const all = await prom(i.getAll());
  for (const it of all) {
    if (it.links?.some(l => l.id === id)) {
      it.links = it.links.filter(l => l.id !== id);
      it.tokens = buildTokens(it);
      await prom(i.put(it));
    }
  }
  await prom(i.delete(id));
}

export async function listExams() {
  const e = await store('exams');
  return await prom(e.getAll());
}

export async function upsertExam(exam) {
  const e = await store('exams', 'readwrite');
  const existing = await prom(e.get(exam.id));
  const now = Date.now();
  const next = {
    ...exam,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    results: exam.results || existing?.results || []
  };
  await prom(e.put(next));
}

export async function deleteExam(id) {
  const e = await store('exams', 'readwrite');
  await prom(e.delete(id));
}

// export/import helpers
export { exportJSON, importJSON, exportAnkiCSV };
