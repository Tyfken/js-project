/*
 * SEARCH — Validate user input and connect search hits to complete records.
 * Actual server requests live in api/endpoints.js, not in this file.
 */

import { TITLE_FIELDS } from "../config.js";
import { cleanSpaces } from "../utils.js";

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 60;

/** Return either { ok: true, value } or { ok: false, errorKey }. */
export function validateQuery(rawInput) {
  const value = cleanSpaces(rawInput);

  // Empty input is valid: it means "show everything again".
  if (value === "") {
    return { ok: true, value: "" };
  }
  if (value.length < MIN_QUERY_LENGTH) {
    return { ok: false, errorKey: "search.tooShort" };
  }
  if (value.length > MAX_QUERY_LENGTH) {
    return { ok: false, errorKey: "search.tooLong" };
  }

  // Require at least one letter or number, rather than only punctuation.
  let hasLetterOrNumber = false;
  for (const character of value) {
    if (/[\p{L}\p{N}]/u.test(character)) {
      hasLetterOrNumber = true;
      break;
    }
  }
  if (!hasLetterOrNumber) {
    return { ok: false, errorKey: "search.invalid" };
  }
  return { ok: true, value };
}

/**
 * Search results must point to records in the full list.
 * Those full records have the indexes needed by favorites and the detail buttons.
 * The lists are small, so two clear loops are easier to learn than a lookup abstraction.
 */
export function matchToFullRecords(category, searchHits, allItems) {
  const titleField = TITLE_FIELDS[category];
  const matchedItems = [];

  for (const hit of searchHits) {
    // Prefer the API index when available; otherwise compare the main title.
    for (const item of allItems) {
      const sameIndex = Number.isInteger(hit.index) && hit.index === item.index;
      const sameTitle = hit[titleField] === item[titleField];
      if (sameIndex || sameTitle) {
        matchedItems.push(item);
        break; // This hit is matched; move on to the next hit.
      }
    }
  }
  return matchedItems;
}
