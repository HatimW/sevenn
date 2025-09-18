export function uid() {
  const g = globalThis;
  return g.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
}

export function debounce(fn, delay = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function setToggleState(element, active, className = 'active') {
  if (!element) return;
  const isActive = Boolean(active);
  if (element.dataset) {
    element.dataset.toggle = 'true';
    element.dataset.active = isActive ? 'true' : 'false';
  }
  if (className && element.classList) {
    element.classList.toggle(className, isActive);
  }
  if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
    const role = element.getAttribute('role');
    if ((element.tagName === 'BUTTON' || role === 'button') && typeof element.setAttribute === 'function') {
      element.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }
}
