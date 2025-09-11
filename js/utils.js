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
