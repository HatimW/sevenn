import { state, setTab, setSubtab, setFlashSession, setQuizSession, setQuery } from './state.js';
import { initDB, findItemsByFilter } from './storage/storage.js';
import { renderSettings } from './ui/settings.js';
import { openEditor } from './ui/components/editor.js';
import { renderTable } from './ui/components/table.js';
import { renderCards } from './ui/components/cards.js';
import { renderStats } from './ui/components/stats.js';
import { renderBuilder } from './ui/components/builder.js';
import { renderFlashcards } from './ui/components/flashcards.js';
import { renderReview } from './ui/components/review.js';
import { renderQuiz } from './ui/components/quiz.js';
import { renderExams, renderExamRunner } from './ui/components/exams.js';
import { renderMap } from './ui/components/map.js';

const tabs = ["Diseases","Drugs","Concepts","Study","Exams","Map","Settings"];

async function render() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'header row';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = '✨ Sevenn';
  header.appendChild(brand);

  const nav = document.createElement('nav');
  nav.className = 'tabs row';

  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (state.tab === t ? ' active' : '');
    btn.textContent = t;
    btn.addEventListener('click', () => {
      setTab(t);
      render();
    });
    nav.appendChild(btn);
  });

  header.appendChild(nav);

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search';
  search.value = state.query;
  search.addEventListener('input', e => { setQuery(e.target.value); render(); });
  header.appendChild(search);
  root.appendChild(header);

  const main = document.createElement('main');
  root.appendChild(main);
  if (state.tab === 'Settings') {
    await renderSettings(main);
  } else if (['Diseases','Drugs','Concepts'].includes(state.tab)) {
    const kindMap = { Diseases:'disease', Drugs:'drug', Concepts:'concept' };
    const kind = kindMap[state.tab];
    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.textContent = 'Add ' + kind;
    addBtn.addEventListener('click', () => openEditor(kind, render));
    main.appendChild(addBtn);
    const subnav = document.createElement('div');
    subnav.className = 'tabs row subtabs';
    ['Browse','Cards','Stats'].forEach(st => {
      const sb = document.createElement('button');
      sb.className = 'tab' + (state.subtab[state.tab] === st ? ' active' : '');
      sb.textContent = st;
      sb.addEventListener('click', () => {
        setSubtab(state.tab, st);
        render();
      });
      subnav.appendChild(sb);
    });
    main.appendChild(subnav);

    const filter = { ...state.filters, types:[kind], query: state.query };
    const items = await findItemsByFilter(filter);
    if (state.subtab[state.tab] === 'Cards') {
      renderCards(main, items, kind, render);
    } else if (state.subtab[state.tab] === 'Stats') {
      renderStats(main, items);
    } else {
      await renderTable(main, items, kind, render);
    }
  } else if (state.tab === 'Study') {
    if (state.flashSession) {
      renderFlashcards(main, render);
    } else if (state.quizSession) {
      renderQuiz(main, render);
    } else {
      const wrap = document.createElement('div');
      await renderBuilder(wrap);
      main.appendChild(wrap);

      const subnav = document.createElement('div');
      subnav.className = 'tabs row subtabs';
      ['Flashcards','Review','Quiz'].forEach(st => {
        const sb = document.createElement('button');
        sb.className = 'tab' + (state.subtab.Study === st ? ' active' : '');
        sb.textContent = st;
        sb.addEventListener('click', () => {
          setSubtab('Study', st);
          render();
        });
        subnav.appendChild(sb);
      });
      main.appendChild(subnav);

      if (state.cohort.length) {
        if (state.subtab.Study === 'Flashcards') {
          const startBtn = document.createElement('button');
          startBtn.className = 'btn';
          startBtn.textContent = 'Start Flashcards';
          startBtn.addEventListener('click', () => {
            setFlashSession({ idx: 0, pool: state.cohort });
            render();
          });
          main.appendChild(startBtn);
        } else if (state.subtab.Study === 'Review') {
          renderReview(main, render);
        } else {
          const startBtn = document.createElement('button');
          startBtn.className = 'btn';
          startBtn.textContent = 'Start Quiz';
          startBtn.addEventListener('click', () => {
            setQuizSession({ idx:0, score:0, pool: state.cohort });
            render();
          });
          main.appendChild(startBtn);
        }
      }
    }
  } else if (state.tab === 'Exams') {
    if (state.examSession) {
      renderExamRunner(main, render);
    } else {
      await renderExams(main, render);
    }
  } else if (state.tab === 'Map') {
    await renderMap(main);
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
