import { state, setBuilder, setCohort } from '../../state.js';
import { listBlocks, listItemsByKind } from '../../storage/storage.js';

// Render Study Builder panel
export async function renderBuilder(root) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'builder';
  root.appendChild(wrap);

  // Nested block -> week -> lecture selection
  const blocks = await listBlocks();
  blocks.forEach(b => {
    const blockDiv = document.createElement('div');
    blockDiv.className = 'builder-section';
    const blkLabel = document.createElement('label');
    blkLabel.className = 'row';
    const blkCb = document.createElement('input');
    blkCb.type = 'checkbox';
    blkCb.checked = state.builder.blocks.includes(b.blockId);
    blkLabel.appendChild(blkCb);
    blkLabel.appendChild(document.createTextNode(b.title || b.blockId));
    blockDiv.appendChild(blkLabel);

    const weekWrap = document.createElement('div');
    weekWrap.className = 'builder-sub';
    weekWrap.style.display = blkCb.checked ? 'block' : 'none';
    blockDiv.appendChild(weekWrap);

    blkCb.addEventListener('change', () => {
      const set = new Set(state.builder.blocks);
      if (blkCb.checked) set.add(b.blockId); else set.delete(b.blockId);
      setBuilder({ blocks: Array.from(set) });
      weekWrap.style.display = blkCb.checked ? 'block' : 'none';
    });

    const weeks = Array.from({ length: b.weeks || 8 }, (_, i) => i + 1);
    weeks.forEach(w => {
      const wkLabel = document.createElement('label');
      wkLabel.className = 'row';
      const wkCb = document.createElement('input');
      wkCb.type = 'checkbox';
      const wkKey = `${b.blockId}|${w}`;
      wkCb.checked = state.builder.weeks.includes(wkKey);
      wkLabel.appendChild(wkCb);
      wkLabel.appendChild(document.createTextNode(`Week ${w}`));
      weekWrap.appendChild(wkLabel);

      const lecWrap = document.createElement('div');
      lecWrap.className = 'builder-sub';
      lecWrap.style.display = wkCb.checked ? 'block' : 'none';
      wkLabel.appendChild(lecWrap);

      wkCb.addEventListener('change', () => {
        const set = new Set(state.builder.weeks);
        if (wkCb.checked) set.add(wkKey); else set.delete(wkKey);
        setBuilder({ weeks: Array.from(set) });
        lecWrap.style.display = wkCb.checked ? 'block' : 'none';
      });

      (b.lectures || []).filter(l => l.week === w).forEach(l => {
        const key = `${b.blockId}|${l.id}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip' + (state.builder.lectures.includes(key) ? ' active' : '');
        btn.textContent = l.name;
        btn.addEventListener('click', () => {
          const set = new Set(state.builder.lectures);
          if (set.has(key)) set.delete(key); else set.add(key);
          setBuilder({ lectures: Array.from(set) });
          btn.classList.toggle('active');
        });
        lecWrap.appendChild(btn);
      });
    });

    wrap.appendChild(blockDiv);
  });

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
      if (state.builder.weeks.length) {
        const ok = state.builder.weeks.some(pair => {
          const [b, w] = pair.split('|');
          return it.blocks?.includes(b) && it.weeks?.includes(Number(w));
        });
        if (!ok) return false;
      }
      if (state.builder.lectures.length) {
        const ok = it.lectures?.some(l => state.builder.lectures.includes(`${l.blockId}|${l.id}`));
        if (!ok) return false;
      }
      return true;
    });
    setCohort(items);
    count.textContent = `Set size: ${items.length}`;
  });
  wrap.appendChild(buildBtn);
  wrap.appendChild(count);
}
