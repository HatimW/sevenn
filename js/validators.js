export function cleanItem(item) {
  return {
    ...item,
    favorite: !!item.favorite,
    color: item.color || null,
    facts: item.facts || [],
    tags: item.tags || [],
    links: item.links || [],
    blocks: item.blocks || [],
    weeks: item.weeks || [],
    lectures: item.lectures || [],
    mapPos: item.mapPos || null,
    mapHidden: !!item.mapHidden,
    sr: item.sr || { box:0, last:0, due:0, ease:2.5 }
  };
}
