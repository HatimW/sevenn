import { uid } from '../../utils.js';
import { upsertItem, listBlocks } from '../../storage/storage.js';

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

export async function openEditor(kind, onSave, existing = null) {
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

  // tagging: blocks, weeks, lectures
  const blocks = await listBlocks();

  const blockWrap = document.createElement('div');
  blockWrap.className = 'tag-wrap';
  const blockTitle = document.createElement('div');
  blockTitle.textContent = 'Blocks';
  blockWrap.appendChild(blockTitle);
  const blockRow = document.createElement('div');
  blockRow.className = 'tag-row';
  const blockChecks = new Map();
  blocks.forEach(b => {
    const lbl = document.createElement('label');
    lbl.className = 'tag-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = existing?.blocks?.includes(b.blockId);
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(b.blockId));
    blockRow.appendChild(lbl);
    blockChecks.set(b.blockId, cb);
  });
  blockWrap.appendChild(blockRow);
  form.appendChild(blockWrap);

  const weekWrap = document.createElement('div');
  weekWrap.className = 'tag-wrap';
  const weekTitle = document.createElement('div');
  weekTitle.textContent = 'Weeks';
  weekWrap.appendChild(weekTitle);
  const weekRow = document.createElement('div');
  weekRow.className = 'tag-row';
  const weekChecks = new Map();
  for (let w = 1; w <= 8; w++) {
    const lbl = document.createElement('label');
    lbl.className = 'tag-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = existing?.weeks?.includes(w);
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode('W' + w));
    weekRow.appendChild(lbl);
    weekChecks.set(w, cb);
  }
  weekWrap.appendChild(weekRow);
  form.appendChild(weekWrap);

  const lecLabel = document.createElement('label');
  lecLabel.textContent = 'Lecture IDs (comma separated)';
  const lectureInput = document.createElement('input');
  lectureInput.className = 'input';
  lectureInput.value = existing?.lectures?.map(l => l.id).join(', ') || '';
  lecLabel.appendChild(lectureInput);
  form.appendChild(lecLabel);

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
    item.blocks = Array.from(blockChecks.entries()).filter(([,cb]) => cb.checked).map(([id]) => id);
    item.weeks = Array.from(weekChecks.entries()).filter(([,cb]) => cb.checked).map(([w]) => Number(w));
    const ids = lectureInput.value.split(',').map(s => Number(s.trim())).filter(Boolean);
    item.lectures = ids.map(id => {
      for (const b of blocks) {
        const l = (b.lectures || []).find(l => l.id === id);
        if (l) return { blockId: b.blockId, id, name: l.name, week: l.week };
      }
      return { id };
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