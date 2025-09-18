import { renderRichText } from './rich-text.js';

const fieldDefs = {
  disease: [
    ['etiology','Etiology'],
    ['pathophys','Pathophys'],
    ['clinical','Clinical'],
    ['diagnosis','Diagnosis'],
    ['treatment','Treatment'],
    ['complications','Complications'],
    ['mnemonic','Mnemonic']
  ],
  drug: [
    ['class','Class'],
    ['source','Source'],
    ['moa','MOA'],
    ['uses','Uses'],
    ['sideEffects','Side Effects'],
    ['contraindications','Contraindications'],
    ['mnemonic','Mnemonic']
  ],
  concept: [
    ['type','Type'],
    ['definition','Definition'],
    ['mechanism','Mechanism'],
    ['clinicalRelevance','Clinical Relevance'],
    ['example','Example'],
    ['mnemonic','Mnemonic']
  ]
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collectExtras(item) {
  if (Array.isArray(item.extras) && item.extras.length) return item.extras;
  if (item.facts && item.facts.length) {
    return [{
      id: 'legacy-facts',
      title: 'Highlights',
      body: `<ul>${item.facts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
    }];
  }
  return [];
}

export function showPopup(item, options = {}){
  const { onEdit } = options;
  const modal = document.createElement('div');
  modal.className = 'modal';
  const card = document.createElement('div');
  card.className = 'card';
  const kindColors = { disease: 'var(--purple)', drug: 'var(--blue)', concept: 'var(--green)' };
  card.style.borderTop = `3px solid ${item.color || kindColors[item.kind] || 'var(--gray)'}`;

  const title = document.createElement('h2');
  title.textContent = item.name || item.concept || 'Item';
  card.appendChild(title);

  const defs = fieldDefs[item.kind] || [];
  defs.forEach(([field,label]) => {
    const val = item[field];
    if (!val) return;
    const sec = document.createElement('div');
    sec.className = 'section';
    const tl = document.createElement('div');
    tl.className = 'section-title';
    tl.textContent = label;
    sec.appendChild(tl);
    const txt = document.createElement('div');
    renderRichText(txt, val);
    sec.appendChild(txt);
    card.appendChild(sec);
  });

  const extras = collectExtras(item);
  extras.forEach(extra => {
    if (!extra || !extra.body) return;
    const sec = document.createElement('div');
    sec.className = 'section section--extra';
    const tl = document.createElement('div');
    tl.className = 'section-title';
    tl.textContent = extra.title || 'Additional Section';
    sec.appendChild(tl);
    const txt = document.createElement('div');
    renderRichText(txt, extra.body);
    sec.appendChild(txt);
    card.appendChild(sec);
  });

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  if (typeof onEdit === 'function') {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      modal.remove();
      onEdit();
    });
    actions.appendChild(editBtn);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.textContent = 'Close';
  close.addEventListener('click', () => modal.remove());
  actions.appendChild(close);

  card.appendChild(actions);

  modal.appendChild(card);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}
