import { uid, setToggleState } from '../../utils.js';
import { upsertItem, listBlocks } from '../../storage/storage.js';
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
    if (status) status.textContent = '';
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

  const blockWrap = document.createElement('section');
  blockWrap.className = 'editor-tags';
  const blockTitle = document.createElement('div');
  blockTitle.className = 'editor-tags-title';
  blockTitle.textContent = 'Curriculum tags';
  blockWrap.appendChild(blockTitle);

  const blockChipRow = document.createElement('div');
  blockChipRow.className = 'editor-chip-row';
  blockWrap.appendChild(blockChipRow);

  const blockPanels = document.createElement('div');
  blockPanels.className = 'editor-block-panels';
  blockWrap.appendChild(blockPanels);

  function createTagChip(label, variant, active = false) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `tag-chip tag-chip-${variant}`;
    chip.textContent = label;
    setToggleState(chip, active);
    return chip;
  }

  function pruneBlock(blockId) {
    for (const key of Array.from(weekSet)) {
      if (key.startsWith(`${blockId}|`)) weekSet.delete(key);
    }
    for (const key of Array.from(lectSet)) {
      if (key.startsWith(`${blockId}|`)) lectSet.delete(key);
    }
  }

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
      const chip = createTagChip(b.title || b.blockId, 'block', blockSet.has(b.blockId));
      chip.addEventListener('click', () => {
        if (blockSet.has(b.blockId)) {
          blockSet.delete(b.blockId);
          pruneBlock(b.blockId);
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
    if (!blockSet.size) {
      const empty = document.createElement('div');
      empty.className = 'editor-tags-empty';
      empty.textContent = 'Choose a block to pick weeks and lectures.';
      blockPanels.appendChild(empty);
      return;
    }

    Array.from(blockSet).forEach(blockId => {
      const block = blockMap.get(blockId);
      if (!block) return;

      const panel = document.createElement('div');
      panel.className = 'editor-block-panel';

      const header = document.createElement('div');
      header.className = 'editor-block-panel-header';
      const title = document.createElement('h4');
      title.textContent = block.title || blockId;
      header.appendChild(title);
      const meta = document.createElement('span');
      meta.className = 'editor-block-meta';
      const lectureCount = block.lectures?.length || 0;
      const weekTotal = block.weeks || new Set((block.lectures || []).map(l => l.week)).size;
      const metaParts = [];
      if (weekTotal) metaParts.push(`${weekTotal} week${weekTotal === 1 ? '' : 's'}`);
      if (lectureCount) metaParts.push(`${lectureCount} lecture${lectureCount === 1 ? '' : 's'}`);
      meta.textContent = metaParts.join(' • ') || 'No weeks defined yet';
      header.appendChild(meta);
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

      if (!sortedWeeks.length) {
        const noWeeks = document.createElement('div');
        noWeeks.className = 'editor-tags-empty subtle';
        noWeeks.textContent = 'Add weeks or lectures to this block to start tagging.';
        weekList.appendChild(noWeeks);
      } else {
        sortedWeeks.forEach(w => {
          const weekKey = `${blockId}|${w}`;
          const section = document.createElement('div');
          section.className = 'editor-week-section';
          if (weekSet.has(weekKey)) section.classList.add('active');

          const weekChip = createTagChip(`Week ${w}`, 'week', weekSet.has(weekKey));
          weekChip.addEventListener('click', () => {
            const wasActive = weekSet.has(weekKey);
            if (wasActive) {
              weekSet.delete(weekKey);
              section.classList.remove('active');
              lectureWrap.classList.add('collapsed');
              (block.lectures || []).filter(l => l.week === w).forEach(l => {
                const key = `${blockId}|${l.id}`;
                lectSet.delete(key);
                const chip = lectureWrap.querySelector(`[data-lecture='${key}']`);
                if (chip) setToggleState(chip, false);
              });
            } else {
              weekSet.add(weekKey);
              section.classList.add('active');
              lectureWrap.classList.remove('collapsed');
            }
            setToggleState(weekChip, weekSet.has(weekKey));
            markDirty();
          });
          section.appendChild(weekChip);

          const lectureWrap = document.createElement('div');
          lectureWrap.className = 'editor-lecture-list';
          if (!weekSet.has(weekKey)) lectureWrap.classList.add('collapsed');

          const lectures = (block.lectures || []).filter(l => l.week === w);
          if (!lectures.length) {
            const empty = document.createElement('div');
            empty.className = 'editor-tags-empty subtle';
            empty.textContent = 'No lectures linked to this week yet.';
            lectureWrap.appendChild(empty);
          } else {
            lectures.forEach(l => {
              const key = `${blockId}|${l.id}`;
              const lectureChip = createTagChip(l.name || `Lecture ${l.id}`, 'lecture', lectSet.has(key));
              lectureChip.dataset.lecture = key;
              lectureChip.addEventListener('click', () => {
                if (lectSet.has(key)) {
                  lectSet.delete(key);
                  setToggleState(lectureChip, false);
                } else {
                  lectSet.add(key);
                  setToggleState(lectureChip, true);
                  if (!weekSet.has(weekKey)) {
                    weekSet.add(weekKey);
                    section.classList.add('active');
                    setToggleState(weekChip, true);
                    lectureWrap.classList.remove('collapsed');
                  }
                }
                markDirty();
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
    if (!silent) {
      status.textContent = 'Saving…';
    }
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
    try {
      await upsertItem(item);
    } catch (err) {
      console.error(err);
      status.textContent = silent ? 'Autosave failed' : 'Failed to save.';
      throw err;
    }
    existing = item;
    updateTitle();
    isDirty = false;
    if (onSave) onSave();
    if (closeAfter) {
      win.close('saved');
    } else {
      status.textContent = silent ? 'Autosaved' : 'Saved';
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