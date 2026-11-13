/*
 * FILTERS — Read form controls, build choices, and keep matching items.
 *
 * Data flow: form input -> readFilters -> applyFilters -> sort -> render cards.
 * All active filters must match. For example: Gryffindor AND has children.
 * Filtering happens in the browser, so it works together with server search.
 */

import { normalizeText, getYear, getFirstLetter } from "../utils.js";

/** Add a value only once, using a simple loop instead of a Set abstraction. */
function addUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

/** Replace a select's choices, keeping its first "All" option and current choice. */
function fillSelect(selectId, choices) {
  const select = document.getElementById(selectId);
  if (select === null) return;
  const previousValue = select.value;

  // Remove old data choices from the end. The first option is the translated "All".
  while (select.options.length > 1) {
    select.remove(1);
  }
  for (const choice of choices) {
    select.add(new Option(choice.label, String(choice.value)));
  }

  // Keep the student's selection when it still exists after a language change.
  select.value = previousValue;
  if (select.selectedIndex < 0) {
    select.selectedIndex = 0;
  }
}

/** Build first-letter choices from either character names or spell names. */
function getInitialChoices(items, titleField) {
  const letters = [];
  for (const item of items) {
    const letter = getFirstLetter(item[titleField]);
    if (letter !== "") addUnique(letters, letter);
  }
  letters.sort();

  const choices = [];
  for (const letter of letters) {
    choices.push({ value: letter, label: letter });
  }
  return choices;
}

/** Fill only the controls belonging to the current category. */
export function populateFilterOptions(category, items, houseList) {
  if (category === "characters") {
    const houseChoices = [];
    for (let index = 0; index < houseList.length; index++) {
      houseChoices.push({ value: index, label: houseList[index].house });
    }
    fillSelect("f-house", houseChoices);

    const decades = [];
    for (const character of items) {
      const birthYear = getYear(character.birthdate);
      if (Number.isFinite(birthYear)) {
        // 1980 -> 198; 198 * 10 -> 1980. The whole decade is one choice.
        addUnique(decades, Math.floor(birthYear / 10) * 10);
      }
    }
    decades.sort(function (a, b) {
      return a - b;
    });
    const decadeChoices = [];
    for (const decade of decades) {
      decadeChoices.push({ value: decade, label: `${decade}s` });
    }
    fillSelect("f-decade", decadeChoices);
    fillSelect("f-char-initial", getInitialChoices(items, "fullName"));
  }

  if (category === "houses") {
    const animalChoices = [];
    const colors = [];
    for (const house of items) {
      if (house.animal) {
        animalChoices.push({ value: house.index, label: house.animal });
      }
      if (Array.isArray(house.colors)) {
        for (const color of house.colors) {
          addUnique(colors, color);
        }
      }
    }
    colors.sort();
    const colorChoices = [];
    for (const color of colors) {
      colorChoices.push({ value: color, label: color });
    }
    fillSelect("f-animal", animalChoices);
    fillSelect("f-color", colorChoices);
  }

  if (category === "spells") {
    fillSelect("f-spell-initial", getInitialChoices(items, "spell"));
  }
  // Books use number inputs, so there are no dynamic book choices to build.
}

/** Find checked checkboxes and nonempty, valid inputs in this category only. */
function getActiveControls(category) {
  const form = document.getElementById("filter-form");
  const fieldset = form.querySelector(`[data-for-category="${category}"]`);
  const controls = [];
  if (fieldset === null) return controls;

  for (const control of fieldset.elements) {
    if (!control.name) continue; // Skip controls without a name, such as reset.

    const valid = control.checkValidity();
    control.setAttribute("aria-invalid", String(!valid));
    if (!valid) continue;

    if (control.type === "checkbox" && control.checked) {
      controls.push(control);
    } else if (control.type !== "checkbox" && control.value.trim() !== "") {
      controls.push(control);
    }
  }
  return controls;
}

