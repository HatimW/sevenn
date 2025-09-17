import { state, setBlockMode } from '../../state.js';
import { sectionDefsForKind } from './sections.js';

export function renderBlockMode(root) {
  const shell = document.createElement('section');
  shell.className = 'block-mode-shell';
  root.appendChild(shell);
  drawBlockMode(shell);
}

function drawBlockMode(shell) {
  shell.innerHTML = '';
  const redraw = () => drawBlockMode(shell);
  const items = state.cohort || [];

  if (!items.length) {
    shell.appendChild(messageCard('Build a study set to unlock Blocks mode. Use the filters above to assemble a cohort.'));
    return;
  }

  const sections = collectSections(items);
  if (!sections.length) {
    shell.appendChild(messageCard('The selected cards do not have structured sections yet. Add cards with rich content to practice in Blocks mode.'));
    return;
  }

  let activeKey = state.blockMode.section;
  if (!activeKey || !sections.some(sec => sec.key === activeKey)) {
    activeKey = sections[0].key;
    if (activeKey !== state.blockMode.section) {
      setBlockMode({ section: activeKey });
    }
  }
  const sectionData = sections.find(sec => sec.key === activeKey) || sections[0];

  const entryMap = new Map();
  sectionData.items.forEach(info => {
    entryMap.set(entryIdFor(info.itemId, sectionData.key), info);
  });

  const validAssignments = sanitizeAssignments(sectionData.key, entryMap);
  const assignedSet = new Set(Object.values(validAssignments));
  const reveal = !!(state.blockMode.reveal && state.blockMode.reveal[sectionData.key]);

  const bankEntries = Array.from(entryMap.entries())
    .filter(([id]) => !assignedSet.has(id))
    .map(([entryId, info]) => ({ entryId, value: info.value, itemId: info.itemId }));

  const orderedBank = orderEntries(sectionData.key, bankEntries);

  const results = sectionData.items.map(info => {
    const entryId = entryIdFor(info.itemId, sectionData.key);
    const assignedId = validAssignments[info.itemId];
    const assignedInfo = assignedId ? entryMap.get(assignedId) : null;
    const assignedValue = assignedInfo ? assignedInfo.value : '';
    const correct = assignedValue && normalized(assignedValue) === normalized(info.value);
    return { ...info, entryId, assignedId, assignedValue, correct };
  });

  const filledCount = results.filter(r => r.assignedValue).length;
  const correctCount = results.filter(r => r.correct).length;

  shell.appendChild(renderHeader({
    sections,
    activeKey: sectionData.key,
    filledCount,
    correctCount,
    total: results.length,
    bankRemaining: orderedBank.length,
    reveal,
    onSectionChange: key => {
      const nextReveal = { ...(state.blockMode.reveal || {}) };
      delete nextReveal[key];
      setBlockMode({ section: key, reveal: nextReveal });
      redraw();
    },
    onCheck: () => {
      const nextReveal = { ...(state.blockMode.reveal || {}) };
      nextReveal[sectionData.key] = true;
      setBlockMode({ reveal: nextReveal });
      redraw();
    },
    onReset: () => {
      const assignments = { ...(state.blockMode.assignments || {}) };
      assignments[sectionData.key] = {};
      const revealMap = { ...(state.blockMode.reveal || {}) };
      delete revealMap[sectionData.key];
      setBlockMode({ assignments, reveal: revealMap });
      redraw();
    }
  }));

  const board = document.createElement('div');
  board.className = 'block-mode-board';
  results.forEach(result => {
    board.appendChild(renderBlockCard({
      sectionLabel: sectionData.label,
      reveal,
      result,
      onRemove: () => {
        const assignments = { ...(state.blockMode.assignments || {}) };
        const nextSectionAssignments = { ...(assignments[sectionData.key] || {}) };
        delete nextSectionAssignments[result.itemId];
        assignments[sectionData.key] = nextSectionAssignments;
        const revealMap = { ...(state.blockMode.reveal || {}) };
        delete revealMap[sectionData.key];
        setBlockMode({ assignments, reveal: revealMap });
        redraw();
      },
      onDrop: entryId => {
        const info = entryMap.get(entryId);
        if (!info) return;
        const assignments = { ...(state.blockMode.assignments || {}) };
        const nextSectionAssignments = { ...(assignments[sectionData.key] || {}) };
        for (const [itemId, assigned] of Object.entries(nextSectionAssignments)) {
          if (assigned === entryId) delete nextSectionAssignments[itemId];
        }
        nextSectionAssignments[result.itemId] = entryId;
        assignments[sectionData.key] = nextSectionAssignments;
        const revealMap = { ...(state.blockMode.reveal || {}) };
        delete revealMap[sectionData.key];
        setBlockMode({ assignments, reveal: revealMap });
        redraw();
      }
    }));
  });
  shell.appendChild(board);

  shell.appendChild(renderBank({
    label: sectionData.label,
    entries: orderedBank
  }));
}

