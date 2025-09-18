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
  settingsBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.78 2.75c-.5-1-2-.99-2.5 0l-.46.95a1 1 0 0 1-1.03.56l-1.05-.13c-1.13-.14-1.93 1.04-1.34 2.04l.52.88a1 1 0 0 1-.26 1.26l-.82.62c-.9.68-.6 2.11.5 2.37l1.02.24a1 1 0 0 1 .75.83l.11 1.05c.11 1.14 1.56 1.64 2.35.86l.75-.75a1 1 0 0 1 1.29-.1l.86.6c.93.64 2.19-.16 2.04-1.25l-.15-1.06a1 1 0 0 1 .58-1.05l.97-.4c1.06-.44 1.06-1.96 0-2.4l-.97-.4a1 1 0 0 1-.58-1.05l.15-1.06c.15-1.09-1.11-1.89-2.04-1.25l-.86.6a1 1 0 0 1-1.29-.1l-.75-.75a1 1 0 0 1-.25-.4z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.3"/></svg>';
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