/** Convert active controls into a simple object: { house: '0', hasChildren: true }. */
export function readFilters(category) {
  const filters = {};
  for (const control of getActiveControls(category)) {
    if (control.type === "checkbox") {
      filters[control.name] = true;
    } else {
      filters[control.name] = control.value.trim();
    }
  }
  return filters;
}

/** Create readable labels for the removable filter chips above the results. */
export function describeFilters(category) {
  const descriptions = [];
  for (const control of getActiveControls(category)) {
    let label = control.name;
    if (control.labels && control.labels.length > 0) {
      label = control.labels[0].textContent.trim();
    }
    if (control.type !== "checkbox") {
      let displayedValue = control.value.trim();
      if (control.tagName === "SELECT") {
        displayedValue = control.selectedOptions[0].text;
      }
      label += `: ${displayedValue}`;
    }
    descriptions.push({ name: control.name, label });
  }
  return descriptions;
}

/** Clear one control when the user clicks its filter chip. */
export function clearFilter(category, name) {
  const form = document.getElementById("filter-form");
  const fieldset = form.querySelector(`[data-for-category="${category}"]`);
  if (fieldset === null) return;
  const control = fieldset.elements.namedItem(name);
  if (control === null) return;

  if (control.type === "checkbox") {
    control.checked = false;
  } else {
    control.value = "";
  }
}

/** Count words without counting extra spaces as words. */
function countWords(text) {
  const parts = String(text ?? "")
    .trim()
    .split(/\s+/);
  let count = 0;
  for (const part of parts) {
    if (part !== "") count++;
  }
  return count;
}

/** Check one item against all active rules. false means exclude the item. */
function itemMatchesFilters(category, item, filters, houseList) {
  for (const name of Object.keys(filters)) {
    const value = filters[name];

    if (category === "characters") {
      if (name === "house") {
        const selectedHouse = houseList[Number(value)];
        if (
          !selectedHouse ||
          normalizeText(item.hogwartsHouse) !==
            normalizeText(selectedHouse.house)
        )
          return false;
      }
      if (name === "hasActor" && !item.interpretedBy) return false;
      if (
        name === "hasChildren" &&
        (!Array.isArray(item.children) || item.children.length === 0)
      )
        return false;
      if (name === "decade") {
        const decade = Math.floor(getYear(item.birthdate) / 10) * 10;
        if (decade !== Number(value)) return false;
      }
      if (name === "initial" && getFirstLetter(item.fullName) !== value)
        return false;
    }

    if (category === "books") {
      if (name === "yearMin" && !(getYear(item.releaseDate) >= Number(value)))
        return false;
      if (name === "yearMax" && !(getYear(item.releaseDate) <= Number(value)))
        return false;
      if (name === "pagesMin" && !(item.pages >= Number(value))) return false;
      if (name === "pagesMax" && !(item.pages <= Number(value))) return false;
    }

    if (category === "houses") {
      if (name === "animal" && item.index !== Number(value)) return false;
      if (
        name === "color" &&
        (!Array.isArray(item.colors) || !item.colors.includes(value))
      )
        return false;
    }

    if (category === "spells") {
      if (name === "initial" && getFirstLetter(item.spell) !== value)
        return false;
      if (
        name === "keyword" &&
        !normalizeText(item.use).includes(normalizeText(value))
      )
        return false;
      if (name === "words") {
        const words = countWords(item.spell);
        if (value === "3" && words < 3) return false;
        if (value !== "3" && words !== Number(value)) return false;
      }
    }
  }
  return true; // No rule failed, so keep this item.
}

/** Return a new list containing only matching items. Empty filters keep everything. */
export function applyFilters(category, items, filters, houseList) {
  const matchingItems = [];
  for (const item of items) {
    if (itemMatchesFilters(category, item, filters, houseList)) {
      matchingItems.push(item);
    }
  }
  return matchingItems;
}