function renderHeader({ sections, activeKey, filledCount, correctCount, total, bankRemaining, reveal, onSectionChange, onCheck, onReset }) {
  const card = document.createElement('div');
  card.className = 'card block-mode-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'block-mode-header-row';
  const title = document.createElement('h2');
  title.textContent = 'Blocks Mode';
  titleRow.appendChild(title);

  const selectWrap = document.createElement('label');
  selectWrap.className = 'block-mode-select';
  const selectLabel = document.createElement('span');
  selectLabel.textContent = 'Section';
  selectWrap.appendChild(selectLabel);
  const select = document.createElement('select');
  sections.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec.key;
    opt.textContent = sec.label;
    if (sec.key === activeKey) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => onSectionChange(select.value));
  selectWrap.appendChild(select);
  titleRow.appendChild(selectWrap);
  card.appendChild(titleRow);

  const meta = document.createElement('div');
  meta.className = 'block-mode-meta-row';
  const placed = document.createElement('span');
  placed.textContent = `Placed: ${filledCount}/${total}`;
  meta.appendChild(placed);
  if (reveal) {
    const score = document.createElement('span');
    score.textContent = `Correct: ${correctCount}/${total}`;
    meta.appendChild(score);
  }
  const bankInfo = document.createElement('span');
  bankInfo.textContent = `In bank: ${bankRemaining}`;
  meta.appendChild(bankInfo);
  card.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'block-mode-actions';
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'btn';
  checkBtn.textContent = 'Check answers';
  checkBtn.disabled = !filledCount;
  checkBtn.addEventListener('click', onCheck);
  actions.appendChild(checkBtn);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn secondary';
  resetBtn.textContent = 'Reset section';
  resetBtn.disabled = !filledCount;
  resetBtn.addEventListener('click', onReset);
  actions.appendChild(resetBtn);
  card.appendChild(actions);

  return card;
}

function renderBlockCard({ sectionLabel, reveal, result, onRemove, onDrop }) {
  const card = document.createElement('div');
  card.className = 'card block-mode-card';

  const title = document.createElement('div');
  title.className = 'block-mode-card-title';
  title.textContent = itemTitle(result.item);
  card.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'block-mode-card-subtitle';
  subtitle.textContent = formatItemContext(result.item);
  if (subtitle.textContent) card.appendChild(subtitle);

  const slot = document.createElement('div');
  slot.className = 'block-mode-slot';
  slot.dataset.itemId = result.itemId;
  slot.dataset.section = sectionLabel;

  slot.addEventListener('dragover', event => {
    event.preventDefault();
    slot.classList.add('drag-over');
  });
  slot.addEventListener('dragenter', event => {
    event.preventDefault();
    slot.classList.add('drag-over');
  });
  slot.addEventListener('dragleave', () => {
    slot.classList.remove('drag-over');
  });
  slot.addEventListener('drop', event => {
    event.preventDefault();
    slot.classList.remove('drag-over');
    const entryId = event.dataTransfer.getData('text/plain');
    if (entryId) onDrop(entryId);
  });

  if (result.assignedValue) {
    slot.classList.add('filled');
    const chip = document.createElement('div');
    chip.className = 'block-chip assigned';
    const text = document.createElement('div');
    text.className = 'block-chip-text';
    text.textContent = result.assignedValue;
    chip.appendChild(text);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chip-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', onRemove);
    chip.appendChild(removeBtn);
    slot.appendChild(chip);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'block-slot-placeholder';
    placeholder.textContent = `Drop ${sectionLabel.toLowerCase()} here`;
    slot.appendChild(placeholder);
  }

  card.appendChild(slot);

  if (reveal) {
    slot.classList.add(result.correct ? 'correct' : (result.assignedValue ? 'incorrect' : 'missing'));
    if (!result.correct) {
      const answer = document.createElement('div');
      answer.className = 'block-mode-answer';
      const label = document.createElement('span');
      label.textContent = 'Answer';
      const body = document.createElement('div');
      body.textContent = result.value;
      answer.appendChild(label);
      answer.appendChild(body);
      card.appendChild(answer);
    }
  }
  return card;
}

