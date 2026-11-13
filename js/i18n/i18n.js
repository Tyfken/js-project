/*
 * I18N — Interface translations. "i18n" is short for internationalization.
 *
 * HTML data-i18n="nav.home" -> translate('nav.home') -> element.textContent.
 * API content translation is separate: see getApiLanguage in config.js.
 */

import { DICTIONARIES } from "./dictionaries.js";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../config.js";

let currentLanguage = DEFAULT_LANGUAGE;

export function getLanguage() {
  return currentLanguage;
}

/** Change the interface language and tell browsers/screen readers about it. */
export function setLanguage(language) {
  if (LANGUAGES.includes(language)) {
    currentLanguage = language;
  } else {
    currentLanguage = DEFAULT_LANGUAGE;
  }
  document.documentElement.lang = currentLanguage;
}

/**
 * Find a translation. Missing phrases fall back to English, then to the key.
 * values replaces placeholders: translate('pager.info', {page: 2, pages: 5}).
 */
export function translate(key, values = {}) {
  const languageDictionary = DICTIONARIES[currentLanguage];
  let text = languageDictionary[key];
  if (text === undefined) text = DICTIONARIES.en[key];
  if (text === undefined) text = key;

  // Replace only named placeholders such as {name}; never insert HTML.
  for (const name of Object.keys(values)) {
    text = text.replaceAll(`{${name}}`, String(values[name]));
  }
  return text;
}

/** Translate static HTML, a newly cloned card, or the favorites panel. */
export function applyTranslations(root = document) {
  // Example: <span data-i18n="nav.home">Home</span>
  const textElements = root.querySelectorAll("[data-i18n]");
  for (const element of textElements) {
    element.textContent = translate(element.dataset.i18n);
  }

  // Example: data-i18n-attr="placeholder:search.placeholder;aria-label:search.label"
  const attributeElements = root.querySelectorAll("[data-i18n-attr]");
  for (const element of attributeElements) {
    const pairs = element.dataset.i18nAttr.split(";");
    for (const pair of pairs) {
      const parts = pair.split(":");
      const attributeName = parts[0].trim();
      const translationKey = parts[1].trim();
      if (attributeName && translationKey) {
        element.setAttribute(attributeName, translate(translationKey));
      }
    }
  }
}
