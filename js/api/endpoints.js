/*
 * API ENDPOINTS — Meaningful names for the app's data requests.
 *
 * Example: getAll('en', 'books')
 *   -> https://potterapi-fedeperin.vercel.app/en/books
 *   -> JSON array -> JavaScript objects with an index -> UI renderer.
 */

import {
  BASE_URL,
  LANGUAGES,
  CATEGORIES,
  TITLE_FIELDS,
  TEASER_SIZE,
  getApiLanguage,
} from "../config.js";
import { fetchJSON, ApiError } from "./client.js";

/** Check inputs and build a safe URL. URLSearchParams handles escaping for us. */
function buildUrl(language, category, options = {}) {
  if (!LANGUAGES.includes(language)) {
    throw new ApiError("data", `Unsupported language: ${language}`);
  }
  if (!CATEGORIES.includes(category)) {
    throw new ApiError("data", `Unknown category: ${category}`);
  }

  const apiLanguage = getApiLanguage(language);
  let address = `${BASE_URL}/${apiLanguage}/${category}`;
  if (options.random === true) {
    address += "/random";
  }

  const url = new URL(address);

  // Only add parameters that were actually supplied.
  // max = page size; page = 1-based page number when max is used;
  // index = one item's position; search = query text.
  const parameterNames = ["max", "page", "index", "search"];
  for (const name of parameterNames) {
    const value = options[name];
    if (value === undefined) {
      continue; // Skip this parameter, then continue with the next one.
    }
    if (
      (name === "max" || name === "index") &&
      (!Number.isInteger(value) || value < 0)
    ) {
      throw new ApiError("data", `Invalid ${name}`);
    }
    if (name === "page" && (!Number.isInteger(value) || value < 1)) {
      throw new ApiError("data", "Invalid page");
    }
    url.searchParams.set(name, String(value));
  }
  return url.toString();
}

/** The API normally sends an array, but a one-item endpoint may send an object. */
function toArray(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data !== null && typeof data === "object") {
    return [data];
  }
  throw new ApiError("data", "Unexpected response format.");
}

/**
 * Favorites need a stable position in the list. Most API items already have one.
 * If an older response has no index, use its position in the array instead.
 * Copy each object so rendering never changes cached API data.
 */
function addMissingIndexes(items, firstIndex = 0) {
  const result = [];
  for (let position = 0; position < items.length; position++) {
    const item = { ...items[position] };
    if (!Number.isInteger(item.index)) {
      item.index = firstIndex + position;
    }
    result.push(item);
  }
  return result;
}

/** Download a complete category. Used by browsing, filters, sorting and search. */
export async function getAll(language, category) {
  const data = await fetchJSON(buildUrl(language, category));
  return addMissingIndexes(toArray(data));
}

/** Download just four items for a home-page preview. */
export async function getTeaser(language, category, max = TEASER_SIZE) {
  const data = await fetchJSON(buildUrl(language, category, { max, page: 1 }));
  return addMissingIndexes(toArray(data));
}

/**
 * Download one page using the API's max + page parameters.
 * Example: max=12, page=2 asks for items 13–24 in the API's original order.
 */
export async function getPage(language, category, max, page) {
  const data = await fetchJSON(buildUrl(language, category, { max, page }));
  const firstIndex = (page - 1) * max;
  return addMissingIndexes(toArray(data), firstIndex);
}

/** Download one saved favorite using its category and index. */
export async function getByIndex(language, category, index) {
  const data = await fetchJSON(buildUrl(language, category, { index }));
  const items = toArray(data);
  if (items.length === 0) {
    throw new ApiError("data", "Item not found.");
  }
  return { ...items[0], index };
}

/** Ask the server for a random item. Never cache randomness! */
export async function getRandom(language, category) {
  const url = buildUrl(language, category, { random: true });
  const data = await fetchJSON(url, { useCache: false });
  const items = toArray(data);
  if (items.length === 0) {
    throw new ApiError("data", "The random response was empty.");
  }
  return items[0];
}

/**
 * A random response might not include an index. Find its title in the full list.
 * Keeping the original item as a fallback still allows the detail dialog to open.
 */
export async function findItemIndex(language, category, item) {
  if (Number.isInteger(item.index)) {
    return item;
  }
  const allItems = await getAll(language, category);
  const titleField = TITLE_FIELDS[category];
  for (const candidate of allItems) {
    if (candidate[titleField] === item[titleField]) {
      return candidate;
    }
  }
  return item;
}

/** Search one category on the server. A 404 here means "no matches", not a crash. */
export async function search(language, category, query) {
  try {
    const data = await fetchJSON(
      buildUrl(language, category, { search: query }),
    );
    return toArray(data);
  } catch (error) {
    if (error.kind === "http" && error.status === 404) {
      return [];
    }
    throw error;
  }
}
