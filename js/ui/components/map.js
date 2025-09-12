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
    g.querySelectorAll(`line[data-a='${id}'], line[data-b='${id}']`).forEach(line => {
      const a = line.dataset.a;
      const b = line.dataset.b;
      line.setAttribute('x1', positions[a].x);
      line.setAttribute('y1', positions[a].y);
      line.setAttribute('x2', positions[b].x);
      line.setAttribute('y2', positions[b].y);
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
      const x = viewBox.x + ((e.clientX - rect.left) / svg.clientWidth) * viewBox.w;
      const y = viewBox.y + ((e.clientY - rect.top) / svg.clientHeight) * viewBox.h;
      positions[nodeDrag.id] = { x, y };
      nodeDrag.circle.setAttribute('cx', x);
      nodeDrag.circle.setAttribute('cy', y);
      nodeDrag.label.setAttribute('x', x);
      nodeDrag.label.setAttribute('y', y - 28 * scale);
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
  const center = size/2;
  const radius = size/2 - 100;
  items.forEach((it, idx) => {
    if (it.mapPos) {
      positions[it.id] = { ...it.mapPos };
    } else {
      const angle = (2*Math.PI*idx)/items.length;
      const x = center + radius*Math.cos(angle);
      const y = center + radius*Math.sin(angle);
      positions[it.id] = {x,y};
    }
  });

  autoLayout(items, positions, size);
  for (const it of items) {
    it.mapPos = positions[it.id];
    await upsertItem(it);
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
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', positions[it.id].x);
      line.setAttribute('y1', positions[it.id].y);
      line.setAttribute('x2', positions[l.id].x);
      line.setAttribute('y2', positions[l.id].y);
      line.setAttribute('class','map-edge');
      line.setAttribute('vector-effect','non-scaling-stroke');
      applyLineStyle(line, l);
      line.dataset.a = it.id;
      line.dataset.b = l.id;
      line.addEventListener('click', e => { e.stopPropagation(); openLineMenu(e, line, it.id, l.id); });
      g.appendChild(line);
    });
  });

  items.forEach(it => {
    const pos = positions[it.id];
    const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', 20);
    circle.setAttribute('class','map-node');
    circle.dataset.id = it.id;
    const kindColors = { disease: 'var(--purple)', drug: 'var(--blue)' };
    const fill = kindColors[it.kind] || it.color || 'var(--gray)';
    circle.setAttribute('fill', fill);
    let text;
    circle.addEventListener('click', () => { if (!nodeWasDragged) showPopup(it); nodeWasDragged = false; });
    circle.addEventListener('mousedown', e => { e.stopPropagation(); nodeDrag = { id: it.id, circle, label: text }; nodeWasDragged = false; svg.style.cursor = 'grabbing'; });
    g.appendChild(circle);
    text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y - 28);
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
  const offset = 28 * scale;
  document.querySelectorAll('.map-node').forEach(c => c.setAttribute('r', 20 * scale));
  document.querySelectorAll('.map-label').forEach(t => {
    t.setAttribute('font-size', 12 * scale);
    const id = t.dataset.id;
    const c = document.querySelector(`circle[data-id='${id}']`);
    if (c) t.setAttribute('y', Number(c.getAttribute('cy')) - offset);
  });
  document.querySelectorAll('.map-edge').forEach(l => l.setAttribute('stroke-width', 4 * Math.pow(unit, -0.2)));
}

function applyLineStyle(line, info){
  const color = info.color || 'var(--gray)';
  line.setAttribute('stroke', color);
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

function autoLayout(items, positions, size){
  const nodes = items.map(it => ({ id: it.id, x: positions[it.id].x, y: positions[it.id].y }));
  const index = Object.fromEntries(nodes.map((n,i)=>[n.id,i]));
  const links = [];
  const seen = new Set();
  items.forEach(it => {
    (it.links||[]).forEach(l => {
      const key = it.id < l.id ? it.id+'|'+l.id : l.id+'|'+it.id;
      if (seen.has(key)) return;
      seen.add(key);
      if (index[l.id] !== undefined) links.push({ source: index[it.id], target: index[l.id] });
    });
  });
  const area = size*size;
  const k = Math.sqrt(area / nodes.length);
  let t = size / 10;
  const dt = t / 200;
  const rep = (dist) => (k*k) / dist;
  const attr = (dist) => (dist*dist)/k;
  for (let iter=0; iter<200; iter++){
    const disp = nodes.map(()=>({x:0,y:0}));
    for (let i=0;i<nodes.length;i++){
      for (let j=i+1;j<nodes.length;j++){
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        let dist = Math.hypot(dx,dy) || 0.01;
        const force = rep(dist);
        const fx = dx/dist * force;
        const fy = dy/dist * force;
        disp[i].x += fx; disp[i].y += fy;
        disp[j].x -= fx; disp[j].y -= fy;
      }
    }
    for (const l of links){
      const dx = nodes[l.source].x - nodes[l.target].x;
      const dy = nodes[l.source].y - nodes[l.target].y;
      let dist = Math.hypot(dx,dy) || 0.01;
      const force = attr(dist);
      const fx = dx/dist * force;
      const fy = dy/dist * force;
      disp[l.source].x -= fx; disp[l.source].y -= fy;
      disp[l.target].x += fx; disp[l.target].y += fy;
    }
    for (let i=0;i<nodes.length;i++){
      const d = disp[i];
      const dist = Math.hypot(d.x, d.y);
      if (dist > 0){
        const limit = Math.min(dist, t);
        nodes[i].x += d.x / dist * limit;
        nodes[i].y += d.y / dist * limit;
      }
      nodes[i].x = Math.min(size, Math.max(0, nodes[i].x));
      nodes[i].y = Math.min(size, Math.max(0, nodes[i].y));
    }
    t -= dt;
  }
  nodes.forEach(n => { positions[n.id] = { x:n.x, y:n.y }; });
}
