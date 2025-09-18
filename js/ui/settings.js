import { getSettings, saveSettings, listBlocks, upsertBlock, deleteBlock, deleteLecture, updateLecture, exportJSON, importJSON, exportAnkiCSV } from '../storage/storage.js';
import { confirmModal } from './components/confirm.js';

const collapsedLectureBlocks = new Set();

function sectionKey(blockId) {
  return blockId || '__unassigned__';
}

function isBlockCollapsed(blockId) {
  return collapsedLectureBlocks.has(sectionKey(blockId));
}

function setBlockCollapsed(blockId, collapsed) {
  const key = sectionKey(blockId);
  if (collapsed) collapsedLectureBlocks.add(key);
  else collapsedLectureBlocks.delete(key);
}

function createPanel(title, description) {
  const panel = document.createElement('section');
  panel.className = 'settings-panel';

  const header = document.createElement('div');
  header.className = 'settings-panel-header';
  const heading = document.createElement('h3');
  heading.textContent = title;
  header.appendChild(heading);
  if (description) {
    const subtitle = document.createElement('p');
    subtitle.className = 'settings-panel-description';
    subtitle.textContent = description;
    header.appendChild(subtitle);
  }
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'settings-panel-body';
  panel.appendChild(body);

  return { panel, body };
}

