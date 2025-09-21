import { getSettings, saveSettings, upsertBlock, deleteBlock, exportJSON, importJSON, exportAnkiCSV } from '../storage/storage.js';
import { loadBlockCatalog, invalidateBlockCatalog } from '../storage/block-catalog.js';
import { REVIEW_RATINGS } from '../review/constants.js';
import { invalidateReviewDurationsCache } from '../review/scheduler.js';
import { confirmModal } from './components/confirm.js';

export async function renderSettings(root) {
  root.innerHTML = '';

  const settings = await getSettings();

  const settingsCard = document.createElement('section');
  settingsCard.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = 'Settings';
  settingsCard.appendChild(heading);

  const dailyLabel = document.createElement('label');
  dailyLabel.textContent = 'Daily review target:';
  const dailyInput = document.createElement('input');
  dailyInput.type = 'number';
  dailyInput.className = 'input';
  dailyInput.min = '1';
  dailyInput.value = settings.dailyCount;
  dailyInput.addEventListener('change', () => {
    saveSettings({ dailyCount: Number(dailyInput.value) });
  });
  dailyLabel.appendChild(dailyInput);
  settingsCard.appendChild(dailyLabel);

  const timingHeader = document.createElement('h3');
  timingHeader.className = 'settings-subheading';
  timingHeader.textContent = 'Review timing (minutes)';
  settingsCard.appendChild(timingHeader);

  const timingGrid = document.createElement('div');
  timingGrid.className = 'settings-review-grid';
  const ratingLabels = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
  const stepValues = settings.reviewSteps || {};
  REVIEW_RATINGS.forEach(key => {
    const row = document.createElement('label');
    row.className = 'settings-review-row';
    row.textContent = `${ratingLabels[key]}:`;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'input settings-review-input';
    input.min = '1';
    input.step = '1';
    input.value = stepValues[key] ?? '';
    input.addEventListener('change', async () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) {
        input.value = stepValues[key] ?? '';
        return;
      }
      await saveSettings({ reviewSteps: { [key]: value } });
      invalidateReviewDurationsCache();
    });
    row.appendChild(input);
    timingGrid.appendChild(row);
  });
  settingsCard.appendChild(timingGrid);

  root.appendChild(settingsCard);

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
  blocks.forEach((b,i) => {
    const wrap = document.createElement('div');
    wrap.className = 'block';
    const title = document.createElement('h3');
    title.textContent = b.title || 'Untitled block';
    if (b.color) {
      title.style.borderLeft = `8px solid ${b.color}`;
      title.style.paddingLeft = '0.5rem';
    }
    wrap.appendChild(title);

    const wkInfo = document.createElement('div');
    const weekLabel = Number.isFinite(Number(b.weeks)) ? Number(b.weeks) : null;
    wkInfo.textContent = weekLabel != null ? `Weeks: ${weekLabel}` : 'Weeks: —';
    wrap.appendChild(wkInfo);

    const controls = document.createElement('div');
    controls.className = 'row';

    const upBtn = document.createElement('button');
    upBtn.className = 'btn';
    upBtn.textContent = '↑';
    upBtn.disabled = i === 0;
    upBtn.addEventListener('click', async () => {
      const other = blocks[i-1];
      const tmp = b.order; b.order = other.order; other.order = tmp;
      await upsertBlock(b); await upsertBlock(other);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'btn';
    downBtn.textContent = '↓';
    downBtn.disabled = i === blocks.length - 1;
    downBtn.addEventListener('click', async () => {
      const other = blocks[i+1];
      const tmp = b.order; b.order = other.order; other.order = tmp;
      await upsertBlock(b); await upsertBlock(other);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    controls.appendChild(downBtn);

    const edit = document.createElement('button');
    edit.className = 'btn';
    edit.textContent = 'Edit';
    controls.appendChild(edit);

    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (await confirmModal('Delete block?')) {
        await deleteBlock(b.blockId);
        invalidateBlockCatalog();
        await renderSettings(root);
      }
    });
    controls.appendChild(del);
    wrap.appendChild(controls);

    const editForm = document.createElement('form');
    editForm.className = 'row';
    editForm.style.display = 'none';
    const titleInput = document.createElement('input');
    titleInput.className = 'input';
    titleInput.value = b.title;
    const weeksInput = document.createElement('input');
    weeksInput.className = 'input';
    weeksInput.type = 'number';
    weeksInput.min = '1';
    weeksInput.value = b.weeks;
    const colorInput = document.createElement('input');
    colorInput.className = 'input';
    colorInput.type = 'color';
    colorInput.value = b.color || '#ffffff';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save';
    editForm.append(titleInput, weeksInput, colorInput, saveBtn);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleValue = titleInput.value.trim();
      const weeksValue = Number(weeksInput.value);
      if (!titleValue || Number.isNaN(weeksValue) || weeksValue <= 0) return;
      const updated = { ...b, title: titleValue, weeks: weeksValue, color: colorInput.value };
      await upsertBlock(updated);
      invalidateBlockCatalog();
      await renderSettings(root);
    });
    wrap.appendChild(editForm);

    edit.addEventListener('click', () => {
      editForm.style.display = editForm.style.display === 'none' ? 'flex' : 'none';
    });

    list.appendChild(wrap);
  });

  const form = document.createElement('form');
  form.className = 'row';
  const titleInput = document.createElement('input');
  titleInput.className = 'input';
  titleInput.placeholder = 'Title';
  const weeks = document.createElement('input');
  weeks.className = 'input';
  weeks.type = 'number';
  weeks.min = '1';
  weeks.placeholder = 'Weeks';
  const color = document.createElement('input');
  color.className = 'input';
  color.type = 'color';
  color.value = '#ffffff';
  const add = document.createElement('button');
  add.className = 'btn';
  add.type = 'submit';
  add.textContent = 'Add block';
  form.append(titleInput, weeks, color, add);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleValue = titleInput.value.trim();
    const weekValue = Number(weeks.value);
    if (!titleValue || Number.isNaN(weekValue) || weekValue <= 0) return;
    await upsertBlock({
      title: titleValue,
      weeks: weekValue,
      color: color.value
    });
    invalidateBlockCatalog();
    await renderSettings(root);
  });
  blocksCard.appendChild(form);

  root.appendChild(blocksCard);

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

  root.appendChild(dataCard);
}
