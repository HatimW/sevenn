import { getSettings, saveSettings, listBlocks, upsertBlock, deleteBlock, deleteLecture, updateLecture, exportJSON, importJSON,
exportAnkiCSV } from '../storage/storage.js';
import { confirmModal } from './components/confirm.js';

const collapsedLectureBlocks = new Set();

function isLectureListCollapsed(blockId) {
  return collapsedLectureBlocks.has(blockId);
}

function createSettingsCard(title, description = '') {
  const section = document.createElement('section');
  section.className = 'settings-card';

  const header = document.createElement('header');
  header.className = 'settings-card-header';
  const heading = document.createElement('h2');
  heading.textContent = title;
  header.appendChild(heading);
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'settings-card-description';
    desc.textContent = description;
    header.appendChild(desc);
  }
  section.appendChild(header);

  return section;
}

function createIconButton(label, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn ghost';
  btn.setAttribute('aria-label', title);
  btn.title = title;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

export async function renderSettings(root) {
  root.innerHTML = '';

  const settings = await getSettings();

  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  root.appendChild(layout);

  const primaryColumn = document.createElement('div');
  primaryColumn.className = 'settings-column primary';
  layout.appendChild(primaryColumn);

  const secondaryColumn = document.createElement('div');
  secondaryColumn.className = 'settings-column secondary';
  layout.appendChild(secondaryColumn);

  const cadenceCard = createSettingsCard('Review cadence', 'Tune how many cards appear in a daily review session.');
  const cadenceField = document.createElement('label');
  cadenceField.className = 'settings-field';
  const cadenceTitle = document.createElement('span');
  cadenceTitle.textContent = 'Daily review target';
  cadenceField.appendChild(cadenceTitle);
  const cadenceInput = document.createElement('input');
  cadenceInput.type = 'number';
  cadenceInput.className = 'input';
  cadenceInput.min = '1';
  cadenceInput.value = settings.dailyCount;
  cadenceInput.addEventListener('change', () => {
    const value = Math.max(1, Number(cadenceInput.value));
    cadenceInput.value = value;
    saveSettings({ dailyCount: value });
  });
  cadenceField.appendChild(cadenceInput);
  cadenceCard.appendChild(cadenceField);
  primaryColumn.appendChild(cadenceCard);

  const blocksCard = createSettingsCard('Curriculum blocks', 'Manage blocks, weeks, and lectures used throughout the app.');
  const blockList = document.createElement('div');
  blockList.className = 'settings-block-grid';
  blocksCard.appendChild(blockList);

  const blocks = await listBlocks();
  blocks.forEach((block, index) => {
    const lectures = (block.lectures || []).slice().sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      return a.id - b.id;
    });
    const collapsed = isLectureListCollapsed(block.blockId);

    const card = document.createElement('article');
    card.className = 'settings-block-card';
    if (collapsed) card.classList.add('is-collapsed');

    const header = document.createElement('div');
    header.className = 'settings-block-header';
    card.appendChild(header);

    const info = document.createElement('div');
    info.className = 'settings-block-info';

    const swatch = document.createElement('span');
    swatch.className = 'settings-block-swatch';
    swatch.style.setProperty('--swatch-color', block.color || '#64748b');
    info.appendChild(swatch);

    const titles = document.createElement('div');
    titles.className = 'settings-block-titles';
    const title = document.createElement('h3');
    title.textContent = block.title || block.blockId;
    titles.appendChild(title);
    const meta = document.createElement('p');
    meta.className = 'settings-block-meta';
    const metaParts = [`Block ${block.blockId}`];
    if (block.weeks) metaParts.push(`${block.weeks} week${block.weeks === 1 ? '' : 's'}`);
    if (lectures.length) metaParts.push(`${lectures.length} lecture${lectures.length === 1 ? '' : 's'}`);
    meta.textContent = metaParts.join(' • ');
    titles.appendChild(meta);
    info.appendChild(titles);
    header.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'settings-block-actions';

    const upBtn = createIconButton('▲', 'Move block up', async () => {
      if (index === 0) return;
      const other = blocks[index - 1];
      const tmp = block.order; block.order = other.order; other.order = tmp;
      await upsertBlock(block); await upsertBlock(other);
      await renderSettings(root);
    });
    if (index === 0) upBtn.disabled = true;
    actions.appendChild(upBtn);

    const downBtn = createIconButton('▼', 'Move block down', async () => {
      if (index === blocks.length - 1) return;
      const other = blocks[index + 1];
      const tmp = block.order; block.order = other.order; other.order = tmp;
      await upsertBlock(block); await upsertBlock(other);
      await renderSettings(root);
    });
    if (index === blocks.length - 1) downBtn.disabled = true;
    actions.appendChild(downBtn);

    let editTitleInput;
    let editWeeksInput;
    let editColorInput;

    const editBtn = createIconButton('✎', 'Edit block details', () => {
      card.classList.toggle('editing');
      editForm.hidden = !card.classList.contains('editing');
      if (!card.classList.contains('editing')) editForm.reset();
    });
    actions.appendChild(editBtn);

    const deleteBtn = createIconButton('🗑', 'Delete block', async () => {
      if (await confirmModal('Delete block?')) {
        await deleteBlock(block.blockId);
        await renderSettings(root);
      }
    });
    actions.appendChild(deleteBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'settings-collapse-toggle';
    toggleBtn.textContent = collapsed ? 'Show lectures' : 'Hide lectures';
    toggleBtn.addEventListener('click', () => {
      const toggled = card.classList.toggle('is-collapsed');
      if (toggled) {
        collapsedLectureBlocks.add(block.blockId);
      } else {
        collapsedLectureBlocks.delete(block.blockId);
      }
      toggleBtn.textContent = toggled ? 'Show lectures' : 'Hide lectures';
    });
    actions.appendChild(toggleBtn);

    header.appendChild(actions);

    const editForm = document.createElement('form');
    editForm.className = 'settings-block-edit';
    editForm.hidden = true;
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updated = {
        ...block,
        title: editTitleInput.value.trim() || block.title,
        weeks: Number(editWeeksInput.value) || 0,
        color: editColorInput.value
      };
      await upsertBlock(updated);
      await renderSettings(root);
    });

    editTitleInput = document.createElement('input');
    editTitleInput.className = 'input';
    editTitleInput.placeholder = 'Block title';
    editTitleInput.value = block.title || '';
    editForm.appendChild(editTitleInput);

    editWeeksInput = document.createElement('input');
    editWeeksInput.className = 'input';
    editWeeksInput.type = 'number';
    editWeeksInput.placeholder = 'Weeks';
    editWeeksInput.min = '0';
    editWeeksInput.value = block.weeks ?? '';
    editForm.appendChild(editWeeksInput);

    editColorInput = document.createElement('input');
    editColorInput.className = 'input';
    editColorInput.type = 'color';
    editColorInput.value = block.color || '#64748b';
    editForm.appendChild(editColorInput);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Save changes';
    editForm.appendChild(saveBtn);

    card.appendChild(editForm);

    const lectureSection = document.createElement('div');
    lectureSection.className = 'settings-lecture-panel';
    card.appendChild(lectureSection);

    const lectureList = document.createElement('div');
    lectureList.className = 'settings-lecture-list';
    lectureSection.appendChild(lectureList);

    if (!lectures.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-empty';
      empty.textContent = 'No lectures yet.';
      lectureList.appendChild(empty);
    } else {
      lectures.forEach(lecture => {
        const row = document.createElement('div');
        row.className = 'settings-lecture-row';

        const label = document.createElement('div');
        label.className = 'settings-lecture-label';
        const strong = document.createElement('strong');
        strong.textContent = lecture.name || `Lecture ${lecture.id}`;
        label.appendChild(strong);
        const sub = document.createElement('span');
        sub.textContent = `Week ${lecture.week}`;
        label.appendChild(sub);
        row.appendChild(label);

        const lectureActions = document.createElement('div');
        lectureActions.className = 'settings-lecture-actions';

        const editLectureBtn = createIconButton('✎', 'Edit lecture', () => {
          row.replaceChildren();
          const form = document.createElement('form');
          form.className = 'settings-lecture-edit';

          const lectureNameInput = document.createElement('input');
          lectureNameInput.className = 'input';
          lectureNameInput.placeholder = 'Lecture name';
          lectureNameInput.value = lecture.name || '';
          form.appendChild(lectureNameInput);

          const lectureWeekInput = document.createElement('input');
          lectureWeekInput.className = 'input';
          lectureWeekInput.type = 'number';
          lectureWeekInput.placeholder = 'Week';
          lectureWeekInput.value = lecture.week ?? '';
          form.appendChild(lectureWeekInput);

          const save = document.createElement('button');
          save.type = 'submit';
          save.className = 'btn';
          save.textContent = 'Save';
          form.appendChild(save);

          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.className = 'btn ghost';
          cancel.textContent = 'Cancel';
          cancel.addEventListener('click', () => renderSettings(root));
          form.appendChild(cancel);

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = lectureNameInput.value.trim();
            const week = Number(lectureWeekInput.value);
            if (!name || !week || week < 1 || (block.weeks && week > block.weeks)) return;
            await updateLecture(block.blockId, { id: lecture.id, name, week });
            await renderSettings(root);
          });

          row.appendChild(form);
        });

        const deleteLectureBtn = createIconButton('🗑', 'Delete lecture', async () => {
          if (await confirmModal('Delete lecture?')) {
            await deleteLecture(block.blockId, lecture.id);
            await renderSettings(root);
          }
        });

        lectureActions.appendChild(editLectureBtn);
        lectureActions.appendChild(deleteLectureBtn);
        row.appendChild(lectureActions);
        lectureList.appendChild(row);
      });
    }

    const lectureForm = document.createElement('form');
    lectureForm.className = 'settings-lecture-form';
    lectureForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idValue = Number(lectureIdInput.value);
      const nameValue = lectureNameInput.value.trim();
      const weekValue = Number(lectureWeekInput.value);
      if (!idValue || !nameValue || !weekValue) return;
      if (weekValue < 1 || (block.weeks && weekValue > block.weeks)) return;
      const lecture = { id: idValue, name: nameValue, week: weekValue };
      const updated = { ...block, lectures: [...(block.lectures || []), lecture] };
      await upsertBlock(updated);
      await renderSettings(root);
    });

    const lectureIdInput = document.createElement('input');
    lectureIdInput.className = 'input';
    lectureIdInput.type = 'number';
    lectureIdInput.placeholder = 'ID';
    lectureForm.appendChild(lectureIdInput);

    const lectureNameInput = document.createElement('input');
    lectureNameInput.className = 'input';
    lectureNameInput.placeholder = 'Lecture name';
    lectureForm.appendChild(lectureNameInput);

    const lectureWeekInput = document.createElement('input');
    lectureWeekInput.className = 'input';
    lectureWeekInput.type = 'number';
    lectureWeekInput.placeholder = 'Week';
    lectureForm.appendChild(lectureWeekInput);

    const addButton = document.createElement('button');
    addButton.type = 'submit';
    addButton.className = 'btn';
    addButton.textContent = 'Add lecture';
    lectureForm.appendChild(addButton);

    lectureSection.appendChild(lectureForm);

    blockList.appendChild(card);
  });

  const addBlockForm = document.createElement('form');
  addBlockForm.className = 'settings-add-block';
  addBlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const blockIdValue = newBlockId.value.trim();
    const blockTitleValue = newBlockTitle.value.trim();
    const blockWeeksValue = Number(newBlockWeeks.value);
    if (!blockIdValue || !blockTitleValue || !blockWeeksValue) return;
    const def = { blockId: blockIdValue, title: blockTitleValue, weeks: blockWeeksValue, color: newBlockColor.value, lectures: [] };
    await upsertBlock(def);
    await renderSettings(root);
  });

  const newBlockId = document.createElement('input');
  newBlockId.className = 'input';
  newBlockId.placeholder = 'Block ID';
  addBlockForm.appendChild(newBlockId);

  const newBlockTitle = document.createElement('input');
  newBlockTitle.className = 'input';
  newBlockTitle.placeholder = 'Title';
  addBlockForm.appendChild(newBlockTitle);

  const newBlockWeeks = document.createElement('input');
  newBlockWeeks.className = 'input';
  newBlockWeeks.type = 'number';
  newBlockWeeks.min = '1';
  newBlockWeeks.placeholder = 'Weeks';
  addBlockForm.appendChild(newBlockWeeks);

  const newBlockColor = document.createElement('input');
  newBlockColor.className = 'input';
  newBlockColor.type = 'color';
  newBlockColor.value = '#64748b';
  addBlockForm.appendChild(newBlockColor);

  const newBlockSubmit = document.createElement('button');
  newBlockSubmit.type = 'submit';
  newBlockSubmit.className = 'btn';
  newBlockSubmit.textContent = 'Add block';
  addBlockForm.appendChild(newBlockSubmit);

  blocksCard.appendChild(addBlockForm);
  primaryColumn.appendChild(blocksCard);

  const dataCard = createSettingsCard('Data management', 'Import or export your content for backups or sharing.');

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn settings-wide-btn';
  exportBtn.textContent = 'Export database';
  exportBtn.addEventListener('click', async () => {
    const dump = await exportJSON();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sevenn-export.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  dataCard.appendChild(exportBtn);

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.hidden = true;
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importJSON(json);
      alert(res.message);
      location.reload();
    } catch (err) {
      console.error(err);
      alert('Import failed');
    }
  });

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn settings-wide-btn';
  importBtn.textContent = 'Import database';
  importBtn.addEventListener('click', () => importInput.click());
  dataCard.appendChild(importBtn);
  dataCard.appendChild(importInput);

  const ankiBtn = document.createElement('button');
  ankiBtn.type = 'button';
  ankiBtn.className = 'btn settings-wide-btn';
  ankiBtn.textContent = 'Export Anki CSV';
  ankiBtn.addEventListener('click', async () => {
    const dump = await exportJSON();
    const blob = await exportAnkiCSV('qa', dump.items || []);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sevenn-anki.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  dataCard.appendChild(ankiBtn);

  secondaryColumn.appendChild(dataCard);
}
