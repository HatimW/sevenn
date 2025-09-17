import { listBlocks, upsertItem, deleteItem } from '../../storage/storage.js';
import { state, setEntryLayout } from '../../state.js';
import { chipList } from './chips.js';
import { openEditor } from './editor.js';
import { confirmModal } from './confirm.js';
import { openLinker } from './linker.js';

const kindColors = { disease: 'var(--pink)', drug: 'var(--blue)', concept: 'var(--green)' };
const fieldDefs = {
  disease: [
    ['etiology','Etiology','🧬'],
    ['pathophys','Pathophys','⚙️'],
    ['clinical','Clinical','🩺'],
    ['diagnosis','Diagnosis','🔎'],
    ['treatment','Treatment','💊'],
    ['complications','Complications','⚠️'],
    ['mnemonic','Mnemonic','🧠']
  ],
  drug: [
    ['class','Class','🏷️'],
    ['source','Source','🌱'],
    ['moa','MOA','⚙️'],
    ['uses','Uses','💊'],
    ['sideEffects','Side Effects','⚠️'],
    ['contraindications','Contraindications','🚫'],
    ['mnemonic','Mnemonic','🧠']
  ],
  concept: [
    ['type','Type','🏷️'],
    ['definition','Definition','📖'],
    ['mechanism','Mechanism','⚙️'],
    ['clinicalRelevance','Clinical Relevance','🩺'],
    ['example','Example','📝'],
    ['mnemonic','Mnemonic','🧠']
  ]
};

const expanded = new Set();
const collapsedBlocks = new Set();
const collapsedWeeks = new Set();

export function createItemCard(item, onChange){
  const card = document.createElement('div');
  card.className = `item-card card--${item.kind}`;
  const color = item.color || kindColors[item.kind] || 'var(--gray)';
  card.style.borderTop = `3px solid ${color}`;

  const header = document.createElement('div');
  header.className = 'card-header';

  const mainBtn = document.createElement('button');
  mainBtn.className = 'card-title-btn';
  mainBtn.textContent = item.name || item.concept || 'Untitled';
  mainBtn.setAttribute('aria-expanded', expanded.has(item.id));
  mainBtn.addEventListener('click', () => {
    if (expanded.has(item.id)) expanded.delete(item.id); else expanded.add(item.id);
    card.classList.toggle('expanded');
    mainBtn.setAttribute('aria-expanded', expanded.has(item.id));
  });
  header.appendChild(mainBtn);

  const settings = document.createElement('div');
  settings.className = 'card-settings';
  const menu = document.createElement('div');
  menu.className = 'card-menu hidden';
  const gear = document.createElement('button');
  gear.className = 'icon-btn';
  gear.textContent = '⚙️';
  gear.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
  settings.append(menu, gear);
  header.appendChild(settings);

  const fav = document.createElement('button');
  fav.className = 'icon-btn';
  fav.textContent = item.favorite ? '★' : '☆';
  fav.title = 'Toggle Favorite';
  fav.setAttribute('aria-label','Toggle Favorite');
  fav.addEventListener('click', async e => {
    e.stopPropagation();
    item.favorite = !item.favorite;
    await upsertItem(item);
    fav.textContent = item.favorite ? '★' : '☆';
    onChange && onChange();
  });
  menu.appendChild(fav);

  const link = document.createElement('button');
  link.className = 'icon-btn';
  link.textContent = '🪢';
  link.title = 'Links';
  link.setAttribute('aria-label','Manage links');
  link.addEventListener('click', e => { e.stopPropagation(); openLinker(item, onChange); });
  menu.appendChild(link);

  const edit = document.createElement('button');
  edit.className = 'icon-btn';
  edit.textContent = '✏️';
  edit.title = 'Edit';
  edit.setAttribute('aria-label','Edit');
  edit.addEventListener('click', e => { e.stopPropagation(); openEditor(item.kind, onChange, item); });
  menu.appendChild(edit);

  const copy = document.createElement('button');
  copy.className = 'icon-btn';
  copy.textContent = '📋';
  copy.title = 'Copy Title';
  copy.setAttribute('aria-label','Copy Title');
  copy.addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard && navigator.clipboard.writeText(item.name || item.concept || '');
  });
  menu.appendChild(copy);

  const del = document.createElement('button');
  del.className = 'icon-btn';
  del.textContent = '🗑️';
  del.title = 'Delete';
  del.setAttribute('aria-label','Delete');
  del.addEventListener('click', async e => {
    e.stopPropagation();
    if (await confirmModal('Delete this item?')) {
      await deleteItem(item.id);
      onChange && onChange();
    }
  });
  menu.appendChild(del);

  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'card-body';
  card.appendChild(body);

  function renderBody(){
    body.innerHTML = '';
    const identifiers = document.createElement('div');
    identifiers.className = 'identifiers';
    (item.blocks || []).forEach(b => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = b;
      identifiers.appendChild(chip);
    });
    (item.weeks || []).forEach(w => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = 'W' + w;
      identifiers.appendChild(chip);
    });
    if (item.lectures) {
      item.lectures.forEach(l => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = '📚 ' + (l.name || l.id);
        identifiers.appendChild(chip);
      });
    }
    body.appendChild(identifiers);

    const defs = fieldDefs[item.kind] || [];
    defs.forEach(([f,label,icon]) => {
      if (!item[f]) return;
      const sec = document.createElement('div');
      sec.className = 'section';
      sec.style.borderLeftColor = color;
      const tl = document.createElement('div');
      tl.className = 'section-title';
      tl.textContent = label;
      if (icon) tl.prepend(icon + ' ');
      sec.appendChild(tl);
      const txt = document.createElement('div');
      txt.className = 'section-content';
      txt.innerHTML = item[f];
      txt.style.whiteSpace = 'normal';
      sec.appendChild(txt);
      body.appendChild(sec);
    });
    if (item.links && item.links.length) {
      const lc = document.createElement('span');
      lc.className = 'chip link-chip';
      lc.textContent = `🪢 ${item.links.length}`;
      body.appendChild(lc);
    }
    if (item.facts && item.facts.length) {
      const facts = chipList(item.facts);
      facts.classList.add('facts');
      body.appendChild(facts);
    }
  }

  renderBody();
  if (expanded.has(item.id)) card.classList.add('expanded');

  function fit(){
    const headerH = header.offsetHeight;
    const maxH = card.clientHeight - headerH - 4;
    let size = parseFloat(getComputedStyle(body).fontSize);
    while(body.scrollHeight > maxH && size > 12){
      size -= 1;
      body.style.fontSize = size + 'px';
    }
  }
  requestAnimationFrame(fit);
  return card;
}

