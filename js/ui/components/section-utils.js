import { sectionDefsForKind } from './sections.js';
import { hasRichTextContent } from './rich-text.js';

const EXTRA_PREFIX = 'extra:';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExtras(item) {
  if (Array.isArray(item?.extras) && item.extras.length) {
    return item.extras
      .map((extra, index) => {
        if (!extra || typeof extra !== 'object') return null;
        const body = typeof extra.body === 'string' ? extra.body : '';
        if (!hasRichTextContent(body)) return null;
        const id = extra.id != null ? String(extra.id) : String(index);
        return {
          id,
          title: typeof extra.title === 'string' && extra.title.trim() ? extra.title.trim() : 'Additional Section',
          body
        };
      })
      .filter(Boolean);
  }
  if (Array.isArray(item?.facts) && item.facts.length) {
    return [
      {
        id: 'legacy-facts',
        title: 'Highlights',
        body: `<ul>${item.facts.map(fact => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>`
      }
    ];
  }
  return [];
}

function extraKeyFor(extra, index) {
  const rawId = extra?.id != null ? String(extra.id) : String(index);
  return `${EXTRA_PREFIX}${rawId}`;
}

export function hasSectionContent(item, key) {
  if (!item || !key) return false;
  const defs = sectionDefsForKind(item.kind);
  if (!defs.some(def => def.key === key)) return false;
  const raw = item[key];
  if (raw === null || raw === undefined) return false;
  return hasRichTextContent(raw);
}

export function sectionsForItem(item, allowedKeys = null) {
  const defs = sectionDefsForKind(item.kind);
  const allowSet = allowedKeys ? new Set(allowedKeys) : null;
  const sections = defs
    .filter(def => (!allowSet || allowSet.has(def.key)) && hasSectionContent(item, def.key))
    .map(def => ({
      key: def.key,
      label: def.label,
      body: item?.[def.key] || '',
      isExtra: false
    }));

  const extras = normalizeExtras(item);
  extras.forEach((extra, index) => {
    const key = extraKeyFor(extra, index);
    sections.push({
      key,
      label: extra.title || 'Additional Section',
      body: extra.body,
      isExtra: true
    });
  });

  return sections;
}

export function getSectionLabel(item, key) {
  const defs = sectionDefsForKind(item.kind);
  const def = defs.find(entry => entry.key === key);
  if (def) return def.label;
  if (typeof key === 'string' && key.startsWith(EXTRA_PREFIX)) {
    const extras = normalizeExtras(item);
    const match = extras.find((extra, index) => extraKeyFor(extra, index) === key);
    if (match) return match.title || 'Custom Section';
    return 'Custom Section';
  }
  return key;
}

export function isExtraSectionKey(key) {
  return typeof key === 'string' && key.startsWith(EXTRA_PREFIX);
}
