import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, buildTokens } from '../js/search.js';

test('tokenize splits and lowercases', () => {
  assert.deepEqual(tokenize('Hello, World!'), ['hello','world']);
});

test('buildTokens gathers fields', () => {
  const item = { name:'Alpha', facts:['beta'], tags:['gamma'], lectures:[{name:'Delta'}] };
  const tokens = buildTokens(item).split(' ');
  ['alpha','beta','gamma','delta'].forEach(tok => {
    assert(tokens.includes(tok));
  });
});
