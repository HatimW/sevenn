import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uid } from '../js/utils.js';

test('uid generates unique values', () => {
  const ids = new Set();
  for (let i=0; i<1000; i++) {
    ids.add(uid());
  }
  assert.equal(ids.size, 1000);
});
