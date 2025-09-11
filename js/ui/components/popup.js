export function showPopup(item){
  const modal = document.createElement('div');
  modal.className = 'modal';
  const card = document.createElement('div');
  card.className = 'card';
  const title = document.createElement('h2');
  title.textContent = item.name || item.concept || 'Item';
  card.appendChild(title);
  const kind = document.createElement('div');
  kind.textContent = `Type: ${item.kind}`;
  card.appendChild(kind);
  if (item.mnemonic){
    const m = document.createElement('div');
    m.textContent = `Mnemonic: ${item.mnemonic}`;
    card.appendChild(m);
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
