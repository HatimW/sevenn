export function renderStats(container, items){
  const wrap = document.createElement('div');
  wrap.className = 'stats';
  const total = document.createElement('div');
  total.textContent = `Total items: ${items.length}`;
  const fav = document.createElement('div');
  fav.textContent = `Favorites: ${items.filter(i => i.favorite).length}`;
  wrap.appendChild(total);
  wrap.appendChild(fav);
  container.appendChild(wrap);
}
