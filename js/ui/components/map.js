import { listItemsByKind, upsertItem } from '../../storage/storage.js';
import { showPopup } from './popup.js';

export async function renderMap(root){
  root.innerHTML = '';
  const items = [
    ...(await listItemsByKind('disease')),
    ...(await listItemsByKind('drug')),
    ...(await listItemsByKind('concept'))
  ];
  const size = 600;
  const center = size/2;
  const radius = size/2 - 40;
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',`0 0 ${size} ${size}`);
  svg.classList.add('map-svg');

  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(g);

  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  defs.innerHTML = `
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
    </marker>
    <marker id="bar" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,10" stroke="context-stroke" stroke-width="2" />
    </marker>`;
  svg.appendChild(defs);

  const positions = {};
  items.forEach((it, idx) => {
    const angle = (2*Math.PI*idx)/items.length;
    const x = center + radius*Math.cos(angle);
    const y = center + radius*Math.sin(angle);
    positions[it.id] = {x,y};
  });
  // edges
  const drawn = new Set();
  items.forEach(it => {
    (it.links||[]).forEach(l => {
      if (!positions[l.id]) return;
      const key = it.id < l.id ? it.id + '|' + l.id : l.id + '|' + it.id;
      if (drawn.has(key)) return;
      drawn.add(key);
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', positions[it.id].x);
      line.setAttribute('y1', positions[it.id].y);
      line.setAttribute('x2', positions[l.id].x);
      line.setAttribute('y2', positions[l.id].y);
      line.setAttribute('class','map-edge');
      line.dataset.source = it.id;
      line.dataset.target = l.id;
      if (l.color) line.setAttribute('stroke', l.color);
      if (l.style === 'dashed') line.setAttribute('stroke-dasharray','4');
      if (l.style === 'arrow') line.setAttribute('marker-end','url(#arrow)');
      if (l.style === 'inhibit') line.setAttribute('marker-end','url(#bar)');
      if (l.label) {
        const title = document.createElementNS('http://www.w3.org/2000/svg','title');
        title.textContent = l.label;
        line.appendChild(title);
      }
      line.addEventListener('click', e => {
        e.stopPropagation();
        editLine(line, e);
      });
      g.appendChild(line);
    });
  });
  // nodes
  items.forEach(it => {
    const pos = positions[it.id];
    const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', 16);
    circle.setAttribute('class','map-node');
    const color = it.color || (it.kind === 'disease' ? 'var(--purple)' : it.kind === 'drug' ? 'var(--blue)' : 'var(--green)');
    circle.style.fill = color;
    circle.addEventListener('click', () => showPopup(it));
    g.appendChild(circle);
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y - 20);
    text.setAttribute('class','map-label');
    text.textContent = it.name || it.concept || '?';
    g.appendChild(text);
  });
  root.appendChild(svg);

  // dragging/panning
  let isDrag = false, lastX = 0, lastY = 0, offsetX = 0, offsetY = 0;
  svg.addEventListener('mousedown', e => {
    if (e.target !== svg) return;
    isDrag = true;
    lastX = e.clientX;
    lastY = e.clientY;
    svg.classList.add('dragging');
  });
  window.addEventListener('mousemove', e => {
    if (!isDrag) return;
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    g.setAttribute('transform', `translate(${offsetX},${offsetY})`);
  });
  window.addEventListener('mouseup', () => {
    isDrag = false;
    svg.classList.remove('dragging');
  });

  function editLine(line, evt){
    const srcId = line.dataset.source;
    const tgtId = line.dataset.target;
    const srcItem = items.find(it => it.id === srcId);
    if (!srcItem) return;
    const link = srcItem.links.find(l => l.id === tgtId);
    const menu = document.createElement('div');
    menu.className = 'line-editor';
    menu.style.left = evt.clientX + 'px';
    menu.style.top = evt.clientY + 'px';

    const colorIn = document.createElement('input');
    colorIn.type = 'color';
    colorIn.value = link.color || '#ffffff';
    const styleSel = document.createElement('select');
    ['solid','dashed','arrow','inhibit'].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      styleSel.appendChild(opt);
    });
    styleSel.value = link.style || 'solid';
    const labelIn = document.createElement('input');
    labelIn.type = 'text';
    labelIn.placeholder = 'Label';
    labelIn.value = link.label || '';
    const save = document.createElement('button');
    save.className = 'btn';
    save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';
    menu.append(colorIn, styleSel, labelIn, save, cancel);
    document.body.appendChild(menu);

    cancel.addEventListener('click', () => menu.remove());
    save.addEventListener('click', async () => {
      link.color = colorIn.value;
      link.style = styleSel.value;
      link.label = labelIn.value;
      line.setAttribute('stroke', link.color);
      line.removeAttribute('stroke-dasharray');
      line.removeAttribute('marker-end');
      if (link.style === 'dashed') line.setAttribute('stroke-dasharray','4');
      if (link.style === 'arrow') line.setAttribute('marker-end','url(#arrow)');
      if (link.style === 'inhibit') line.setAttribute('marker-end','url(#bar)');
      let title = line.querySelector('title');
      if (!title){
        title = document.createElementNS('http://www.w3.org/2000/svg','title');
        line.appendChild(title);
      }
      title.textContent = link.label;
      await upsertItem(srcItem);
      menu.remove();
    });
  }
}