export async function renderCardList(container, items, kind, onChange){
  container.innerHTML = '';
  const blocks = await listBlocks();
  const blockTitle = id => blocks.find(b => b.blockId === id)?.title || id;
  const orderMap = new Map(blocks.map((b,i)=>[b.blockId,i]));
  const groups = new Map();
  items.forEach(it => {
    let block = '_';
    let week = '_';
    if (it.lectures && it.lectures.length) {
      let bestOrd = Infinity, bestWeek = -Infinity, bestLec = -Infinity;
      it.lectures.forEach(l => {
        const ord = orderMap.has(l.blockId) ? orderMap.get(l.blockId) : Infinity;
        if (
          ord < bestOrd ||
          (ord === bestOrd && (l.week > bestWeek || (l.week === bestWeek && l.id > bestLec)))
        ) {
          block = l.blockId;
          week = l.week;
          bestOrd = ord;
          bestWeek = l.week;
          bestLec = l.id;
        }
      });
    } else {
      let bestOrd = Infinity;
      (it.blocks || []).forEach(id => {
        const ord = orderMap.has(id) ? orderMap.get(id) : Infinity;
        if (ord < bestOrd) { block = id; bestOrd = ord; }
      });
      if (it.weeks && it.weeks.length) week = Math.max(...it.weeks);
    }
    if (!groups.has(block)) groups.set(block, new Map());
    const wkMap = groups.get(block);
    const arr = wkMap.get(week) || [];
    arr.push(it);
    wkMap.set(week, arr);
  });
  const sortedBlocks = Array.from(groups.keys()).sort((a,b)=>{
    const ao = orderMap.has(a) ? orderMap.get(a) : Infinity;
    const bo = orderMap.has(b) ? orderMap.get(b) : Infinity;
    return ao - bo;
  });
  const layoutState = state.entryLayout;

  const toolbar = document.createElement('div');
  toolbar.className = 'entry-layout-toolbar';

  const viewToggle = document.createElement('div');
  viewToggle.className = 'layout-toggle';

  const listBtn = document.createElement('button');
  listBtn.type = 'button';
  listBtn.className = 'layout-btn' + (layoutState.mode === 'list' ? ' active' : '');
  listBtn.textContent = 'List';
  listBtn.addEventListener('click', () => {
    if (layoutState.mode === 'list') return;
    setEntryLayout({ mode: 'list' });
    updateToolbar();
    applyLayout();
  });

  const gridBtn = document.createElement('button');
  gridBtn.type = 'button';
  gridBtn.className = 'layout-btn' + (layoutState.mode === 'grid' ? ' active' : '');
  gridBtn.textContent = 'Grid';
  gridBtn.addEventListener('click', () => {
    if (layoutState.mode === 'grid') return;
    setEntryLayout({ mode: 'grid' });
    updateToolbar();
    applyLayout();
  });

  viewToggle.appendChild(listBtn);
  viewToggle.appendChild(gridBtn);
  toolbar.appendChild(viewToggle);

  const columnWrap = document.createElement('label');
  columnWrap.className = 'layout-control';
  columnWrap.textContent = 'Columns';
  const columnInput = document.createElement('input');
  columnInput.type = 'range';
  columnInput.min = '1';
  columnInput.max = '6';
  columnInput.step = '1';
  columnInput.value = String(layoutState.columns);
  const columnValue = document.createElement('span');
  columnValue.className = 'layout-value';
  columnValue.textContent = String(layoutState.columns);
  columnInput.addEventListener('input', () => {
    setEntryLayout({ columns: Number(columnInput.value) });
    columnValue.textContent = String(state.entryLayout.columns);
    applyLayout();
  });
  columnWrap.appendChild(columnInput);
  columnWrap.appendChild(columnValue);
  toolbar.appendChild(columnWrap);

  const scaleWrap = document.createElement('label');
  scaleWrap.className = 'layout-control';
  scaleWrap.textContent = 'Scale';
  const scaleInput = document.createElement('input');
  scaleInput.type = 'range';
  scaleInput.min = '0.6';
  scaleInput.max = '1.4';
  scaleInput.step = '0.05';
  scaleInput.value = String(layoutState.scale);
  const scaleValue = document.createElement('span');
  scaleValue.className = 'layout-value';
  scaleValue.textContent = `${layoutState.scale.toFixed(2)}x`;
  scaleInput.addEventListener('input', () => {
    setEntryLayout({ scale: Number(scaleInput.value) });
    scaleValue.textContent = `${state.entryLayout.scale.toFixed(2)}x`;
    applyLayout();
  });
  scaleWrap.appendChild(scaleInput);
  scaleWrap.appendChild(scaleValue);
  toolbar.appendChild(scaleWrap);

  container.appendChild(toolbar);

  function updateToolbar(){
    const mode = state.entryLayout.mode;
    listBtn.classList.toggle('active', mode === 'list');
    gridBtn.classList.toggle('active', mode === 'grid');
    columnWrap.style.display = mode === 'grid' ? '' : 'none';
  }

  function applyLayout(){
    const lists = container.querySelectorAll('.card-list');
    lists.forEach(list => {
      list.classList.toggle('grid-layout', state.entryLayout.mode === 'grid');
      list.style.setProperty('--entry-scale', state.entryLayout.scale);
      list.style.setProperty('--entry-columns', state.entryLayout.columns);
    });
  }

  updateToolbar();

  sortedBlocks.forEach(b => {
    const blockSec = document.createElement('section');
    blockSec.className = 'block-section';
    const blockHeader = document.createElement('button');
    blockHeader.type = 'button';
    blockHeader.className = 'block-header';
    const blockLabel = b === '_' ? 'Unassigned' : blockTitle(b);
    const blockKey = String(b);
    const bdef = blocks.find(bl => bl.blockId === b);
    if (bdef?.color) blockHeader.style.background = bdef.color;
    function updateBlockState(){
      const isCollapsed = collapsedBlocks.has(blockKey);
      blockSec.classList.toggle('collapsed', isCollapsed);
      blockHeader.textContent = `${isCollapsed ? '▸' : '▾'} ${blockLabel}`;
      blockHeader.setAttribute('aria-expanded', String(!isCollapsed));
    }
    updateBlockState();
    blockHeader.addEventListener('click', () => {
      if (collapsedBlocks.has(blockKey)) collapsedBlocks.delete(blockKey); else collapsedBlocks.add(blockKey);
      updateBlockState();
    });
    blockSec.appendChild(blockHeader);
    const wkMap = groups.get(b);
    const sortedWeeks = Array.from(wkMap.keys()).sort((a,b)=>{
      if (a === '_' && b !== '_') return 1;
      if (b === '_' && a !== '_') return -1;
      return Number(b) - Number(a);
    });
    sortedWeeks.forEach(w => {
      const weekSec = document.createElement('div');
      weekSec.className = 'week-section';
      const weekHeader = document.createElement('button');
      weekHeader.type = 'button';
      weekHeader.className = 'week-header';
      const weekLabel = w === '_' ? 'Unassigned' : `Week ${w}`;
      const weekKey = `${blockKey}__${w}`;
      function updateWeekState(){
        const isCollapsed = collapsedWeeks.has(weekKey);
        weekSec.classList.toggle('collapsed', isCollapsed);
        weekHeader.textContent = `${isCollapsed ? '▸' : '▾'} ${weekLabel}`;
        weekHeader.setAttribute('aria-expanded', String(!isCollapsed));
      }
      updateWeekState();
      weekHeader.addEventListener('click', () => {
        if (collapsedWeeks.has(weekKey)) collapsedWeeks.delete(weekKey); else collapsedWeeks.add(weekKey);
        updateWeekState();
      });
      weekSec.appendChild(weekHeader);
      const list = document.createElement('div');
      list.className = 'card-list';
      list.style.setProperty('--entry-scale', state.entryLayout.scale);
      list.style.setProperty('--entry-columns', state.entryLayout.columns);
      list.classList.toggle('grid-layout', state.entryLayout.mode === 'grid');
      const rows = wkMap.get(w);
      function renderChunk(start=0){
        const slice = rows.slice(start,start+200);
        slice.forEach(it=>{ list.appendChild(createItemCard(it,onChange)); });
        if (start+200 < rows.length) requestAnimationFrame(()=>renderChunk(start+200));
      }
      renderChunk();
      weekSec.appendChild(list);
      blockSec.appendChild(weekSec);
    });
    container.appendChild(blockSec);
  });

  applyLayout();
}
