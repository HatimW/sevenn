import { listItemsByKind, upsertItem } from '../../storage/storage.js';

// Modal for linking items together
export async function openLinker(item, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';

  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('h2');
  title.textContent = `Links for ${item.name || item.concept || ''}`;
  card.appendChild(title);

  const all = [
    ...(await listItemsByKind('disease')),
    ...(await listItemsByKind('drug')),
    ...(await listItemsByKind('concept'))
  ];
  const idMap = new Map(all.map(i => [i.id, i]));
  const links = new Set((item.links || []).map(l => l.id));

  const list = document.createElement('div');
  list.className = 'link-list';
  card.appendChild(list);

  function renderList() {
    list.innerHTML = '';
    links.forEach(id => {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      const it = idMap.get(id);
      label.textContent = it ? (it.name || it.concept || id) : id;
      row.appendChild(label);
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Remove';
      btn.addEventListener('click', () => { links.delete(id); renderList(); });
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  renderList();

  const input = document.createElement('input');
  input.className = 'input';
  input.placeholder = 'Search items...';
  card.appendChild(input);

  const sug = document.createElement('ul');
  sug.className = 'quiz-suggestions';
  card.appendChild(sug);

  input.addEventListener('input', () => {
    const v = input.value.toLowerCase();
    sug.innerHTML = '';
    if (!v) return;
    all.filter(it => it.id !== item.id && (it.name || it.concept || '').toLowerCase().includes(v))
      .slice(0,5)
      .forEach(it => {
        const li = document.createElement('li');
        li.textContent = it.name || it.concept || '';
        li.addEventListener('mousedown', () => {
          links.add(it.id);
          input.value = '';
          sug.innerHTML = '';
          renderList();
        });
        sug.appendChild(li);
      });
  });

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Close';
  cancel.addEventListener('click', () => document.body.removeChild(overlay));
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn';
  save.textContent = 'Save';
  save.addEventListener('click', async () => {
    const newLinks = new Set(links);
    const oldLinks = new Set((item.links || []).map(l => l.id));

    item.links = Array.from(newLinks).map(id => ({ id, type: 'assoc' }));
    await upsertItem(item);

    const affected = new Set([...oldLinks, ...newLinks]);
    for (const id of affected) {
      const other = idMap.get(id);
      if (!other) continue;
      other.links = other.links || [];
      const has = other.links.some(l => l.id === item.id);
      const should = newLinks.has(id);
      if (should && !has) other.links.push({ id: item.id, type: 'assoc' });
      if (!should && has) other.links = other.links.filter(l => l.id !== item.id);
      await upsertItem(other);
    }

    document.body.removeChild(overlay);
    onSave && onSave();
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  card.appendChild(actions);

  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
  input.focus();
}

