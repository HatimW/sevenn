import { getSettings, saveSettings, listBlocks, upsertBlock, deleteBlock, deleteLecture, updateLecture, exportJSON, importJSON, exportAnkiCSV } from '../storage/storage.js';
import { confirmModal } from './components/confirm.js';

const collapsedLectureBlocks = new Set();

function isLectureListCollapsed(blockId) {
  return collapsedLectureBlocks.has(blockId);
}

function toggleLectureListCollapse(blockId) {
  let collapsed;
  if (collapsedLectureBlocks.has(blockId)) {
    collapsedLectureBlocks.delete(blockId);
    collapsed = false;
  } else {
    collapsedLectureBlocks.add(blockId);
    collapsed = true;
  }
  return collapsed;
}

export async function renderSettings(root) {
  root.innerHTML = '';

  const settings = await getSettings();
  const blocks = await listBlocks();

  const layout = document.createElement('div');
  layout.className = 'settings-layout';
  root.appendChild(layout);

  const generalCard = document.createElement('section');
  generalCard.className = 'settings-card';
  const generalHeader = document.createElement('div');
  generalHeader.className = 'settings-card-header';
  const generalTitle = document.createElement('h2');
  generalTitle.textContent = 'Review preferences';
  generalHeader.appendChild(generalTitle);
  const generalHint = document.createElement('p');
  generalHint.className = 'settings-card-subtitle';
  generalHint.textContent = 'Tailor how many items surface in a day to match your pace.';
  generalHeader.appendChild(generalHint);
  generalCard.appendChild(generalHeader);

  const dailyField = document.createElement('label');
  dailyField.className = 'settings-field';
  const dailyLabel = document.createElement('span');
  dailyLabel.className = 'settings-field-label';
  dailyLabel.textContent = 'Daily review target';
  dailyField.appendChild(dailyLabel);
  const dailyInput = document.createElement('input');
  dailyInput.type = 'number';
  dailyInput.className = 'input';
  dailyInput.min = '1';
  dailyInput.value = settings.dailyCount;
  dailyInput.addEventListener('change', () => {
    saveSettings({ dailyCount: Number(dailyInput.value) || 1 });
  });
  dailyField.appendChild(dailyInput);
  generalCard.appendChild(dailyField);

  layout.appendChild(generalCard);

  const blocksCard = document.createElement('section');
  blocksCard.className = 'settings-card settings-card--wide';
  const blocksHeader = document.createElement('div');
  blocksHeader.className = 'settings-card-header';
  const blocksTitle = document.createElement('h2');
  blocksTitle.textContent = 'Curriculum blocks';
  blocksHeader.appendChild(blocksTitle);
  const blocksHint = document.createElement('p');
  blocksHint.className = 'settings-card-subtitle';
  blocksHint.textContent = 'Organize blocks, lectures, and weekly structure in one place.';
  blocksHeader.appendChild(blocksHint);
  blocksCard.appendChild(blocksHeader);

  const blockList = document.createElement('div');
  blockList.className = 'settings-block-list';
  const nextOrder = blocks.reduce((max, block, idx) => Math.max(max, block.order ?? idx), -1) + 1;

  blocks
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.blockId || '').localeCompare(b.blockId || ''))
    .forEach((block, index, arr) => {
      blockList.appendChild(renderBlockRow(block, index, arr));
    });
  blocksCard.appendChild(blockList);

  const newBlockForm = document.createElement('form');
  newBlockForm.className = 'settings-inline-form settings-block-add';
  const newBlockTitle = document.createElement('h3');
  newBlockTitle.textContent = 'Add a new block';
  newBlockForm.appendChild(newBlockTitle);

  const newBlockFields = document.createElement('div');
  newBlockFields.className = 'settings-inline-grid';

  const idField = createInlineInput('ID', 'text', 'e.g. MSK');
  const titleField = createInlineInput('Title', 'text', 'Musculoskeletal');
  const weeksField = createInlineInput('Weeks', 'number', '6');
  weeksField.input.min = '1';
  const colorField = createInlineInput('Accent color', 'color');
  colorField.input.value = '#1e293b';

  newBlockFields.append(idField.element, titleField.element, weeksField.element, colorField.element);
  newBlockForm.appendChild(newBlockFields);

  const addBlockBtn = document.createElement('button');
  addBlockBtn.className = 'btn primary';
  addBlockBtn.type = 'submit';
  addBlockBtn.textContent = 'Create block';
  newBlockForm.appendChild(addBlockBtn);

  newBlockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      blockId: idField.input.value.trim(),
      title: titleField.input.value.trim(),
      weeks: Number(weeksField.input.value),
      color: colorField.input.value,
      lectures: [],
      order: nextOrder,
    };
    if (!payload.blockId || !payload.title || !payload.weeks) return;
    await upsertBlock(payload);
    await renderSettings(root);
  });

  blocksCard.appendChild(newBlockForm);
  layout.appendChild(blocksCard);

  const dataCard = document.createElement('section');
  dataCard.className = 'settings-card';
  const dataHeader = document.createElement('div');
  dataHeader.className = 'settings-card-header';
  const dataTitle = document.createElement('h2');
  dataTitle.textContent = 'Data management';
  dataHeader.appendChild(dataTitle);
  const dataHint = document.createElement('p');
  dataHint.className = 'settings-card-subtitle';
  dataHint.textContent = 'Safeguard your progress or migrate to another device.';
  dataHeader.appendChild(dataHint);
  dataCard.appendChild(dataHeader);

  const dataActions = document.createElement('div');
  dataActions.className = 'settings-action-grid';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn secondary';
  exportBtn.type = 'button';
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
  dataActions.appendChild(exportBtn);

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
      console.error(err);
      alert('Import failed');
    }
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'btn secondary';
  importBtn.type = 'button';
  importBtn.textContent = 'Import database';
  importBtn.addEventListener('click', () => importInput.click());
  dataActions.appendChild(importBtn);
  dataActions.appendChild(importInput);

  const ankiBtn = document.createElement('button');
  ankiBtn.className = 'btn secondary';
  ankiBtn.type = 'button';
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
  dataActions.appendChild(ankiBtn);

  dataCard.appendChild(dataActions);
  layout.appendChild(dataCard);

  function createInlineInput(label, type, placeholder = '') {
    const field = document.createElement('label');
    field.className = 'settings-inline-field';
    const span = document.createElement('span');
    span.className = 'settings-inline-label';
    span.textContent = label;
    field.appendChild(span);
    const input = document.createElement('input');
    input.className = 'input';
    input.type = type;
    if (placeholder) input.placeholder = placeholder;
    field.appendChild(input);
    return { element: field, input };
  }

  function renderBlockRow(block, index, arr) {
    const card = document.createElement('article');
    card.className = 'settings-block-card';

    const header = document.createElement('div');
    header.className = 'settings-block-header';
    card.appendChild(header);

    const info = document.createElement('div');
    info.className = 'settings-block-info';

    const accent = document.createElement('span');
    accent.className = 'settings-block-accent';
    accent.style.setProperty('--accent', block.color || '#38bdf8');
    info.appendChild(accent);

    const textWrap = document.createElement('div');
    textWrap.className = 'settings-block-text';
    const title = document.createElement('h3');
    title.textContent = block.title || block.blockId;
    textWrap.appendChild(title);
    const subtitle = document.createElement('span');
    subtitle.className = 'settings-block-subtitle';
    const lectureCount = block.lectures?.length || 0;
    const metaParts = [block.blockId];
    if (block.weeks) metaParts.push(`${block.weeks} week${block.weeks === 1 ? '' : 's'}`);
    if (lectureCount) metaParts.push(`${lectureCount} lecture${lectureCount === 1 ? '' : 's'}`);
    subtitle.textContent = metaParts.join(' • ');
    textWrap.appendChild(subtitle);
    info.appendChild(textWrap);
    header.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'settings-block-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'settings-icon-btn';
    const collapsedInitially = isLectureListCollapsed(block.blockId);
    toggleBtn.textContent = collapsedInitially ? 'Show lectures' : 'Hide lectures';
    toggleBtn.setAttribute('aria-expanded', String(!collapsedInitially));
    actions.appendChild(toggleBtn);

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'settings-icon-btn';
    upBtn.textContent = 'Move up';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', async () => {
      const other = arr[index - 1];
      const currentOrder = block.order ?? index;
      const otherOrder = other.order ?? (index - 1);
      block.order = otherOrder;
      other.order = currentOrder;
      await upsertBlock(block);
      await upsertBlock(other);
      await renderSettings(root);
    });
    actions.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'settings-icon-btn';
    downBtn.textContent = 'Move down';
    downBtn.disabled = index === arr.length - 1;
    downBtn.addEventListener('click', async () => {
      const other = arr[index + 1];
      const currentOrder = block.order ?? index;
      const otherOrder = other.order ?? (index + 1);
      block.order = otherOrder;
      other.order = currentOrder;
      await upsertBlock(block);
      await upsertBlock(other);
      await renderSettings(root);
    });
    actions.appendChild(downBtn);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'settings-icon-btn';
    editBtn.textContent = 'Edit block';
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'settings-icon-btn destructive';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (await confirmModal('Delete block?')) {
        await deleteBlock(block.blockId);
        await renderSettings(root);
      }
    });
    actions.appendChild(deleteBtn);

    header.appendChild(actions);

    const editForm = document.createElement('form');
    editForm.className = 'settings-inline-form hidden';
    const editGrid = document.createElement('div');
    editGrid.className = 'settings-inline-grid';

    const titleField = createInlineInput('Title', 'text', 'Block title');
    titleField.input.value = block.title || '';
    const weekField = createInlineInput('Weeks', 'number', '0');
    weekField.input.value = block.weeks ?? 0;
    weekField.input.min = '0';
    const colorField = createInlineInput('Accent color', 'color');
    colorField.input.value = block.color || '#1e293b';

    editGrid.append(titleField.element, weekField.element, colorField.element);
    editForm.appendChild(editGrid);

    const editActions = document.createElement('div');
    editActions.className = 'settings-inline-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn primary';
    saveBtn.textContent = 'Save changes';
    editActions.appendChild(saveBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      editForm.classList.add('hidden');
    });
    editActions.appendChild(cancelBtn);
    editForm.appendChild(editActions);

    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        ...block,
        title: titleField.input.value.trim(),
        weeks: Number(weekField.input.value),
        color: colorField.input.value,
      };
      await upsertBlock(payload);
      await renderSettings(root);
    });

    card.appendChild(editForm);

    editBtn.addEventListener('click', () => {
      editForm.classList.toggle('hidden');
    });

    const lectureSection = document.createElement('div');
    lectureSection.className = 'settings-lecture-section';
    if (isLectureListCollapsed(block.blockId)) {
      lectureSection.classList.add('collapsed');
    }
    card.appendChild(lectureSection);

    const lectureList = document.createElement('div');
    lectureList.className = 'settings-lecture-list';

    const sortedLectures = (block.lectures || [])
      .slice()
      .sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || (a.id ?? 0) - (b.id ?? 0));

    if (!sortedLectures.length) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty';
      empty.textContent = 'No lectures yet. Add one to start tagging entries.';
      lectureList.appendChild(empty);
    } else {
      sortedLectures.forEach((lecture) => {
        lectureList.appendChild(renderLectureRow(block, lecture));
      });
    }

    lectureSection.appendChild(lectureList);

    const lectureForm = document.createElement('form');
    lectureForm.className = 'settings-inline-form settings-lecture-form';

    const lectureGrid = document.createElement('div');
    lectureGrid.className = 'settings-inline-grid';

    const lectureId = createInlineInput('Lecture ID', 'number', '1');
    lectureId.input.min = '1';
    const lectureName = createInlineInput('Lecture name', 'text', 'Intro to anatomy');
    const lectureWeek = createInlineInput('Week', 'number', '1');
    lectureWeek.input.min = '1';

    lectureGrid.append(lectureId.element, lectureName.element, lectureWeek.element);
    lectureForm.appendChild(lectureGrid);

    const lectureActions = document.createElement('div');
    lectureActions.className = 'settings-inline-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.className = 'btn primary';
    addBtn.textContent = 'Add lecture';
    lectureActions.appendChild(addBtn);
    lectureForm.appendChild(lectureActions);

    lectureForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        id: Number(lectureId.input.value),
        name: lectureName.input.value.trim(),
        week: Number(lectureWeek.input.value),
      };
      if (!payload.id || !payload.name || !payload.week) return;
      if (block.weeks && (payload.week < 1 || payload.week > block.weeks)) return;
      const updated = {
        ...block,
        lectures: [...(block.lectures || []), payload],
      };
      await upsertBlock(updated);
      await renderSettings(root);
    });

    lectureSection.appendChild(lectureForm);

    toggleBtn.addEventListener('click', () => {
      const collapsed = toggleLectureListCollapse(block.blockId);
      lectureSection.classList.toggle('collapsed', collapsed);
      toggleBtn.textContent = collapsed ? 'Show lectures' : 'Hide lectures';
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    });

    return card;
  }

  function renderLectureRow(block, lecture) {
    const row = document.createElement('div');
    row.className = 'settings-lecture-item';

    const info = document.createElement('div');
    info.className = 'settings-lecture-info';
    info.textContent = `${lecture.id}: ${lecture.name || 'Untitled'} (Week ${lecture.week || '?'})`;
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'settings-lecture-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'settings-icon-btn';
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'settings-icon-btn destructive';
    deleteBtn.textContent = 'Delete';
    actions.appendChild(deleteBtn);

    row.appendChild(actions);

    editBtn.addEventListener('click', () => {
      const form = document.createElement('form');
      form.className = 'settings-inline-form settings-lecture-edit';

      const grid = document.createElement('div');
      grid.className = 'settings-inline-grid';

      const nameField = createInlineInput('Lecture name', 'text', 'Lecture title');
      nameField.input.value = lecture.name || '';
      const weekField = createInlineInput('Week', 'number', '1');
      weekField.input.value = lecture.week ?? '';
      weekField.input.min = '1';

      grid.append(nameField.element, weekField.element);
      form.appendChild(grid);

      const formActions = document.createElement('div');
      formActions.className = 'settings-inline-actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'btn primary';
      saveBtn.textContent = 'Save lecture';
      formActions.appendChild(saveBtn);
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn ghost';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        form.replaceWith(renderLectureRow(block, lecture));
      });
      formActions.appendChild(cancelBtn);
      form.appendChild(formActions);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = nameField.input.value.trim();
        const week = Number(weekField.input.value);
        if (!name || !week || (block.weeks && (week < 1 || week > block.weeks))) return;
        await updateLecture(block.blockId, { id: lecture.id, name, week });
        await renderSettings(root);
      });

      row.replaceWith(form);
    });

    deleteBtn.addEventListener('click', async () => {
      if (await confirmModal('Delete lecture?')) {
        await deleteLecture(block.blockId, lecture.id);
        await renderSettings(root);
      }
    });

    return row;
  }
}
