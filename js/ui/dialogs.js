/*
 * DIALOGS — Small reusable UI helpers for details, swap confirmation and toasts.
 * Native <dialog> elements handle focus trapping and the Escape key for us.
 */

import { renderCard, getTitle } from "./render.js";

// Remember which item is open so the dialog's favorite button knows what to save.
let openDetailData = null;

export function currentDetail() {
  return openDetailData;
}

/** Show a short notification, then remove it after four seconds. */
export function toast(message) {
  const note = document.createElement("p");
  note.className = "toast";
  note.textContent = message;
  document.getElementById("toast-region").append(note);
  setTimeout(function () {
    note.remove();
  }, 4000);
}

/** Reuse the card renderer for a larger detail view. */
export function openDetail(category, item) {
  // Step 1: render a card, then keep only its inner <article>.
  const card = renderCard(category, item);
  const article = card.querySelector("article");

  // Step 2: remove the card's duplicate heading and buttons.
  // The dialog has its own heading, close button and favorite button.
  const heading = article.querySelector("h3");
  if (heading !== null) heading.remove();
  const actions = article.querySelector(".card-actions");
  if (actions !== null) actions.remove();

  // Step 3: put the article into the dialog and remember its source item.
  document.getElementById("detail-title").textContent = getTitle(
    category,
    item,
  );
  document.getElementById("detail-body").replaceChildren(article);
  openDetailData = { category, item };

  const dialog = document.getElementById("detail-dialog");
  if (!dialog.open) dialog.showModal();
}

/** Connect the detail dialog's close button, backdrop click and close event. */
export function initDialogs() {
  const dialog = document.getElementById("detail-dialog");

  // The browser fires close after the close button, Escape, or dialog.close().
  dialog.addEventListener("close", function () {
    openDetailData = null;
  });

  dialog.addEventListener("click", function (event) {
    // Clicking the dialog itself means clicking its backdrop area.
    const clickedBackdrop = event.target === dialog;
    const clickedCloseButton = event.target.closest("[data-close]") !== null;
    if (clickedBackdrop || clickedCloseButton) dialog.close();
  });
}

/**
 * Ask which full favorite slot should be replaced.
 * Returns a Promise: a slot number (0–3), or null when the user cancels.
 * A Promise lets the caller wait for a human decision without freezing the page.
 */
export function confirmSwap(labels, incomingTitle) {
  const dialog = document.getElementById("swap-dialog");
  const fieldset = document.getElementById("swap-options");
  document.getElementById("swap-incoming").textContent = incomingTitle;

  // Step 1: remove last time's radio labels, but keep the translated legend.
  const oldLabels = fieldset.querySelectorAll("label");
  for (const label of oldLabels) {
    label.remove();
  }

  // Step 2: create one radio choice for each saved favorite.
  for (let slot = 0; slot < labels.length; slot++) {
    const label = document.createElement("label");
    label.className = "swap-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "swap";
    radio.value = String(slot);
    radio.checked = slot === 0;
    label.append(radio, document.createTextNode(labels[slot]));
    fieldset.append(label);
  }

  // method="dialog" makes the submit button's value become dialog.returnValue.
  dialog.returnValue = "";
  return new Promise(function (resolve) {
    // once:true removes this listener after this particular dialog closes.
    dialog.addEventListener(
      "close",
      function () {
        if (dialog.returnValue !== "confirm") {
          resolve(null);
          return;
        }
        const selectedRadio = fieldset.querySelector("input:checked");
        if (selectedRadio === null) resolve(null);
        else resolve(Number(selectedRadio.value));
      },
      { once: true },
    );

    // Step 3: open the modal. The close listener above resolves the Promise later.
    dialog.showModal();
  });
}
