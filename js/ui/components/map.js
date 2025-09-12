import { listItemsByKind, getItem, upsertItem } from '../../storage/storage.js';
import { showPopup } from './popup.js';

export async function renderMap(root){
  root.innerHTML = '';
  const items = [
    ...(await listItemsByKind('disease')),
    ...(await listItemsByKind('drug')),
    ...(await listItemsByKind('concept'))
  ];

  const base = 1000;
  const size = Math.max(base, items.length * 150);
  const viewport = base;
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  const viewBox = { x:(size-viewport)/2, y:(size-viewport)/2, w:viewport, h:viewport };
  const updateViewBox = () => {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    adjustScale();
  };

  svg.classList.add('map-svg');

  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(g);


  const updateEdges = id => {
    g.querySelectorAll(`path[data-a='${id}'], path[data-b='${id}']`).forEach(edge => {
      edge.setAttribute('d', calcPath(edge.dataset.a, edge.dataset.b));

    });
  };

  // pan/zoom state
  let dragging = false;
  let nodeDrag = null;
  let nodeWasDragged = false;
  let last = { x:0, y:0 };
  svg.addEventListener('mousedown', e => {
    if (e.target === svg) {
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      svg.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('mousemove', async e => {
    if (nodeDrag) {
      const rect = svg.getBoundingClientRect();
      const unit = viewBox.w / svg.clientWidth;
      const scale = Math.pow(unit, 0.8);
      const x = viewBox.x + ((e.clientX - rect.left) / svg.clientWidth) * viewBox.w - nodeDrag.offset.x;
      const y = viewBox.y + ((e.clientY - rect.top) / svg.clientHeight) * viewBox.h - nodeDrag.offset.y;

      positions[nodeDrag.id] = { x, y };
      nodeDrag.circle.setAttribute('cx', x);
      nodeDrag.circle.setAttribute('cy', y);
      nodeDrag.label.setAttribute('x', x);
      const baseR = Number(nodeDrag.circle.dataset.radius) || 20;
      nodeDrag.label.setAttribute('y', y - (baseR + 8) * scale);
      updateEdges(nodeDrag.id);
      nodeWasDragged = true;
      return;
    }

    if (!dragging) return;
    const scale = viewBox.w / svg.clientWidth;
    viewBox.x -= (e.clientX - last.x) * scale;
    viewBox.y -= (e.clientY - last.y) * scale;
    last = { x: e.clientX, y: e.clientY };
    updateViewBox();
  });

  window.addEventListener('mouseup', async () => {
    if (nodeDrag) {
      const it = itemMap[nodeDrag.id];
      it.mapPos = positions[nodeDrag.id];
      await upsertItem(it);
      nodeDrag = null;
    }
    dragging = false;
    svg.style.cursor = 'grab';
  });

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.9 : 1.1;
    const mx = viewBox.x + (e.offsetX / svg.clientWidth) * viewBox.w;
    const my = viewBox.y + (e.offsetY / svg.clientHeight) * viewBox.h;

    viewBox.w = Math.min(size * 2, Math.max(100, viewBox.w * factor));
    viewBox.h = viewBox.w;
    viewBox.x = mx - (e.offsetX / svg.clientWidth) * viewBox.w;
    viewBox.y = my - (e.offsetY / svg.clientHeight) * viewBox.h;
    updateViewBox();
  });


  if (!window._mapResizeAttached) {
    window.addEventListener('resize', adjustScale);
    window._mapResizeAttached = true;
  }

  const positions = {};
  const itemMap = Object.fromEntries(items.map(it => [it.id, it]));
  const linkCounts = Object.fromEntries(items.map(it => [it.id, (it.links || []).length]));
  const maxLinks = Math.max(1, ...Object.values(linkCounts));
  const minRadius = 20;
  const maxRadius = 40;


  const center = size/2;
  const newItems = [];
  items.forEach(it => {
    if (it.mapPos) positions[it.id] = { ...it.mapPos };
    else newItems.push(it);
  });
  newItems.sort((a,b) => linkCounts[b.id] - linkCounts[a.id]);
  const step = (2*Math.PI) / Math.max(newItems.length,1);
  newItems.forEach((it, idx) => {
    const angle = idx * step;
    const degree = linkCounts[it.id];
    const dist = 100 - (degree / maxLinks) * 50;
    const x = center + dist*Math.cos(angle);
    const y = center + dist*Math.sin(angle);
    positions[it.id] = { x, y };
    it.mapPos = positions[it.id];
  });
  for (const it of newItems) await upsertItem(it);

  function pointToSeg(px, py, x1, y1, x2, y2){
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx*dx + dy*dy;
    if (!l2) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  function calcPath(aId, bId){
    const a = positions[aId];
    const b = positions[bId];
    const x1 = a.x, y1 = a.y;
    const x2 = b.x, y2 = b.y;
    let cx = (x1 + x2) / 2;
    let cy = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    for (const id in positions){
      if (id === aId || id === bId) continue;
      const p = positions[id];
      if (pointToSeg(p.x, p.y, x1, y1, x2, y2) < 40){
        const nx = -dy / len;
        const ny = dx / len;
        const side = ((p.x - x1) * nx + (p.y - y1) * ny) > 0 ? 1 : -1;
        cx += nx * 80 * side;
        cy += ny * 80 * side;
        break;
      }
    }
    return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
  }


  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg','marker');
  marker.setAttribute('id','arrow');
  marker.setAttribute('viewBox','0 0 10 10');
  marker.setAttribute('refX','10');
  marker.setAttribute('refY','5');
  marker.setAttribute('markerWidth','6');
  marker.setAttribute('markerHeight','6');
  marker.setAttribute('orient','auto');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M0,0 L10,5 L0,10 Z');
  path.setAttribute('fill','inherit');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const drawn = new Set();
  items.forEach(it => {
    (it.links||[]).forEach(l => {
      if (!positions[l.id]) return;
      const key = it.id < l.id ? it.id + '|' + l.id : l.id + '|' + it.id;
      if (drawn.has(key)) return;
      drawn.add(key);

      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', calcPath(it.id, l.id));
      path.setAttribute('fill','none');
      path.setAttribute('class','map-edge');
      path.setAttribute('vector-effect','non-scaling-stroke');
      applyLineStyle(path, l);
      path.dataset.a = it.id;
      path.dataset.b = l.id;
      path.addEventListener('click', e => { e.stopPropagation(); openLineMenu(e, path, it.id, l.id); });
      g.appendChild(path);

    });
  });

  items.forEach(it => {
    const pos = positions[it.id];
    const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);

    // Scale radius between minRadius and maxRadius based on relative link count
    const normalized = (linkCounts[it.id] || 0) / maxLinks;
    const baseR = minRadius + normalized * (maxRadius - minRadius);
    circle.setAttribute('r', baseR);
    circle.dataset.radius = baseR;
    circle.setAttribute('class','map-node');

    circle.dataset.id = it.id;
    const kindColors = { disease: 'var(--purple)', drug: 'var(--blue)' };
    const fill = kindColors[it.kind] || it.color || 'var(--gray)';
    circle.setAttribute('fill', fill);
    let text;
    circle.addEventListener('click', () => { if (!nodeWasDragged) showPopup(it); nodeWasDragged = false; });
    circle.addEventListener('mousedown', e => {
      e.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const mouseX = viewBox.x + ((e.clientX - rect.left) / svg.clientWidth) * viewBox.w;
      const mouseY = viewBox.y + ((e.clientY - rect.top) / svg.clientHeight) * viewBox.h;
      nodeDrag = { id: it.id, circle, label: text, offset: { x: mouseX - pos.x, y: mouseY - pos.y } };
      nodeWasDragged = false;
      svg.style.cursor = 'grabbing';
    });

    g.appendChild(circle);
    text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y - (baseR + 8));
    text.setAttribute('class','map-label');
    text.dataset.id = it.id;
    text.textContent = it.name || it.concept || '?';
    g.appendChild(text);
  });

  root.appendChild(svg);
  updateViewBox();
}

