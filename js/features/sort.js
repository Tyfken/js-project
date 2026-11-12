import { year } from '../utils.js';

const sort = (key, labelKey, get, numeric = false) => ({ key, labelKey, get, numeric });

export const SORTS = {
  characters: [
    sort('name', 'sort.name', (c) => c.fullName),
    sort('birth', 'sort.birth', (c) => year(c.birthdate), true),
    sort('children', 'sort.children', (c) => c.children?.length ?? 0, true),
  ],
  books: [
    sort('number', 'sort.number', (b) => b.number, true),
    sort('pages', 'sort.pages', (b) => b.pages, true),
    sort('release', 'sort.release', (b) => year(b.releaseDate), true),
  ],
  houses: [sort('name', 'sort.name', (h) => h.house)],
  spells: [sort('name', 'sort.name', (s) => s.spell)],
};

const isMissing = (v) => v === undefined || v === null || v === '' || Number.isNaN(v);

export function sortItems(category, items, key, dir, lang) {
  const spec = SORTS[category].find((s) => s.key === key) ?? SORTS[category][0];
  const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
  const sign = dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const x = spec.get(a);
    const y = spec.get(b);
    if (isMissing(x) || isMissing(y)) return isMissing(x) === isMissing(y) ? 0 : isMissing(x) ? 1 : -1;
    return sign * (spec.numeric ? x - y : collator.compare(String(x), String(y)));
  });
}
