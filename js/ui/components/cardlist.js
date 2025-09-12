import { listBlocks, upsertItem, deleteItem } from '../../storage/storage.js';
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
  const gear = document.createElement('button');
  gear.className = 'icon-btn';
  gear.textContent = '⚙️';
  const menu = document.createElement('div');
  menu.className = 'card-menu hidden';
  gear.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
  settings.appendChild(gear);
  settings.appendChild(menu);
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
      txt.textContent = item[f];
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
  return card;
}

export async function renderCardList(container, items, kind, onChange){
  const blocks = await listBlocks();
  const blockTitle = id => blocks.find(b => b.blockId === id)?.title || id;
  const groups = new Map();
  items.forEach(it => {
    const bs = it.blocks && it.blocks.length ? it.blocks : ['_'];
    const ws = it.weeks && it.weeks.length ? it.weeks : ['_'];
    bs.forEach(b => {
      if (!groups.has(b)) groups.set(b, new Map());
      const wkMap = groups.get(b);
      ws.forEach(w => {
        const arr = wkMap.get(w) || [];
        arr.push(it);
        wkMap.set(w, arr);
      });
    });
  });
  const sortedBlocks = Array.from(groups.keys()).sort((a,b)=>{
    if (a === '_' && b !== '_') return 1;
    if (b === '_' && a !== '_') return -1;
    return a.localeCompare(b);
  });
  sortedBlocks.forEach(b => {
    const blockSec = document.createElement('section');
    blockSec.className = 'block-section';
    const h2 = document.createElement('div');
    h2.className = 'block-header';
    h2.textContent = b === '_' ? 'Unassigned' : `${blockTitle(b)} (${b})`;
    blockSec.appendChild(h2);
    const wkMap = groups.get(b);
    const sortedWeeks = Array.from(wkMap.keys()).sort((a,b)=>{
      if (a === '_' && b !== '_') return 1;
      if (b === '_' && a !== '_') return -1;
      return Number(a) - Number(b);
    });
    sortedWeeks.forEach(w => {
      const weekSec = document.createElement('div');
      weekSec.className = 'week-section';
      const h3 = document.createElement('h3');
      h3.textContent = w === '_' ? 'Unassigned' : `Week ${w}`;
      weekSec.appendChild(h3);
      const list = document.createElement('div');
      list.className = 'card-list';
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
}
