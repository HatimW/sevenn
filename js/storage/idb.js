const DB_NAME = 'sevenn-db';
const DB_VERSION = 1;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    const timer = setTimeout(() => reject(new Error('IndexedDB open timeout')), 5000);
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('by_kind', 'kind');
        items.createIndex('by_updatedAt', 'updatedAt');
        items.createIndex('by_favorite', 'favorite');
        items.createIndex('by_blocks', 'blocks', { multiEntry: true });
        items.createIndex('by_weeks', 'weeks', { multiEntry: true });
        items.createIndex('by_lecture_ids', 'lectures.id', { multiEntry: true });
        items.createIndex('by_search', 'tokens');
      }

      if (!db.objectStoreNames.contains('blocks')) {
        const blocks = db.createObjectStore('blocks', { keyPath: 'blockId' });
        blocks.createIndex('by_title', 'title');
        blocks.createIndex('by_createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains('exams')) {
        const exams = db.createObjectStore('exams', { keyPath: 'id' });
        exams.createIndex('by_createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
  });
}
