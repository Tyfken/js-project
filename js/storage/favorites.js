import { MAX_FAVORITES } from '../config.js';
import { loadAccount, saveAccount } from './account-store.js';
import { isSignedIn } from '../auth/auth.js';

const same = (category, index) => (f) => f.category === category && f.index === index;
const signedInAccount = () => (isSignedIn() ? loadAccount() : null);

export const getFavorites = () => signedInAccount()?.favorites ?? [];
export const isFavorite = (category, index) => getFavorites().some(same(category, index));

function update(mutate) {
  const account = signedInAccount();
  if (!account) return 'signedout';
  const abort = mutate(account.favorites);
  if (abort) return abort;
  return saveAccount(account) ? 'ok' : 'error';
}

export function addFavorite(category, index) {
  const result = update((list) => {
    if (list.some(same(category, index))) return 'exists';
    if (list.length >= MAX_FAVORITES) return 'full';
    list.push({ category, index });
    return null;
  });
  return result === 'ok' ? 'added' : result;
}

export const removeFavorite = (category, index) => update((list) => {
  const keep = list.filter((f) => !same(category, index)(f));
  list.splice(0, list.length, ...keep);
  return null;
}) === 'ok';

export const replaceFavorite = (slot, category, index) => update((list) => {
  if (slot < 0 || slot >= list.length) return 'noslot';
  list[slot] = { category, index };
  return null;
}) === 'ok';

export const clearFavorites = () => update((list) => {
  list.length = 0;
  return null;
}) === 'ok';
