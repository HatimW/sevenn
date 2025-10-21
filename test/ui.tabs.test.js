import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { JSDOM } from 'jsdom';

import { state, setTab, setSubtab, setQuery } from '../js/state.js';
import { createAppShell } from '../js/app-shell.js';

const renderCardListMock = mock.fn(async (container, _source, kind) => {
  container.dataset.renderedKind = kind;
});
const renderCardsMock = mock.fn(async (container) => {
  container.dataset.rendered = 'cards';
});
const renderBuilderMock = mock.fn(async (container) => {
  container.dataset.rendered = 'builder';
});
const renderLecturesMock = mock.fn(async (container) => {
  container.dataset.rendered = 'lectures';
});
const renderFlashcardsMock = mock.fn(() => {});
const renderReviewMock = mock.fn(async () => {});
const renderQuizMock = mock.fn(() => {});
const renderBlockModeMock = mock.fn(() => {});
const renderBlockBoardMock = mock.fn(async (container) => {
  container.dataset.rendered = 'block-board';
});
const renderExamsMock = mock.fn(async (container) => {
  container.dataset.rendered = 'exams';
});
const renderExamRunnerMock = mock.fn(() => {});
const renderMapMock = mock.fn(async (container) => {
  container.dataset.rendered = 'map';
});
const renderSettingsMock = mock.fn(async (container) => {
  container.dataset.rendered = 'settings';
});
const createEntryAddControlMock = mock.fn((_redraw, kind) => {
  const control = document.createElement('div');
  control.className = 'add-control';
  control.dataset.kind = kind;
  return control;
});
const findItemsByFilterMock = mock.fn(() => ({
  async toArray() {
    return [];
  }
}));

const { renderApp, tabs } = createAppShell({
  state,
  setTab,
  setSubtab,
  setQuery,
  findItemsByFilter: findItemsByFilterMock,
  renderSettings: renderSettingsMock,
  renderCardList: renderCardListMock,
  renderCards: renderCardsMock,
  renderBuilder: renderBuilderMock,
  renderLectures: renderLecturesMock,
  renderFlashcards: renderFlashcardsMock,
  renderReview: renderReviewMock,
  renderQuiz: renderQuizMock,
  renderBlockMode: renderBlockModeMock,
  renderBlockBoard: renderBlockBoardMock,
  renderExams: renderExamsMock,
  renderExamRunner: renderExamRunnerMock,
  renderMap: renderMapMock,
  createEntryAddControl: createEntryAddControlMock
});

function resetState() {
  setTab('Block Board');
  setQuery('');
  state.subtab.Lists = 'Diseases';
  state.subtab.Study = 'Builder';
  state.flashSession = null;
  state.quizSession = null;
  state.examSession = null;
}

function resetMocks() {
  renderCardListMock.mock.resetCalls();
  renderCardsMock.mock.resetCalls();
  renderBuilderMock.mock.resetCalls();
  renderLecturesMock.mock.resetCalls();
  renderFlashcardsMock.mock.resetCalls();
  renderReviewMock.mock.resetCalls();
  renderQuizMock.mock.resetCalls();
  renderBlockModeMock.mock.resetCalls();
  renderBlockBoardMock.mock.resetCalls();
  renderExamsMock.mock.resetCalls();
  renderExamRunnerMock.mock.resetCalls();
  renderMapMock.mock.resetCalls();
  renderSettingsMock.mock.resetCalls();
  createEntryAddControlMock.mock.resetCalls();
  findItemsByFilterMock.mock.resetCalls();
}

describe('tab layout', () => {
  beforeEach(() => {
    resetMocks();
    resetState();
    const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    global.requestAnimationFrame = (cb) => cb();
  });

  it('exposes the new navigation order', () => {
    assert.deepStrictEqual(tabs, ['Block Board','Lists','Cards','Study','Exams','Map','Lectures']);
  });

  it('renders the lists tab with disease entries by default', async () => {
    setTab('Lists');
    await renderApp();
    assert.equal(renderCardListMock.mock.callCount(), 1);
    const firstCall = renderCardListMock.mock.calls[0];
    assert(firstCall);
    assert.equal(firstCall.arguments[2], 'disease');
    assert.equal(createEntryAddControlMock.mock.callCount(), 1);
    const buttons = document.querySelectorAll('.list-subtab');
    assert.equal(buttons.length, 3);
    const active = document.querySelector('.list-subtab.active');
    assert(active);
    assert.equal(active?.textContent, 'Diseases');
  });

  it('switches list subtabs when the selector is clicked', async () => {
    setTab('Lists');
    await renderApp();
    const conceptsBtn = Array.from(document.querySelectorAll('.list-subtab')).find(btn => btn.textContent === 'Concepts');
    assert(conceptsBtn);
    conceptsBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(state.subtab.Lists, 'Concepts');
    const lastCall = renderCardListMock.mock.calls.at(-1);
    assert(lastCall);
    assert.equal(lastCall.arguments[2], 'concept');
  });

  it('routes to the block board view', async () => {
    setTab('Block Board');
    await renderApp();
    assert.equal(renderBlockBoardMock.mock.callCount(), 1);
  });

  it('routes to lectures via the builder', async () => {
    setTab('Lectures');
    await renderApp();
    assert.equal(renderLecturesMock.mock.callCount(), 1);
  });

  it('smoke tests cards, study, exams, and map tabs', async () => {
    setTab('Cards');
    await renderApp();
    assert.equal(renderCardsMock.mock.callCount(), 1);

    setTab('Study');
    state.flashSession = null;
    state.quizSession = null;
    state.subtab.Study = 'Builder';
    await renderApp();
    assert.equal(renderBuilderMock.mock.callCount(), 1);

    setTab('Exams');
    state.examSession = null;
    await renderApp();
    assert.equal(renderExamsMock.mock.callCount(), 1);

    setTab('Map');
    await renderApp();
    assert.equal(renderMapMock.mock.callCount(), 1);
  });
});
