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

  // tagging: blocks -> weeks -> lectures
  const blocks = await listBlocks();
  const blockMap = new Map(blocks.map(b => [b.blockId, b]));
  const selections = new Map();

  const blockWrap = document.createElement('div');
  blockWrap.className = 'tag-wrap';
  const blockTitle = document.createElement('div');
  blockTitle.textContent = 'Blocks';
  blockWrap.appendChild(blockTitle);

  const blockRow = document.createElement('div');
  blockRow.className = 'tag-row';

  blocks.forEach(b => {
    const container = document.createElement('div');
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = b.title || b.blockId;
    const selDiv = document.createElement('div');
    selDiv.className = 'row';
    selDiv.style.display = 'none';

    const weekSel = document.createElement('select');
    weekSel.className = 'input';
    const wBlank = document.createElement('option');
    wBlank.value = '';
    wBlank.textContent = 'Week';
    weekSel.appendChild(wBlank);
    for (let w = 1; w <= b.weeks; w++) {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = 'W' + w;
      weekSel.appendChild(opt);
    }

    const lecSel = document.createElement('select');
    lecSel.className = 'input';
    const lBlank = document.createElement('option');
    lBlank.value = '';
    lBlank.textContent = 'Lecture';
    lecSel.appendChild(lBlank);

    weekSel.addEventListener('change', () => {
      const w = Number(weekSel.value);
      lecSel.innerHTML = '';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = 'Lecture';
      lecSel.appendChild(blank);
      if (w) {
        (b.lectures || []).filter(l => l.week === w).forEach(l => {
          const opt = document.createElement('option');
          opt.value = l.id;
          opt.textContent = l.name;
          lecSel.appendChild(opt);
        });
      }
    });

    chip.addEventListener('click', () => {
      const active = chip.classList.toggle('active');
      selDiv.style.display = active ? 'flex' : 'none';
      if (active) selections.set(b.blockId, { weekSel, lecSel });
      else selections.delete(b.blockId);
    });

    container.appendChild(chip);
    container.appendChild(selDiv);
    selDiv.appendChild(weekSel);
    selDiv.appendChild(lecSel);
    blockRow.appendChild(container);

    if (existing?.blocks?.includes(b.blockId)) {
      chip.classList.add('active');
      selDiv.style.display = 'flex';
      selections.set(b.blockId, { weekSel, lecSel });
      const lec = existing?.lectures?.find(l => l.blockId === b.blockId);
      if (lec) {
        weekSel.value = lec.week;
        weekSel.dispatchEvent(new Event('change'));
        lecSel.value = lec.id;
      }
    }
  });

  blockWrap.appendChild(blockRow);
  form.appendChild(blockWrap);

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
    item.blocks = Array.from(selections.keys());
    const weekSet = new Set();
    const lectures = [];
    selections.forEach(({ weekSel, lecSel }, blockId) => {
      const w = Number(weekSel.value);
      if (w) weekSet.add(w);
      const lecId = Number(lecSel.value);
      if (lecId) {
        const blk = blockMap.get(blockId);
        const l = blk?.lectures.find(l => l.id === lecId);
        if (l) lectures.push({ blockId, id: l.id, name: l.name, week: l.week });
      }
    });
    item.weeks = Array.from(weekSet);
    item.lectures = lectures;
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