import { getSettings, saveSettings, listBlocks, upsertBlock, deleteBlock, deleteLecture, updateLecture, exportJSON, importJSON, exportAnkiCSV } from '../storage/storage.js';
import { confirmModal } from './components/confirm.js';

const collapsedLectureBlocks = new Set();

function isLectureListCollapsed(blockId) {
  return collapsedLectureBlocks.has(blockId);
}

function toggleLectureListCollapse(blockId) {
  if (collapsedLectureBlocks.has(blockId)) {
    collapsedLectureBlocks.delete(blockId);
  } else {
    collapsedLectureBlocks.add(blockId);
  }
}

export async function renderSettings(root) {
  root.innerHTML = '';

  const [settings, blocksRaw] = await Promise.all([getSettings(), listBlocks()]);
  const blocks = blocksRaw
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.blockId.localeCompare(b.blockId));

  const page = document.createElement('div');
  page.className = 'settings-page';

  const hero = document.createElement('section');
  hero.className = 'settings-hero';
  const title = document.createElement('h1');
  title.textContent = 'Workspace settings';
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Tune your study cadence and organise the curriculum structure in one place.';
  hero.append(title, subtitle);
  page.appendChild(hero);

  const overview = document.createElement('div');
  overview.className = 'settings-overview';
  overview.appendChild(createDailyCard(settings));
  overview.appendChild(createDataCard());
  page.appendChild(overview);

  const blockSection = document.createElement('section');
  blockSection.className = 'settings-section';
  const blockHeader = document.createElement('div');
  blockHeader.className = 'settings-section-header';
  const blockTitle = document.createElement('h2');
  blockTitle.textContent = 'Curriculum blocks';
  const blockDesc = document.createElement('p');
  blockDesc.className = 'settings-section-description';
  blockDesc.textContent = 'Reorder blocks, manage lecture details, and keep tagging effortless.';
  blockHeader.append(blockTitle, blockDesc);
  blockSection.appendChild(blockHeader);

  const blockList = document.createElement('div');
  blockList.className = 'settings-block-list';
  if (!blocks.length) {
    const empty = document.createElement('div');
    empty.className = 'settings-empty';
    empty.textContent = 'No blocks yet. Add one below to start mapping your curriculum.';
    blockList.appendChild(empty);
  } else {
    blocks.forEach((block, index) => {
      blockList.appendChild(createBlockCard(block, index, blocks.length));
    });
  }
  blockSection.appendChild(blockList);
  blockSection.appendChild(createAddBlockForm());
  page.appendChild(blockSection);

  root.appendChild(page);

  function createDailyCard(currentSettings) {
    const card = document.createElement('section');
    card.className = 'settings-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    const heading = document.createElement('h2');
    heading.className = 'settings-card-title';
    heading.textContent = 'Daily pacing';
    const description = document.createElement('p');
    description.className = 'settings-card-description';
    description.textContent = 'Set a realistic daily review target to keep your spaced repetition flow on track.';
    header.append(heading, description);
    card.appendChild(header);

    const field = document.createElement('label');
    field.className = 'settings-field';
    field.textContent = 'Daily review target';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'input';
    input.min = '1';
    input.value = currentSettings.dailyCount;
    input.addEventListener('change', () => {
      const value = Number(input.value) || currentSettings.dailyCount;
      saveSettings({ dailyCount: Math.max(1, value) });
    });
    field.appendChild(input);

    const helper = document.createElement('p');
    helper.className = 'settings-card-helper';
    helper.textContent = 'We use this number to pace upcoming reviews across tabs.';

    card.append(field, helper);
    return card;
  }

  function createDataCard() {
    const card = document.createElement('section');
    card.className = 'settings-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    const heading = document.createElement('h2');
    heading.className = 'settings-card-title';
    heading.textContent = 'Data management';
    const description = document.createElement('p');
    description.className = 'settings-card-description';
    description.textContent = 'Safely export your workspace or bring in updates from teammates.';
    header.append(heading, description);
    card.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'settings-card-actions';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn secondary';
    exportBtn.textContent = 'Export JSON';
    exportBtn.addEventListener('click', async () => {
      const dump = await exportJSON();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'sevenn-export.json';
      link.click();
      URL.revokeObjectURL(link.href);
    });
    actions.appendChild(exportBtn);

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json';
    importInput.className = 'settings-hidden-file';
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const res = await importJSON(json);
        alert(res.message);
        location.reload();
      } catch (err) {
        alert('Import failed');
      }
    });

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'btn secondary';
    importBtn.textContent = 'Import JSON';
    importBtn.addEventListener('click', () => importInput.click());
    actions.append(importBtn, importInput);

    const ankiBtn = document.createElement('button');
    ankiBtn.type = 'button';
    ankiBtn.className = 'btn secondary';
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
    actions.appendChild(ankiBtn);

    card.appendChild(actions);
    return card;
  }

  function createBlockCard(block, index, total) {
    const card = document.createElement('article');
    card.className = 'settings-block-card';
    card.dataset.blockId = block.blockId;
    if (block.color) {
      card.style.setProperty('--block-accent', block.color);
    }

    const header = document.createElement('div');
    header.className = 'settings-block-header';

    const identity = document.createElement('div');
    identity.className = 'settings-block-identity';

    const colorSwatch = document.createElement('span');
    colorSwatch.className = 'settings-block-color';
    colorSwatch.style.background = block.color || 'rgba(148, 163, 184, 0.4)';

    const textWrap = document.createElement('div');
    textWrap.className = 'settings-block-text';

    const heading = document.createElement('h3');
    heading.className = 'settings-block-title';
    heading.textContent = `${block.blockId} — ${block.title}`;

    const meta = document.createElement('span');
    meta.className = 'settings-block-meta';
    const lectureCount = block.lectures?.length || 0;
    const weekCount = block.weeks || 0;
    meta.textContent = `${weekCount} week${weekCount === 1 ? '' : 's'} • ${lectureCount} lecture${lectureCount === 1 ? '' : 's'}`;

    textWrap.append(heading, meta);
    identity.append(colorSwatch, textWrap);
    header.appendChild(identity);

    const controls = document.createElement('div');
    controls.className = 'settings-block-controls';

    const collapsed = isLectureListCollapsed(block.blockId);
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'settings-collapse-btn';
    collapseBtn.textContent = collapsed ? 'Show lectures' : 'Hide lectures';
    collapseBtn.setAttribute('aria-expanded', (!collapsed).toString());
    controls.appendChild(collapseBtn);

    const iconGroup = document.createElement('div');
    iconGroup.className = 'settings-icon-group';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'icon-btn ghost';
    upBtn.title = 'Move block up';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', async () => {
      if (index === 0) return;
      const other = blocks[index - 1];
      const tmp = block.order;
      block.order = other.order;
      other.order = tmp;
      await upsertBlock(block);
      await upsertBlock(other);
      await renderSettings(root);
    });
    iconGroup.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'icon-btn ghost';
    downBtn.title = 'Move block down';
    downBtn.textContent = '↓';
    downBtn.disabled = index === total - 1;
    downBtn.addEventListener('click', async () => {
      if (index === total - 1) return;
      const other = blocks[index + 1];
      const tmp = block.order;
      block.order = other.order;
      other.order = tmp;
      await upsertBlock(block);
      await upsertBlock(other);
      await renderSettings(root);
    });
    iconGroup.appendChild(downBtn);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn ghost';
    editBtn.title = 'Edit block';
    editBtn.textContent = '✎';
    iconGroup.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.title = 'Delete block';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', async () => {
      if (await confirmModal('Delete block?')) {
        await deleteBlock(block.blockId);
        await renderSettings(root);
      }
    });
    iconGroup.appendChild(deleteBtn);

    controls.appendChild(iconGroup);
    header.appendChild(controls);
    card.appendChild(header);

    const editForm = document.createElement('form');
    editForm.className = 'settings-inline-form settings-block-edit';
    editForm.hidden = true;

    const titleInput = document.createElement('input');
    titleInput.className = 'input';
    titleInput.value = block.title;
    titleInput.placeholder = 'Block title';

    const weeksInput = document.createElement('input');
    weeksInput.className = 'input';
    weeksInput.type = 'number';
    weeksInput.min = '1';
    weeksInput.value = block.weeks ?? '';
    weeksInput.placeholder = 'Weeks';

    const colorInput = document.createElement('input');
    colorInput.className = 'input';
    colorInput.type = 'color';
    colorInput.value = block.color || '#ffffff';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Save changes';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'settings-link-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      editForm.hidden = true;
      editBtn.setAttribute('aria-expanded', 'false');
    });

    editForm.append(titleInput, weeksInput, colorInput, saveBtn, cancelBtn);
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const updated = {
        ...block,
        title: titleInput.value.trim() || block.title,
        weeks: Number(weeksInput.value) || 0,
        color: colorInput.value || block.color,
      };
      await upsertBlock(updated);
      await renderSettings(root);
    });
    card.appendChild(editForm);

    editBtn.addEventListener('click', () => {
      const expanded = editForm.hidden;
      editForm.hidden = !expanded;
      editBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });

    const lectureSection = document.createElement('section');
    lectureSection.className = 'settings-lecture-section';
    lectureSection.classList.toggle('collapsed', collapsed);

    const lectureList = document.createElement('div');
    lectureList.className = 'settings-lecture-list';

    const sortedLectures = (block.lectures || [])
      .slice()
      .sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || a.id - b.id);

    if (!sortedLectures.length) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty subtle';
      empty.textContent = 'No lectures defined for this block yet.';
      lectureList.appendChild(empty);
    } else {
      sortedLectures.forEach((lecture) => {
        lectureList.appendChild(createLectureRow(lecture));
      });
    }

    lectureSection.appendChild(lectureList);

    const lectureForm = document.createElement('form');
    lectureForm.className = 'settings-inline-form settings-lecture-form';

    const idInput = document.createElement('input');
    idInput.className = 'input';
    idInput.type = 'number';
    idInput.placeholder = 'ID';

    const nameInput = document.createElement('input');
    nameInput.className = 'input';
    nameInput.placeholder = 'Lecture name';

    const weekInput = document.createElement('input');
    weekInput.className = 'input';
    weekInput.type = 'number';
    weekInput.placeholder = 'Week';

    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.className = 'btn subtle';
    addBtn.textContent = 'Add lecture';

    lectureForm.append(idInput, nameInput, weekInput, addBtn);
    lectureForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const lecture = {
        id: Number(idInput.value),
        name: nameInput.value.trim(),
        week: Number(weekInput.value),
      };
      if (!lecture.id || !lecture.name || !lecture.week) return;
      if (block.weeks && (lecture.week < 1 || lecture.week > block.weeks)) return;
      const nextLectures = Array.isArray(block.lectures) ? block.lectures.slice() : [];
      nextLectures.push(lecture);
      const updated = { ...block, lectures: nextLectures };
      await upsertBlock(updated);
      await renderSettings(root);
    });
    lectureSection.appendChild(lectureForm);

    collapseBtn.addEventListener('click', () => {
      toggleLectureListCollapse(block.blockId);
      const nowCollapsed = isLectureListCollapsed(block.blockId);
      lectureSection.classList.toggle('collapsed', nowCollapsed);
      collapseBtn.textContent = nowCollapsed ? 'Show lectures' : 'Hide lectures';
      collapseBtn.setAttribute('aria-expanded', (!nowCollapsed).toString());
    });

    card.appendChild(lectureSection);
    return card;

    function createLectureRow(lecture) {
      const row = document.createElement('div');
      row.className = 'settings-lecture-row';

      const info = document.createElement('div');
      info.className = 'settings-lecture-info';
      const name = document.createElement('div');
      name.className = 'settings-lecture-name';
      name.textContent = lecture.name || `Lecture ${lecture.id}`;
      const details = document.createElement('div');
      details.className = 'settings-lecture-meta';
      details.textContent = `ID ${lecture.id} • Week ${lecture.week}`;
      info.append(name, details);
      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'settings-lecture-actions';

      const editLecture = document.createElement('button');
      editLecture.type = 'button';
      editLecture.className = 'settings-pill-btn';
      editLecture.textContent = 'Edit';

      const deleteLectureBtn = document.createElement('button');
      deleteLectureBtn.type = 'button';
      deleteLectureBtn.className = 'settings-pill-btn danger';
      deleteLectureBtn.textContent = 'Delete';

      deleteLectureBtn.addEventListener('click', async () => {
        if (await confirmModal('Delete lecture?')) {
          await deleteLecture(block.blockId, lecture.id);
          await renderSettings(root);
        }
      });

      editLecture.addEventListener('click', () => {
        const editor = document.createElement('form');
        editor.className = 'settings-inline-form settings-lecture-edit';

        const editName = document.createElement('input');
        editName.className = 'input';
        editName.value = lecture.name || '';
        editName.placeholder = 'Lecture name';

        const editWeek = document.createElement('input');
        editWeek.className = 'input';
        editWeek.type = 'number';
        editWeek.value = lecture.week ?? '';
        editWeek.placeholder = 'Week';

        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'btn subtle';
        save.textContent = 'Save';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'settings-link-btn';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
          renderSettings(root);
        });

        editor.append(editName, editWeek, save, cancel);
        editor.addEventListener('submit', async (event) => {
          event.preventDefault();
          const nameValue = editName.value.trim();
          const weekValue = Number(editWeek.value);
          if (!nameValue || !weekValue) return;
          if (block.weeks && (weekValue < 1 || weekValue > block.weeks)) return;
          await updateLecture(block.blockId, { id: lecture.id, name: nameValue, week: weekValue });
          await renderSettings(root);
        });

        row.replaceChildren(editor);
      });

      actions.append(editLecture, deleteLectureBtn);
      row.appendChild(actions);
      return row;
    }
  }

  function createAddBlockForm() {
    const wrap = document.createElement('div');
    wrap.className = 'settings-add-block-card';

    const heading = document.createElement('h3');
    heading.textContent = 'Add new block';
    wrap.appendChild(heading);

    const form = document.createElement('form');
    form.className = 'settings-inline-form settings-add-block';

    const id = document.createElement('input');
    id.className = 'input';
    id.placeholder = 'Block ID';

    const title = document.createElement('input');
    title.className = 'input';
    title.placeholder = 'Title';

    const weeks = document.createElement('input');
    weeks.className = 'input';
    weeks.type = 'number';
    weeks.placeholder = 'Weeks';

    const color = document.createElement('input');
    color.className = 'input';
    color.type = 'color';
    color.value = '#ffffff';

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn';
    submit.textContent = 'Create block';

    form.append(id, title, weeks, color, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const def = {
        blockId: id.value.trim(),
        title: title.value.trim(),
        weeks: Number(weeks.value),
        color: color.value,
        lectures: [],
      };
      if (!def.blockId || !def.title || !def.weeks) return;
      await upsertBlock(def);
      await renderSettings(root);
    });

    wrap.appendChild(form);
    return wrap;
  }
}
