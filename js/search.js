const contentFields = [
  'etiology','pathophys','clinical','diagnosis','treatment','complications','mnemonic',
  'class','source','moa','uses','sideEffects','contraindications',
  'type','definition','mechanism','clinicalRelevance','example'
];

function stripHtml(value = '') {
  return value
    .replace(/<br\s*\/?>(\s*)/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[#a-z0-9]+;/gi, ' ');
}

export function tokenize(str) {
  return str.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

export function buildTokens(item) {
  const fields = [];
  if (item.name) fields.push(item.name);
  if (item.concept) fields.push(item.concept);
  fields.push(...(item.tags || []));
  if (Array.isArray(item.extras)) {
    item.extras.forEach(extra => {
      if (!extra) return;
      if (extra.title) fields.push(extra.title);
      if (extra.body) fields.push(stripHtml(extra.body));
    });
  } else if (item.facts && item.facts.length) {
    fields.push(...item.facts);
  }
  if (item.lectures) fields.push(...item.lectures.map(l => l.name));
  contentFields.forEach(field => {
    if (typeof item[field] === 'string' && item[field]) {
      fields.push(stripHtml(item[field]));
    }
  });
  return Array.from(new Set(tokenize(fields.join(' ')))).slice(0,200).join(' ');
}

export function buildSearchMeta(item) {
  const pieces = [];
  if (item.name) pieces.push(item.name);
  if (item.concept) pieces.push(item.concept);
  pieces.push(...(item.tags || []));
  pieces.push(...(item.blocks || []));
  if (Array.isArray(item.lectures)) {
    pieces.push(...item.lectures.map(l => l?.name || ''));
  }
  return pieces.join(' ').toLowerCase();
}