function renderBank({ label, entries, onPick }) {
  const card = document.createElement('div');
  card.className = 'card block-mode-bank';
  const title = document.createElement('div');
  title.className = 'block-mode-bank-title';
  title.textContent = `${label} bank`;
  card.appendChild(title);

  const list = document.createElement('div');
  list.className = 'block-mode-bank-items';
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'block-mode-bank-empty';
    empty.textContent = 'All matches placed!';
    list.appendChild(empty);
  } else {
    entries.forEach(entry => {
      const chip = document.createElement('div');
      chip.className = 'block-chip';
      chip.textContent = entry.value;
      chip.draggable = true;
      chip.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', entry.entryId);
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
      if (onPick) {
        chip.addEventListener('click', () => onPick(entry.entryId));
      }
      list.appendChild(chip);
    });
  }
  card.appendChild(list);
  return card;
}

function collectSections(items) {
  const map = new Map();
  items.forEach((item, index) => {
    const itemId = resolveItemId(item, index);
    sectionDefsForKind(item.kind).forEach(def => {
      const value = sectionValue(item[def.key]);
      if (!value) return;
      let section = map.get(def.key);
      if (!section) {
        section = { key: def.key, label: def.label, items: [] };
        map.set(def.key, section);
      }
      section.items.push({ item, itemId, value });
    });
  });
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function sanitizeAssignments(sectionKey, entryMap) {
  const current = (state.blockMode.assignments && state.blockMode.assignments[sectionKey]) || {};
  let changed = false;
  const valid = {};
  for (const [itemId, entryId] of Object.entries(current)) {
    if (entryMap.has(entryId)) {
      valid[itemId] = entryId;
    } else {
      changed = true;
    }
  }
  if (changed) {
    const assignments = { ...(state.blockMode.assignments || {}) };
    assignments[sectionKey] = valid;
    setBlockMode({ assignments });
  }
  return valid;
}

function orderEntries(sectionKey, entries) {
  const ids = entries.map(entry => entry.entryId);
  const existing = (state.blockMode.order && state.blockMode.order[sectionKey]) || [];
  const filtered = existing.filter(id => ids.includes(id));
  const missing = ids.filter(id => !filtered.includes(id));
  const next = filtered.concat(missing);
  if (!arraysEqual(existing, next)) {
    const order = { ...(state.blockMode.order || {}) };
    order[sectionKey] = next;
    setBlockMode({ order });
  }
  const byId = new Map(entries.map(entry => [entry.entryId, entry]));
  return next.map(id => byId.get(id)).filter(Boolean);
}

function entryIdFor(itemId, sectionKey) {
  return `${itemId}::${sectionKey}`;
}

function sectionValue(raw) {
  if (raw == null) return '';
  const text = typeof raw === 'string' ? raw : String(raw);
  return text.trim();
}

function normalized(text) {
  return sectionValue(text).replace(/\s+/g, ' ').toLowerCase();
}

function resolveItemId(item, index) {
  return item.id || item.uid || item.slug || item.key || `${item.kind || 'item'}-${index}`;
}

function itemTitle(item) {
  return item.name || item.concept || item.title || 'Card';
}

function formatItemContext(item) {
  const parts = [];
  if (item.kind) parts.push(capitalize(item.kind));
  if (Array.isArray(item.lectures) && item.lectures.length) {
    const lectureNames = item.lectures.map(l => l.name).filter(Boolean);
    if (lectureNames.length) parts.push(lectureNames.join(', '));
  }
  return parts.join(' • ');
}

function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

function messageCard(text) {
  const card = document.createElement('div');
  card.className = 'card block-mode-empty';
  card.textContent = text;
  return card;
}