export async function renderSettings(root) {
  root.innerHTML = '';
  root.className = 'settings-root';

  const settings = await getSettings();
  const blocks = await listBlocks();
  blocks.sort((a, b) => a.order - b.order || a.blockId.localeCompare(b.blockId));

  const page = document.createElement('div');
  page.className = 'settings-page';
  root.appendChild(page);

  const hero = document.createElement('header');
  hero.className = 'settings-hero';
  const title = document.createElement('h1');
  title.textContent = 'Settings';
  const intro = document.createElement('p');
  intro.textContent = 'Tune your study experience, manage curriculum structure, and keep your data in sync with the rest of Sevenn.';
  hero.append(title, intro);
  page.appendChild(hero);

  const panels = document.createElement('div');
  panels.className = 'settings-panels';
  page.appendChild(panels);

  const { panel: goalPanel, body: goalBody } = createPanel('Study goals', 'Set your daily target so the review queue stays manageable.');
  const goalField = document.createElement('label');
  goalField.className = 'settings-field';
  goalField.textContent = 'Daily review target';
  const goalHint = document.createElement('span');
  goalHint.className = 'settings-field-hint';
  goalHint.textContent = 'Number of cards to review each day';
  goalField.appendChild(goalHint);
  const goalInput = document.createElement('input');
  goalInput.type = 'number';
  goalInput.className = 'input';
  goalInput.min = '1';
  goalInput.value = settings.dailyCount;
  goalInput.addEventListener('change', () => {
    saveSettings({ dailyCount: Number(goalInput.value) });
  });
  goalField.appendChild(goalInput);
  goalBody.appendChild(goalField);
  panels.appendChild(goalPanel);

  const { panel: dataPanel, body: dataBody } = createPanel('Data & backups', 'Keep a local copy of your work or bring in data from elsewhere.');
  const dataActions = document.createElement('div');
  dataActions.className = 'settings-action-grid';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = 'Export database';
  exportBtn.addEventListener('click', async () => {
    const dump = await exportJSON();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sevenn-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  dataActions.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn secondary';
  importBtn.textContent = 'Import database';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.hidden = true;
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
  importBtn.addEventListener('click', () => importInput.click());
  dataActions.appendChild(importBtn);

  const ankiBtn = document.createElement('button');
  ankiBtn.className = 'btn secondary';
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
  dataActions.appendChild(ankiBtn);

  dataBody.appendChild(dataActions);
  dataBody.appendChild(importInput);
  panels.appendChild(dataPanel);

  const { panel: blockPanel, body: blockBody } = createPanel('Curriculum blocks', 'Organise blocks, weeks, and lectures to match the way you study.');
  blockPanel.classList.add('settings-panel-wide');
  page.appendChild(blockPanel);

  const blockList = document.createElement('div');
  blockList.className = 'settings-block-list';
  blockBody.appendChild(blockList);

  if (!blocks.length) {
    const empty = document.createElement('p');
    empty.className = 'settings-empty';
    empty.textContent = 'No blocks yet. Use the form below to start building your curriculum structure.';
    blockList.appendChild(empty);
  } else {
    blocks.forEach((block, index) => {
      blockList.appendChild(createBlockCard(block, index));
    });
  }

  const createWrap = document.createElement('div');
  createWrap.className = 'settings-block-create-wrap';
  const createTitle = document.createElement('h4');
  createTitle.textContent = 'Add new block';
  createWrap.appendChild(createTitle);

  const createForm = document.createElement('form');
  createForm.className = 'settings-inline-form settings-block-create';
  const idInput = document.createElement('input');
  idInput.className = 'input';
  idInput.placeholder = 'ID';
  const titleInput = document.createElement('input');
  titleInput.className = 'input';
  titleInput.placeholder = 'Title';
  const weeksInput = document.createElement('input');
  weeksInput.className = 'input';
  weeksInput.type = 'number';
  weeksInput.min = '1';
  weeksInput.placeholder = 'Weeks';
  const colorInput = document.createElement('input');
  colorInput.className = 'input';
  colorInput.type = 'color';
  colorInput.value = '#ffffff';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn';
  addBtn.type = 'submit';
  addBtn.textContent = 'Create block';
  createForm.append(idInput, titleInput, weeksInput, colorInput, addBtn);
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const def = {
      blockId: idInput.value.trim(),
      title: titleInput.value.trim(),
      weeks: Number(weeksInput.value),
      color: colorInput.value,
      lectures: [],
    };
    if (!def.blockId || !def.title || !def.weeks) return;
    await upsertBlock(def);
    await renderSettings(root);
  });
  createWrap.appendChild(createForm);
  blockBody.appendChild(createWrap);

  function createBlockCard(block, index) {
    const card = document.createElement('article');
    card.className = 'settings-block-card';
    card.style.setProperty('--block-color', block.color || '#38bdf8');
    let collapsed = isBlockCollapsed(block.blockId);
    if (collapsed) card.classList.add('collapsed');

    const header = document.createElement('div');
    header.className = 'settings-block-header';
    card.appendChild(header);

    const info = document.createElement('div');
    info.className = 'settings-block-info';
    const badge = document.createElement('span');
    badge.className = 'settings-block-id';
    badge.textContent = block.blockId;
    const name = document.createElement('h4');
    name.className = 'settings-block-title';
    name.textContent = block.title;
    const meta = document.createElement('p');
    meta.className = 'settings-block-meta';
    const lectures = (block.lectures || []).slice().sort((a, b) => a.week - b.week || a.id - b.id);
    const metaParts = [];
    metaParts.push(`${block.weeks} ${block.weeks === 1 ? 'week' : 'weeks'}`);
    metaParts.push(`${lectures.length} ${lectures.length === 1 ? 'lecture' : 'lectures'}`);
    meta.textContent = metaParts.join(' • ');
    info.append(badge, name, meta);
    header.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'settings-block-actions';

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'icon-btn ghost settings-collapse-btn';
    const updateCollapseBtn = () => {
      collapseBtn.textContent = collapsed ? '▸' : '▾';
      collapseBtn.title = collapsed ? 'Show lectures' : 'Hide lectures';
      collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    updateCollapseBtn();
    collapseBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      card.classList.toggle('collapsed', collapsed);
      content.hidden = collapsed;
      setBlockCollapsed(block.blockId, collapsed);
      updateCollapseBtn();
    });
    actions.appendChild(collapseBtn);

    const upBtn = document.createElement('button');
    upBtn.className = 'icon-btn ghost';
    upBtn.textContent = '▲';
    upBtn.title = 'Move up';
    upBtn.disabled = index === 0;
    if (!upBtn.disabled) {
      upBtn.addEventListener('click', async () => {
        const other = blocks[index - 1];
        const tmp = block.order; block.order = other.order; other.order = tmp;
        await upsertBlock(block); await upsertBlock(other);
        await renderSettings(root);
      });
    }
    actions.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'icon-btn ghost';
    downBtn.textContent = '▼';
    downBtn.title = 'Move down';
    downBtn.disabled = index === blocks.length - 1;
    if (!downBtn.disabled) {
      downBtn.addEventListener('click', async () => {
        const other = blocks[index + 1];
        const tmp = block.order; block.order = other.order; other.order = tmp;
        await upsertBlock(block); await upsertBlock(other);
        await renderSettings(root);
      });
    }
    actions.appendChild(downBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn ghost';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit block';
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Delete block';
    deleteBtn.addEventListener('click', async () => {
      if (await confirmModal('Delete block?')) {
        await deleteBlock(block.blockId);
        await renderSettings(root);
      }
    });
    actions.appendChild(deleteBtn);

    header.appendChild(actions);

    const content = document.createElement('div');
    content.className = 'settings-block-content';
    content.hidden = collapsed;
    card.appendChild(content);

    const editForm = document.createElement('form');
    editForm.className = 'settings-inline-form settings-block-edit';
    editForm.hidden = true;
    const editTitle = document.createElement('input');
    editTitle.className = 'input';
    editTitle.value = block.title;
    const editWeeks = document.createElement('input');
    editWeeks.className = 'input';
    editWeeks.type = 'number';
    editWeeks.min = '1';
    editWeeks.value = block.weeks;
    const editColor = document.createElement('input');
    editColor.className = 'input';
    editColor.type = 'color';
    editColor.value = block.color || '#ffffff';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save changes';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    editForm.append(editTitle, editWeeks, editColor, saveBtn, cancelBtn);
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updated = { ...block, title: editTitle.value.trim(), weeks: Number(editWeeks.value), color: editColor.value };
      await upsertBlock(updated);
      await renderSettings(root);
    });
    cancelBtn.addEventListener('click', () => {
      editTitle.value = block.title;
      editWeeks.value = block.weeks;
      editColor.value = block.color || '#ffffff';
      editForm.hidden = true;
      editBtn.setAttribute('aria-expanded', 'false');
    });
    content.appendChild(editForm);

    editBtn.addEventListener('click', () => {
      const showing = !editForm.hidden;
      editForm.hidden = showing;
      editBtn.setAttribute('aria-expanded', showing ? 'false' : 'true');
    });

    const lectureSection = document.createElement('section');
    lectureSection.className = 'settings-lecture-section';
    content.appendChild(lectureSection);

    if (!lectures.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-empty';
      empty.textContent = 'No lectures yet for this block.';
      lectureSection.appendChild(empty);
    } else {
      const lectureList = document.createElement('div');
      lectureList.className = 'settings-lecture-list';
      lectureSection.appendChild(lectureList);

      lectures.forEach((lecture) => {
        const row = document.createElement('div');
        row.className = 'settings-lecture-row';

        const details = document.createElement('div');
        details.className = 'settings-lecture-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'settings-lecture-name';
        nameEl.textContent = lecture.name;
        const metaEl = document.createElement('div');
        metaEl.className = 'settings-lecture-meta';
        metaEl.textContent = `Week ${lecture.week} • ID ${lecture.id}`;
        details.append(nameEl, metaEl);
        row.appendChild(details);

        const rowActions = document.createElement('div');
        rowActions.className = 'settings-lecture-actions';
        const editLectureBtn = document.createElement('button');
        editLectureBtn.className = 'icon-btn ghost';
        editLectureBtn.textContent = '✎';
        editLectureBtn.title = 'Edit lecture';
        const deleteLectureBtn = document.createElement('button');
        deleteLectureBtn.className = 'icon-btn danger';
        deleteLectureBtn.textContent = '🗑';
        deleteLectureBtn.title = 'Delete lecture';
        rowActions.append(editLectureBtn, deleteLectureBtn);
        row.appendChild(rowActions);

        editLectureBtn.addEventListener('click', () => {
          const form = document.createElement('form');
          form.className = 'settings-inline-form settings-lecture-edit';
          const nameInput = document.createElement('input');
          nameInput.className = 'input';
          nameInput.value = lecture.name;
          const weekInput = document.createElement('input');
          weekInput.className = 'input';
          weekInput.type = 'number';
          weekInput.min = '1';
          weekInput.max = block.weeks;
          weekInput.value = lecture.week;
          const saveLectureBtn = document.createElement('button');
          saveLectureBtn.className = 'btn';
          saveLectureBtn.type = 'submit';
          saveLectureBtn.textContent = 'Save';
          const cancelLectureBtn = document.createElement('button');
          cancelLectureBtn.className = 'btn secondary';
          cancelLectureBtn.type = 'button';
          cancelLectureBtn.textContent = 'Cancel';
          form.append(nameInput, weekInput, saveLectureBtn, cancelLectureBtn);
          row.replaceChildren(form);
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = nameInput.value.trim();
            const week = Number(weekInput.value);
            if (!name || !week || week < 1 || week > block.weeks) return;
            await updateLecture(block.blockId, { id: lecture.id, name, week });
            await renderSettings(root);
          });
          cancelLectureBtn.addEventListener('click', async () => {
            await renderSettings(root);
          });
        });

        deleteLectureBtn.addEventListener('click', async () => {
          if (await confirmModal('Delete lecture?')) {
            await deleteLecture(block.blockId, lecture.id);
            await renderSettings(root);
          }
        });

        lectureList.appendChild(row);
      });
    }

    const lectureForm = document.createElement('form');
    lectureForm.className = 'settings-inline-form settings-lecture-add';
    const lectureId = document.createElement('input');
    lectureId.className = 'input';
    lectureId.placeholder = 'Lecture ID';
    lectureId.type = 'number';
    lectureId.min = '1';
    const lectureName = document.createElement('input');
    lectureName.className = 'input';
    lectureName.placeholder = 'Lecture name';
    const lectureWeek = document.createElement('input');
    lectureWeek.className = 'input';
    lectureWeek.placeholder = 'Week';
    lectureWeek.type = 'number';
    lectureWeek.min = '1';
    lectureWeek.max = block.weeks;
    const lectureAdd = document.createElement('button');
    lectureAdd.className = 'btn subtle';
    lectureAdd.type = 'submit';
    lectureAdd.textContent = 'Add lecture';
    lectureForm.append(lectureId, lectureName, lectureWeek, lectureAdd);
    lectureForm.addEventListener('submit', async (e) => {
      e.preventDefault();
    const lecture = { id: Number(lectureId.value), name: lectureName.value.trim(), week: Number(lectureWeek.value) };
    if (!lecture.id || !lecture.name || !lecture.week) return;
    if (lecture.week < 1 || lecture.week > block.weeks) return;
    const updated = { ...block, lectures: [...(block.lectures || []), lecture] };
      await upsertBlock(updated);
      await renderSettings(root);
    });
    lectureSection.appendChild(lectureForm);

    return card;
  }
}
