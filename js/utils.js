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

function parseDateValue(value) {
  if (!value) return Number.NaN;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? Number.NaN : time;
  }
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.NaN : time;
}

export function findActiveBlockId(blocks, now = Date.now()) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const nowTs = Number.isFinite(now) ? now : Date.now();
  let current = null;
  let upcoming = null;
  let recent = null;

  blocks.forEach(block => {
    if (!block || block.blockId == null) return;
    const id = String(block.blockId);
    const start = parseDateValue(block.startDate);
    const end = parseDateValue(block.endDate);

    const hasStart = Number.isFinite(start);
    const hasEnd = Number.isFinite(end);

    if (hasStart && hasEnd) {
      if (start <= nowTs && nowTs <= end) {
        if (!current || start < current.start || (start === current.start && end < current.end)) {
          current = { id, start, end };
        }
        return;
      }
      if (start > nowTs) {
        if (!upcoming || start < upcoming.start) {
          upcoming = { id, start };
        }
        return;
      }
      if (!recent || end > recent.end) {
        recent = { id, end };
      }
      return;
    }

    if (hasStart) {
      if (start <= nowTs) {
        if (!recent || start > recent.end) {
          recent = { id, end: start };
        }
      } else if (!upcoming || start < upcoming.start) {
        upcoming = { id, start };
      }
      return;
    }

    if (hasEnd) {
      if (nowTs <= end) {
        if (!current || end < current.end) {
          current = { id, start: end, end };
        }
      } else if (!recent || end > recent.end) {
        recent = { id, end };
      }
    }
  });

  if (current) return current.id;
  if (upcoming) return upcoming.id;
  if (recent) return recent.id;

  const first = blocks.find(block => block && block.blockId != null);
  return first ? String(first.blockId) : '';
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
