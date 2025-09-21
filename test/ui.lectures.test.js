import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

import { renderLectures } from '../js/ui/components/lectures.js';
import { state, resetLecturesState } from '../js/state.js';
import { initDB } from '../js/storage/storage.js';
import { saveLecture, listLecturesByBlock } from '../js/storage/lectures.js';
import { openDB } from '../js/storage/idb.js';
import { invalidateBlockCatalog } from '../js/storage/block-catalog.js';

async function clearStore(name) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function resetData() {
  await clearStore('items');
  await clearStore('blocks');
  await clearStore('lectures');
}

async function seedBlock(def) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('blocks', 'readwrite');
    const store = tx.objectStore('blocks');
    const now = Date.now();
    store.put({
      blockId: def.blockId,
      title: def.title,
      weeks: def.weeks,
      color: def.color || null,
      order: now,
      createdAt: now,
      updatedAt: now
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function waitFor(predicate, options = {}) {
  const { timeout = 500 } = options;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
}

describe('lectures management UI', () => {
  beforeEach(async () => {
    const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>', { url: 'https://example.org/' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    global.requestAnimationFrame = (cb) => cb();
    global.localStorage = dom.window.localStorage;
    localStorage.clear();
    resetLecturesState();
    state.tab = 'Lectures';
    await initDB();
    await resetData();
    invalidateBlockCatalog();
  });

  it('creates a lecture through the add dialog', async () => {
    await seedBlock({ blockId: 'cardio', title: 'Cardiology', weeks: 10, color: '#ffffff' });
    invalidateBlockCatalog();
    const root = document.getElementById('root');
    async function redraw() {
      await renderLectures(root, redraw);
    }
    await redraw();

    const addBtn = document.querySelector('[data-action="add-lecture"]');
    assert.ok(addBtn, 'Add lecture button should exist');
    addBtn.click();

    const form = document.querySelector('.lecture-dialog form');
    assert.ok(form, 'lecture dialog form should render');
    const nameInput = form.querySelector('[data-field="name"]');
    const weekInput = form.querySelector('[data-field="week"]');
    assert.ok(nameInput && weekInput);

    const numberInputs = Array.from(form.querySelectorAll('input[type="number"]'));
    const passCountInput = numberInputs.find(input => !input.dataset.field);
    assert.ok(passCountInput, 'Pass count input should exist');

    passCountInput.value = '2';
    passCountInput.dispatchEvent(new window.Event('change', { bubbles: true }));

    let actionSelects = [];
    await waitFor(() => {
      actionSelects = Array.from(form.querySelectorAll('.lecture-pass-action'));
      return actionSelects.length === 2;
    });
    assert.equal(actionSelects.length, 2);
    actionSelects[0].value = 'Notes';
    actionSelects[0].dispatchEvent(new window.Event('change', { bubbles: true }));
    actionSelects[1].value = 'Quiz';
    actionSelects[1].dispatchEvent(new window.Event('change', { bubbles: true }));

    nameInput.value = 'Intro to Cardio';
    weekInput.value = '1';

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();
    await waitFor(() => document.querySelectorAll('[data-lecture-row]').length === 1);

    const lectures = await listLecturesByBlock('cardio');
    assert.equal(lectures.length, 1);
    assert.equal(lectures[0].name, 'Intro to Cardio');
    assert.equal(lectures[0].id, 1);
    assert.equal(lectures[0].passPlan.schedule.length, 2);
    assert.equal(lectures[0].passPlan.schedule[1].action, 'Quiz');

    const rows = document.querySelectorAll('[data-lecture-row]');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].textContent.includes('Intro to Cardio'));
  });

  it('edits lecture details from the table', async () => {
    await seedBlock({ blockId: 'cardio', title: 'Cardiology', weeks: 10, color: '#ffffff' });
    await saveLecture({ blockId: 'cardio', id: 5, name: 'Foundations', week: 2 });
    invalidateBlockCatalog();

    const root = document.getElementById('root');
    async function redraw() {
      await renderLectures(root, redraw);
    }
    await redraw();

    const editBtn = document.querySelector('[data-lecture-row][data-lecture-id="5"] [data-action="edit-lecture"]');
    assert.ok(editBtn, 'Edit button should be rendered');
    editBtn.click();

    const form = document.querySelector('.lecture-dialog form');
    assert.ok(form, 'Edit dialog should open');
    const nameInput = form.querySelector('[data-field="name"]');
    const weekInput = form.querySelector('[data-field="week"]');
    assert.ok(nameInput && weekInput);

    nameInput.value = 'Updated Foundations';
    weekInput.value = '3';

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();
    await waitFor(() => {
      const row = document.querySelector('[data-lecture-row][data-lecture-id="5"]');
      return row && row.textContent.includes('Updated Foundations');
    });

    const lectures = await listLecturesByBlock('cardio');
    assert.equal(lectures.length, 1);
    assert.equal(lectures[0].name, 'Updated Foundations');
    assert.equal(lectures[0].week, 3);

    const row = document.querySelector('[data-lecture-row][data-lecture-id="5"]');
    assert.ok(row);
    assert.ok(row.textContent.includes('Updated Foundations'));
  });

  it('removes lectures after confirming deletion', async () => {
    await seedBlock({ blockId: 'cardio', title: 'Cardiology', weeks: 10, color: '#ffffff' });
    await saveLecture({ blockId: 'cardio', id: 7, name: 'Clinical Cases', week: 4 });
    invalidateBlockCatalog();

    const root = document.getElementById('root');
    async function redraw() {
      await renderLectures(root, redraw);
    }
    await redraw();

    const deleteBtn = document.querySelector('[data-lecture-row][data-lecture-id="7"] [data-action="delete-lecture"]');
    assert.ok(deleteBtn, 'Delete button should be present');
    deleteBtn.click();

    const modal = document.querySelector('.modal');
    assert.ok(modal, 'Confirmation modal should appear');
    const yesBtn = Array.from(modal.querySelectorAll('.btn')).find(btn => btn.textContent === 'Yes');
    assert.ok(yesBtn, 'Yes button should be available');
    yesBtn.click();

    await flush();
    await flush();
    await waitFor(() => document.querySelectorAll('[data-lecture-row]').length === 0);

    const lectures = await listLecturesByBlock('cardio');
    assert.equal(lectures.length, 0);

    const rows = document.querySelectorAll('[data-lecture-row]');
    assert.equal(rows.length, 0);
  });
});
