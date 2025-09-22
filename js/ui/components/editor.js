import { uid, setToggleState } from '../../utils.js';
import { upsertItem } from '../../storage/storage.js';
import { loadBlockCatalog } from '../../storage/block-catalog.js';
import { createFloatingWindow } from './window-manager.js';
import { createRichTextEditor } from './rich-text.js';
import { confirmModal } from './confirm.js';

const fieldMap = {
  disease: [
    ['etiology', 'Etiology'],
    ['pathophys', 'Pathophys'],
    ['clinical', 'Clinical'],
    ['diagnosis', 'Diagnosis'],
    ['treatment', 'Treatment'],
    ['complications', 'Complications'],
    ['mnemonic', 'Mnemonic']
  ],
  drug: [
    ['class', 'Class'],
    ['source', 'Source'],
    ['moa', 'MOA'],
    ['uses', 'Uses'],
    ['sideEffects', 'Side Effects'],
    ['contraindications', 'Contraindications'],
    ['mnemonic', 'Mnemonic']
  ],
  concept: [
    ['type', 'Type'],
    ['definition', 'Definition'],
    ['mechanism', 'Mechanism'],
    ['clinicalRelevance', 'Clinical Relevance'],
    ['example', 'Example'],
    ['mnemonic', 'Mnemonic']
  ]
};

