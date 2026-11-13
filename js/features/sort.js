/*
 * SORT — Decide which property to compare and in which direction.
 * Sorting a copy preserves the API's original order for future searches/filters.
 */

import { getYear } from "../utils.js";

// Each option has a stable key, a translation key, and whether it is numeric.
// There are no function-producing factories or getters hidden inside this table.
export const SORT_OPTIONS = {
  characters: [
    { key: "api", labelKey: "sort.api", numeric: true },
    { key: "name", labelKey: "sort.name", numeric: false },
    { key: "birth", labelKey: "sort.birth", numeric: true },
    { key: "children", labelKey: "sort.children", numeric: true },
  ],
  books: [
    { key: "api", labelKey: "sort.api", numeric: true },
    { key: "number", labelKey: "sort.number", numeric: true },
    { key: "pages", labelKey: "sort.pages", numeric: true },
    { key: "release", labelKey: "sort.release", numeric: true },
  ],
  houses: [
    { key: "api", labelKey: "sort.api", numeric: true },
    { key: "name", labelKey: "sort.name", numeric: false },
  ],
  spells: [
    { key: "api", labelKey: "sort.api", numeric: true },
    { key: "name", labelKey: "sort.name", numeric: false },
  ],
};

/** Read the value used by one sort option. Explicit cases are easy to trace. */
function getSortValue(category, item, key) {
  // "API order" means the item's original index in the API list.
  if (key === "api") return item.index;

  if (category === "characters") {
    if (key === "birth") return getYear(item.birthdate);
    if (key === "children")
      return Array.isArray(item.children) ? item.children.length : 0;
    return item.fullName;
  }
  if (category === "books") {
    if (key === "pages") return item.pages;
    if (key === "release") return getYear(item.releaseDate);
    return item.number;
  }
  if (category === "houses") return item.house;
  return item.spell;
}

/** Missing values should go last, in BOTH ascending and descending order. */
function isMissing(value) {
  return (
    value === undefined || value === null || value === "" || Number.isNaN(value)
  );
}

/** Return a sorted copy of items; never change the input array. */
export function sortItems(category, items, key, direction, language) {
  const options = SORT_OPTIONS[category];
  let selectedOption = options[0];

  // Find the requested option. If it is not valid for this category, use the first.
  for (const option of options) {
    if (option.key === key) {
      selectedOption = option;
      break;
    }
  }

  // Intl.Collator compares words according to the chosen language.
  const collator = new Intl.Collator(language, {
    sensitivity: "base",
    numeric: true,
  });
  const copy = items.slice();

  // sort calls this function with two items. Negative = a first; positive = b first.
  copy.sort(function (a, b) {
    const valueA = getSortValue(category, a, selectedOption.key);
    const valueB = getSortValue(category, b, selectedOption.key);
    const missingA = isMissing(valueA);
    const missingB = isMissing(valueB);

    if (missingA && missingB) return 0;
    if (missingA) return 1;
    if (missingB) return -1;

    let comparison;
    if (selectedOption.numeric) {
      comparison = valueA - valueB;
    } else {
      comparison = collator.compare(String(valueA), String(valueB));
    }

    if (direction === "desc") {
      return -comparison;
    }
    return comparison;
  });
  return copy;
}
