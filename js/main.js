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

const tabs = ["Diseases","Drugs","Concepts","Cards","Study","Exams","Map"];

async function render() {
  const root = document.getElementById('app');
  const activeEl = document.activeElement;
  const shouldRestoreSearch = activeEl && activeEl.dataset && activeEl.dataset.role === 'global-search';
  const selectionStart = shouldRestoreSearch && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;
  const selectionEnd = shouldRestoreSearch && typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : null;

  root.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'header';

  const left = document.createElement('div');
  left.className = 'header-left';
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = '✨ Sevenn';
  left.appendChild(brand);
  header.appendChild(left);

  const right = document.createElement('div');
  right.className = 'header-right';

  const nav = document.createElement('nav');
  nav.className = 'tabs';
  nav.setAttribute('aria-label', 'Primary sections');

  tabs.forEach(t => {
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

  right.appendChild(nav);

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search';
  search.value = state.query;
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.className = 'search-input';
  search.setAttribute('aria-label', 'Search entries');
  search.dataset.role = 'global-search';
  search.addEventListener('input', e => {
    setQuery(e.target.value);
    render();
  });
  right.appendChild(search);

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'tab settings-tab' + (state.tab === 'Settings' ? ' active' : '');
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.innerHTML = '<span aria-hidden="true">&#9881;</span>';
  settingsBtn.title = 'Settings';
  settingsBtn.addEventListener('click', () => {
    setTab('Settings');
    render();
  });
  right.appendChild(settingsBtn);
  header.appendChild(right);
  root.appendChild(header);

  if (shouldRestoreSearch) {
    requestAnimationFrame(() => {
      search.focus();
      if (selectionStart !== null && selectionEnd !== null && search.setSelectionRange) {
        search.setSelectionRange(selectionStart, selectionEnd);
      } else {
        const len = search.value.length;
        if (search.setSelectionRange) search.setSelectionRange(len, len);
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