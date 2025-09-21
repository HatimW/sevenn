import { upsertBlock, deleteBlock, exportJSON, importJSON, exportAnkiCSV } from '../storage/storage.js';
import { loadBlockCatalog, invalidateBlockCatalog } from '../storage/block-catalog.js';
import { confirmModal } from './components/confirm.js';

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'settings-empty-blocks';
  empty.textContent = 'No blocks yet. Use “Add block” to create one.';
  return empty;
}

function formatWeeks(weeks) {
  if (!Number.isFinite(weeks)) return 'Weeks: —';
  return `Weeks: ${weeks}`;
}

export async function renderSettings(root) {
  root.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  root.appendChild(layout);

  const blocksCard = document.createElement('section');
  blocksCard.className = 'card';
  const bHeading = document.createElement('h2');
  bHeading.textContent = 'Blocks';
  blocksCard.appendChild(bHeading);

  const list = document.createElement('div');
  list.className = 'block-list';
  blocksCard.appendChild(list);

  const catalog = await loadBlockCatalog();
  const blocks = catalog.blocks || [];
  if (!blocks.length) {
    list.appendChild(createEmptyState());
  }

  blocks.forEach((block, index) => {
    if (!block) return;
    const wrap = document.createElement('div');
    wrap.className = 'settings-block-row';

    const header = document.createElement('div');
    header.className = 'settings-block-header';
    const title = document.createElement('h3');
    title.className = 'settings-block-title';
    title.textContent = block.title || 'Untitled block';
    if (block.color) {
      title.style.setProperty('--block-accent', block.color);
      title.classList.add('has-accent');
    }
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'settings-block-meta';
    meta.textContent = formatWeeks(Number(block.weeks));
    header.appendChild(meta);

    wrap.appendChild(header);

    const controls = document.createElement('div');
    controls.className = 'settings-block-controls';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'btn tertiary';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', async () => {
      const other = blocks[index - 1];
      if (!other) return;
      const tmp = block.order;
      block.order = other.order;
      other.order = tmp;
      await upsertBlock(block);
      await upsertBlock(other);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'btn tertiary';
    downBtn.textContent = '↓';
    downBtn.disabled = index === blocks.length - 1;
    downBtn.addEventListener('click', async () => {
      const other = blocks[index + 1];
      if (!other) return;
      const tmp = block.order;
      block.order = other.order;
      other.order = tmp;
      await upsertBlock(block);
      await upsertBlock(other);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(downBtn);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn secondary';
    editBtn.textContent = 'Edit';
    controls.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn secondary';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!(await confirmModal('Delete block?'))) return;
      await deleteBlock(block.blockId);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(deleteBtn);

    wrap.appendChild(controls);

    const editForm = document.createElement('form');
    editForm.className = 'settings-block-edit';
    editForm.hidden = true;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.required = true;
    titleInput.className = 'input';
    titleInput.value = block.title || '';

    const weeksInput = document.createElement('input');
    weeksInput.type = 'number';
    weeksInput.min = '1';
    weeksInput.required = true;
    weeksInput.className = 'input';
    weeksInput.value = block.weeks != null ? String(block.weeks) : '1';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'input';
    colorInput.value = block.color || '#ffffff';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Save changes';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      editForm.hidden = true;
    });

    editForm.append(titleInput, weeksInput, colorInput, saveBtn, cancelBtn);
    editForm.addEventListener('submit', async event => {
      event.preventDefault();
      const titleValue = titleInput.value.trim();
      const weeksValue = Number(weeksInput.value);
      if (!titleValue || !Number.isFinite(weeksValue) || weeksValue <= 0) {
        return;
      }
      const payload = {
        ...block,
        title: titleValue,
        weeks: weeksValue,
        color: colorInput.value || null
      };
      await upsertBlock(payload);
      invalidateBlockCatalog();
      await renderSettings(root);
    });

    wrap.appendChild(editForm);

    editBtn.addEventListener('click', () => {
      editForm.hidden = !editForm.hidden;
    });

    list.appendChild(wrap);
  });

  const form = document.createElement('form');
  form.className = 'settings-block-add';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.required = true;
  titleInput.placeholder = 'Block title';
  titleInput.className = 'input';

  const weeksInput = document.createElement('input');
  weeksInput.type = 'number';
  weeksInput.min = '1';
  weeksInput.required = true;
  weeksInput.value = '1';
  weeksInput.placeholder = 'Weeks';
  weeksInput.className = 'input';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'input';
  colorInput.value = '#ffffff';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn';
  submitBtn.textContent = 'Add block';

  form.append(titleInput, weeksInput, colorInput, submitBtn);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const titleValue = titleInput.value.trim();
    const weeksValue = Number(weeksInput.value);
    if (!titleValue || !Number.isFinite(weeksValue) || weeksValue <= 0) {
      return;
    }
    await upsertBlock({
      title: titleValue,
      weeks: weeksValue,
      color: colorInput.value || null
    });
    titleInput.value = '';
    weeksInput.value = '1';
    colorInput.value = '#ffffff';
    invalidateBlockCatalog();
    await renderSettings(root);
  });

  blocksCard.appendChild(form);

  layout.appendChild(blocksCard);

  const dataCard = document.createElement('section');
  dataCard.className = 'card';
  const dHeading = document.createElement('h2');
  dHeading.textContent = 'Data';
  dataCard.appendChild(dHeading);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = 'Export DB';
  exportBtn.addEventListener('click', async () => {
    const dump = await exportJSON();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sevenn-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  dataCard.appendChild(exportBtn);

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importJSON(json);
      alert(res.message);
      location.reload();
    } catch (e) {
      alert('Import failed');
    }
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'btn';
  importBtn.textContent = 'Import DB';
  importBtn.addEventListener('click', () => importInput.click());
  dataCard.appendChild(importBtn);
  dataCard.appendChild(importInput);

  const ankiBtn = document.createElement('button');
  ankiBtn.className = 'btn';
  ankiBtn.textContent = 'Export Anki CSV';
  ankiBtn.addEventListener('click', async () => {
    const dump = await exportJSON();
    const blob = await exportAnkiCSV('qa', dump.items || []);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sevenn-anki.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  dataCard.appendChild(ankiBtn);

  layout.appendChild(dataCard);
}
