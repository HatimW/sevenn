import { state, setQuizSession, setSubtab, setStudySelectedMode } from '../../state.js';
import { renderRichText } from './rich-text.js';
import { persistStudySession, removeStudySession } from '../../study/study-sessions.js';

function titleOf(item){
  return item.name || item.concept || '';
}

export function renderQuiz(root, redraw){
  const sess = state.quizSession;
  if (!sess) return;

  if (!sess.dict){
    sess.dict = sess.pool.map(it => ({id:it.id, title:titleOf(it), lower:titleOf(it).toLowerCase()}));
  }

  const item = sess.pool[sess.idx];
  if (!item){
    removeStudySession('quiz').catch(err => console.warn('Failed to clear quiz session', err));
    const done = document.createElement('div');
    done.textContent = `Score ${sess.score}/${sess.pool.length}`;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Done';
    btn.addEventListener('click', () => {
      setQuizSession(null);
      setStudySelectedMode('Quiz');
      setSubtab('Study', 'Builder');
      redraw();
    });
    done.appendChild(document.createElement('br'));
    done.appendChild(btn);
    root.appendChild(done);
    return;
  }

  const form = document.createElement('form');
  form.className = 'quiz-form';

  const info = document.createElement('div');
  info.className = 'quiz-info';
  sectionsFor(item).forEach(([label, field]) => {
    if (!item[field]) return;
    const sec = document.createElement('div');
    sec.className = 'section';
    const head = document.createElement('div');
    head.className = 'section-title';
    head.textContent = label;
    const body = document.createElement('div');
    renderRichText(body, item[field]);
    sec.appendChild(head);
    sec.appendChild(body);
    info.appendChild(sec);
  });
  form.appendChild(info);

  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  form.appendChild(input);

  const sug = document.createElement('ul');
  sug.className = 'quiz-suggestions';
  form.appendChild(sug);

  input.addEventListener('input', () => {
    const v = input.value.toLowerCase();
    sug.innerHTML = '';
    if (!v) return;
    const starts = sess.dict.filter(d => d.lower.startsWith(v));
    const contains = sess.dict.filter(d => !d.lower.startsWith(v) && d.lower.includes(v));
    [...starts, ...contains].slice(0,5).forEach(d => {
      const li = document.createElement('li');
      li.textContent = d.title;
      li.addEventListener('mousedown', () => { input.value = d.title; sug.innerHTML=''; });
      sug.appendChild(li);
    });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const ans = input.value.trim().toLowerCase();
    const correct = titleOf(item).toLowerCase();
    if (ans === correct) sess.score++;
    sess.idx++;
    setQuizSession(sess);
    redraw();
  });

  root.appendChild(form);

  const controls = document.createElement('div');
  controls.className = 'quiz-controls';

  const saveExit = document.createElement('button');
  saveExit.type = 'button';
  saveExit.className = 'btn secondary';
  saveExit.textContent = 'Save & exit';
  saveExit.addEventListener('click', async () => {
    const original = saveExit.textContent;
    saveExit.disabled = true;
    saveExit.textContent = 'Saving…';
    try {
      await persistStudySession('quiz', {
        session: { idx: sess.idx, score: sess.score, pool: sess.pool },
        cohort: sess.pool
      });
      setQuizSession(null);
      setStudySelectedMode('Quiz');
      setSubtab('Study', 'Builder');
      redraw();
    } catch (err) {
      console.error('Failed to save quiz progress', err);
      saveExit.textContent = 'Save failed';
      setTimeout(() => { saveExit.textContent = original; }, 2000);
    } finally {
      saveExit.disabled = false;
    }
  });
  controls.appendChild(saveExit);

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'btn secondary';
  exitBtn.textContent = 'Exit without saving';
  exitBtn.addEventListener('click', () => {
    removeStudySession('quiz').catch(err => console.warn('Failed to discard quiz session', err));
    setQuizSession(null);
    setStudySelectedMode('Quiz');
    setSubtab('Study', 'Builder');
    redraw();
  });
  controls.appendChild(exitBtn);

  root.appendChild(controls);
}

function sectionsFor(item){
  const map = {
    disease: [
      ['Etiology','etiology'],
      ['Pathophys','pathophys'],
      ['Clinical Presentation','clinical'],
      ['Diagnosis','diagnosis'],
      ['Treatment','treatment'],
      ['Complications','complications'],
      ['Mnemonic','mnemonic']
    ],
    drug: [
      ['Mechanism','moa'],
      ['Uses','uses'],
      ['Side Effects','sideEffects'],
      ['Contraindications','contraindications'],
      ['Mnemonic','mnemonic']
    ],
    concept: [
      ['Definition','definition'],
      ['Mechanism','mechanism'],
      ['Clinical Relevance','clinicalRelevance'],
      ['Example','example'],
      ['Mnemonic','mnemonic']
    ]
  };
  return map[item.kind] || [];
}
