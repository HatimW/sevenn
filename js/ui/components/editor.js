import { uid } from '../../utils.js';
import { upsertItem } from '../../storage/storage.js';

const fieldMap = {
  disease: [
    ['etiology', 'Etiology'],
    ['pathophys', 'Pathophys'],
    ['clinical', 'Clinical'],
    ['diagnosis', 'Diagnosis'],
    ['treatment', 'Treatment'],
    ['complications', 'Complications'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts (comma separated)']
  ],
  drug: [
    ['class', 'Class'],
    ['source', 'Source'],
    ['moa', 'MOA'],
    ['uses', 'Uses'],
    ['sideEffects', 'Side Effects'],
    ['contraindications', 'Contraindications'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts (comma separated)']
  ],
  concept: [
    ['type', 'Type'],
    ['definition', 'Definition'],
    ['mechanism', 'Mechanism'],
    ['clinicalRelevance', 'Clinical Relevance'],
    ['example', 'Example'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts (comma separated)']
  ]
};

export function openEditor(kind, onSave, existing = null) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';

  const form = document.createElement('form');
  form.className = 'card modal-form';

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

  const fieldInputs = {};
  fieldMap[kind].forEach(([field, label]) => {
    const lbl = document.createElement('label');
    lbl.textContent = label;
    let inp;
    if (field === 'facts') {
      inp = document.createElement('input');
      inp.className = 'input';
      inp.value = existing ? (existing.facts || []).join(', ') : '';
    } else {
      inp = document.createElement('textarea');
      inp.className = 'input';
      inp.value = existing ? existing[field] || '' : '';
    }
    lbl.appendChild(inp);
    form.appendChild(lbl);
    fieldInputs[field] = inp;
  });

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'input';
  colorInput.value = existing?.color || '#ffffff';
  colorLabel.appendChild(colorInput);
  form.appendChild(colorLabel);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => document.body.removeChild(overlay));

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  actions.appendChild(cancel);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleKey = kind === 'concept' ? 'concept' : 'name';
    const item = existing || { id: uid(), kind };
    item[titleKey] = nameInput.value.trim();
    if (!item[titleKey]) return;
    fieldMap[kind].forEach(([field]) => {
      const v = fieldInputs[field].value.trim();
      if (field === 'facts') {
        item.facts = v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
      } else {
        item[field] = v;
      }
    });
    item.color = colorInput.value;
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