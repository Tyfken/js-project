import { AUTH, STORAGE_KEYS } from '../config.js';
import { loadAccount, saveAccount, deleteAccountRecord } from '../storage/account-store.js';

const NAME_RULE = /^[\p{L}\p{N} '\-]{2,24}$/u;
const encoder = new TextEncoder();
const clean = (text) => String(text ?? '').trim().replace(/\s+/g, ' ');
const fail = (errorKey, vars) => ({ ok: false, errorKey, vars });

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toBase64(bits);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


const stores = () => {
  try { return [sessionStorage, localStorage]; } catch { return []; }
};
const sessionToken = (account) => `${account.username.toLowerCase()}:${account.createdAt}`;

function endSession() {
  for (const store of stores()) {
    try { store.removeItem(STORAGE_KEYS.session); } catch {  }
  }
}

function startSession(account, remember) {
  endSession();
  try { (remember ? localStorage : sessionStorage).setItem(STORAGE_KEYS.session, sessionToken(account)); } catch {  }
}

export function isSignedIn() {
  const account = loadAccount();
  if (!account) return false;
  return stores().some((store) => {
    try { return store.getItem(STORAGE_KEYS.session) === sessionToken(account); } catch { return false; }
  });
}

export const hasAccount = () => loadAccount() !== null;
export const currentUser = () => (isSignedIn() ? loadAccount().username : null);


export async function register({ username, password = '', confirm = '', remember = false }) {
  if (hasAccount()) return fail('auth.accountExists');
  const name = clean(username);
  if (!NAME_RULE.test(name)) return fail('auth.usernameInvalid');
  if (password.length < AUTH.minPassword || password.length > AUTH.maxPassword) return fail('auth.passwordLength');
  if (password !== confirm) return fail('auth.passwordMismatch');
  if (!globalThis.crypto?.subtle) return fail('auth.insecureContext');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const account = {
    username: name,
    salt: toBase64(salt),
    hash: await derive(password, salt, AUTH.iterations),
    iterations: AUTH.iterations,
    createdAt: Date.now(),
    failed: 0,
    lockedUntil: 0,
    favorites: [],
  };
  if (!saveAccount(account)) return fail('fav.storageError');
  startSession(account, remember);
  return { ok: true };
}

export async function login({ username, password = '', remember = false }) {
  const account = loadAccount();
  if (!account) return fail('auth.noAccount');
  const wait = (account.lockedUntil ?? 0) - Date.now();
  if (wait > 0) return fail('auth.locked', { seconds: Math.ceil(wait / 1000) });
  if (!globalThis.crypto?.subtle) return fail('auth.insecureContext');
  const hash = await derive(password, fromBase64(account.salt), account.iterations);
  const nameMatches = clean(username).toLowerCase() === account.username.toLowerCase();
  if (!(nameMatches && safeEqual(hash, account.hash))) {
    account.failed = (account.failed ?? 0) + 1;
    if (account.failed >= AUTH.maxAttempts) {
      account.lockedUntil = Date.now() + Math.min(AUTH.baseLockMs * 2 ** (account.failed - AUTH.maxAttempts), AUTH.maxLockMs);
    }
    saveAccount(account);
    return fail('auth.badCredentials');
  }
  account.failed = 0;
  account.lockedUntil = 0;
  saveAccount(account);
  startSession(account, remember);
  return { ok: true };
}

export const logout = endSession;

export function deleteAccount() {
  endSession();
  return deleteAccountRecord();
}
