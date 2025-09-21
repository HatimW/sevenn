import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { JSDOM } from 'jsdom';

import { state } from '../js/state.js';
import { renderBlockBoard, __setBlockBoardDeps } from '../js/ui/components/block-board.js';

const BASE_TIME = Date.now() - 60 * 60 * 1000;

function setupBoardDeps({ blocks, lectures }) {
  const loadBlockCatalogMock = mock.fn(async () => ({ blocks }));
  const listAllLecturesMock = mock.fn(async () => lectures);
  const saveLectureMock = mock.fn(async (payload) => payload);
  __setBlockBoardDeps({
    loadBlockCatalog: loadBlockCatalogMock,
    listAllLectures: listAllLecturesMock,
    saveLecture: saveLectureMock
  });
  return { loadBlockCatalogMock, listAllLecturesMock, saveLectureMock };
}

describe('block board rendering', () => {
  let container;
  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    container = document.createElement('div');
    document.body.appendChild(container);
    state.blockBoard = { collapsedBlocks: [], showDensity: true, showPomodoro: false };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    __setBlockBoardDeps({});
    mock.restoreAll();
  });

  function sampleData() {
    return {
      blocks: [{ blockId: 'b1', title: 'Cardiology' }],
      lectures: [
        {
          blockId: 'b1',
          id: 'L1',
          name: 'Intro lecture',
          passes: [
            { order: 1, label: 'Pass 1', due: BASE_TIME, completedAt: null }
          ]
        }
      ]
    };
  }

  it('renders urgent queues and wires action buttons', async () => {
    const data = sampleData();
    const { saveLectureMock } = setupBoardDeps(data);
    await renderBlockBoard(container, () => {});
    const urgentHeaders = container.querySelectorAll('.block-board-urgent-header');
    assert.equal(urgentHeaders.length, 3);
    const markBtn = Array.from(container.querySelectorAll('.block-board-pass-actions button')).find(btn => btn.textContent?.includes('Mark done'));
    assert(markBtn);
    markBtn.click();
    await renderBlockBoard(container, () => {});
    assert.equal(saveLectureMock.mock.callCount(), 1);

    const delayBtn = Array.from(container.querySelectorAll('.block-board-pass-actions button')).find(btn => btn.textContent?.includes('+1 day'));
    assert(delayBtn);
    delayBtn.click();
    await renderBlockBoard(container, () => {});
    assert.equal(saveLectureMock.mock.callCount(), 2);

    const pushAllBtn = Array.from(container.querySelectorAll('.block-board-urgent-header .btn.tertiary')).find(btn => btn.textContent?.includes('Push all'));
    assert(pushAllBtn);
    pushAllBtn.click();
    await renderBlockBoard(container, () => {});
    assert.equal(saveLectureMock.mock.callCount(), 3);
  });

  it('persists density, collapse, and pomodoro state', async () => {
    const data = sampleData();
    setupBoardDeps(data);
    await renderBlockBoard(container, () => {});
    const densityBtn = Array.from(container.querySelectorAll('.block-board-block-controls .btn.secondary')).find(btn => btn.textContent?.toLowerCase().includes('density'));
    assert(densityBtn);
    densityBtn.click();
    await renderBlockBoard(container, () => {});
    assert.equal(state.blockBoard.showDensity, false);

    const collapseBtn = Array.from(container.querySelectorAll('.block-board-block-controls .btn.secondary')).find(btn => btn.textContent?.toLowerCase().includes('collapse'));
    assert(collapseBtn);
    collapseBtn.click();
    await renderBlockBoard(container, () => {});
    assert(state.blockBoard.collapsedBlocks.includes('b1'));

    const pomodoroToggle = container.querySelector('.block-board-pomodoro .btn.secondary');
    assert(pomodoroToggle);
    pomodoroToggle.click();
    await Promise.resolve();
    assert.equal(state.blockBoard.showPomodoro, true);
  });

  it('supports drag and drop scheduling updates', async () => {
    const data = sampleData();
    const { saveLectureMock } = setupBoardDeps(data);
    await renderBlockBoard(container, () => {});
    const columns = container.querySelectorAll('.block-board-day-column');
    assert(columns.length > 1);
    const targetColumn = columns[1];
    const payload = {
      blockId: 'b1',
      lectureId: 'L1',
      passOrder: 1,
      due: BASE_TIME
    };
    const dropEvent = new window.Event('drop', { bubbles: true, cancelable: true });
    dropEvent.dataTransfer = {
      getData: () => JSON.stringify(payload)
    };
    targetColumn.dispatchEvent(dropEvent);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(saveLectureMock.mock.callCount(), 1);
  });
});
