/*
 * UTILS.JS — Small, named text helpers.
 *
 * There are no hidden timers or cryptic selector shortcuts here.
 * Search and filter timers are kept visibly in main.js.
 */

/**
 * Make text easier to compare: remove accents, use lowercase, trim spaces.
 * Example: "Álbus" becomes "albus". This is for matching, not for display.
 */
export function normalizeText(value) {
  // Step 1: null and undefined become an empty string instead of causing errors.
  const text = String(value ?? "");

  // Step 2: NFD separates a letter from its accent; the loop removes accent marks.
  // Keeping the steps separate is easier to explain than one long regular expression.
  const separateLettersAndAccents = text.normalize("NFD");
  let withoutAccents = "";
  for (const character of separateLettersAndAccents) {
    if (!/\p{M}/u.test(character)) {
      withoutAccents += character;
    }
  }

  // Step 3: lowercase and outer-space removal make comparisons consistent.
  return withoutAccents.toLowerCase().trim();
}

/** Find a four-digit year in a date such as "Jul 31, 1980". */
export function getYear(value) {
  const match = /\d{4}/.exec(String(value ?? ""));
  if (match === null) {
    return NaN; // NaN means "not a number": the API did not give us a usable year.
  }
  return Number(match[0]);
}

/** Return the first actual letter, ignoring punctuation and accent marks. */
export function getFirstLetter(value) {
  const text = normalizeText(value);

  // Check each character so students can see exactly what "first letter" means.
  for (const character of text) {
    if (/\p{L}/u.test(character)) {
      return character.toUpperCase();
    }
  }
  return "";
}

/** Turn spaces, tabs and repeated spaces into one ordinary space. */
export function cleanSpaces(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/** A readable missing-value check used by sorting and card rendering. */
export function hasValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && value !== "";
}
