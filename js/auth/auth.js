/*
 * AUTH — A beginner-readable, browser-local account demo.
 *
 * IMPORTANT: this is NOT secure server authentication. Someone with access to
 * this browser's developer tools can change local data. Use a demo password,
 * never a real one. A real product needs a backend, HTTPS and server sessions.
 *
 * We still avoid storing plaintext passwords: PBKDF2 turns a password plus a
 * random salt into a derived hash. Login repeats that calculation to compare.
 * The original storage format and 600,000 iterations are preserved.
 */

import { AUTH, STORAGE_KEYS } from "../config.js";
import {
  loadAccount,
  saveAccount,
  deleteAccountRecord,
} from "../storage/account-store.js";
import { cleanSpaces } from "../utils.js";

const USERNAME_RULE = /^[\p{L}\p{N} '\-]{2,24}$/u;

/** Return a normal failure object that the form can translate and display. */
function authError(errorKey, values = {}) {
  return { ok: false, errorKey, values };
}

/** Convert binary bytes to text that localStorage can hold. */
function bytesToBase64(bytes) {
  let binaryText = "";
  for (const byte of bytes) {
    binaryText += String.fromCharCode(byte);
  }
  return btoa(binaryText);
}

/** Reverse bytesToBase64 when login needs the original random salt. */
function base64ToBytes(text) {
  const binaryText = atob(text);
  const bytes = new Uint8Array(binaryText.length);
  for (let position = 0; position < binaryText.length; position++) {
    bytes[position] = binaryText.charCodeAt(position);
  }
  return bytes;
}

/** Some privacy modes block storage. Handle that without crashing the app. */
function getStorageAreas() {
  try {
    return [sessionStorage, localStorage];
  } catch {
    return [];
  }
}

/** The session identifies this account, NOT a password or server access token. */
function makeSessionId(account) {
  return `${account.username.toLowerCase()}:${account.createdAt}`;
}

/** Remove both session types so "remember me" cannot leave an old session behind. */
function endSession() {
  for (const storage of getStorageAreas()) {
    try {
      storage.removeItem(STORAGE_KEYS.session);
    } catch {
      // A blocked storage area simply cannot contain a usable saved session.
    }
  }
}

/** sessionStorage ends with the tab; localStorage survives browser restarts. */
function startSession(account, rememberMe) {
  endSession();
  try {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(STORAGE_KEYS.session, makeSessionId(account));
  } catch {
    // The account still works during this visit, but the session was not saved.
  }
}

/** A session is valid only if it matches the currently saved local account. */
export function isSignedIn() {
  const account = loadAccount();
  if (account === null) return false;

  for (const storage of getStorageAreas()) {
    try {
      if (storage.getItem(STORAGE_KEYS.session) === makeSessionId(account))
        return true;
    } catch {
      // Try the other storage area if this one is blocked.
    }
  }
  return false;
}

export function hasAccount() {
  return loadAccount() !== null;
}

export function getCurrentUsername() {
  if (!isSignedIn()) return null;
  const account = loadAccount();
  return account ? account.username : null;
}

/** Web Crypto requires HTTPS or localhost. Opening a file directly is not enough. */
function hasSecureCrypto() {
  return Boolean(globalThis.crypto && globalThis.crypto.subtle);
}

/**
 * PBKDF2 calculation, step by step.
 * The same password + salt + iteration count gives the same hash.
 * A different random salt gives a different hash for each new account.
 */
async function hashPassword(password, salt, iterations) {
  // Step 1: convert the password string into bytes for Web Crypto.
  const passwordBytes = new TextEncoder().encode(password);

  // Step 2: import those bytes as input key material. false = not exportable.
  const key = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  // Step 3: perform the deliberately slow hash calculation (256 output bits).
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );

  // Step 4: store/compare the result as Base64 text, not as the original password.
  return bytesToBase64(new Uint8Array(bits));
}

/** Compare all characters without an advanced bitwise expression. */
function hashesMatch(first, second) {
  if (first.length !== second.length) return false;
  let foundDifference = false;
  for (let position = 0; position < first.length; position++) {
    if (first.charCodeAt(position) !== second.charCodeAt(position)) {
      foundDifference = true;
    }
  }
  return !foundDifference;
}

/** Create the single account allowed in this browser, then sign it in. */
export async function register(credentials) {
  if (hasAccount()) return authError("auth.accountExists");

  const username = cleanSpaces(credentials.username);
  const password = credentials.password ?? "";
  const confirm = credentials.confirm ?? "";
  if (!USERNAME_RULE.test(username)) return authError("auth.usernameInvalid");
  if (
    password.length < AUTH.minPassword ||
    password.length > AUTH.maxPassword
  ) {
    return authError("auth.passwordLength");
  }
  if (password !== confirm) return authError("auth.passwordMismatch");
  if (!hasSecureCrypto()) return authError("auth.insecureContext");

  // A salt is random public data stored beside the hash; it is not a secret key.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const account = {
    username,
    salt: bytesToBase64(salt),
    hash: await hashPassword(password, salt, AUTH.iterations),
    iterations: AUTH.iterations,
    createdAt: Date.now(),
    failed: 0,
    lockedUntil: 0,
    favorites: [],
  };

  if (!saveAccount(account)) return authError("fav.storageError");
  startSession(account, Boolean(credentials.remember));
  return { ok: true };
}

/** Check username and password, with a temporary lock after repeated failures. */
export async function login(credentials) {
  const account = loadAccount();
  if (account === null) return authError("auth.noAccount");

  const waitMs = (account.lockedUntil ?? 0) - Date.now();
  if (waitMs > 0) {
    return authError("auth.locked", { seconds: Math.ceil(waitMs / 1000) });
  }
  if (!hasSecureCrypto()) return authError("auth.insecureContext");

  let calculatedHash;
  try {
    const salt = base64ToBytes(account.salt);
    calculatedHash = await hashPassword(
      credentials.password ?? "",
      salt,
      account.iterations,
    );
  } catch {
    return authError("error.unknown");
  }

  const username = cleanSpaces(credentials.username).toLowerCase();
  const usernameMatches = username === account.username.toLowerCase();
  if (!usernameMatches || !hashesMatch(calculatedHash, account.hash)) {
    account.failed = (account.failed ?? 0) + 1;

    if (account.failed >= AUTH.maxAttempts) {
      // After five failures: 30 seconds. Each extra failure doubles the wait,
      // up to five minutes. ** means "to the power of": 2 ** 2 = 4.
      const extraFailures = account.failed - AUTH.maxAttempts;
      const lockMs = AUTH.firstLockMs * 2 ** extraFailures;
      account.lockedUntil = Date.now() + Math.min(lockMs, AUTH.longestLockMs);
    }
    if (!saveAccount(account)) return authError("fav.storageError");
    return authError("auth.badCredentials");
  }

  // A correct login clears the failure count and starts a fresh session.
  account.failed = 0;
  account.lockedUntil = 0;
  if (!saveAccount(account)) return authError("fav.storageError");
  startSession(account, Boolean(credentials.remember));
  return { ok: true };
}

export function logout() {
  endSession();
}

/** Delete the local account and all its saved favorite references. */
export function deleteAccount() {
  endSession();
  return deleteAccountRecord();
}