const titleMap = { disease: 'Disease', drug: 'Drug', concept: 'Concept' };

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function openEditor(kind, onSave, existing = null) {
  let isDirty = false;
  let status;
  let statusFadeTimer = null;
  let autoSaveTimer = null;
  const AUTOSAVE_DELAY = 2000;

  const win = createFloatingWindow({
    title: `${existing ? 'Edit' : 'Add'} ${titleMap[kind] || kind}`,
    width: 660,
    onBeforeClose: async (reason) => {
      if (reason === 'saved') return true;
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      if (!isDirty) return true;
      if (reason !== 'close') return true;
      const shouldSave = await confirmModal('Save changes before closing?');
      if (shouldSave) {
        try {
          await persist({ closeAfter: true });
        } catch (err) {
          console.error(err);
        }
        return false;
      }
      return true;
    }
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

  const cancelAutoSave = () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
  };

  const queueAutoSave = () => {
    cancelAutoSave();
    if (!isDirty) return;
    if (!nameInput.value.trim()) return;
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      if (!isDirty) return;
      persist({ silent: true }).catch(err => {
        console.error('Autosave failed', err);
      });
    }, AUTOSAVE_DELAY);
  };

  const markDirty = () => {
    isDirty = true;
    if (status) {
      if (statusFadeTimer) {
        clearTimeout(statusFadeTimer);
        statusFadeTimer = null;
      }
      status.textContent = '';
      status.classList.remove('editor-status-muted');
    }
    queueAutoSave();
  };

  nameInput.addEventListener('input', markDirty);

  const fieldInputs = {};
  fieldMap[kind].forEach(([field, label]) => {
    const fieldWrap = document.createElement('div');
    fieldWrap.className = 'editor-field';

    const labelEl = document.createElement('label');
    labelEl.className = 'editor-field-label';
    labelEl.textContent = label;
    const labelId = `field-${field}-${uid()}`;
    labelEl.id = labelId;
    fieldWrap.appendChild(labelEl);

    const editor = createRichTextEditor({
      value: existing ? existing[field] || '' : '',
      onChange: markDirty,
      ariaLabelledBy: labelId
    });
    const inp = editor.element;
    fieldInputs[field] = editor;
    fieldWrap.appendChild(inp);
    form.appendChild(fieldWrap);
  });

  const extrasWrap = document.createElement('section');
  extrasWrap.className = 'editor-extras';
  const extrasHeader = document.createElement('div');
  extrasHeader.className = 'editor-extras-header';
  const extrasTitle = document.createElement('h3');
  extrasTitle.textContent = 'Custom Sections';
  extrasHeader.appendChild(extrasTitle);
  const addExtraBtn = document.createElement('button');
  addExtraBtn.type = 'button';
  addExtraBtn.className = 'btn subtle';
  addExtraBtn.textContent = 'Add Section';
  extrasHeader.appendChild(addExtraBtn);
  extrasWrap.appendChild(extrasHeader);

  const extrasList = document.createElement('div');
  extrasList.className = 'editor-extras-list';
  extrasWrap.appendChild(extrasList);
  form.appendChild(extrasWrap);

  const extraControls = new Map();

  function addExtra(extra = null) {
    const data = extra || {};
    const id = data.id || uid();
    const row = document.createElement('div');
    row.className = 'editor-extra';
    row.dataset.id = id;

    const titleRow = document.createElement('div');
    titleRow.className = 'editor-extra-title-row';
    const titleInput = document.createElement('input');
    titleInput.className = 'input editor-extra-title';
    titleInput.placeholder = 'Section title';
    titleInput.value = data.title || '';
    titleRow.appendChild(titleInput);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn ghost';
    removeBtn.title = 'Remove section';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      extraControls.delete(id);
      row.remove();
      markDirty();
    });
    titleRow.appendChild(removeBtn);
    row.appendChild(titleRow);

    const editor = createRichTextEditor({ value: data.body || '', onChange: markDirty });
    row.appendChild(editor.element);
    extrasList.appendChild(row);
    extraControls.set(id, { id, titleInput, editor });

    titleInput.addEventListener('input', markDirty);
    row.addEventListener('input', markDirty);
    if (!extra) markDirty();
  }

  addExtraBtn.addEventListener('click', () => addExtra());

  const legacyExtras = (() => {
    if (existing?.extras && existing.extras.length) return existing.extras;
    if (existing?.facts && existing.facts.length) {
      return [{
        id: uid(),
        title: 'Highlights',
        body: existing.facts.map(f => `<p>${escapeHtml(f)}</p>`).join('')
      }];
    }
    return [];
  })();

  legacyExtras.forEach(extra => addExtra(extra));

  const colorLabel = document.createElement('label');
  colorLabel.className = 'editor-field';
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'input';
  colorInput.value = existing?.color || '#ffffff';
  colorLabel.appendChild(colorInput);
  form.appendChild(colorLabel);
  colorInput.addEventListener('input', markDirty);

  const catalog = await loadBlockCatalog({ force: true });
  const blocks = (catalog.blocks || []).map(block => ({
    ...block,
    lectures: (catalog.lectureLists?.[block.blockId] || []).map(lecture => ({ ...lecture }))
  }));
  const blockMap = new Map(blocks.map(b => [b.blockId, b]));
  const blockSet = new Set(existing?.blocks || []);
  const manualWeeks = new Set(
    Array.isArray(existing?.weeks)
      ? existing.weeks.filter(value => Number.isFinite(Number(value))).map(value => Number(value))
      : []
  );
  const lectSet = new Set();
  existing?.lectures?.forEach(l => {
    if (l.blockId != null) blockSet.add(l.blockId);
    if (l.blockId != null && l.id != null) {
      lectSet.add(`${l.blockId}|${l.id}`);
    }
  });

  const blockWrap = document.createElement('section');
  blockWrap.className = 'editor-tags';
  const blockTitle = document.createElement('div');
  blockTitle.className = 'editor-tags-title';
  blockTitle.textContent = 'Curriculum tags';
  blockWrap.appendChild(blockTitle);

  const blockDescription = document.createElement('p');
  blockDescription.className = 'editor-tags-description';
  blockDescription.textContent = 'Pick the lectures that relate to this entry. Block and week tags update automatically as you choose lectures.';
  blockWrap.appendChild(blockDescription);

  const blockChipRow = document.createElement('div');
  blockChipRow.className = 'editor-chip-row';
  blockWrap.appendChild(blockChipRow);

  const manualWeeksBox = document.createElement('div');
  manualWeeksBox.className = 'editor-manual-weeks';
  const manualWeeksHeader = document.createElement('div');
  manualWeeksHeader.className = 'editor-manual-weeks-header';
  const manualWeeksTitle = document.createElement('span');
  manualWeeksTitle.textContent = 'Additional week tags';
  manualWeeksHeader.appendChild(manualWeeksTitle);
  const addWeekBtn = document.createElement('button');
  addWeekBtn.type = 'button';
  addWeekBtn.className = 'btn subtle';
  addWeekBtn.textContent = 'Add week tag';
  manualWeeksHeader.appendChild(addWeekBtn);
  manualWeeksBox.appendChild(manualWeeksHeader);
  const manualWeekList = document.createElement('div');
  manualWeekList.className = 'editor-manual-weeks-list';
  manualWeeksBox.appendChild(manualWeekList);
  blockWrap.appendChild(manualWeeksBox);

  const blockPanels = document.createElement('div');
  blockPanels.className = 'editor-block-panels';
  blockWrap.appendChild(blockPanels);

  const UNSCHEDULED_KEY = '__unscheduled';

  function createTagChip(label, variant, active = false) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `tag-chip tag-chip-${variant}`;
    chip.textContent = label;
    setToggleState(chip, active);
    return chip;
  }

  function blockHasSelectedLectures(blockId) {
    const block = blockMap.get(blockId);
    if (!block?.lectures) return false;
    return block.lectures.some(l => lectSet.has(`${blockId}|${l.id}`));
  }

  function collectSelectedWeekKeys() {
    const selected = new Set();
    lectSet.forEach(key => {
      const [blockId, lectureId] = key.split('|');
      const lecId = Number(lectureId);
      if (!blockId || !Number.isFinite(lecId)) return;
      const block = blockMap.get(blockId);
      const lecture = block?.lectures?.find(le => le.id === lecId);
      if (!lecture) return;
      const weekValue = lecture.week == null || lecture.week === '' ? UNSCHEDULED_KEY : lecture.week;
      selected.add(`${blockId}|${weekValue}`);
    });
    return selected;
  }

  function collectWeekNumbers() {
    const numbers = new Set(manualWeeks);
    lectSet.forEach(key => {
      const [blockId, lectureId] = key.split('|');
      const lecId = Number(lectureId);
      if (!blockId || !Number.isFinite(lecId)) return;
      const block = blockMap.get(blockId);
      const lecture = block?.lectures?.find(le => le.id === lecId);
      if (!lecture) return;
      const weekValue = Number(lecture.week);
      if (Number.isFinite(weekValue)) numbers.add(weekValue);
    });
    return numbers;
  }

  function renderManualWeekTags() {
    manualWeekList.innerHTML = '';
    if (!manualWeeks.size) {
      const empty = document.createElement('span');
      empty.className = 'editor-manual-weeks-empty';
      empty.textContent = 'No extra week tags yet.';
      manualWeekList.appendChild(empty);
      manualWeeksBox.classList.add('empty');
    } else {
      manualWeeksBox.classList.remove('empty');
      Array.from(manualWeeks)
        .sort((a, b) => a - b)
        .forEach(weekNum => {
          const chip = document.createElement('div');
          chip.className = 'editor-manual-week-chip';
          const label = document.createElement('span');
          label.textContent = `Week ${weekNum}`;
          chip.appendChild(label);
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'icon-btn ghost';
          removeBtn.title = 'Remove week tag';
          removeBtn.setAttribute('aria-label', `Remove week ${weekNum}`);
          removeBtn.textContent = '✕';
          removeBtn.addEventListener('click', () => {
            manualWeeks.delete(weekNum);
            markDirty();
            renderManualWeekTags();
            renderBlockPanels();
          });
          chip.appendChild(removeBtn);
          manualWeekList.appendChild(chip);
        });
    }
  }

  addWeekBtn.addEventListener('click', () => {
    const value = prompt('Enter a week number to tag (1-52)');
    if (!value) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(1, Math.round(parsed));
    if (!manualWeeks.has(clamped)) {
      manualWeeks.add(clamped);
      markDirty();
    }
    renderManualWeekTags();
    renderBlockPanels();
  });

  function renderBlockChips() {
    blockChipRow.innerHTML = '';
    if (!blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'editor-tags-empty';
      empty.textContent = 'No curriculum blocks have been created yet.';
      blockChipRow.appendChild(empty);
      return;
    }
    blocks.forEach(b => {
      const isSelected = blockSet.has(b.blockId);
      const hasLectures = blockHasSelectedLectures(b.blockId);
      const chip = createTagChip(b.title || b.blockId, 'block', isSelected || hasLectures);
      chip.dataset.manual = isSelected ? 'true' : 'false';
      chip.addEventListener('click', () => {
        if (blockSet.has(b.blockId)) {
          blockSet.delete(b.blockId);
        } else {
          blockSet.add(b.blockId);
        }
        markDirty();
        renderBlockChips();
        renderBlockPanels();
      });
      blockChipRow.appendChild(chip);
    });
  }

  function renderBlockPanels() {
    blockPanels.innerHTML = '';
    if (!blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'editor-tags-empty';
      empty.textContent = 'No curriculum blocks have been created yet.';
      blockPanels.appendChild(empty);
      return;
    }

    const selectedWeekKeys = collectSelectedWeekKeys();
    blocks.forEach(block => {
      if (!block) return;
      const blockId = block.blockId;
      const panel = document.createElement('section');
      panel.className = 'editor-block-panel';
      if (blockSet.has(blockId) || blockHasSelectedLectures(blockId)) {
        panel.classList.add('active');
      }

      const header = document.createElement('div');
      header.className = 'editor-block-panel-header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'editor-block-panel-title';

      const title = document.createElement('h4');
      title.textContent = block.title || blockId;
      titleWrap.appendChild(title);

      const meta = document.createElement('span');
      meta.className = 'editor-block-meta';
      const lectureCount = block.lectures?.length || 0;
      const weekTotal = block.weeks || new Set((block.lectures || []).map(l => l.week)).size;
      const metaParts = [];
      if (weekTotal) metaParts.push(`${weekTotal} week${weekTotal === 1 ? '' : 's'}`);
      if (lectureCount) metaParts.push(`${lectureCount} lecture${lectureCount === 1 ? '' : 's'}`);
      meta.textContent = metaParts.join(' • ') || 'No weeks defined yet';
      titleWrap.appendChild(meta);

      header.appendChild(titleWrap);

      const selectedCount = (block.lectures || []).reduce((count, l) => (
        lectSet.has(`${blockId}|${l.id}`) ? count + 1 : count
      ), 0);
      if (selectedCount) {
        const badge = document.createElement('span');
        badge.className = 'editor-block-selected-count';
        badge.textContent = `${selectedCount} selected`;
        header.appendChild(badge);
      }

      panel.appendChild(header);

      const weekList = document.createElement('div');
      weekList.className = 'editor-week-list';

      const weekNumbers = new Set();
      if (block.weeks) {
        for (let i = 1; i <= block.weeks; i++) weekNumbers.add(i);
      }
      (block.lectures || []).forEach(l => {
        if (typeof l.week === 'number') weekNumbers.add(l.week);
      });
      const sortedWeeks = Array.from(weekNumbers).sort((a, b) => a - b);
      const unscheduledLectures = (block.lectures || []).filter(l => l.week == null || l.week === '');
      const weekGroups = sortedWeeks.map(weekNumber => ({
        key: `${blockId}|${weekNumber}`,
        label: `Week ${weekNumber}`,
        lectures: (block.lectures || []).filter(l => l.week === weekNumber),
        weekNumber
      }));
      if (unscheduledLectures.length) {
        weekGroups.push({
          key: `${blockId}|${UNSCHEDULED_KEY}`,
          label: 'Unscheduled',
          lectures: unscheduledLectures,
          unscheduled: true
        });
      }

      if (!weekGroups.length) {
        const noWeeks = document.createElement('div');
        noWeeks.className = 'editor-tags-empty subtle';
        noWeeks.textContent = 'Add weeks or lectures to this block to start tagging.';
        weekList.appendChild(noWeeks);
      } else {
        weekGroups.forEach(group => {
          const { key: weekKey, label, lectures, weekNumber, unscheduled } = group;
          const section = document.createElement('div');
          section.className = 'editor-week-section';

          const hasLectureSelection = (lectures || []).some(l => lectSet.has(`${blockId}|${l.id}`));
          const isManualWeek = Number.isFinite(weekNumber) && manualWeeks.has(Number(weekNumber));
          if (hasLectureSelection || isManualWeek) {
            section.classList.add('active');
          }
          if (selectedWeekKeys.has(weekKey)) {
            section.classList.add('active');
          }

          const weekHeader = document.createElement('div');
          weekHeader.className = 'editor-week-header';
          const weekLabel = document.createElement('span');
          weekLabel.textContent = label;
          weekHeader.appendChild(weekLabel);

          const countLabel = document.createElement('span');
          countLabel.className = 'editor-week-count';
          const total = lectures?.length || 0;
          if (total) {
            countLabel.textContent = `${total} lecture${total === 1 ? '' : 's'}`;
          } else if (unscheduled) {
            countLabel.textContent = 'No unscheduled lectures yet';
          } else {
            countLabel.textContent = 'No lectures yet';
          }
          weekHeader.appendChild(countLabel);

          if (Number.isFinite(weekNumber) && manualWeeks.has(Number(weekNumber))) {
            const badge = document.createElement('span');
            badge.className = 'editor-week-manual';
            badge.textContent = 'Tagged';
            weekHeader.appendChild(badge);
          }

          section.appendChild(weekHeader);

          const lectureWrap = document.createElement('div');
          lectureWrap.className = 'editor-lecture-list';

          if (!lectures.length) {
            const empty = document.createElement('div');
            empty.className = 'editor-tags-empty subtle';
            empty.textContent = unscheduled
              ? 'No unscheduled lectures yet.'
              : 'No lectures linked to this week yet.';
            lectureWrap.appendChild(empty);
          } else {
            lectures.forEach(l => {
              const key = `${blockId}|${l.id}`;
              const lectureChip = createTagChip(l.name || `Lecture ${l.id}`, 'lecture', lectSet.has(key));
              lectureChip.dataset.lecture = key;
              lectureChip.addEventListener('click', () => {
                if (lectSet.has(key)) {
                  lectSet.delete(key);
                } else {
                  lectSet.add(key);
                }
                markDirty();
                renderBlockChips();
                renderBlockPanels();
              });
              lectureWrap.appendChild(lectureChip);
            });
          }

          section.appendChild(lectureWrap);
          weekList.appendChild(section);
        });
      }

      panel.appendChild(weekList);
      blockPanels.appendChild(panel);
    });
  }

  renderManualWeekTags();
  renderBlockChips();
  renderBlockPanels();

  form.appendChild(blockWrap);

  const actionBar = document.createElement('div');
  actionBar.className = 'editor-actions';

  status = document.createElement('span');
  status.className = 'editor-status';

  async function persist(options = {}) {
    const opts = typeof options === 'boolean' ? { closeAfter: options } : options;
    const { closeAfter = false, silent = false } = opts;
    cancelAutoSave();
    const titleKey = kind === 'concept' ? 'concept' : 'name';
    const trimmed = nameInput.value.trim();
    if (!trimmed) {
      if (!silent) {
        status.textContent = 'Name is required.';
      }
      return false;
    }
    if (!silent && status) {
      status.classList.remove('editor-status-muted');
      status.textContent = 'Saving…';
    }
    const wasNew = !existing;
    const item = existing || { id: uid(), kind };
    item[titleKey] = trimmed;
    fieldMap[kind].forEach(([field]) => {
      const control = fieldInputs[field];
      const v = control?.getValue ? control.getValue() : '';
      item[field] = v;
    });
    item.extras = Array.from(extraControls.values()).map(({ id, titleInput, editor }) => ({
      id,
      title: titleInput.value.trim(),
      body: editor.getValue()
    })).filter(ex => ex.title || ex.body);
    item.facts = [];
    const blockTags = new Set(blockSet);
    lectSet.forEach(key => {
      const [blockId] = key.split('|');
      if (blockId) blockTags.add(blockId);
    });
    item.blocks = Array.from(blockTags);

    const weekNums = collectWeekNumbers();
    item.weeks = Array.from(weekNums).sort((a, b) => a - b);
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
    try {
      await upsertItem(item);
    } catch (err) {
      console.error(err);
      if (status) {
        if (statusFadeTimer) {
          clearTimeout(statusFadeTimer);
          statusFadeTimer = null;
        }
        status.classList.remove('editor-status-muted');
        status.textContent = silent ? 'Autosave failed' : 'Failed to save.';
      }
      throw err;
    }
    existing = item;
    updateTitle();
    isDirty = false;
    const shouldNotify = onSave && (!silent || wasNew);
    if (shouldNotify) onSave();
    if (closeAfter) {
      win.close('saved');
    } else {
      if (statusFadeTimer) {
        clearTimeout(statusFadeTimer);
        statusFadeTimer = null;
      }
      if (status) {
        if (silent) {
          status.textContent = 'Autosaved';
          status.classList.add('editor-status-muted');
          statusFadeTimer = setTimeout(() => {
            status.classList.remove('editor-status-muted');
            statusFadeTimer = null;
          }, 1800);
        } else {
          status.textContent = 'Saved';
          status.classList.remove('editor-status-muted');
        }
      }
    }
    return true;
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    persist({ closeAfter: true }).catch(() => {});
  });

  actionBar.appendChild(saveBtn);
  actionBar.appendChild(status);
  form.appendChild(actionBar);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    persist({ closeAfter: true }).catch(() => {});
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