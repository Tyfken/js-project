/*
 * UI RENDERERS — Turn JavaScript data into visible HTML.
 *
 * Data flow: API object -> clone a <template> -> fill data-field elements
 *            -> add favorite state -> append the card to a list.
 *
 * We use textContent, not innerHTML, for API text. That means a value such as
 * "<img src=x>" is displayed as text and cannot become executable page markup.
 */

import { TITLE_FIELDS, TEMPLATE_IDS, HOUSE_IMAGES } from "../config.js";
import { translate, applyTranslations } from "../i18n/i18n.js";
import { hasValue } from "../utils.js";
import { isFavorite } from "../storage/favorites.js";

// Re-export the central asset paths so older imports keep working.
// To use your own house SVGs, edit js/config.js or replace the files themselves.
export { HOUSE_IMAGES };

// Some API color names are not exact CSS colors. Map them to readable swatches.
const COLOR_MAP = {
  red: "#8e1f1f",
  scarlet: "#8e1f1f",
  gold: "#c9a227",
  blue: "#27407a",
  bronze: "#a0722c",
  yellow: "#d9b22a",
  black: "#1a1a1a",
  green: "#1f5c3a",
  silver: "#b5b8bd",
};

// Translate error types into the same friendly messages as the original app.
const ERROR_KEYS = {
  network: "error.network",
  timeout: "error.timeout",
  http: "error.http",
  parse: "error.data",
  data: "error.data",
};

/** Read the correct title property for a category. */
export function getTitle(category, item) {
  if (!item) return "";
  const titleField = TITLE_FIELDS[category];
  return String(item[titleField] ?? "");
}

/** Convert an error object into a translated, user-friendly sentence. */
export function getErrorMessage(error) {
  let key = "error.unknown";
  if (error && ERROR_KEYS[error.kind]) key = ERROR_KEYS[error.kind];
  return translate(key, { status: error?.status ?? "" });
}

/** Clone one invisible HTML template into a real element we can fill. */
function cloneTemplate(templateId) {
  const template = document.getElementById(templateId);
  if (template === null) {
    throw new Error(`Missing HTML template: ${templateId}`);
  }
  return template.content.firstElementChild.cloneNode(true);
}

/** Update a bookmark button's pressed state and its translated label. */
export function setFavoriteButton(button, isSaved) {
  if (button === null) return;
  button.setAttribute("aria-pressed", String(isSaved));

  // Card buttons have a screen-reader-only span; the dialog button has visible text.
  let label = button.querySelector("[data-label]");
  if (label === null) label = button;
  label.dataset.i18n = isSaved ? "fav.remove" : "fav.add";
  label.textContent = translate(label.dataset.i18n);
}

/** Build one card. The returned <li> is not on the page until a caller appends it. */
export function renderCard(category, item) {
  // Step 1: copy the item so adding a fallback house image does not change API data.
  const displayItem = { ...item };
  if (category === "houses" && !displayItem.image) {
    displayItem.image = HOUSE_IMAGES[displayItem.index];
  }

  // Step 2: clone the correct template and remember the item's API index.
  const card = cloneTemplate(TEMPLATE_IDS[category]);
  card.dataset.index = String(displayItem.index);

  // A plain JavaScript property connects this card to its data for click handlers.
  // This replaces the original WeakMap, which was harder for beginners to trace.
  card.itemData = displayItem;

  // Step 3: fill every element marked data-field="someProperty".
  const fields = card.querySelectorAll("[data-field]");
  for (const element of fields) {
    const fieldName = element.dataset.field;
    const value = displayItem[fieldName];

    // Missing values hide the whole metadata row when there is one.
    if (!hasValue(value)) {
      const row = element.closest("[data-row]");
      if (row !== null) row.hidden = true;
      else element.hidden = true;
      continue;
    }

    if (element instanceof HTMLImageElement) {
      element.referrerPolicy = "no-referrer";
      element.src = value;
      element.alt = getTitle(category, displayItem);
      // If a remote picture fails, hide it and leave the decorative star visible.
      element.addEventListener(
        "error",
        function () {
          element.hidden = true;
        },
        { once: true },
      );
    } else if (Array.isArray(value)) {
      // Arrays become small list items: children are chips; colors get swatches.
      element.replaceChildren();
      for (const entry of value) {
        const listItem = document.createElement("li");
        if (fieldName === "colors") {
          const swatch = document.createElement("span");
          swatch.className = "color-swatch";
          swatch.style.backgroundColor =
            COLOR_MAP[String(entry).toLowerCase()] ?? String(entry);
          listItem.className = "chip-item color-item";
          listItem.append(swatch, String(entry));
        } else {
          listItem.className = "chip-item";
          listItem.textContent = String(entry);
        }
        element.append(listItem);
      }
    } else if (fieldName === "number") {
      element.textContent = translate("field.bookNo", { n: value });
    } else {
      element.textContent = String(value);
    }
  }

  // Step 4: translate static labels such as "Played by" inside this new card.
  applyTranslations(card);
  return card;
}

/** Replace a list's contents with cards, including their current favorite state. */
export function renderCardsInto(container, category, items) {
  container.replaceChildren();
  for (const item of items) {
    const card = renderCard(category, item);
    const button = card.querySelector('[data-action="favorite"]');
    setFavoriteButton(button, isFavorite(category, Number(item.index)));
    container.append(card);
  }
}

/** Show temporary loading placeholders while an API request is in progress. */
export function renderSkeletonsInto(container, count) {
  container.replaceChildren();
  for (let number = 0; number < count; number++) {
    container.append(cloneTemplate("tpl-skeleton"));
  }
}

/** Update the error, empty, count and busy indicators in one predictable place. */
export function setStatus(options = {}) {
  const error = options.error ?? "";
  const empty = options.empty ?? false;
  const count = options.count ?? "";
  const busy = options.busy ?? false;

  document.getElementById("error-panel").hidden = error === "";
  document.getElementById("error-message").textContent = error;
  document.getElementById("empty-state").hidden = !empty;
  document.getElementById("results-count").textContent = count;
  document.getElementById("results").setAttribute("aria-busy", String(busy));
  document
    .getElementById("global-results")
    .setAttribute("aria-busy", String(busy));
}

/** Build removable chips from the active filter descriptions. */
export function renderChips(descriptions) {
  const container = document.getElementById("active-filters");
  container.replaceChildren();
  for (const description of descriptions) {
    const chip = cloneTemplate("tpl-chip");
    chip.querySelector('[data-field="label"]').textContent = description.label;
    const button = chip.querySelector("button");
    button.dataset.removeFilter = description.name;
    button.setAttribute(
      "aria-label",
      `${translate("filter.remove")}: ${description.label}`,
    );
    container.append(chip);
  }
}
