const DB_NAME = 'sevenn-db';
const DB_VERSION = 3;

const memoryStores = new Map([
  ['items', { keyPath: 'id' }],
  ['blocks', { keyPath: 'blockId' }],
  ['exams', { keyPath: 'id' }],
  ['settings', { keyPath: 'id' }],
  ['exam_sessions', { keyPath: 'examId' }]
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createMemoryDB() {
  const storeData = new Map();

  function ensureStore(name) {
    if (!storeData.has(name)) {
      storeData.set(name, new Map());
    }
    return storeData.get(name);
  }

  function getKey(name, value) {
    const keyPath = memoryStores.get(name)?.keyPath || 'id';
    const key = value?.[keyPath];
    if (key == null) {
      throw new Error(`Missing key for ${name}`);
    }
    return key;
  }

  function buildIndex(name, indexName, map) {
    if (name === 'items' && indexName === 'by_kind') {
      return {
        getAll(kind) {
          const items = Array.from(map.values()).filter(item => item?.kind === kind).map(clone);
          return Promise.resolve(items);
        }
      };
    }
    return {
      getAll() {
        return Promise.resolve([]);
      }
    };
  }

  function objectStore(name) {
    const map = ensureStore(name);
    return {
      get(key) {
        return Promise.resolve(clone(map.get(key)));
      },
      put(value) {
        const snapshot = clone(value);
        const key = getKey(name, snapshot);
        map.set(key, snapshot);
        return Promise.resolve(clone(snapshot));
      },
      delete(key) {
        map.delete(key);
        return Promise.resolve();
      },
      getAll() {
        return Promise.resolve(Array.from(map.values()).map(clone));
      },
      index(indexName) {
        return buildIndex(name, indexName, map);
      }
    };
  }

  return {
    transaction(name) {
      return {
        objectStore() {
          return objectStore(name);
        }
      };
    }
  };
}

export function openDB() {
  if (!('indexedDB' in globalThis)) {
    console.warn('IndexedDB not supported. Falling back to in-memory storage.');
    return Promise.resolve(createMemoryDB());
  }

  return new Promise((resolve, reject) => {
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

      if (!db.objectStoreNames.contains('exam_sessions')) {
        const sessions = db.createObjectStore('exam_sessions', { keyPath: 'examId' });
        sessions.createIndex('by_updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
  }).catch(err => {
    console.warn('Failed to open IndexedDB. Using in-memory storage instead.', err);
    return createMemoryDB();
  });
}
