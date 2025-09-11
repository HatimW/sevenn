import { listItemsByKind } from '../../storage/storage.js';
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
      svg.appendChild(line);
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
    circle.addEventListener('click', () => showPopup(it));
    svg.appendChild(circle);
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y - 20);
    text.setAttribute('class','map-label');
    text.textContent = it.name || it.concept || '?';
    svg.appendChild(text);
  });
  root.appendChild(svg);
}
