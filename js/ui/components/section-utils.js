import { sectionDefsForKind } from './sections.js';

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasSectionContent(item, key) {
  if (!item || !key) return false;
  const defs = sectionDefsForKind(item.kind);
  if (!defs.some(def => def.key === key)) return false;
  const raw = item[key];
  if (raw === null || raw === undefined) return false;
  return stripHtml(raw).length > 0;
}

export function sectionsForItem(item, allowedKeys = null) {
  const defs = sectionDefsForKind(item.kind);
  const allowSet = allowedKeys ? new Set(allowedKeys) : null;
  return defs
    .filter(def => (!allowSet || allowSet.has(def.key)) && hasSectionContent(item, def.key))
    .map(def => ({ key: def.key, label: def.label }));
}

export function getSectionLabel(item, key) {
  const defs = sectionDefsForKind(item.kind);
  const def = defs.find(entry => entry.key === key);
  return def ? def.label : key;
}
