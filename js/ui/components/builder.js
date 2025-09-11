import { state, setBuilder, setCohort } from '../../state.js';
import { listBlocks, listItemsByKind } from '../../storage/storage.js';

// Render Study Builder panel
export async function renderBuilder(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'builder';
  root.appendChild(wrap);

  // Blocks selection
  const blocks = await listBlocks();
  const blockSection = document.createElement('div');
  blockSection.className = 'builder-section';
  const blockTitle = document.createElement('div');
  blockTitle.textContent = 'Blocks:';
  blockSection.appendChild(blockTitle);
  blocks.forEach(b => {
    const label = document.createElement('label');
    label.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.builder.blocks.includes(b.blockId);
    cb.addEventListener('change', () => {
      const set = new Set(state.builder.blocks);
      if (cb.checked) set.add(b.blockId); else set.delete(b.blockId);
      setBuilder({ blocks: Array.from(set) });
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(b.title || b.blockId));
    blockSection.appendChild(label);
  });
  wrap.appendChild(blockSection);

  // Week selection (1-8)
  const weekSection = document.createElement('div');
  weekSection.className = 'builder-section';
  const weekTitle = document.createElement('div');
  weekTitle.textContent = 'Weeks:';
  weekSection.appendChild(weekTitle);
  for (let w = 1; w <= 8; w++) {
    const label = document.createElement('label');
    label.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.builder.weeks.includes(w);
    cb.addEventListener('change', () => {
      const set = new Set(state.builder.weeks);
      if (cb.checked) set.add(w); else set.delete(w);
      setBuilder({ weeks: Array.from(set) });
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(String(w)));
    weekSection.appendChild(label);
  }
  wrap.appendChild(weekSection);

  // Type selection
  const typeSection = document.createElement('div');
  typeSection.className = 'builder-section';
  const typeTitle = document.createElement('div');
  typeTitle.textContent = 'Types:';
  typeSection.appendChild(typeTitle);
  const typeMap = { disease: 'Disease', drug: 'Drug', concept: 'Concept' };
  Object.entries(typeMap).forEach(([val, labelText]) => {
    const label = document.createElement('label');
    label.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.builder.types.includes(val);
    cb.addEventListener('change', () => {
      const set = new Set(state.builder.types);
      if (cb.checked) set.add(val); else set.delete(val);
      setBuilder({ types: Array.from(set) });
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(labelText));
    typeSection.appendChild(label);
  });
  wrap.appendChild(typeSection);

  // Favorites toggle
  const favSection = document.createElement('label');
  favSection.className = 'row';
  const favCb = document.createElement('input');
  favCb.type = 'checkbox';
  favCb.checked = state.builder.onlyFav;
  favCb.addEventListener('change', () => setBuilder({ onlyFav: favCb.checked }));
  favSection.appendChild(favCb);
  favSection.appendChild(document.createTextNode('Only favorites'));
  wrap.appendChild(favSection);

  // Build button and result count
  const buildBtn = document.createElement('button');
  buildBtn.className = 'btn btn-primary';
  buildBtn.textContent = 'Build Set';
  const count = document.createElement('div');
  count.className = 'builder-count';
  count.textContent = `Set size: ${state.cohort.length}`;
  buildBtn.addEventListener('click', async () => {
    let items = [];
    for (const kind of state.builder.types) {
      items = items.concat(await listItemsByKind(kind));
    }
    items = items.filter(it => {
      if (state.builder.onlyFav && !it.favorite) return false;
      if (state.builder.blocks.length && !it.blocks?.some(b => state.builder.blocks.includes(b))) return false;
      if (state.builder.weeks.length && !it.weeks?.some(w => state.builder.weeks.includes(w))) return false;
      return true;
    });
    setCohort(items);
    count.textContent = `Set size: ${items.length}`;
  });
  wrap.appendChild(buildBtn);
  wrap.appendChild(count);
}
