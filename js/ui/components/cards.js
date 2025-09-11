import { createTitleCell } from './titlecell.js';

function pickSummary(item, kind){
  const fields = {
    disease: ['etiology','pathophys','clinical','diagnosis','treatment'],
    drug: ['class','moa','uses','sideEffects'],
    concept: ['definition','mechanism','clinicalRelevance','example']
  }[kind] || [];
  for (const f of fields) {
    if (item[f]) return item[f];
  }
  return '';
}

export function renderCards(container, items, kind, onChange){
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  items.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';
    card.appendChild(createTitleCell(it, onChange));
    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.textContent = pickSummary(it, kind);
    card.appendChild(summary);
    grid.appendChild(card);
  });
  container.appendChild(grid);
}
