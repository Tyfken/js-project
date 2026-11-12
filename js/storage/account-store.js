import { STORAGE_KEYS } from '../config.js';

export function loadAccount() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.account));
    if (data && typeof data.username === 'string' && typeof data.salt === 'string'
      && typeof data.hash === 'string' && Array.isArray(data.favorites)) return data;
  } catch {
  }
  return null;
}

export function saveAccount(account) {
  try {
    localStorage.setItem(STORAGE_KEYS.account, JSON.stringify(account));
    return true;
  } catch {
    return false;
  }
}

export function deleteAccountRecord() {
  try {
    localStorage.removeItem(STORAGE_KEYS.account);
    return true;
  } catch {
    return false;
  }
}
