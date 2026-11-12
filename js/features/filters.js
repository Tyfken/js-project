import { norm, year, initial } from '../utils.js';

const PREDICATES = {
  characters: {
    house: (c, v, ctx) => norm(c.hogwartsHouse) === norm(ctx.houses[Number(v)]?.house),
    hasActor: (c) => Boolean(c.interpretedBy),
    hasChildren: (c) => Array.isArray(c.children) && c.children.length > 0,
    decade: (c, v) => Math.floor(year(c.birthdate) / 10) * 10 === Number(v),
    initial: (c, v) => initial(c.fullName) === v,
  },
  books: {
    yearMin: (b, v) => year(b.releaseDate) >= Number(v),
    yearMax: (b, v) => year(b.releaseDate) <= Number(v),
    pagesMin: (b, v) => b.pages >= Number(v),
    pagesMax: (b, v) => b.pages <= Number(v),
  },
  houses: {
    animal: (h, v) => h.index === Number(v),
    color: (h, v) => (h.colors ?? []).includes(v),
  },
  spells: {
    initial: (s, v) => initial(s.spell) === v,
    keyword: (s, v) => norm(s.use).includes(norm(v)),
    words: (s, v) => {
      const count = String(s.spell).trim().split(/\s+/).length;
      return v === '3' ? count >= 3 : count === Number(v);
    },
  },
};

const unique = (list) => [...new Set(list)];
const letters = (names) => unique(names.map(initial).filter(Boolean)).sort().map((l) => [l, l]);

const OPTION_BUILDERS = {
  characters: {
    'f-house': (_, ctx) => ctx.houses.map((h, i) => [i, h.house]),
    'f-decade': (items) => unique(items.map((c) => Math.floor(year(c.birthdate) / 10) * 10).filter(Number.isFinite))
      .sort((a, b) => a - b).map((d) => [d, `${d}s`]),
    'f-char-initial': (items) => letters(items.map((c) => c.fullName)),
  },
  houses: {
    'f-animal': (items) => items.filter((h) => h.animal).map((h) => [h.index, h.animal]),
    'f-color': (items) => unique(items.flatMap((h) => h.colors ?? [])).sort().map((c) => [c, c]),
  },
  spells: { 'f-spell-initial': (items) => letters(items.map((s) => s.spell)) },
};

export function populateFilterOptions(category, items, ctx) {
  for (const [id, build] of Object.entries(OPTION_BUILDERS[category] ?? {})) {
    const select = document.getElementById(id);
    if (!select) continue;
    const previous = select.value;
    select.replaceChildren(select.firstElementChild, ...build(items, ctx).map(([value, label]) => new Option(label, value)));
    select.value = previous;
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  }
}

const isActive = (el) => (el.type === 'checkbox' ? el.checked : el.value.trim() !== '');

function activeControls(category, form) {
  const fieldset = form.querySelector(`[data-for-category="${category}"]`);
  if (!fieldset) return [];
  return [...fieldset.elements].filter((el) => {
    if (!el.name) return false;
    const valid = el.checkValidity();
    el.setAttribute('aria-invalid', String(!valid));
    return valid && isActive(el);
  });
}

export const readFilters = (category, form) =>
  Object.fromEntries(activeControls(category, form).map((el) => [el.name, el.type === 'checkbox' ? true : el.value.trim()]));

export function describeFilters(category, form) {
  return activeControls(category, form).map((el) => {
    const label = el.labels?.[0]?.textContent.trim() ?? el.name;
    const value = el.type === 'checkbox' ? '' : `: ${el.tagName === 'SELECT' ? el.selectedOptions[0].text : el.value.trim()}`;
    return { name: el.name, label: label + value };
  });
}

export function clearControl(category, form, name) {
  const el = form.querySelector(`[data-for-category="${category}"]`)?.elements.namedItem(name);
  if (!el) return;
  if (el.type === 'checkbox') el.checked = false;
  else el.value = '';
}

export function applyFilters(category, items, filters, ctx) {
  const rules = Object.entries(filters);
  if (!rules.length) return items;
  return items.filter((item) => rules.every(([name, value]) => PREDICATES[category][name]?.(item, value, ctx) ?? true));
}
