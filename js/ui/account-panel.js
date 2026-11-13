/*
 * ACCOUNT PANEL — The side panel's form, account buttons and four favorite slots.
 *
 * Flow: form submit -> auth.js -> localStorage -> onChange callback
 *       -> main.refreshFavoriteUI() -> this panel and all bookmark buttons update.
 *
 * Authentication rules live in auth.js. This file only handles the panel UI.
 */

import { MAX_FAVORITES } from "../config.js";
import { translate, applyTranslations, getLanguage } from "../i18n/i18n.js";
import { getByIndex } from "../api/endpoints.js";
import {
  register,
  login,
  logout,
  deleteAccount,
  hasAccount,
  getCurrentUsername,
  isSignedIn,
} from "../auth/auth.js";
import {
  getFavorites,
  removeFavorite,
  clearFavorites,
} from "../storage/favorites.js";
import { getTitle, HOUSE_IMAGES } from "./render.js";
import { toast } from "./dialogs.js";

// main.js supplies one function to call after account/favorite data changes.
let onChange = async function () {};
let slotRequestVersion = 0;
let authBusy = false;

/** Open/close the panel and keep its toggle button's accessibility state in sync. */
export function openPanel(shouldOpen = true) {
  const panel = document.getElementById("favorites-panel");
  panel.hidden = !shouldOpen;
  document
    .getElementById("fav-toggle")
    .setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen && !isSignedIn()) {
    document.getElementById("auth-username").focus();
  }
}

/** Show a translated form error and mark the relevant inputs for assistive tools. */
function showAuthError(key, values) {
  const error = document.getElementById("auth-error");
  error.hidden = !key;
  error.textContent = key ? translate(key, values) : "";
  const inputs = document.querySelectorAll(
    '#auth-form input:not([type="checkbox"])',
  );
  for (const input of inputs) {
    input.setAttribute("aria-invalid", String(Boolean(key)));
  }
}

/** Without an account: registration form. With an account: sign-in form. */
function renderAuthForm() {
  const creating = !hasAccount();
  document.getElementById("auth-title").textContent = translate(
    creating ? "auth.createTitle" : "auth.signInTitle",
  );
  document.getElementById("auth-hint").textContent = translate(
    creating ? "auth.createHint" : "auth.signInHint",
  );
  document.getElementById("auth-submit").textContent = translate(
    creating ? "auth.createSubmit" : "auth.signInSubmit",
  );
  document.getElementById("auth-confirm-row").hidden = !creating;
  document.getElementById("auth-password").autocomplete = creating
    ? "new-password"
    : "current-password";
  document.getElementById("auth-reset").hidden = creating;
}

/**
 * Load saved references and turn them into visible slots.
 * A version number prevents an older language request from overwriting a newer one.
 */
async function renderFavoriteSlots(favorites) {
  slotRequestVersion++;
  const thisRequest = slotRequestVersion;
  const language = getLanguage();
  const loadedItems = [];

  // Step 1: fetch each saved item. A failed item becomes null, not a broken panel.
  for (const favorite of favorites) {
    let item = null;
    try {
      item = await getByIndex(language, favorite.category, favorite.index);
    } catch {
      // We can still show the category and index if details are unavailable.
    }
    if (thisRequest !== slotRequestVersion) return; // A newer refresh has started.
    loadedItems.push(item);
  }

  // Step 2: there are always four HTML slots, even when fewer favorites are saved.
  const slots = document.querySelectorAll("#fav-slots [data-slot]");
  for (let position = 0; position < slots.length; position++) {
    const slot = slots[position];
    const favorite = favorites[position];
    slot.className = favorite ? "favorite-slot slot-filled" : "favorite-slot";
    slot.replaceChildren();

    if (!favorite) {
      const emptyText = document.createElement("span");
      emptyText.dataset.i18n = "fav.emptySlot";
      emptyText.className = "slot-empty";
      slot.append(emptyText);
      applyTranslations(slot);
      continue;
    }

    const item = loadedItems[position];
    const title = item
      ? getTitle(favorite.category, item)
      : `#${favorite.index}`;

    // Step 3: add a picture when available; otherwise the text label is enough.
    let picture = null;
    if (item) picture = item.image ?? item.cover ?? null;
    if (!picture && favorite.category === "houses")
      picture = HOUSE_IMAGES[favorite.index];
    if (picture) {
      const image = document.createElement("img");
      image.src = picture;
      image.alt = "";
      image.width = 40;
      image.height = 40;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.className = "slot-image";
      image.addEventListener(
        "error",
        function () {
          image.remove();
        },
        { once: true },
      );
      slot.append(image);
    }

    // Step 4: add the readable title and a remove button with a data reference.
    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = `${translate(`nav.${favorite.category}`)}: ${title}`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "slot-remove";
    removeButton.dataset.favRemove = `${favorite.category}:${favorite.index}`;
    removeButton.setAttribute(
      "aria-label",
      `${translate("fav.remove")}: ${title}`,
    );
    removeButton.textContent = "×";
    slot.append(label, removeButton);
  }
}

