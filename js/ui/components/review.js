import { state, setReviewConfig, setFlashSession, setQuizSession } from '../../state.js';

// Render Review mode controls
export function renderReview(root, redraw) {
  const cfg = state.review;
  const section = document.createElement('section');
  section.className = 'review-controls';

  const countLabel = document.createElement('label');
  countLabel.textContent = 'Count:';
  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '1';
  countInput.value = cfg.count;
  countInput.addEventListener('change', () => setReviewConfig({ count: Number(countInput.value) }));
  countLabel.appendChild(countInput);
  section.appendChild(countLabel);

  const formatLabel = document.createElement('label');
  formatLabel.textContent = 'Format:';
  const formatSel = document.createElement('select');
  ['flashcards','quiz'].forEach(f => {
    const opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    if (cfg.format === f) opt.selected = true;
    formatSel.appendChild(opt);
  });
  formatSel.addEventListener('change', () => setReviewConfig({ format: formatSel.value }));
  formatLabel.appendChild(formatSel);
  section.appendChild(formatLabel);

  const startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = 'Start Review';
  startBtn.addEventListener('click', () => {
    const items = sampleItems(state.cohort, cfg.count);
    if (!items.length) return;
    if (cfg.format === 'flashcards') {
      setFlashSession({ idx: 0, pool: items });
    } else {
      setQuizSession({ idx:0, score:0, pool: items });
    }
    redraw();
  });
  section.appendChild(startBtn);

  root.appendChild(section);
}

function sampleItems(cohort, count) {
  const sorted = [...cohort].sort((a,b) => {
    const ad = (a.sr && a.sr.due) || a.updatedAt || 0;
    const bd = (b.sr && b.sr.due) || b.updatedAt || 0;
    return ad - bd;
  });
  if (sorted.length <= count) return sorted;
  const third = Math.ceil(sorted.length / 3);
  const oldest = sorted.slice(0, third);
  const middle = sorted.slice(third, third*2);
  const newest = sorted.slice(third*2);
  const take = (arr, n) => {
    const out = [];
    for (let i=0; i<n && arr.length; i++) {
      const idx = Math.floor(Math.random()*arr.length);
      out.push(arr.splice(idx,1)[0]);
    }
    return out;
  };
  const res = [];
  const nOld = Math.round(count*0.6);
  const nMid = Math.round(count*0.3);
  const nNew = count - nOld - nMid;
  res.push(...take(oldest, nOld));
  res.push(...take(middle, nMid));
  res.push(...take(newest, nNew));
  return res;
}
