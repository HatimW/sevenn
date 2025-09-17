import { listItemsByKind, getItem, upsertItem } from '../../storage/storage.js';
import { showPopup } from './popup.js';

const TOOL = {
  NAVIGATE: 'navigate',
  HIDE: 'hide',
  BREAK: 'break-link',
  ADD_LINK: 'add-link',
  AREA: 'area'
};

function createCursor(svg, hotX = 8, hotY = 8) {
  const encoded = encodeURIComponent(svg.trim())
    .replace(/%0A/g, '')
    .replace(/%20/g, ' ');
  return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, pointer`;
}

const CURSOR_STYLE = {
  hide: createCursor(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<path d="M6 19.5l9-9a3 3 0 0 1 4.24 0l6.5 6.5a3 3 0 0 1 0 4.24l-9 9H9a3 3 0 0 1-3-3z" fill="#f97316" />'
    + '<path d="M8.2 21.2l8.6 8.6" stroke="#fed7aa" stroke-width="3" stroke-linecap="round" />'
    + '<path d="M11.3 24.5l4 4" stroke="#fff7ed" stroke-width="2" stroke-linecap="round" />'
    + '</svg>',
    7,
    26
  ),
  break: createCursor(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<circle cx="11" cy="11" r="4" fill="none" stroke="#f97316" stroke-width="2.2" />'
    + '<circle cx="11" cy="21" r="4" fill="none" stroke="#f97316" stroke-width="2.2" />'
    + '<path d="M14.5 13L24 3.5" stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round" />'
    + '<path d="M14.5 19L24 28.5" stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round" />'
    + '<path d="M6 6l7 7" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" />'
    + '<path d="M6 26l7-7" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" />'
    + '</svg>',
    18,
    18
  ),
  link: createCursor(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + '<path d="M12 11h5a4.5 4.5 0 0 1 0 9h-3" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />'
    + '<path d="M14 15h-4a4.5 4.5 0 0 0 0 9h5" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />'
    + '<path d="M13 19h6" stroke="#bae6fd" stroke-width="2" stroke-linecap="round" />'
    + '</svg>',
    9,
    23
  )
};

const DEFAULT_LINK_COLOR = '#888888';

const mapState = {
  tool: TOOL.NAVIGATE,
  selectionIds: [],
  previewSelection: null,
  pendingLink: null,
  hiddenMenuTab: 'nodes',
  panelVisible: true,
  listenersAttached: false,
  draggingView: false,
  nodeDrag: null,
  areaDrag: null,
  menuDrag: null,
  selectionRect: null,
  nodeWasDragged: false,
  viewBox: null,
  svg: null,
  g: null,
  positions: {},
  itemMap: {},
  elements: new Map(),
  root: null,
  updateViewBox: () => {},
  selectionBox: null,
  sizeLimit: 2000,
  minView: 100,
  lastPointer: { x: 0, y: 0 },
  autoPan: null,
  autoPanFrame: null,
  toolboxPos: { x: 16, y: 16 },
  toolboxDrag: null,
  toolboxEl: null,
  toolboxContainer: null,
  baseCursor: 'grab',
  cursorOverride: null,
  defaultViewSize: null,
  justCompletedSelection: false
};

function setAreaInteracting(active) {
  if (!mapState.root) return;
  mapState.root.classList.toggle('map-area-interacting', Boolean(active));
}

export async function renderMap(root) {
  if (mapState.root && mapState.root !== root) {
    mapState.root.classList.remove('map-area-interacting');
  }
  mapState.root = root;
  root.innerHTML = '';
  mapState.nodeDrag = null;
  mapState.areaDrag = null;
  mapState.draggingView = false;
  mapState.menuDrag = null;
  mapState.selectionRect = null;
  mapState.previewSelection = null;
  mapState.nodeWasDragged = false;
  mapState.justCompletedSelection = false;
  stopToolboxDrag();
  mapState.toolboxEl = null;
  mapState.toolboxContainer = null;
  mapState.cursorOverride = null;
  stopAutoPan();
  setAreaInteracting(false);

  ensureListeners();

  const items = [
    ...(await listItemsByKind('disease')),
    ...(await listItemsByKind('drug')),
    ...(await listItemsByKind('concept'))
  ];

  const hiddenNodes = items.filter(it => it.mapHidden);
  const visibleItems = items.filter(it => !it.mapHidden);

  const itemMap = Object.fromEntries(items.map(it => [it.id, it]));
  mapState.itemMap = itemMap;

  const base = 1000;
  const size = Math.max(base, visibleItems.length * 150);
  const viewport = base;
  mapState.sizeLimit = size * 2;
  mapState.minView = 100;

  const container = document.createElement('div');
  container.className = 'map-container';
  root.appendChild(container);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('map-svg');
  const defaultView = {
    x: (size - viewport) / 2,
    y: (size - viewport) / 2,
    w: viewport,
    h: viewport
  };
  let viewBox;
  if (mapState.viewBox) {
    const current = mapState.viewBox;
    const cx = Number.isFinite(current.x) && Number.isFinite(current.w) ? current.x + current.w / 2 : defaultView.x + defaultView.w / 2;
    const cy = Number.isFinite(current.y) && Number.isFinite(current.h) ? current.y + current.h / 2 : defaultView.y + defaultView.h / 2;
    const minSize = mapState.minView || defaultView.w;
    const maxSize = mapState.sizeLimit || defaultView.w;
    const desiredSize = Number.isFinite(current.w) ? current.w : defaultView.w;
    const clamped = Math.min(Math.max(desiredSize, minSize), maxSize);
    viewBox = {
      x: cx - clamped / 2,
      y: cy - clamped / 2,
      w: clamped,
      h: clamped
    };
  } else {
    viewBox = { ...defaultView };
  }

  mapState.svg = svg;
  mapState.viewBox = viewBox;
  if (!Number.isFinite(mapState.defaultViewSize)) {
    mapState.defaultViewSize = viewBox.w;
  }

  const updateViewBox = () => {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    adjustScale();
  };
  mapState.updateViewBox = updateViewBox;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M0,0 L10,5 L0,10 Z');
  arrowPath.setAttribute('fill', 'inherit');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);
  svg.appendChild(g);
  mapState.g = g;

  container.appendChild(svg);

  const selectionBox = document.createElement('div');
  selectionBox.className = 'map-selection hidden';
  container.appendChild(selectionBox);
  mapState.selectionBox = selectionBox;

  attachSvgEvents(svg);

  const positions = {};
  mapState.positions = positions;
  mapState.elements = new Map();

  const linkCounts = Object.fromEntries(items.map(it => [it.id, (it.links || []).length]));
  const maxLinks = Math.max(1, ...Object.values(linkCounts));
  const minRadius = 20;
  const maxRadius = 60;

  const center = size / 2;
  const newItems = [];
  visibleItems.forEach(it => {
    if (it.mapPos) positions[it.id] = { ...it.mapPos };
    else newItems.push(it);
  });

  newItems.sort((a, b) => (linkCounts[b.id] || 0) - (linkCounts[a.id] || 0));
  const step = (2 * Math.PI) / Math.max(newItems.length, 1);
  newItems.forEach((it, idx) => {
    const angle = idx * step;
    const degree = linkCounts[it.id] || 0;
    const dist = 100 - (degree / maxLinks) * 50;
    const x = center + dist * Math.cos(angle);
    const y = center + dist * Math.sin(angle);
    positions[it.id] = { x, y };
    it.mapPos = positions[it.id];
  });
  for (const it of newItems) await upsertItem(it);

  mapState.selectionIds = mapState.selectionIds.filter(id => positions[id]);

  const hiddenLinks = gatherHiddenLinks(items, itemMap);

  buildToolbox(container, hiddenNodes.length, hiddenLinks.length);
  buildHiddenPanel(container, hiddenNodes, hiddenLinks);

  const drawn = new Set();
  visibleItems.forEach(it => {
    (it.links || []).forEach(l => {
      if (l.hidden) return;
      if (!positions[l.id]) return;
      const key = it.id < l.id ? `${it.id}|${l.id}` : `${l.id}|${it.id}`;
      if (drawn.has(key)) return;
      drawn.add(key);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', calcPath(it.id, l.id));
      path.setAttribute('fill', 'none');
      path.setAttribute('class', 'map-edge');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      applyLineStyle(path, l);
      path.dataset.a = it.id;
      path.dataset.b = l.id;
      path.addEventListener('click', e => {
        e.stopPropagation();
        handleEdgeClick(path, it.id, l.id, e);
      });
      path.addEventListener('mouseenter', () => {
        if (mapState.tool === TOOL.HIDE) {
          applyCursorOverride('hide');
        } else if (mapState.tool === TOOL.BREAK) {
          applyCursorOverride('break');
        }
      });
      path.addEventListener('mouseleave', () => {
        if (mapState.tool === TOOL.HIDE) {
          clearCursorOverride('hide');
        }
        if (mapState.tool === TOOL.BREAK) {
          clearCursorOverride('break');
        }
      });
      g.appendChild(path);
    });
  });

  visibleItems.forEach(it => {
    const pos = positions[it.id];
    if (!pos) return;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    const baseR = minRadius + ((maxRadius - minRadius) * (linkCounts[it.id] || 0) / maxLinks);
    circle.setAttribute('r', baseR);
    circle.dataset.radius = baseR;
    circle.setAttribute('class', 'map-node');
    circle.dataset.id = it.id;
    const kindColors = { disease: 'var(--purple)', drug: 'var(--blue)' };
    const fill = kindColors[it.kind] || it.color || 'var(--gray)';
    circle.setAttribute('fill', fill);

    const handleNodePointerDown = e => {
      if (e.button !== 0) return;
      const isNavigateTool = mapState.tool === TOOL.NAVIGATE;
      const isAreaDrag = mapState.tool === TOOL.AREA && mapState.selectionIds.includes(it.id);
      if (!isNavigateTool && !isAreaDrag) return;
      e.stopPropagation();
      e.preventDefault();
      const { x, y } = clientToMap(e.clientX, e.clientY);
      const current = mapState.positions[it.id] || pos;
      if (isNavigateTool) {
        mapState.nodeDrag = {
          id: it.id,
          offset: { x: x - current.x, y: y - current.y }
        };
        mapState.nodeWasDragged = false;
        setAreaInteracting(true);
      } else {
        mapState.areaDrag = {
          ids: [...mapState.selectionIds],
          start: { x, y },
          origin: mapState.selectionIds.map(id => {
            const source = mapState.positions[id] || positions[id] || { x: 0, y: 0 };
            return { id, pos: { ...source } };
          }),
          moved: false
        };
        mapState.nodeWasDragged = false;
        setAreaInteracting(true);
      }
      refreshCursor({ keepOverride: false });
    };

    circle.addEventListener('mousedown', handleNodePointerDown);

    circle.addEventListener('click', async e => {
      e.stopPropagation();
      if (mapState.tool === TOOL.NAVIGATE) {
        if (!mapState.nodeWasDragged) showPopup(it);
        mapState.nodeWasDragged = false;
      } else if (mapState.tool === TOOL.HIDE) {
        if (confirm(`Remove ${titleOf(it)} from the map?`)) {
          await setNodeHidden(it.id, true);
          await renderMap(root);
        }
      } else if (mapState.tool === TOOL.ADD_LINK) {
        await handleAddLinkClick(it.id);
      }
    });

    circle.addEventListener('mouseenter', () => {
      if (mapState.tool === TOOL.HIDE) {
        applyCursorOverride('hide');
      } else if (mapState.tool === TOOL.ADD_LINK) {
        applyCursorOverride('link');
      }
    });

    circle.addEventListener('mouseleave', () => {
      if (mapState.tool === TOOL.HIDE) {
        clearCursorOverride('hide');
      }
      if (mapState.tool === TOOL.ADD_LINK) {
        clearCursorOverride('link');
      }
    });

    g.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y - (baseR + 8));
    text.setAttribute('class', 'map-label');
    text.dataset.id = it.id;
    text.textContent = it.name || it.concept || '?';
    text.addEventListener('mousedown', handleNodePointerDown);
    g.appendChild(text);

    mapState.elements.set(it.id, { circle, label: text });
  });

  updateSelectionHighlight();
  updatePendingHighlight();

  updateViewBox();
  refreshCursor();
}

function ensureListeners() {
  if (mapState.listenersAttached || typeof window === 'undefined') return;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  mapState.listenersAttached = true;
  if (!window._mapResizeAttached) {
    window.addEventListener('resize', adjustScale);
    window._mapResizeAttached = true;
  }
  if (!window._mapToolboxResizeAttached) {
    window.addEventListener('resize', ensureToolboxWithinBounds);
    window._mapToolboxResizeAttached = true;
  }
}

function attachSvgEvents(svg) {
  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target !== svg) return;
    mapState.justCompletedSelection = false;
    if (mapState.tool !== TOOL.AREA) {
      e.preventDefault();
      mapState.draggingView = true;
      mapState.lastPointer = { x: e.clientX, y: e.clientY };
      setAreaInteracting(true);
      refreshCursor({ keepOverride: false });
    } else if (mapState.tool === TOOL.AREA) {
      e.preventDefault();
      mapState.selectionRect = {
        start: { x: e.clientX, y: e.clientY },
        current: { x: e.clientX, y: e.clientY }
      };
      mapState.selectionBox.classList.remove('hidden');
      setAreaInteracting(true);
    }
  });

  svg.addEventListener('click', e => {
    if (mapState.tool !== TOOL.AREA) return;
    if (e.target !== svg) return;
    if (mapState.justCompletedSelection) {
      mapState.justCompletedSelection = false;
      return;
    }
    if (mapState.selectionIds.length || mapState.previewSelection) {
      mapState.selectionIds = [];
      mapState.previewSelection = null;
      updateSelectionHighlight();
    }
    setAreaInteracting(false);
  });

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.9 : 1.1;
    const rect = svg.getBoundingClientRect();
    const mx = mapState.viewBox.x + ((e.clientX - rect.left) / rect.width) * mapState.viewBox.w;
    const my = mapState.viewBox.y + ((e.clientY - rect.top) / rect.height) * mapState.viewBox.h;
    const maxSize = mapState.sizeLimit || 2000;
    const minSize = mapState.minView || 100;
    const nextW = Math.max(minSize, Math.min(maxSize, mapState.viewBox.w * factor));
    mapState.viewBox.w = nextW;
    mapState.viewBox.h = nextW;
    mapState.viewBox.x = mx - ((e.clientX - rect.left) / rect.width) * mapState.viewBox.w;
    mapState.viewBox.y = my - ((e.clientY - rect.top) / rect.height) * mapState.viewBox.h;
    mapState.updateViewBox();
  }, { passive: false });
}

function handleMouseMove(e) {
  if (!mapState.svg) return;

  if (mapState.toolboxDrag) {
    moveToolboxDrag(e.clientX, e.clientY);
    return;
  }

  if (mapState.menuDrag) {
    updateMenuDragPosition(e.clientX, e.clientY);
    return;
  }

  if (mapState.nodeDrag) {
    const { circle, label } = mapState.elements.get(mapState.nodeDrag.id) || {};
    if (!circle) return;
    const { x, y } = clientToMap(e.clientX, e.clientY);
    const nx = x - mapState.nodeDrag.offset.x;
    const ny = y - mapState.nodeDrag.offset.y;
    mapState.positions[mapState.nodeDrag.id] = { x: nx, y: ny };
    circle.setAttribute('cx', nx);
    circle.setAttribute('cy', ny);
    if (label) {
      label.setAttribute('x', nx);
      const baseR = Number(circle.dataset.radius) || 20;
      label.setAttribute('y', ny - (baseR + 8));
    }
    updateEdgesFor(mapState.nodeDrag.id);
    mapState.nodeWasDragged = true;
    return;
  }

  if (mapState.areaDrag) {
    updateAutoPanFromPointer(e.clientX, e.clientY);
    const { x, y } = clientToMap(e.clientX, e.clientY);
    const dx = x - mapState.areaDrag.start.x;
    const dy = y - mapState.areaDrag.start.y;
    mapState.areaDrag.moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    mapState.areaDrag.origin.forEach(({ id, pos }) => {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      mapState.positions[id] = { x: nx, y: ny };
      const entry = mapState.elements.get(id);
      if (entry) {
        entry.circle.setAttribute('cx', nx);
        entry.circle.setAttribute('cy', ny);
        entry.label.setAttribute('x', nx);
        const baseR = Number(entry.circle.dataset.radius) || 20;
        entry.label.setAttribute('y', ny - (baseR + 8));
      }
      updateEdgesFor(id);
    });
    mapState.nodeWasDragged = true;
    return;
  }

  if (mapState.draggingView) {
    const scale = mapState.viewBox.w / mapState.svg.clientWidth;
    mapState.viewBox.x -= (e.clientX - mapState.lastPointer.x) * scale;
    mapState.viewBox.y -= (e.clientY - mapState.lastPointer.y) * scale;
    mapState.lastPointer = { x: e.clientX, y: e.clientY };
    mapState.updateViewBox();
    return;
  }

  if (mapState.selectionRect) {
    updateAutoPanFromPointer(e.clientX, e.clientY);
    mapState.selectionRect.current = { x: e.clientX, y: e.clientY };
    updateSelectionBox();
  }
}

async function handleMouseUp(e) {
  if (!mapState.svg) return;

  if (mapState.toolboxDrag) {
    stopToolboxDrag();
  }

  if (mapState.menuDrag) {
    await finishMenuDrag(e.clientX, e.clientY);
    return;
  }

  let cursorNeedsRefresh = false;

  if (mapState.nodeDrag) {
    const id = mapState.nodeDrag.id;
    mapState.nodeDrag = null;
    cursorNeedsRefresh = true;
    if (mapState.nodeWasDragged) {
      await persistNodePosition(id);
    }
    mapState.nodeWasDragged = false;
    setAreaInteracting(false);
  }

  if (mapState.areaDrag) {
    const moved = mapState.areaDrag.moved;
    const ids = mapState.areaDrag.ids;
    mapState.areaDrag = null;
    cursorNeedsRefresh = true;
    if (moved) {
      await Promise.all(ids.map(id => persistNodePosition(id)));
    }
    mapState.nodeWasDragged = false;
    stopAutoPan();
    setAreaInteracting(false);
  }

  if (mapState.draggingView) {
    mapState.draggingView = false;
    cursorNeedsRefresh = true;
    setAreaInteracting(false);
  }

  if (mapState.selectionRect) {
    const selected = computeSelectionFromRect();
    mapState.selectionIds = selected;
    mapState.previewSelection = null;
    mapState.selectionRect = null;
    mapState.selectionBox.classList.add('hidden');
    updateSelectionHighlight();
    stopAutoPan();
    setAreaInteracting(false);
    mapState.justCompletedSelection = true;
  }

  if (cursorNeedsRefresh) {
    refreshCursor({ keepOverride: true });
  }
}

function clientToMap(clientX, clientY) {
  if (!mapState.svg) return { x: 0, y: 0 };
  const rect = mapState.svg.getBoundingClientRect();
  const x = mapState.viewBox.x + ((clientX - rect.left) / rect.width) * mapState.viewBox.w;
  const y = mapState.viewBox.y + ((clientY - rect.top) / rect.height) * mapState.viewBox.h;
  return { x, y };
}

function updateSelectionBox() {
  if (!mapState.selectionRect || !mapState.selectionBox || !mapState.svg) return;
  const { start, current } = mapState.selectionRect;
  const rect = mapState.svg.getBoundingClientRect();
  const left = Math.min(start.x, current.x) - rect.left;
  const top = Math.min(start.y, current.y) - rect.top;
  const width = Math.abs(start.x - current.x);
  const height = Math.abs(start.y - current.y);
  mapState.selectionBox.style.left = `${left}px`;
  mapState.selectionBox.style.top = `${top}px`;
  mapState.selectionBox.style.width = `${width}px`;
  mapState.selectionBox.style.height = `${height}px`;

  const from = clientToMap(start.x, start.y);
  const to = clientToMap(current.x, current.y);
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const preview = [];
  Object.entries(mapState.positions).forEach(([id, pos]) => {
    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
      preview.push(id);
    }
  });
  mapState.previewSelection = preview;
  updateSelectionHighlight();
}

function updateAutoPanFromPointer(clientX, clientY) {
  if (!mapState.svg || mapState.tool !== TOOL.AREA) return;
  const vector = computeAutoPanVector(clientX, clientY);
  if (vector) {
    startAutoPan(vector);
  } else {
    stopAutoPan();
  }
}

function computeAutoPanVector(clientX, clientY) {
  const rect = mapState.svg.getBoundingClientRect();
  const threshold = 40;
  const baseSpeed = 25;
  let dx = 0;
  let dy = 0;

  const leftDist = clientX - rect.left;
  const rightDist = rect.right - clientX;
  const topDist = clientY - rect.top;
  const bottomDist = rect.bottom - clientY;

  if (leftDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - leftDist) / threshold);
    dx -= intensity * baseSpeed;
  } else if (rightDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - rightDist) / threshold);
    dx += intensity * baseSpeed;
  }

  if (topDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - topDist) / threshold);
    dy -= intensity * baseSpeed;
  } else if (bottomDist < threshold) {
    const intensity = Math.min(1, Math.max(0, threshold - bottomDist) / threshold);
    dy += intensity * baseSpeed;
  }

  if (dx || dy) {
    return { dx, dy };
  }
  return null;
}

function startAutoPan(vector) {
  mapState.autoPan = vector;
  applyAutoPan(vector);
  if (typeof window === 'undefined') return;
  if (mapState.autoPanFrame) return;
  const step = () => {
    if (!mapState.autoPan) {
      mapState.autoPanFrame = null;
      return;
    }
    applyAutoPan(mapState.autoPan);
    mapState.autoPanFrame = window.requestAnimationFrame(step);
  };
  mapState.autoPanFrame = window.requestAnimationFrame(step);
}

function applyAutoPan(vector) {
  if (!mapState.svg || !mapState.viewBox || !mapState.updateViewBox) return;
  const rect = mapState.svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const scaleX = mapState.viewBox.w / rect.width;
  const scaleY = mapState.viewBox.h / rect.height;
  mapState.viewBox.x += vector.dx * scaleX;
  mapState.viewBox.y += vector.dy * scaleY;
  mapState.updateViewBox();
}

function stopAutoPan() {
  mapState.autoPan = null;
  if (mapState.autoPanFrame && typeof window !== 'undefined') {
    window.cancelAnimationFrame(mapState.autoPanFrame);
  }
  mapState.autoPanFrame = null;
}

function computeSelectionFromRect() {
  if (mapState.previewSelection) return mapState.previewSelection.slice();
  return mapState.selectionIds.slice();
}

function updateSelectionHighlight() {
  const ids = mapState.previewSelection || mapState.selectionIds;
  const set = new Set(ids);
  mapState.elements.forEach(({ circle, label }, id) => {
    if (set.has(id)) {
      circle.classList.add('selected');
      label.classList.add('selected');
    } else {
      circle.classList.remove('selected');
      label.classList.remove('selected');
    }
  });
}

function updatePendingHighlight() {
  mapState.elements.forEach(({ circle, label }, id) => {
    if (mapState.pendingLink === id) {
      circle.classList.add('pending');
      label.classList.add('pending');
    } else {
      circle.classList.remove('pending');
      label.classList.remove('pending');
    }
  });
}

function updateEdgesFor(id) {
  if (!mapState.g) return;
  mapState.g.querySelectorAll(`path[data-a='${id}'], path[data-b='${id}']`).forEach(edge => {
    edge.setAttribute('d', calcPath(edge.dataset.a, edge.dataset.b));
  });
}

function buildToolbox(container, hiddenNodeCount, hiddenLinkCount) {
  const tools = [
    { id: TOOL.NAVIGATE, icon: '🧭', label: 'Navigate' },
    { id: TOOL.HIDE, icon: '🪄', label: 'Hide' },
    { id: TOOL.BREAK, icon: '✂️', label: 'Break link' },
    { id: TOOL.ADD_LINK, icon: '🔗', label: 'Add link' },
    { id: TOOL.AREA, icon: '📦', label: 'Select area' }
  ];

  const box = document.createElement('div');
  box.className = 'map-toolbox';
  box.style.left = `${mapState.toolboxPos.x}px`;
  box.style.top = `${mapState.toolboxPos.y}px`;
  mapState.toolboxEl = box;
  mapState.toolboxContainer = container;

  box.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    if (event.target.closest('.map-tool') || event.target.closest('.map-toolbox-drag')) return;
    startToolboxDrag(event);
  });

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'map-toolbox-drag';
  handle.setAttribute('aria-label', 'Drag toolbar');
  handle.innerHTML = '<span>⋮</span>';
  handle.addEventListener('mousedown', startToolboxDrag);
  box.appendChild(handle);

  const list = document.createElement('div');
  list.className = 'map-tool-list';
  tools.forEach(tool => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-tool' + (mapState.tool === tool.id ? ' active' : '');
    btn.textContent = tool.icon;
    btn.title = tool.label;
    btn.addEventListener('click', () => {
      if (mapState.tool !== tool.id) {
        mapState.tool = tool.id;
        if (tool.id !== TOOL.AREA) {
          mapState.selectionIds = [];
          mapState.previewSelection = null;
        }
        if (tool.id !== TOOL.ADD_LINK) {
          mapState.pendingLink = null;
        }
        if (tool.id === TOOL.HIDE) {
          mapState.hiddenMenuTab = mapState.hiddenMenuTab === 'links' ? 'links' : 'nodes';
          mapState.panelVisible = true;
        }
        mapState.cursorOverride = null;
        renderMap(mapState.root);
      }
    });
    list.appendChild(btn);
  });
  box.appendChild(list);

  const badges = document.createElement('div');
  badges.className = 'map-tool-badges';
  const nodeBadge = document.createElement('span');
  nodeBadge.className = 'map-tool-badge';
  nodeBadge.setAttribute('title', `${hiddenNodeCount} hidden node${hiddenNodeCount === 1 ? '' : 's'}`);
  nodeBadge.innerHTML = `<span>🙈</span><strong>${hiddenNodeCount}</strong>`;
  badges.appendChild(nodeBadge);

  const linkBadge = document.createElement('span');
  linkBadge.className = 'map-tool-badge';
  linkBadge.setAttribute('title', `${hiddenLinkCount} hidden link${hiddenLinkCount === 1 ? '' : 's'}`);
  linkBadge.innerHTML = `<span>🕸️</span><strong>${hiddenLinkCount}</strong>`;
  badges.appendChild(linkBadge);

  box.appendChild(badges);

  container.appendChild(box);
  ensureToolboxWithinBounds();
}

function buildHiddenPanel(container, hiddenNodes, hiddenLinks) {
  const allowPanel = mapState.tool === TOOL.HIDE;
  const panel = document.createElement('div');
  panel.className = 'map-hidden-panel';
  if (!(allowPanel && mapState.panelVisible)) {
    panel.classList.add('hidden');
  }

  const header = document.createElement('div');
  header.className = 'map-hidden-header';

  const tabs = document.createElement('div');
  tabs.className = 'map-hidden-tabs';

  const nodeTab = document.createElement('button');
  nodeTab.type = 'button';
  nodeTab.textContent = `Nodes (${hiddenNodes.length})`;
  nodeTab.className = mapState.hiddenMenuTab === 'nodes' ? 'active' : '';
  nodeTab.addEventListener('click', () => {
    mapState.hiddenMenuTab = 'nodes';
    renderMap(mapState.root);
  });
  tabs.appendChild(nodeTab);

  const linkTab = document.createElement('button');
  linkTab.type = 'button';
  linkTab.textContent = `Links (${hiddenLinks.length})`;
  linkTab.className = mapState.hiddenMenuTab === 'links' ? 'active' : '';
  linkTab.addEventListener('click', () => {
    mapState.hiddenMenuTab = 'links';
    renderMap(mapState.root);
  });
  tabs.appendChild(linkTab);

  header.appendChild(tabs);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'map-hidden-close';
  closeBtn.textContent = mapState.panelVisible ? 'Hide' : 'Show';
  closeBtn.addEventListener('click', () => {
    mapState.panelVisible = !mapState.panelVisible;
    renderMap(mapState.root);
  });
  header.appendChild(closeBtn);

  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'map-hidden-body';

  if (mapState.hiddenMenuTab === 'nodes') {
    const list = document.createElement('div');
    list.className = 'map-hidden-list';
    if (hiddenNodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'map-hidden-empty';
      empty.textContent = 'No hidden nodes.';
      list.appendChild(empty);
    } else {
      hiddenNodes
        .slice()
        .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
        .forEach(it => {
          const item = document.createElement('div');
          item.className = 'map-hidden-item';
          item.classList.add('draggable');
          item.textContent = titleOf(it) || it.id;
          item.addEventListener('mousedown', e => {
            if (mapState.tool !== TOOL.HIDE) return;
            startMenuDrag(it, e);
          });
          list.appendChild(item);
        });
    }
    body.appendChild(list);
  } else {
    const list = document.createElement('div');
    list.className = 'map-hidden-list';
    if (hiddenLinks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'map-hidden-empty';
      empty.textContent = 'No hidden links.';
      list.appendChild(empty);
    } else {
      hiddenLinks.forEach(link => {
        const item = document.createElement('div');
        item.className = 'map-hidden-item';
        const label = document.createElement('span');
        label.textContent = `${titleOf(link.a)} ↔ ${titleOf(link.b)}`;
        item.appendChild(label);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Unhide';
        btn.addEventListener('click', async () => {
          await setLinkHidden(link.a.id, link.b.id, false);
          await renderMap(mapState.root);
        });
        item.appendChild(btn);
        list.appendChild(item);
      });
    }
    body.appendChild(list);
  }

  panel.appendChild(body);

  container.appendChild(panel);

  if (allowPanel && !mapState.panelVisible) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'map-hidden-toggle';
    toggle.textContent = 'Show menu';
    toggle.addEventListener('click', () => {
      mapState.panelVisible = true;
      renderMap(mapState.root);
    });
    container.appendChild(toggle);
  }
}

function startMenuDrag(item, event) {
  event.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'map-drag-ghost';
  ghost.textContent = titleOf(item) || item.id;
  document.body.appendChild(ghost);
  mapState.menuDrag = { id: item.id, ghost };
  updateMenuDragPosition(event.clientX, event.clientY);
}

async function finishMenuDrag(clientX, clientY) {
  const drag = mapState.menuDrag;
  mapState.menuDrag = null;
  if (drag?.ghost) drag.ghost.remove();
  if (!drag || !mapState.svg) return;
  const rect = mapState.svg.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return;
  }
  const { x, y } = clientToMap(clientX, clientY);
  const item = await getItem(drag.id);
  if (!item) return;
  item.mapHidden = false;
  item.mapPos = { x, y };
  await upsertItem(item);
  await renderMap(mapState.root);
}

function updateMenuDragPosition(clientX, clientY) {
  if (!mapState.menuDrag?.ghost) return;
  mapState.menuDrag.ghost.style.left = `${clientX + 12}px`;
  mapState.menuDrag.ghost.style.top = `${clientY + 12}px`;
}

function startToolboxDrag(event) {
  if (event.button !== 0) return;
  if (!mapState.toolboxEl || !mapState.toolboxContainer) return;
  if (event.target.closest('.map-toolbox-toggle')) return;
  event.preventDefault();
  const boxRect = mapState.toolboxEl.getBoundingClientRect();
  const containerRect = mapState.toolboxContainer.getBoundingClientRect();
  mapState.toolboxDrag = {
    offsetX: event.clientX - boxRect.left,
    offsetY: event.clientY - boxRect.top,
    boxWidth: boxRect.width,
    boxHeight: boxRect.height,
    containerRect
  };
  if (typeof document !== 'undefined') {
    document.body.classList.add('map-toolbox-dragging');
  }
}

function moveToolboxDrag(clientX, clientY) {
  const drag = mapState.toolboxDrag;
  if (!drag || !mapState.toolboxEl) return;
  const { containerRect, offsetX, offsetY, boxWidth, boxHeight } = drag;
  const width = containerRect.width;
  const height = containerRect.height;
  if (!width || !height) return;
  let x = clientX - containerRect.left - offsetX;
  let y = clientY - containerRect.top - offsetY;
  const maxX = Math.max(0, width - boxWidth);
  const maxY = Math.max(0, height - boxHeight);
  x = clamp(x, 0, maxX);
  y = clamp(y, 0, maxY);
  mapState.toolboxPos = { x, y };
  mapState.toolboxEl.style.left = `${x}px`;
  mapState.toolboxEl.style.top = `${y}px`;
}

function stopToolboxDrag() {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('map-toolbox-dragging');
  }
  if (!mapState.toolboxDrag) {
    ensureToolboxWithinBounds();
    return;
  }
  mapState.toolboxDrag = null;
  ensureToolboxWithinBounds();
}

function ensureToolboxWithinBounds() {
  const box = mapState.toolboxEl;
  const container = mapState.toolboxContainer;
  if (!box || !container || !box.isConnected || !container.isConnected) return;
  const containerRect = container.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;
  if (!width || !height) return;
  const maxX = Math.max(0, width - boxRect.width);
  const maxY = Math.max(0, height - boxRect.height);
  const x = clamp(mapState.toolboxPos.x, 0, maxX);
  const y = clamp(mapState.toolboxPos.y, 0, maxY);
  mapState.toolboxPos = { x, y };
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

function determineBaseCursor() {
  if (mapState.draggingView || mapState.nodeDrag || mapState.areaDrag) return 'grabbing';
  switch (mapState.tool) {
    case TOOL.AREA:
      return 'crosshair';
    case TOOL.NAVIGATE:
      return 'grab';
    case TOOL.HIDE:
    case TOOL.BREAK:
    case TOOL.ADD_LINK:
      return 'grab';
    default:
      return 'pointer';
  }
}

function refreshCursor(options = {}) {
  if (!mapState.svg) return;
  const { keepOverride = false } = options;
  const base = determineBaseCursor();
  mapState.baseCursor = base;
  if (mapState.cursorOverride) {
    const overrideStyle = CURSOR_STYLE[mapState.cursorOverride];
    if (keepOverride && overrideStyle) {
      mapState.svg.style.cursor = overrideStyle;
      return;
    }
    mapState.cursorOverride = null;
  }
  mapState.svg.style.cursor = base;
}

function applyCursorOverride(kind) {
  if (!mapState.svg) return;
  if (mapState.nodeDrag || mapState.areaDrag || mapState.draggingView) return;
  const style = CURSOR_STYLE[kind];
  if (!style) return;
  mapState.cursorOverride = kind;
  mapState.svg.style.cursor = style;
}

function clearCursorOverride(kind) {
  if (mapState.cursorOverride !== kind) return;
  mapState.cursorOverride = null;
  refreshCursor();
}

async function persistNodePosition(id) {
  const item = mapState.itemMap[id];
  if (!item) return;
  const next = { ...item, mapPos: { ...mapState.positions[id] } };
  mapState.itemMap[id] = next;
  await upsertItem(next);
}

function gatherHiddenLinks(items, itemMap) {
  const hidden = [];
  const seen = new Set();
  items.forEach(it => {
    (it.links || []).forEach(link => {
      if (!link.hidden) return;
      const other = itemMap[link.id];
      if (!other) return;
      const key = it.id < link.id ? `${it.id}|${link.id}` : `${link.id}|${it.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      hidden.push({ a: it, b: other });
    });
  });
  return hidden;
}

