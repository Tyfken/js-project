/*
 * CONFIG.JS — The app's settings in one place.
 *
 * Change a value here instead of searching through many files.
 * This file does not fetch data or change the page. It only stores settings.
 */

// Step 1: The official API address. An endpoint is added after this address.
// Official docs: https://github.com/fedeperin/potterapi
// Note: "pottherapy" is a typo and returns 404; the working API is "potterapi".
export const BASE_URL = "https://potterapi-fedeperin.vercel.app";

// Step 2: Languages shown in the language menu.
export const LANGUAGES = ["en", "es", "fr", "it", "pt", "uk", "id"];

// Important: the API does NOT provide Indonesian content.
// Indonesian interface labels are available, but API content falls back to English.
export const API_LANGUAGES = ["en", "es", "fr", "it", "pt", "uk"];
export const DEFAULT_LANGUAGE = "en";

// The four kinds of data supported by both the API and our HTML templates.
export const CATEGORIES = ["characters", "books", "houses", "spells"];

// Each category uses a different property for its main title.
// For example: character.fullName, but book.title.
export const TITLE_FIELDS = {
  characters: "fullName",
  books: "title",
  houses: "house",
  spells: "spell",
};

// These IDs match the <template> elements near the bottom of index.html.
export const TEMPLATE_IDS = {
  characters: "tpl-character",
  books: "tpl-book",
  houses: "tpl-house",
  spells: "tpl-spell",
};

// ---------------------------------------------------------------------------
// EASY SVG REPLACEMENT
// Put your own SVG files at these paths, or change the paths here only.
// The HTML logo and all house cards/favorite slots read from this one place.
// ---------------------------------------------------------------------------
export const BRAND_LOGO_PATH = "img/brand/logo.png";

// API house indexes: 0 Gryffindor, 1 Hufflepuff, 2 Ravenclaw, 3 Slytherin.
export const HOUSE_IMAGES = [
  "img/houses/gryffindor.svg",
  "img/houses/hufflepuff.svg",
  "img/houses/ravenclaw.svg",
  "img/houses/slytherin.svg",
];

export const MAX_FAVORITES = 4;
export const TEASER_SIZE = 4;
export const DEFAULT_PAGE_SIZE = 12;

// Keep the original storage keys so existing accounts and favorites still work.
// Changing these strings would make previously saved data appear to disappear.
export const STORAGE_KEYS = {
  account: "hp:v2:account",
  session: "hp:v2:session",
  language: "hp:v1:lang",
};

// Password hashing and temporary login lockout settings.
// These protect the local demo, but do NOT turn it into a real online account.
export const AUTH = {
  iterations: 600000,
  minPassword: 8,
  maxPassword: 128,
  maxAttempts: 5,
  firstLockMs: 30000,
  longestLockMs: 300000,
};

// Network settings: wait at most 10 seconds, then try twice more if appropriate.
export const REQUEST_TIMEOUT_MS = 10000;
export const MAX_RETRIES = 2;

/**
 * Choose a language that the content API actually supports.
 * If the API supports the selected language, use it; otherwise use English.
 */
export function getApiLanguage(language) {
  if (API_LANGUAGES.includes(language)) {
    return language;
  }
  return DEFAULT_LANGUAGE;
}
