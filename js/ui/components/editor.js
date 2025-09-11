import { uid } from '../../utils.js';
import { upsertItem } from '../../storage/storage.js';

export function openEditor(kind, onSave, existing = null) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';

  const form = document.createElement('form');
  form.className = 'card';

  const title = document.createElement('h2');
  title.textContent = (existing ? 'Edit ' : 'Add ') + kind;
  form.appendChild(title);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = kind === 'concept' ? 'Concept' : 'Name';
  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.value = existing ? (existing.name || existing.concept || '') : '';
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save';
  form.appendChild(saveBtn);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => document.body.removeChild(overlay));
  form.appendChild(cancel);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleKey = kind === 'concept' ? 'concept' : 'name';
    const item = existing || { id: uid(), kind };
    item[titleKey] = nameInput.value.trim();
    if (!item[titleKey]) return;
    await upsertItem(item);
    document.body.removeChild(overlay);
    onSave && onSave();
  });

  overlay.appendChild(form);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) document.body.removeChild(overlay);
  });
  document.body.appendChild(overlay);
  nameInput.focus();
}
