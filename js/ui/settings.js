import { getSettings, saveSettings, listBlocks, upsertBlock, deleteBlock, exportJSON, importJSON, exportAnkiCSV } from '../storage/storage.js';

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

  root.appendChild(settingsCard);

  const blocksCard = document.createElement('section');
  blocksCard.className = 'card';
  const bHeading = document.createElement('h2');
  bHeading.textContent = 'Blocks';
  blocksCard.appendChild(bHeading);

  const list = document.createElement('div');
  list.className = 'block-list';
  blocksCard.appendChild(list);

  const blocks = await listBlocks();
  blocks.forEach(b => {
    const wrap = document.createElement('div');
    wrap.className = 'block';
    const title = document.createElement('h3');
    title.textContent = `${b.blockId} – ${b.title}`;
    wrap.appendChild(title);

    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (confirm('Delete block?')) {
        await deleteBlock(b.blockId);
        await renderSettings(root);
      }
    });
    wrap.appendChild(del);

    const lecList = document.createElement('ul');
    b.lectures.forEach(l => {
      const li = document.createElement('li');
      li.textContent = `${l.id}: ${l.name} (W${l.week})`;
      lecList.appendChild(li);
    });
    wrap.appendChild(lecList);

    const lecForm = document.createElement('form');
    lecForm.className = 'row';
    const idInput = document.createElement('input');
    idInput.className = 'input';
    idInput.placeholder = 'id';
    idInput.type = 'number';
    const nameInput = document.createElement('input');
    nameInput.className = 'input';
    nameInput.placeholder = 'name';
    const weekInput = document.createElement('input');
    weekInput.className = 'input';
    weekInput.placeholder = 'week';
    weekInput.type = 'number';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.type = 'submit';
    addBtn.textContent = 'Add lecture';
    lecForm.append(idInput, nameInput, weekInput, addBtn);
    lecForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const lecture = { id: Number(idInput.value), name: nameInput.value.trim(), week: Number(weekInput.value) };
      if (!lecture.id || !lecture.name || !lecture.week) return;
      const updated = { ...b, lectures: [...b.lectures, lecture] };
      await upsertBlock(updated);
      await renderSettings(root);
    });
    wrap.appendChild(lecForm);

    list.appendChild(wrap);
  });

  const form = document.createElement('form');
  form.className = 'row';
  const id = document.createElement('input');
  id.className = 'input';
  id.placeholder = 'ID';
  const titleInput = document.createElement('input');
  titleInput.className = 'input';
  titleInput.placeholder = 'Title';
  const weeks = document.createElement('input');
  weeks.className = 'input';
  weeks.type = 'number';
  weeks.placeholder = 'Weeks';
  const add = document.createElement('button');
  add.className = 'btn';
  add.type = 'submit';
  add.textContent = 'Add block';
  form.append(id, titleInput, weeks, add);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const def = {
      blockId: id.value.trim(),
      title: titleInput.value.trim(),
      weeks: Number(weeks.value),
      lectures: [],
    };
    if (!def.blockId || !def.title || !def.weeks) return;
    await upsertBlock(def);
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
