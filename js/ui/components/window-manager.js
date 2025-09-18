const windows = new Set();
let zIndexCounter = 2000;
let dock;
let dockList;
let dockHandle;

function ensureDock(){
  if (dock) return;
  dock = document.createElement('div');
  dock.className = 'window-dock';

  dockHandle = document.createElement('button');
  dockHandle.type = 'button';
  dockHandle.className = 'window-dock-handle';
  dockHandle.textContent = '🗂';
  dockHandle.addEventListener('click', () => {
    dock.classList.toggle('open');
  });
  dock.appendChild(dockHandle);

  dockList = document.createElement('div');
  dockList.className = 'window-dock-list';
  dock.appendChild(dockList);

  document.body.appendChild(dock);
}

function bringToFront(win){
  if (!win) return;
  zIndexCounter += 1;
  win.style.zIndex = zIndexCounter;
}

function setupDragging(win, header){
  let active = null;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    active = {
      offsetX: e.clientX - win.offsetLeft,
      offsetY: e.clientY - win.offsetTop
    };
    bringToFront(win);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  });

  function handleMove(e){
    if (!active) return;
    const left = e.clientX - active.offsetX;
    const top = e.clientY - active.offsetY;
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
  }

  function stopDrag(){
    active = null;
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', stopDrag);
  }
}

export function createFloatingWindow({ title, width = 520, onClose, onBeforeClose } = {}){
  ensureDock();
  const win = document.createElement('div');
  win.className = 'floating-window';
  win.style.width = typeof width === 'number' ? `${width}px` : width;
  win.style.left = `${120 + windows.size * 32}px`;
  win.style.top = `${100 + windows.size * 24}px`;
  bringToFront(win);

  const header = document.createElement('div');
  header.className = 'floating-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'floating-title';
  titleEl.textContent = title || 'Window';
  header.appendChild(titleEl);

  const actions = document.createElement('div');
  actions.className = 'floating-actions';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.type = 'button';
  minimizeBtn.className = 'floating-action';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.textContent = '—';
  actions.appendChild(minimizeBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'floating-action';
  closeBtn.title = 'Close';
  closeBtn.textContent = '×';
  actions.appendChild(closeBtn);

  header.appendChild(actions);
  win.appendChild(header);

  const body = document.createElement('div');
  body.className = 'floating-body';
  win.appendChild(body);

  let minimized = false;
  let dockButton = null;

  function handleMinimize(){
    if (minimized) {
      restore();
      return;
    }
    minimized = true;
    win.classList.add('minimized');
    win.style.display = 'none';
    dock.classList.add('open');
    dockButton = document.createElement('button');
    dockButton.type = 'button';
    dockButton.className = 'dock-entry';
    dockButton.textContent = titleEl.textContent;
    dockButton.addEventListener('click', () => restore());
    dockList.appendChild(dockButton);
  }

  function destroyDockButton(){
    if (dockButton && dockButton.parentElement) {
      dockButton.parentElement.removeChild(dockButton);
    }
    dockButton = null;
    if (!dockList.childElementCount) {
      dock.classList.remove('open');
    }
  }

  function restore(){
    if (!minimized) return;
    minimized = false;
    win.classList.remove('minimized');
    win.style.display = '';
    bringToFront(win);
    destroyDockButton();
  }

  minimizeBtn.addEventListener('click', handleMinimize);

  async function close(reason){
    if (typeof onBeforeClose === 'function') {
      try {
        const shouldClose = await onBeforeClose(reason);
        if (shouldClose === false) return false;
      } catch (err) {
        console.error(err);
        return false;
      }
    }
    destroyDockButton();
    windows.delete(win);
    if (win.parentElement) win.parentElement.removeChild(win);
    if (typeof onClose === 'function') onClose(reason);
    return true;
  }

  closeBtn.addEventListener('click', () => { void close('close'); });

  function isInteractiveTarget(target){
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('input, textarea, select, [contenteditable="true"], button, label, .rich-editor-area')) {
      return true;
    }
    return false;
  }

  win.addEventListener('mousedown', (event) => {
    if (isInteractiveTarget(event.target)) {
      requestAnimationFrame(() => bringToFront(win));
      return;
    }
    bringToFront(win);
  });

  win.addEventListener('focusin', () => bringToFront(win));

  setupDragging(win, header);

  document.body.appendChild(win);
  windows.add(win);

  return {
    element: win,
    body,
    setContent(node){
      body.innerHTML = '';
      if (node) body.appendChild(node);
    },
    close,
    minimize: handleMinimize,
    restore,
    setTitle(text){
      titleEl.textContent = text;
      if (dockButton) dockButton.textContent = text;
    },
    isMinimized(){
      return minimized;
    },
    focus(){
      bringToFront(win);
    }
  };
}
