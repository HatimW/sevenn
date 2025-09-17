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

test('buildTokens includes rich text content', () => {
  const item = { etiology: '<p>Heart <strong>Failure</strong> &amp; Shock</p>' };
  const tokens = buildTokens(item).split(' ');
  ['heart','failure','shock'].forEach(tok => {
    assert(tokens.includes(tok));
  });
});
