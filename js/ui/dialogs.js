import { renderCard, titleOf } from './render.js';
import { CLS } from './styles.js';

let current = null;
const detailDialog = () => document.getElementById('detail-dialog');

export const currentDetail = () => current;

export function toast(message) {
  const note = document.createElement('p');
  note.className = CLS.toast;
  note.textContent = message;
  document.getElementById('toast-region').append(note);
  setTimeout(() => note.remove(), 4000);
}

export function openDetail(category, item) {
  const article = renderCard(category, item).querySelector('article');
  article.querySelector('h3')?.remove();
  article.querySelector('.card-actions')?.remove();
  document.getElementById('detail-title').textContent = titleOf(category, item);
  document.getElementById('detail-body').replaceChildren(article);
  current = { category, item };
  if (!detailDialog().open) detailDialog().showModal();
}

export function initDialogs() {
  const dialog = detailDialog();
  dialog.addEventListener('close', () => { current = null; });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
  });
}

export function confirmSwap(labels, incomingTitle) {
  const dialog = document.getElementById('swap-dialog');
  const fieldset = document.getElementById('swap-options');
  document.getElementById('swap-incoming').textContent = incomingTitle;
  fieldset.querySelectorAll('label').forEach((label) => label.remove());
  labels.forEach((text, i) => {
    const label = document.createElement('label');
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'swap', value: String(i), checked: i === 0 });
    label.className = CLS.swapOption;
    radio.className = CLS.swapRadio;
    label.append(radio, ' ', text);
    fieldset.append(label);
  });
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const picked = dialog.returnValue === 'confirm' ? fieldset.querySelector('input:checked')?.value : null;
      resolve(picked == null ? null : Number(picked));
    }, { once: true });
    dialog.showModal();
  });
}