function adjustScale(){
  const svg = document.querySelector('.map-svg');
  if (!svg) return;
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  const unit = vb[2] / svg.clientWidth; // units per pixel
  const scale = Math.pow(unit, 0.8);
  document.querySelectorAll('.map-node').forEach(c => {
    const baseR = Number(c.dataset.radius) || 20;
    c.setAttribute('r', baseR * scale);
  });
  document.querySelectorAll('.map-label').forEach(t => {
    t.setAttribute('font-size', 12 * scale);
    const id = t.dataset.id;
    const c = document.querySelector(`circle[data-id='${id}']`);
    if (c) {
      const baseR = Number(c.dataset.radius) || 20;
      t.setAttribute('y', Number(c.getAttribute('cy')) - (baseR + 8) * scale);
    }
  });
  document.querySelectorAll('.map-edge').forEach(l => l.setAttribute('stroke-width', 4 * Math.pow(unit, -0.2)));

}

function applyLineStyle(line, info){
  const color = info.color || 'var(--gray)';
  line.style.stroke = color;

  if (info.style === 'dashed') line.setAttribute('stroke-dasharray','4,4');
  else line.removeAttribute('stroke-dasharray');
  if (info.style === 'arrow') line.setAttribute('marker-end','url(#arrow)');
  else line.removeAttribute('marker-end');
  let title = line.querySelector('title');
  if (!title) {
    title = document.createElementNS('http://www.w3.org/2000/svg','title');
    line.appendChild(title);
  }
  title.textContent = info.name || '';
}

async function openLineMenu(evt, line, aId, bId){
  const existing = await getItem(aId);
  const link = existing.links.find(l => l.id === bId) || {};
  const menu = document.createElement('div');
  menu.className = 'line-menu';
  menu.style.left = evt.pageX + 'px';
  menu.style.top = evt.pageY + 'px';

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = link.color || '#888888';
  colorLabel.appendChild(colorInput);
  menu.appendChild(colorLabel);

  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Style';
  const typeSel = document.createElement('select');
  ['solid','dashed','arrow'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    typeSel.appendChild(opt);
  });
  typeSel.value = link.style || 'solid';
  typeLabel.appendChild(typeSel);
  menu.appendChild(typeLabel);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Label';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = link.name || '';
  nameLabel.appendChild(nameInput);
  menu.appendChild(nameLabel);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Save';
  btn.addEventListener('click', async () => {
    const patch = { color: colorInput.value, style: typeSel.value, name: nameInput.value };
    await updateLink(aId, bId, patch);
    applyLineStyle(line, patch);
    document.body.removeChild(menu);
  });
  menu.appendChild(btn);

  document.body.appendChild(menu);
  const closer = e => {
    if (!menu.contains(e.target)) {
      document.body.removeChild(menu);
      document.removeEventListener('mousedown', closer);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closer), 0);
}

async function updateLink(aId, bId, patch){
  const a = await getItem(aId);
  const b = await getItem(bId);
  if (!a || !b) return;
  const apply = (item, otherId) => {
    item.links = item.links || [];
    const l = item.links.find(x => x.id === otherId);
    if (l) Object.assign(l, patch);
  };
  apply(a, bId);
  apply(b, aId);
  await upsertItem(a);
  await upsertItem(b);
}
