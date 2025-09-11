import { createItemCard } from './cardlist.js';

export function renderCards(container, items, kind, onChange){
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  items.forEach(it => {
    const card = createItemCard(it, onChange);
    grid.appendChild(card);
  });
  container.appendChild(grid);
}
