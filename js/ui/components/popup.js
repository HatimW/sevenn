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

export function showPopup(item){
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
    txt.textContent = val;
    txt.style.whiteSpace = 'pre-wrap';
    sec.appendChild(txt);
    card.appendChild(sec);
  });

  if (item.facts && item.facts.length){
    const facts = document.createElement('div');
    facts.className = 'facts';
    facts.textContent = item.facts.join(', ');
    card.appendChild(facts);
  }

  const close = document.createElement('button');
  close.className = 'btn';
  close.textContent = 'Close';
  close.addEventListener('click', () => modal.remove());
  card.appendChild(close);

  modal.appendChild(card);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}
