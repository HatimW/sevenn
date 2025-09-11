import { listExams, upsertExam } from '../../storage/storage.js';
import { state, setExamSession } from '../../state.js';

// render list and import of exams
export async function renderExams(root, render) {
  root.innerHTML = '';

  // Import button
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const exam = JSON.parse(text);
      exam.id = exam.id || crypto.randomUUID();
      exam.createdAt = exam.createdAt || Date.now();
      exam.updatedAt = Date.now();
      exam.results = exam.results || [];
      await upsertExam(exam);
      render();
    } catch (err) {
      alert('Invalid exam JSON');
    }
  });
  root.appendChild(fileInput);

  // existing exams list
  const exams = await listExams();
  const list = document.createElement('div');
  exams.forEach(ex => {
    const row = document.createElement('div');
    row.className = 'row';
    const title = document.createElement('span');
    title.textContent = ex.examTitle;
    const start = document.createElement('button');
    start.className = 'btn';
    start.textContent = 'Start';
    start.addEventListener('click', () => {
      setExamSession({ exam: ex, idx: 0, answers: [] });
      render();
    });
    row.appendChild(title);
    row.appendChild(start);
    list.appendChild(row);
  });
  root.appendChild(list);
}

export function renderExamRunner(root, render) {
  const sess = state.examSession;
  const q = sess.exam.questions[sess.idx];
  root.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = `Question ${sess.idx + 1} / ${sess.exam.questions.length}`;
  root.appendChild(h);
  const stem = document.createElement('p');
  stem.textContent = q.stem;
  root.appendChild(stem);
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = opt.text;
    btn.addEventListener('click', () => {
      sess.answers.push(opt.id);
      sess.idx++;
      if (sess.idx >= sess.exam.questions.length) {
        const correct = sess.exam.questions.filter((qu, i) => sess.answers[i] === qu.answer).length;
        alert(`Score: ${correct}/${sess.exam.questions.length}`);
        setExamSession(null);
      }
      render();
    });
    root.appendChild(btn);
  });
}
