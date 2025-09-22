import { DEFAULT_PASS_COLORS } from '../../lectures/scheduler.js';

let palette = DEFAULT_PASS_COLORS.slice();

function normalizePalette(colors = []) {
  if (!Array.isArray(colors) || !colors.length) {
    return DEFAULT_PASS_COLORS.slice();
  }
  return colors.map((color, index) => {
    if (typeof color === 'string') {
      const trimmed = color.trim();
      if (trimmed) return trimmed;
    }
    return DEFAULT_PASS_COLORS[index % DEFAULT_PASS_COLORS.length];
  });
}

export function setPassColorPalette(colors) {
  palette = normalizePalette(colors);
}

export function getPassColorPalette() {
  return (palette.length ? palette : DEFAULT_PASS_COLORS).slice();
}

export function passColorForOrder(order = 1) {
  const list = palette.length ? palette : DEFAULT_PASS_COLORS;
  if (!Number.isFinite(order)) {
    return list[0] || DEFAULT_PASS_COLORS[0];
  }
  const index = Math.max(0, Math.floor(order) - 1) % list.length;
  return list[index];
}

export { DEFAULT_PASS_COLORS };
