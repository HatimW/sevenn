import { listBlocks } from '../../storage/storage.js';
import { createTitleCell } from './titlecell.js';
import { chipList } from './chips.js';

const columnMap = {
  disease: [
    ['etiology', 'Etiology'],
    ['pathophys', 'Pathophys'],
    ['clinical', 'Clinical'],
    ['diagnosis', 'Diagnosis'],
    ['treatment', 'Treatment'],
    ['complications', 'Complications'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts']
  ],
  drug: [
    ['class', 'Class'],
    ['source', 'Source'],
    ['moa', 'MOA'],
    ['uses', 'Uses'],
    ['sideEffects', 'Side Effects'],
    ['contraindications', 'Contraindications'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts']
  ],
  concept: [
    ['type', 'Type'],
    ['definition', 'Definition'],
    ['mechanism', 'Mechanism'],
    ['clinicalRelevance', 'Clinical Relevance'],
    ['example', 'Example'],
    ['mnemonic', 'Mnemonic'],
    ['facts', 'Facts']
  ]
};

export async function renderTable(container, items, kind, onChange) {
  const blocks = await listBlocks();
  const blockTitle = (id) => blocks.find(b => b.blockId === id)?.title || id;
  const groups = new Map(); // block -> week -> items
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

  const sortedBlocks = Array.from(groups.keys()).sort((a, b) => {
    if (a === '_' && b !== '_') return 1;
    if (b === '_' && a !== '_') return -1;
    return a.localeCompare(b);
  });

  sortedBlocks.forEach(b => {
    const blockSec = document.createElement('section');
    blockSec.className = 'block-section';
    const h2 = document.createElement('h2');
    h2.textContent = b === '_' ? 'Unassigned' : `${blockTitle(b)} (${b})`;
    blockSec.appendChild(h2);

    const wkMap = groups.get(b);
    const sortedWeeks = Array.from(wkMap.keys()).sort((a, b) => {
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

      const table = document.createElement('table');
      table.className = 'table';

      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      const thTitle = document.createElement('th');
      thTitle.textContent = 'Title';
      hr.appendChild(thTitle);
      columnMap[kind].forEach(([, label]) => {
        const th = document.createElement('th');
        th.textContent = label;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const rows = wkMap.get(w);

      function renderChunk(start = 0) {
        const slice = rows.slice(start, start + 200);
        slice.forEach(it => {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.appendChild(createTitleCell(it, onChange));
          tr.appendChild(td);
          columnMap[kind].forEach(([field]) => {
            const td2 = document.createElement('td');
            if (field === 'facts') {
              td2.appendChild(chipList(it.facts || []));
            } else {
              td2.textContent = it[field] || '';
            }
            tr.appendChild(td2);
          });
          tbody.appendChild(tr);
        });
        if (start + 200 < rows.length) {
          requestAnimationFrame(() => renderChunk(start + 200));
        }
      }

      renderChunk();
      table.appendChild(tbody);
      weekSec.appendChild(table);
      blockSec.appendChild(weekSec);
    });

    container.appendChild(blockSec);
  });
}
