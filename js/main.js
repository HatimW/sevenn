import { state, setTab, setSubtab, setFlashSession, setQuizSession, setQuery } from './state.js';
import { initDB, findItemsByFilter } from './storage/storage.js';
import { renderSettings } from './ui/settings.js';
import { renderCardList } from './ui/components/cardlist.js';
import { renderCards } from './ui/components/cards.js';
import { renderBuilder } from './ui/components/builder.js';
import { renderFlashcards } from './ui/components/flashcards.js';
import { renderReview } from './ui/components/review.js';
import { renderQuiz } from './ui/components/quiz.js';
import { renderBlockMode } from './ui/components/block-mode.js';
import { renderExams, renderExamRunner } from './ui/components/exams.js';
import { renderMap } from './ui/components/map.js';
import { createEntryAddControl } from './ui/components/entry-controls.js';

const tabs = ["Diseases","Drugs","Concepts","Cards","Study","Exams","Map","Settings"];

async function render() {
  const root = document.getElementById('app');
  const prevFocused = document.activeElement;
  const shouldPreserveSearch =
    prevFocused && prevFocused.dataset && prevFocused.dataset.persistFocus === 'main-search';
  let prevSelection = null;
  if (shouldPreserveSearch) {
    try {
      prevSelection = {
        start: prevFocused.selectionStart ?? prevFocused.value.length,
        end: prevFocused.selectionEnd ?? prevFocused.value.length
      };
    } catch (_) {
      prevSelection = null;
    }
  }

  root.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'header';

  const headerInner = document.createElement('div');
  headerInner.className = 'header-inner';
  header.appendChild(headerInner);

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = '✨ Sevenn';
  const headerLeft = document.createElement('div');
  headerLeft.className = 'header-left';
  headerLeft.appendChild(brand);

  const primaryTabs = tabs.filter(t => t !== 'Settings');

  const nav = document.createElement('nav');
  nav.className = 'tabs';

  primaryTabs.forEach(t => {
    const btn = document.createElement('button');
    const kindClass = { Diseases:'disease', Drugs:'drug', Concepts:'concept' }[t];
    btn.className = 'tab' + (state.tab === t ? ' active' : '');
    if (kindClass) btn.classList.add(kindClass);
    btn.textContent = t;
    btn.addEventListener('click', () => {
      setTab(t);
      render();
    });
    nav.appendChild(btn);
  });

  headerLeft.appendChild(nav);
  headerInner.appendChild(headerLeft);

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'search-input';
  search.placeholder = 'Search';
  search.value = state.query;
  search.dataset.persistFocus = 'main-search';
  search.addEventListener('input', e => {
    setQuery(e.target.value);
    render();
  });

  const headerControls = document.createElement('div');
  headerControls.className = 'header-controls';
  headerControls.appendChild(search);

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'icon-button settings-btn' + (state.tab === 'Settings' ? ' active' : '');
  settingsButton.setAttribute('aria-label', 'Open settings');
  settingsButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm9.18-3.5a1 1 0 0 1-.17 1.12l-1.54 1.77c.06.33.1.67.1 1.01s-.04.68-.1 1.01l1.54 1.77a1 1 0 0 1 .17 1.12l-1.3 2.25a1 1 0 0 1-1.07.49l-2.24-.45a8.2 8.2 0 0 1-1.75 1.01l-.34 2.26a1 1 0 0 1-.98.84h-2.6a1 1 0 0 1-.98-.84l-.34-2.26a8.2 8.2 0 0 1-1.75-1.01l-2.24.45a1 1 0 0 1-1.07-.49l-1.3-2.25a1 1 0 0 1 .17-1.12l1.54-1.77A7.6 7.6 0 0 1 4 15.9c0-.34.04-.68.1-1.01L2.56 13.1a1 1 0 0 1-.17-1.12l1.3-2.25a1 1 0 0 1 1.07-.49l2.24.45c.54-.4 1.13-.73 1.75-1.01l.34-2.26a1 1 0 0 1 .98-.84h2.6a1 1 0 0 1 .98.84l.34 2.26c.62.28 1.21.61 1.75 1.01l2.24-.45a1 1 0 0 1 1.07.49l1.3 2.25Zm-3.62.5c0-3.05-2.51-5.54-5.56-5.54-3.05 0-5.56 2.49-5.56 5.54 0 3.05 2.51 5.54 5.56 5.54 3.05 0 5.56-2.49 5.56-5.54Z" />
    </svg>
  `;
  settingsButton.addEventListener('click', () => {
    setTab('Settings');
    render();
  });
  headerControls.appendChild(settingsButton);

  headerInner.appendChild(headerControls);
  root.appendChild(header);

  if (shouldPreserveSearch) {
    queueMicrotask(() => {
      search.focus();
      if (prevSelection && typeof prevSelection.start === 'number' && typeof prevSelection.end === 'number') {
        try {
          search.setSelectionRange(prevSelection.start, prevSelection.end);
        } catch (_) {
          // Ignore if the browser disallows selection on search inputs
        }
      }
    });
  }

  const main = document.createElement('main');
  if (state.tab === 'Map') main.className = 'map-main';
  root.appendChild(main);
  if (state.tab === 'Settings') {
    await renderSettings(main);
  } else if (['Diseases','Drugs','Concepts'].includes(state.tab)) {
    const kindMap = { Diseases:'disease', Drugs:'drug', Concepts:'concept' };
    const kind = kindMap[state.tab];
    main.appendChild(createEntryAddControl(render, kind));

    const listHost = document.createElement('div');
    listHost.className = 'tab-content';
    main.appendChild(listHost);

    const filter = { ...state.filters, types:[kind], query: state.query };
    const items = await findItemsByFilter(filter);
    await renderCardList(listHost, items, kind, render);
  } else if (state.tab === 'Cards') {
    main.appendChild(createEntryAddControl(render, 'disease'));
    const content = document.createElement('div');
    content.className = 'tab-content';
    main.appendChild(content);
    const filter = { ...state.filters, query: state.query };
    const items = await findItemsByFilter(filter);
    renderCards(content, items, render);
  } else if (state.tab === 'Study') {
    main.appendChild(createEntryAddControl(render, 'disease'));
    const content = document.createElement('div');
    content.className = 'tab-content';
    main.appendChild(content);
    if (state.flashSession) {
      renderFlashcards(content, render);
    } else if (state.quizSession) {
      renderQuiz(content, render);
    } else {
      const wrap = document.createElement('div');
      await renderBuilder(wrap);
      content.appendChild(wrap);

      const subnav = document.createElement('div');
      subnav.className = 'tabs row subtabs';
      ['Flashcards','Review','Quiz','Blocks'].forEach(st => {
        const sb = document.createElement('button');
        sb.className = 'tab' + (state.subtab.Study === st ? ' active' : '');
        sb.textContent = st;
        sb.addEventListener('click', () => {
          setSubtab('Study', st);
          render();
        });
        subnav.appendChild(sb);
      });
      content.appendChild(subnav);

      if (state.cohort.length) {
        if (state.subtab.Study === 'Flashcards') {
          const startBtn = document.createElement('button');
          startBtn.className = 'btn';
          startBtn.textContent = 'Start Flashcards';
          startBtn.addEventListener('click', () => {
            setFlashSession({ idx: 0, pool: state.cohort });
            render();
          });
          content.appendChild(startBtn);
        } else if (state.subtab.Study === 'Review') {
          renderReview(content, render);
        } else if (state.subtab.Study === 'Quiz') {
          const startBtn = document.createElement('button');
          startBtn.className = 'btn';
          startBtn.textContent = 'Start Quiz';
          startBtn.addEventListener('click', () => {
            setQuizSession({ idx:0, score:0, pool: state.cohort });
            render();
          });
          content.appendChild(startBtn);
        } else if (state.subtab.Study === 'Blocks') {
          renderBlockMode(content);
        }
      }
    }
  } else if (state.tab === 'Exams') {
    main.appendChild(createEntryAddControl(render, 'disease'));
    const content = document.createElement('div');
    content.className = 'tab-content';
    main.appendChild(content);
    if (state.examSession) {
      renderExamRunner(content, render);
    } else {
      await renderExams(content, render);
    }
  } else if (state.tab === 'Map') {
    main.appendChild(createEntryAddControl(render, 'disease'));
    const mapHost = document.createElement('div');
    mapHost.className = 'tab-content map-host';
    main.appendChild(mapHost);
    await renderMap(mapHost);
  } else {
    main.textContent = `Currently viewing: ${state.tab}`;
  }
}

async function bootstrap() {
  try {
    await initDB();
    render();
  } catch (err) {
    const root = document.getElementById('app');
    if (root) root.textContent = 'Failed to load app';
    console.error(err);
  }
}

bootstrap();