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

  const nav = document.createElement('nav');
  nav.className = 'tabs';
  nav.setAttribute('aria-label', 'Primary sections');
  const tabClassMap = {
    Diseases: 'tab-disease',
    Drugs: 'tab-drug',
    Concepts: 'tab-concept',
    Cards: 'tab-cards',
    Study: 'tab-study',
    Exams: 'tab-exams',
    Map: 'tab-map'
  };
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    if (state.tab === t) btn.classList.add('active');
    const variant = tabClassMap[t];
    if (variant) btn.classList.add(variant);
    btn.textContent = t;
    btn.addEventListener('click', () => {
      setTab(t);
      render();
    });
    nav.appendChild(btn);
  });
  left.appendChild(nav);
  header.appendChild(left);

  const right = document.createElement('div');
  right.className = 'header-right';

  const searchField = document.createElement('label');
  searchField.className = 'search-field';
  searchField.setAttribute('aria-label', 'Search entries');

  const searchIcon = document.createElement('span');
  searchIcon.className = 'search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 14.5L18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="9" r="5.8" stroke="currentColor" stroke-width="1.6"/></svg>';
  searchField.appendChild(searchIcon);

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search entries';
  search.value = state.query;
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.className = 'search-input';
  search.dataset.role = 'global-search';
  search.addEventListener('input', e => {
    setQuery(e.target.value);
    render();
  });
  search.addEventListener('search', e => {
    setQuery(e.target.value);
    render();
  });
  searchField.appendChild(search);
  right.appendChild(searchField);

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'header-settings-btn';
  if (state.tab === 'Settings') settingsBtn.classList.add('active');
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.6"/></svg>';
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
    await renderCards(content, items, render);
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