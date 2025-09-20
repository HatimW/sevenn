import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import {
  initDB,
  saveLecture,
  listBlocks
} from '../js/storage/storage.js';
import { openDB } from '../js/storage/idb.js';
import {
  loadBlockCatalog,
  getBlockCatalog,
  getLecturesForBlock,
  invalidateBlockCatalog
} from '../js/storage/block-catalog.js';

async function seedBlocks() {
  await initDB();
  const db = await openDB();
  const clearStore = (storeName) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  await clearStore('lectures');
  await clearStore('blocks');
  invalidateBlockCatalog();
  const putBlock = (record) => new Promise((resolve, reject) => {
    const tx = db.transaction('blocks', 'readwrite');
    const store = tx.objectStore('blocks');
    const req = store.put(record);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  const now = Date.now();
  await putBlock({ blockId: 'cardio', title: 'Cardiology', color: '#ff0000', weeks: 4, order: now + 2, createdAt: now + 2 });
  await putBlock({ blockId: 'neuro', title: 'Neurology', color: '#0000ff', weeks: 6, order: now + 1, createdAt: now + 1 });

  await saveLecture({ blockId: 'cardio', id: 2, name: 'Vascular', week: 3 });
  await saveLecture({ blockId: 'cardio', id: 1, name: 'Basics', week: 1 });
  await saveLecture({ blockId: 'neuro', id: 7, name: 'Motor pathways', week: 4 });
}

test('block catalog normalizes lecture data and refreshes snapshots', async () => {
  await seedBlocks();
  const { blocks, lectureIndex } = await listBlocks();

  assert.equal(blocks.length, 2);
  assert.ok(!('lectures' in blocks[0]), 'blocks should not embed lecture arrays');
  assert.ok(lectureIndex.cardio, 'lecture index contains cardio block');
  assert.ok(lectureIndex.neuro, 'lecture index contains neuro block');
  assert.equal(Object.keys(lectureIndex.cardio).length, 2);
  assert.equal(lectureIndex.cardio[1].name, 'Basics');
  assert.equal(lectureIndex.cardio[1].week, 1);
  assert.equal(lectureIndex.cardio[2].week, 3);

  const catalog = await loadBlockCatalog();
  const cardioLectures = catalog.lectureLists.cardio || [];
  assert.deepEqual(cardioLectures.map(l => l.id), [1, 2], 'lectures sorted by week and id');

  const snapshot = getBlockCatalog();
  assert.equal(snapshot.blocks.length, 2);
  assert.equal(snapshot.lectureIndex.cardio['1'].name, 'Basics');

  const lectureSlice = getLecturesForBlock('cardio');
  assert.deepEqual(lectureSlice.map(l => l.id), [1, 2]);
  lectureSlice[0].name = 'Mutated';
  const secondRead = getLecturesForBlock('cardio');
  assert.equal(secondRead[0].name, 'Basics', 'lecture snapshots are cloned per read');

  await saveLecture({ blockId: 'cardio', id: 3, name: 'Arrhythmias', week: 4 });
  invalidateBlockCatalog();
  const refreshed = await loadBlockCatalog();
  assert.equal(refreshed.lectureLists.cardio.length, 3, 'catalog refresh picks up new lectures');
});
