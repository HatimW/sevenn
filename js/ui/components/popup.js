import { createItemCard } from './cardlist.js';

export function showPopup(item){
  const modal = document.createElement('div');
  modal.className = 'modal';
  const card = createItemCard(item);
  const close = document.createElement('button');
  close.className = 'btn';
  close.textContent = 'Close';
  close.addEventListener('click', () => modal.remove());
  card.appendChild(close);
  modal.appendChild(card);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}
