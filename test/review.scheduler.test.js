import test from 'node:test';
import assert from 'node:assert/strict';

import { rateSection, collectDueSections, collectUpcomingSections } from '../js/review/scheduler.js';
import { DEFAULT_REVIEW_STEPS, RETIRE_RATING } from '../js/review/constants.js';

const baseDurations = { ...DEFAULT_REVIEW_STEPS };

function createItem({ id, kind = 'disease', fields = {}, sr = null }) {
  return {
    id,
    kind,
    name: id,
    etiology: '',
    pathophys: '',
    clinical: '',
    diagnosis: '',
    treatment: '',
    complications: '',
    mnemonic: '',
    ...fields,
    sr: sr || { version: 2, sections: {} },
    blocks: [],
    lectures: []
  };
}

test('rateSection schedules intervals based on ratings', () => {
  const item = createItem({ id: 'alpha' });
  const now = Date.now();

  let state = rateSection(item, 'etiology', 'again', baseDurations, now);
  assert.equal(state.streak, 0);
  assert.equal(state.lastRating, 'again');
  assert.equal(state.retired, false);
  assert.ok(Math.abs(state.due - (now + baseDurations.again * 60 * 1000)) < 5 * 1000);

  const later = now + 1000;
  state = rateSection(item, 'etiology', 'good', baseDurations, later);
  assert.equal(state.streak, 1);
  const expectedGood = later + baseDurations.good * 60 * 1000;
  assert.ok(Math.abs(state.due - expectedGood) < 5 * 1000);

  const evenLater = later + 1000;
  state = rateSection(item, 'etiology', 'easy', baseDurations, evenLater);
  assert.equal(state.streak, 3);
  const expectedEasy = evenLater + baseDurations.easy * 3 * 60 * 1000;
  assert.ok(Math.abs(state.due - expectedEasy) < 5 * 1000);

  state = rateSection(item, 'etiology', RETIRE_RATING, baseDurations, evenLater + 1000);
  assert.equal(state.retired, true);
  assert.equal(state.lastRating, RETIRE_RATING);
  assert.equal(state.due, Number.MAX_SAFE_INTEGER);
});

test('collectDueSections returns only active overdue sections', () => {
  const now = Date.now();
  const overdue = createItem({
    id: 'due-1',
    fields: { etiology: '<p>text</p>' },
    sr: {
      version: 2,
      sections: {
        etiology: { streak: 1, lastRating: 'good', last: now - 10_000, due: now - 1_000, retired: false }
      }
    }
  });
  const future = createItem({
    id: 'future-1',
    fields: { etiology: '<p>later</p>' },
    sr: {
      version: 2,
      sections: {
        etiology: { streak: 1, lastRating: 'good', last: now - 10_000, due: now + 60_000, retired: false }
      }
    }
  });
  const retired = createItem({
    id: 'retired-1',
    fields: { etiology: '<p>skip</p>' },
    sr: {
      version: 2,
      sections: {
        etiology: { streak: 1, lastRating: RETIRE_RATING, last: now - 10_000, due: Number.MAX_SAFE_INTEGER, retired: true }
      }
    }
  });

  const results = collectDueSections([overdue, future, retired], { now });
  assert.equal(results.length, 1);
  assert.equal(results[0].itemId, 'due-1');
  assert.equal(results[0].sectionKey, 'etiology');
});

test('collectUpcomingSections lists future reviews in order', () => {
  const now = Date.now();
  const soon = createItem({
    id: 'future-soon',
    fields: { etiology: '<p>soon</p>' },
    sr: {
      version: 2,
      sections: {
        etiology: { streak: 2, lastRating: 'good', last: now - 5_000, due: now + 5 * 60_000, retired: false }
      }
    }
  });
  const later = createItem({
    id: 'future-later',
    fields: { etiology: '<p>later</p>' },
    sr: {
      version: 2,
      sections: {
        etiology: { streak: 3, lastRating: 'easy', last: now - 5_000, due: now + 120 * 60_000, retired: false }
      }
    }
  });
  const overdue = createItem({
    id: 'due-now',
    fields: { etiology: '<p>now</p>' },
    sr: {
      version: 2,
      sections: {
        etiology: { streak: 1, lastRating: 'good', last: now - 5_000, due: now - 60_000, retired: false }
      }
    }
  });

  const results = collectUpcomingSections([soon, later, overdue], { now });
  assert.equal(results.length, 2);
  assert.equal(results[0].itemId, 'future-soon');
  assert.equal(results[1].itemId, 'future-later');

  const limited = collectUpcomingSections([soon, later, overdue], { now, limit: 1 });
  assert.equal(limited.length, 1);
  assert.equal(limited[0].itemId, 'future-soon');
});
