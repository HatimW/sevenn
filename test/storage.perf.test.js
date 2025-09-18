import test from 'node:test';
import assert from 'node:assert/strict';

import { initDB, upsertItem, findItemsByFilter } from '../js/storage/storage.js';

const TOTAL_ITEMS = 120;

const srDefaults = { box: 0, last: 0, due: 0, ease: 2.5 };

function createBaseDisease(id, name) {
  return {
    id,
    kind: 'disease',
    name,
    favorite: false,
    color: null,
    extras: [],
    facts: [],
    tags: [],
    links: [],
    blocks: [],
    weeks: [],
    lectures: [],
    sr: { ...srDefaults },
    etiology: '',
    pathophys: '',
    clinical: '',
    diagnosis: '',
    treatment: '',
    complications: '',
    mnemonic: ''
  };
}

test('findItemsByFilter yields batched, filtered results efficiently', async () => {
  await initDB();
  const base = `perf-${Date.now().toString(36)}`;
  const blockId = `block-${base}`;
  const markerTag = `marker${base}`;

  for (let i = 0; i < TOTAL_ITEMS; i++) {
    const id = `${base}-${i}`;
    const item = createBaseDisease(id, `Perf ${base} ${i}`);
    const hasBlock = i % 2 === 0;
    if (hasBlock) {
      item.blocks = [blockId];
      item.weeks = [1];
    }
    if (i % 3 === 0) {
      item.tags = [markerTag];
    }
    if (i % 10 === 0) {
      item.favorite = true;
    }
    await upsertItem(item);
  }

  const blockQuery = findItemsByFilter({ types: ['disease'], block: blockId, week: 1, query: base, sort: 'updated' });
  const batches = [];
  for await (const batch of blockQuery) {
    batches.push(batch);
  }
  const flattened = batches.flat();
  const expectedBlockMatches = Math.ceil(TOTAL_ITEMS / 2);
  assert.equal(flattened.length, expectedBlockMatches, 'block and week filters should intersect correctly');
  assert.ok(batches.length >= 2, 'results should be chunked into multiple batches');
  assert.ok(flattened.every(it => (it.blocks || []).includes(blockId)), 'all items should belong to the requested block');
  assert.ok(flattened.every(it => (it.weeks || []).includes(1)), 'all items should include the requested week');

  const repeated = await blockQuery.toArray();
  assert.deepEqual(repeated.map(it => it.id), flattened.map(it => it.id), 'cached materialization should match streamed batches');

  const favoritesQuery = findItemsByFilter({ types: ['disease'], onlyFav: true, query: base, sort: 'updated' });
  const favorites = await favoritesQuery.toArray();
  assert.ok(favorites.length > 0, 'favorites filter should return matches');
  assert.ok(favorites.every(it => it.favorite), 'favorites query should only include favorite items');

  const unlabeled = await findItemsByFilter({ types: ['disease'], block: '__unlabeled', query: base, sort: 'updated' }).toArray();
  assert.equal(unlabeled.length, expectedBlockMatches, 'unlabeled filter should return items without blocks');
  assert.ok(unlabeled.every(it => (it.blocks || []).length === 0), 'unlabeled results should have no block assignments');

  const tagMatches = await findItemsByFilter({ types: ['disease'], query: markerTag, sort: 'name' }).toArray();
  const expectedTagCount = Math.ceil(TOTAL_ITEMS / 3);
  assert.equal(tagMatches.length, expectedTagCount, 'tag query should locate all tagged items');
  assert.ok(tagMatches.every(it => (it.tags || []).includes(markerTag)), 'query results should include the marker tag');
  const sortedNames = tagMatches.map(it => it.name || it.concept || '');
  const namesCopy = [...sortedNames].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(sortedNames, namesCopy, 'name sort should order alphabetically');
});