/** Choose signed-in versus signed-out UI, then refresh the appropriate section. */
export async function refreshAccountPanel() {
  // Cancel any older slot-loading job, including when the user signs out.
  slotRequestVersion++;
  const username = getCurrentUsername();
  const favorites = username ? getFavorites() : [];
  document.getElementById("auth-section").hidden = Boolean(username);
  document.getElementById("account-section").hidden = !username;

  const toggleLabel = document.querySelector("#fav-toggle [data-i18n]");
  toggleLabel.dataset.i18n = username ? "fav.open" : "auth.signIn";
  applyTranslations(document.getElementById("fav-toggle"));
  document.getElementById("fav-badge").textContent = username
    ? `${favorites.length}/${MAX_FAVORITES}`
    : "";

  if (!username) {
    renderAuthForm();
    return;
  }
  document.getElementById("account-title").textContent = translate(
    "account.greeting",
    { name: username },
  );
  document.getElementById("fav-counter").textContent = translate(
    "fav.counter",
    { n: favorites.length, max: MAX_FAVORITES },
  );
  await renderFavoriteSlots(favorites);
}

/** Read the form, register or sign in, and report the result without a page reload. */
async function handleAuthSubmit(event) {
  event.preventDefault(); // Stop the browser's normal full-page form submission.
  if (authBusy) return; // Ignore duplicate clicks while hashing is running.

  const form = event.currentTarget;
  const formData = new FormData(form);
  const creating = !hasAccount();
  const credentials = {
    username: formData.get("username"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    remember: formData.get("remember") !== null,
  };

  authBusy = true;
  document.getElementById("auth-submit").disabled = true;
  try {
    let result;
    if (creating) result = await register(credentials);
    else result = await login(credentials);

    if (!result.ok) {
      showAuthError(result.errorKey, result.values);
      return;
    }
    form.reset();
    showAuthError(null);
    toast(
      translate(creating ? "auth.created" : "auth.welcome", {
        name: getCurrentUsername(),
      }),
    );
    await onChange();
  } catch {
    showAuthError("error.unknown");
  } finally {
    // Always re-enable the form, whether the attempt succeeded or failed.
    authBusy = false;
    document.getElementById("auth-submit").disabled = false;
  }
}

/** Connect all panel controls once at startup. */
export function initAccountPanel(changeCallback) {
  onChange = changeCallback;
  const panel = document.getElementById("favorites-panel");

  // Toggle: hidden=true means open; hidden=false means close.
  document.getElementById("fav-toggle").addEventListener("click", function () {
    openPanel(panel.hidden);
  });

  // Escape closes the non-modal side panel and returns focus to its toggle.
  panel.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    openPanel(false);
    document.getElementById("fav-toggle").focus();
  });
  document.getElementById("panel-close").addEventListener("click", function () {
    openPanel(false);
    document.getElementById("fav-toggle").focus();
  });

  document
    .getElementById("auth-form")
    .addEventListener("submit", handleAuthSubmit);

  // Password reset deletes the local account because there is no email/server reset.
  document
    .getElementById("auth-reset")
    .addEventListener("click", async function () {
      if (!window.confirm(translate("auth.resetConfirm"))) return;
      if (deleteAccount()) toast(translate("auth.resetDone"));
      else toast(translate("fav.storageError"));
      showAuthError(null);
      await onChange();
    });

  document
    .getElementById("signout-btn")
    .addEventListener("click", async function () {
      logout();
      toast(translate("auth.signedOut"));
      await onChange();
    });

  document
    .getElementById("delete-account-btn")
    .addEventListener("click", async function () {
      if (!window.confirm(translate("auth.deleteConfirm"))) return;
      if (deleteAccount()) toast(translate("auth.deleted"));
      else toast(translate("fav.storageError"));
      await onChange();
    });

  document
    .getElementById("fav-clear")
    .addEventListener("click", async function () {
      if (getFavorites().length === 0) return;
      if (!window.confirm(translate("fav.clearConfirm"))) return;
      if (clearFavorites()) toast(translate("fav.cleared"));
      else toast(translate("fav.storageError"));
      await onChange();
    });

  // One listener on the list handles all four remove buttons, even after re-rendering.
  document
    .getElementById("fav-slots")
    .addEventListener("click", async function (event) {
      const button = event.target.closest("[data-fav-remove]");
      if (button === null) return;
      const parts = button.dataset.favRemove.split(":");
      const category = parts[0];
      const index = Number(parts[1]);
      if (removeFavorite(category, index)) toast(translate("fav.removed"));
      else toast(translate("fav.storageError"));
      await onChange();
    });
}
