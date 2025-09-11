export function tokenize(str) {
  return str.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

export function buildTokens(item) {
  const fields = [];
  if (item.name) fields.push(item.name);
  if (item.concept) fields.push(item.concept);
  fields.push(...(item.facts || []), ...(item.tags || []));
  if (item.lectures) fields.push(...item.lectures.map(l => l.name));
  return Array.from(new Set(tokenize(fields.join(' ')))).slice(0,200).join(' ');
}
