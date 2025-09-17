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
  fields.push(...(item.facts || []), ...(item.tags || []));
  if (item.lectures) fields.push(...item.lectures.map(l => l.name));
  contentFields.forEach(field => {
    if (typeof item[field] === 'string' && item[field]) {
      fields.push(stripHtml(item[field]));
    }
  });
  return Array.from(new Set(tokenize(fields.join(' ')))).slice(0,200).join(' ');
}
