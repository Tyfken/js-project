/*
 * ACCOUNT STORAGE — Read/write the ONE local account in localStorage.
 *
 * localStorage stores strings, so objects must be converted to/from JSON.
 * This module does not check passwords. auth.js handles that separately.
 * A password is never included in the account object saved here.
 */

import { STORAGE_KEYS, CATEGORIES } from "../config.js";

/** Check saved data before trusting it. Old or damaged data must not crash the UI. */
function isValidAccount(account) {
  if (account === null || typeof account !== "object") return false;
  if (typeof account.username !== "string") return false;
  if (typeof account.salt !== "string" || typeof account.hash !== "string")
    return false;
  if (!Number.isInteger(account.iterations) || account.iterations < 1)
    return false;
  if (!Number.isFinite(account.createdAt)) return false;
  if (!Array.isArray(account.favorites)) return false;

  // Every favorite needs a supported category and a nonnegative whole-number index.
  for (const favorite of account.favorites) {
    if (favorite === null || typeof favorite !== "object") return false;
    if (!CATEGORIES.includes(favorite.category)) return false;
    if (!Number.isInteger(favorite.index) || favorite.index < 0) return false;
  }
  return true;
}

/** Return the saved account, or null when there is no usable account. */
export function loadAccount() {
  try {
    const savedText = localStorage.getItem(STORAGE_KEYS.account);
    const account = JSON.parse(savedText);
    if (isValidAccount(account)) {
      return account;
    }
  } catch {
    // JSON may be damaged, or browser privacy settings may block storage.
  }
  return null;
}

/** Save the account. Return a boolean so the caller can display a storage error. */
export function saveAccount(account) {
  try {
    localStorage.setItem(STORAGE_KEYS.account, JSON.stringify(account));
    return true;
  } catch {
    return false;
  }
}

/** Delete the account and its favorites. This is also used by password reset. */
export function deleteAccountRecord() {
  try {
    localStorage.removeItem(STORAGE_KEYS.account);
    return true;
  } catch {
    return false;
  }
}
