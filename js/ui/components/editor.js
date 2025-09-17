import { uid } from '../../utils.js';
import { upsertItem, listBlocks } from '../../storage/storage.js';
import { createFloatingWindow } from './window-manager.js';

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

const titleMap = { disease: 'Disease', drug: 'Drug', concept: 'Concept' };

export async function openEditor(kind, onSave, existing = null) {
  const win = createFloatingWindow({
    title: `${existing ? 'Edit' : 'Add'} ${titleMap[kind] || kind}`,
    width: 600
  });

  const form = document.createElement('form');
  form.className = 'editor-form';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = kind === 'concept' ? 'Concept' : 'Name';
  nameLabel.className = 'editor-field';
  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.value = existing ? (existing.name || existing.concept || '') : '';
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  const fieldInputs = {};
  fieldMap[kind].forEach(([field, label]) => {
    const lbl = document.createElement('label');
    lbl.className = 'editor-field';
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
  colorLabel.className = 'editor-field';
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'input';
  colorInput.value = existing?.color || '#ffffff';
  colorLabel.appendChild(colorInput);
  form.appendChild(colorLabel);

  const blocks = await listBlocks();
  const blockMap = new Map(blocks.map(b => [b.blockId, b]));
  const blockSet = new Set(existing?.blocks || []);
  const weekSet = new Set();
  const lectSet = new Set();
  existing?.lectures?.forEach(l => {
    blockSet.add(l.blockId);
    weekSet.add(`${l.blockId}|${l.week}`);
    lectSet.add(`${l.blockId}|${l.id}`);
  });

  const blockWrap = document.createElement('div');
  blockWrap.className = 'tag-wrap editor-tags';
  const blockTitle = document.createElement('div');
  blockTitle.className = 'editor-tags-title';
  blockTitle.textContent = 'Tags';
  blockWrap.appendChild(blockTitle);

  blocks.forEach(b => {
    const blockDiv = document.createElement('div');
    blockDiv.className = 'editor-tag-block';
    const blkLabel = document.createElement('label');
    blkLabel.className = 'row';
    const blkCb = document.createElement('input');
    blkCb.type = 'checkbox';
    blkCb.checked = blockSet.has(b.blockId);
    blkLabel.appendChild(blkCb);
    blkLabel.appendChild(document.createTextNode(b.title || b.blockId));
    blockDiv.appendChild(blkLabel);

    const weekWrap = document.createElement('div');
    weekWrap.className = 'builder-sub';
    weekWrap.style.display = blkCb.checked ? 'block' : 'none';
    blockDiv.appendChild(weekWrap);

    blkCb.addEventListener('change', () => {
      if (blkCb.checked) blockSet.add(b.blockId); else blockSet.delete(b.blockId);
      weekWrap.style.display = blkCb.checked ? 'block' : 'none';
    });

    const weeks = Array.from({ length: b.weeks || 0 }, (_, i) => i + 1);
    weeks.forEach(w => {
      const wkLabel = document.createElement('label');
      wkLabel.className = 'row';
      const wkCb = document.createElement('input');
      wkCb.type = 'checkbox';
      const wkKey = `${b.blockId}|${w}`;
      wkCb.checked = weekSet.has(wkKey);
      wkLabel.appendChild(wkCb);
      wkLabel.appendChild(document.createTextNode(`Week ${w}`));
      weekWrap.appendChild(wkLabel);

      const lecWrap = document.createElement('div');
      lecWrap.className = 'builder-sub';
      lecWrap.style.display = wkCb.checked ? 'block' : 'none';
      wkLabel.appendChild(lecWrap);

      wkCb.addEventListener('change', () => {
        if (wkCb.checked) weekSet.add(wkKey); else weekSet.delete(wkKey);
        lecWrap.style.display = wkCb.checked ? 'block' : 'none';
      });

      (b.lectures || []).filter(l => l.week === w).forEach(l => {
        const key = `${b.blockId}|${l.id}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip' + (lectSet.has(key) ? ' active' : '');
        btn.textContent = l.name;
        btn.addEventListener('click', () => {
          if (lectSet.has(key)) lectSet.delete(key); else lectSet.add(key);
          btn.classList.toggle('active');
        });
        lecWrap.appendChild(btn);
      });
    });

    blockWrap.appendChild(blockDiv);
  });

  form.appendChild(blockWrap);

  const actionBar = document.createElement('div');
  actionBar.className = 'editor-actions';

  const status = document.createElement('span');
  status.className = 'editor-status';

  async function persist(closeAfter){
    const titleKey = kind === 'concept' ? 'concept' : 'name';
    const trimmed = nameInput.value.trim();
    if (!trimmed) {
      status.textContent = 'Name is required.';
      return;
    }
    status.textContent = 'Saving…';
    const item = existing || { id: uid(), kind };
    item[titleKey] = trimmed;
    fieldMap[kind].forEach(([field]) => {
      const v = fieldInputs[field].value.trim();
      if (field === 'facts') {
        item.facts = v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
      } else {
        item[field] = v;
      }
    });
    item.blocks = Array.from(blockSet);
    const weekNums = new Set(Array.from(weekSet).map(k => Number(k.split('|')[1])));
    item.weeks = Array.from(weekNums);
    const lectures = [];
    for (const key of lectSet) {
      const [blockId, lecIdStr] = key.split('|');
      const lecId = Number(lecIdStr);
      const blk = blockMap.get(blockId);
      const l = blk?.lectures.find(le => le.id === lecId);
      if (l) lectures.push({ blockId, id: l.id, name: l.name, week: l.week });
    }
    item.lectures = lectures;
    item.color = colorInput.value;
    await upsertItem(item);
    existing = item;
    updateTitle();
    status.textContent = closeAfter ? '' : 'Saved';
    if (onSave) onSave();
    if (closeAfter) {
      win.close('saved');
    }
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => persist(false));

  const saveCloseBtn = document.createElement('button');
  saveCloseBtn.type = 'button';
  saveCloseBtn.className = 'btn';
  saveCloseBtn.textContent = 'Save & Close';
  saveCloseBtn.addEventListener('click', () => persist(true));

  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 'btn secondary';
  discardBtn.textContent = 'Close without Saving';
  discardBtn.addEventListener('click', () => win.close('discard'));

  actionBar.appendChild(saveBtn);
  actionBar.appendChild(saveCloseBtn);
  actionBar.appendChild(discardBtn);
  actionBar.appendChild(status);
  form.appendChild(actionBar);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    persist(false);
  });

  win.setContent(form);

  const updateTitle = () => {
    const base = `${existing ? 'Edit' : 'Add'} ${titleMap[kind] || kind}`;
    const name = nameInput.value.trim();
    if (name) {
      win.setTitle(`${base}: ${name}`);
    } else {
      win.setTitle(base);
    }
  };
  nameInput.addEventListener('input', updateTitle);
  updateTitle();

  win.focus();
  nameInput.focus();
}