/*
 * FAVORITES — Save up to four { category, index } references.
 *
 * We save a reference, not a whole character/book object. The API can supply
 * fresh details and translations later. Only a signed-in local user can save.
 *
 * Flow: button -> add/remove/replace -> localStorage -> refresh favorite UI.
 */

import { MAX_FAVORITES } from "../config.js";
import { loadAccount, saveAccount } from "./account-store.js";
import { isSignedIn } from "../auth/auth.js";

/** Return the account only when a valid session exists. */
function getSignedInAccount() {
  if (isSignedIn()) {
    return loadAccount();
  }
  return null;
}

/** Signed-out visitors see an empty list rather than another session's favorites. */
export function getFavorites() {
  const account = getSignedInAccount();
  if (account === null) return [];
  return account.favorites;
}

/** Compare BOTH category and index: character 0 is not the same as book 0. */
export function isFavorite(category, index) {
  for (const favorite of getFavorites()) {
    if (favorite.category === category && favorite.index === index) return true;
  }
  return false;
}

/**
 * Add a reference. Return a clear result string instead of throwing for normal cases.
 * Possible results: added, exists, full, signedout, error.
 */
export function addFavorite(category, index) {
  const account = getSignedInAccount();
  if (account === null) return "signedout";
  if (isFavorite(category, index)) return "exists";
  if (account.favorites.length >= MAX_FAVORITES) return "full";

  account.favorites.push({ category, index });
  if (!saveAccount(account)) return "error";
  return "added";
}

/** Keep every favorite except the selected one, then save the shorter list. */
export function removeFavorite(category, index) {
  const account = getSignedInAccount();
  if (account === null) return false;
  const keptFavorites = [];

  for (const favorite of account.favorites) {
    if (favorite.category !== category || favorite.index !== index) {
      keptFavorites.push(favorite);
    }
  }
  account.favorites = keptFavorites;
  return saveAccount(account);
}

/** Replace one numbered slot when the user confirms the swap dialog. */
export function replaceFavorite(slot, category, index) {
  const account = getSignedInAccount();
  if (account === null) return false;
  if (!Number.isInteger(slot) || slot < 0 || slot >= account.favorites.length)
    return false;

  // Do not create two copies of the same favorite in different slots.
  for (let position = 0; position < account.favorites.length; position++) {
    const favorite = account.favorites[position];
    if (
      position !== slot &&
      favorite.category === category &&
      favorite.index === index
    )
      return false;
  }

  account.favorites[slot] = { category, index };
  return saveAccount(account);
}

/** Empty the list without deleting the account. */
export function clearFavorites() {
  const account = getSignedInAccount();
  if (account === null) return false;
  account.favorites = [];
  return saveAccount(account);
}
