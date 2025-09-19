import { state } from '../state.js';
import { listItemsByKind } from '../storage/storage.js';

const DEFAULT_KINDS = ['disease', 'drug', 'concept'];

export async function loadReviewSourceItems() {
  const existingCohort = Array.isArray(state.cohort) && state.cohort.length ? state.cohort : null;
  if (existingCohort) {
    return existingCohort;
  }

  const kinds = Array.isArray(state.builder?.types) && state.builder.types.length
    ? state.builder.types
    : DEFAULT_KINDS;

  const seenIds = new Set();
  const items = [];

  for (const kind of kinds) {
    try {
      const entries = await listItemsByKind(kind);
      if (!Array.isArray(entries)) continue;
      for (const item of entries) {
        if (!item) continue;
        const id = item.id || `${kind}::${items.length}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        items.push(item);
      }
    } catch (err) {
      console.warn('Failed to load review items for kind', kind, err);
    }
  }

  return items;
}