async function handleAddLinkClick(nodeId) {
  if (!mapState.pendingLink) {
    mapState.pendingLink = nodeId;
    updatePendingHighlight();
    return;
  }
  if (mapState.pendingLink === nodeId) {
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  const from = mapState.itemMap[mapState.pendingLink];
  const to = mapState.itemMap[nodeId];
  if (!from || !to) {
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  const existing = (from.links || []).find(l => l.id === nodeId);
  if (existing) {
    if (existing.hidden) {
      if (confirm('A hidden link already exists. Unhide it?')) {
        await setLinkHidden(from.id, to.id, false);
        await renderMap(mapState.root);
      }
    } else {
      alert('These concepts are already linked.');
    }
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  if (!confirm(`Create a link between ${titleOf(from)} and ${titleOf(to)}?`)) {
    mapState.pendingLink = null;
    updatePendingHighlight();
    return;
  }
  const label = prompt('Optional label for this link:', '') || '';
  await createLink(from.id, to.id, { name: label, color: DEFAULT_LINK_COLOR, style: 'solid', hidden: false });
  mapState.pendingLink = null;
  updatePendingHighlight();
  await renderMap(mapState.root);
}

function handleEdgeClick(path, aId, bId, evt) {
  if (mapState.tool === TOOL.NAVIGATE) {
    openLineMenu(evt, path, aId, bId);
  } else if (mapState.tool === TOOL.BREAK) {
    if (confirm('Are you sure you want to delete this link?')) {
      removeLink(aId, bId).then(() => renderMap(mapState.root));
    }
  } else if (mapState.tool === TOOL.HIDE) {
    if (confirm('Hide this link on the map?')) {
      setLinkHidden(aId, bId, true).then(() => renderMap(mapState.root));
    }
  }
}

function adjustScale() {
  const svg = mapState.svg;
  if (!svg) return;
  const vb = svg.getAttribute('viewBox');
  if (!vb) return;
  const [,, w] = vb.split(' ').map(Number);
  if (!Number.isFinite(w) || w <= 0) return;
  const defaultSize = Number.isFinite(mapState.defaultViewSize) ? mapState.defaultViewSize : w;
  const zoomInRatio = defaultSize / w;
  const zoomOutRatio = w / defaultSize;
  const nodeScale = clamp(Math.pow(zoomInRatio, 0.4), 0.7, 2.1);
  const labelScale = clamp(Math.pow(zoomOutRatio, 0.45), 1, 2.3);
  const lineScale = clamp(Math.pow(zoomInRatio, 0.25), 0.7, 2);

  mapState.elements.forEach(({ circle, label }) => {
    const baseR = Number(circle.dataset.radius) || 20;
    const scaledRadius = baseR * nodeScale;
    circle.setAttribute('r', scaledRadius);
    const pos = mapState.positions[circle.dataset.id];
    if (pos && label) {
      label.setAttribute('font-size', 13 * labelScale);
      const offset = (baseR + 8) * nodeScale + (labelScale - 1) * 4;
      label.setAttribute('y', pos.y - offset);
    }
  });
  svg.querySelectorAll('.map-edge').forEach(line => {
    line.setAttribute('stroke-width', 4 * lineScale);
  });
}

function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function calcPath(aId, bId) {
  const positions = mapState.positions;
  const a = positions[aId];
  const b = positions[bId];
  if (!a || !b) return '';
  const x1 = a.x, y1 = a.y;
  const x2 = b.x, y2 = b.y;
  let cx = (x1 + x2) / 2;
  let cy = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  for (const id in positions) {
    if (id === aId || id === bId) continue;
    const p = positions[id];
    if (pointToSegment(p.x, p.y, x1, y1, x2, y2) < 40) {
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

function applyLineStyle(line, info) {
  const color = info.color || 'var(--gray)';
  line.style.stroke = color;
  if (info.style === 'dashed') line.setAttribute('stroke-dasharray', '4,4');
  else line.removeAttribute('stroke-dasharray');
  if (info.style === 'arrow') line.setAttribute('marker-end', 'url(#arrow)');
  else line.removeAttribute('marker-end');
  let title = line.querySelector('title');
  if (!title) {
    title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    line.appendChild(title);
  }
  title.textContent = info.name || '';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function setNodeHidden(id, hidden) {
  const item = await getItem(id);
  if (!item) return;
  item.mapHidden = hidden;
  await upsertItem(item);
}

async function createLink(aId, bId, info) {
  const a = await getItem(aId);
  const b = await getItem(bId);
  if (!a || !b) return;
  const linkInfo = { id: bId, style: 'solid', color: DEFAULT_LINK_COLOR, name: '', hidden: false, ...info };
  const reverseInfo = { ...linkInfo, id: aId };
  a.links = a.links || [];
  b.links = b.links || [];
  a.links.push({ ...linkInfo });
  b.links.push({ ...reverseInfo });
  await upsertItem(a);
  await upsertItem(b);
}

async function removeLink(aId, bId) {
  const a = await getItem(aId);
  const b = await getItem(bId);
  if (!a || !b) return;
  a.links = (a.links || []).filter(l => l.id !== bId);
  b.links = (b.links || []).filter(l => l.id !== aId);
  await upsertItem(a);
  await upsertItem(b);
}

async function setLinkHidden(aId, bId, hidden) {
  await updateLink(aId, bId, { hidden });
}

function titleOf(item) {
  return item?.name || item?.concept || '';
}

async function openLineMenu(evt, line, aId, bId) {
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
  ['solid', 'dashed', 'arrow'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
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

async function updateLink(aId, bId, patch) {
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
