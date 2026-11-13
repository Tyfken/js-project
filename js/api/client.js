/*
 * API CLIENT — The reusable "fetch, check, retry" layer.
 *
 * Data flow: endpoint URL -> fetch -> JSON -> cache -> endpoint function.
 * This file knows HOW to talk to a server, but not WHAT a character looks like.
 */

import { REQUEST_TIMEOUT_MS, MAX_RETRIES } from "../config.js";

// A custom error lets the UI distinguish a timeout from a server error.
export class ApiError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.kind = kind; // network, timeout, http, parse, or data
    this.status = status; // HTTP status, such as 404 or 500; 0 means none.
  }
}

// Cache successful JSON responses for this page session.
// Example: opening the Characters tab twice does not download the same list twice.
// A Map is a collection of key/value pairs: URL -> JavaScript data.
const responseCache = new Map();

/** Wait for a number of milliseconds before another network attempt. */
function wait(milliseconds) {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

/** Make ONE request. Retrying is handled separately below. */
async function requestOnce(url) {
  // Step 1: AbortController lets us stop a request that takes too long.
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    // Step 2: fetch downloads a response. await pauses THIS function, not the page.
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    // Step 3: fetch does not throw for 404/500, so check the status ourselves.
    if (!response.ok) {
      throw new ApiError("http", `HTTP ${response.status}`, response.status);
    }

    // Step 4: turn the response body into a JavaScript array or object.
    try {
      return await response.json();
    } catch {
      throw new ApiError("parse", "The response was not valid JSON.");
    }
  } catch (error) {
    // Keep errors we already classified, such as HTTP 404 or invalid JSON.
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "AbortError") {
      throw new ApiError("timeout", "The request took too long.");
    }
    throw new ApiError("network", error.message);
  } finally {
    // finally runs after success OR failure. Never leave a timer running.
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch JSON with a timeout, limited retries, and an optional successful-result cache.
 * options is an object, so callers can write { useCache: false }.
 */
export async function fetchJSON(url, options = {}) {
  const useCache = options.useCache !== false; // Default: true.

  if (useCache && responseCache.has(url)) {
    return responseCache.get(url);
  }

  // attempt 0 is the first request; attempts 1 and 2 are retries.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await requestOnce(url);
      if (useCache) {
        responseCache.set(url, data);
      }
      return data; // Success immediately ends the loop and this function.
    } catch (error) {
      // A missing item (404) or bad data will not improve by retrying.
      const temporaryServerProblem =
        error.kind === "http" && error.status >= 500;
      const canRetry =
        error.kind === "network" ||
        error.kind === "timeout" ||
        temporaryServerProblem;
      const hasAnotherAttempt = attempt < MAX_RETRIES;

      if (!canRetry || !hasAnotherAttempt) {
        throw error; // The caller decides how to display this error.
      }

      // Wait 400 ms, then 800 ms. This gives a busy server a little breathing room.
      await wait(400 * 2 ** attempt);
    }
  }
}
