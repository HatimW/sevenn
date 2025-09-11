import { upsertItem, deleteItem } from '../../storage/storage.js';
import { openEditor } from './editor.js';
import { confirmModal } from './confirm.js';

export function createTitleCell(item, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'title-cell';
  const kindColors = { disease: 'var(--pink)', drug: 'var(--green)', concept: 'var(--blue)' };
  wrap.style.borderLeft = '4px solid ' + (item.color || kindColors[item.kind] || 'var(--gray)');
  wrap.style.paddingLeft = '4px';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = item.name || item.concept || 'Untitled';
  wrap.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const blocks = (item.blocks || []).join('·');
  const weeks = (item.weeks || []).map(w => 'W' + w).join('·');
  meta.textContent = [blocks, weeks].filter(Boolean).join(' • ');
  wrap.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'actions row';

  const fav = document.createElement('button');
  fav.className = 'btn';
  fav.textContent = item.favorite ? '★' : '☆';
  fav.addEventListener('click', async () => {
    item.favorite = !item.favorite;
    await upsertItem(item);
    fav.textContent = item.favorite ? '★' : '☆';
    onChange && onChange();
  });
  actions.appendChild(fav);

  const edit = document.createElement('button');
  edit.className = 'btn';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => openEditor(item.kind, onChange, item));
  actions.appendChild(edit);

  const del = document.createElement('button');
  del.className = 'btn';
  del.textContent = 'Del';
  del.addEventListener('click', async () => {
    if (await confirmModal('Delete this item?')) {
      await deleteItem(item.id);
      onChange && onChange();
    }
  });
  actions.appendChild(del);

  wrap.appendChild(actions);
  return wrap;
}
