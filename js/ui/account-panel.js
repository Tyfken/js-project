import { MAX_FAVORITES } from '../config.js';
import { t, applyI18n, getLang } from '../i18n/i18n.js';
import { getByIndex } from '../api/endpoints.js';
import { register, login, logout, deleteAccount, hasAccount, currentUser, isSignedIn } from '../auth/auth.js';
import * as favs from '../storage/favorites.js';
import { titleOf, HOUSE_IMAGES } from './render.js';
import { CLS } from './styles.js';
import { toast } from './dialogs.js';
import { $, $$ } from '../utils.js';

let onChange = () => {};
let slotToken = 0;
let busy = false;

export function openPanel(open = true) {
  $('#favorites-panel').hidden = !open;
  $('#fav-toggle').setAttribute('aria-expanded', String(open));
  if (open && !isSignedIn()) $('#auth-username').focus();
}

function showAuthError(key, vars) {
  const error = $('#auth-error');
  error.hidden = !key;
  error.textContent = key ? t(key, vars) : '';
  for (const input of $$('#auth-form input:not([type="checkbox"])')) input.setAttribute('aria-invalid', String(Boolean(key)));
}

function renderAuthForm() {
  const creating = !hasAccount();
  $('#auth-title').textContent = t(creating ? 'auth.createTitle' : 'auth.signInTitle');
  $('#auth-hint').textContent = t(creating ? 'auth.createHint' : 'auth.signInHint');
  $('#auth-submit').textContent = t(creating ? 'auth.createSubmit' : 'auth.signInSubmit');
  $('#auth-confirm-row').hidden = !creating;
  $('#auth-password').autocomplete = creating ? 'new-password' : 'current-password';
  $('#auth-reset').hidden = creating;
}

async function renderSlots(items) {
  const token = ++slotToken;
  const lang = getLang();
  const loaded = await Promise.all(items.map((f) => getByIndex(lang, f.category, f.index).catch(() => null)));
  if (token !== slotToken) return;
  $$('#fav-slots [data-slot]').forEach((slot, i) => {
    const fav = items[i];
    slot.className = fav ? CLS.slotFilled[fav.category] : CLS.slotEmptyBox;
    if (!fav) {
      const empty = document.createElement('span');
      empty.dataset.i18n = 'fav.emptySlot';
      empty.className = CLS.slotEmpty;
      slot.replaceChildren(empty);
      applyI18n(slot);
      return;
    }
    const item = loaded[i];
    const title = item ? titleOf(fav.category, item) : `#${fav.index}`;
    const nodes = [];
    const picture = item?.image ?? item?.cover ?? (fav.category === 'houses' ? HOUSE_IMAGES[fav.index] : null);
    if (picture) {
      const img = Object.assign(document.createElement('img'), { src: picture, alt: '', width: 40, height: 40, loading: 'lazy', referrerPolicy: 'no-referrer' });
      img.className = CLS.slotImg;
      img.addEventListener('error', () => img.remove(), { once: true });
      nodes.push(img);
    }
    const label = document.createElement('span');
    label.className = CLS.slotLabel;
    label.textContent = `${t(`nav.${fav.category}`)}: ${title}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = CLS.slotRemove;
    remove.dataset.favRemove = `${fav.category}:${fav.index}`;
    remove.setAttribute('aria-label', `${t('fav.remove')}: ${title}`);
    remove.textContent = '×';
    slot.replaceChildren(...nodes, label, remove);
  });
}

export async function refreshAccountPanel() {
  const user = currentUser();
  const items = user ? favs.getFavorites() : [];
  $('#auth-section').hidden = Boolean(user);
  $('#account-section').hidden = !user;
  $('#fav-toggle [data-i18n]').dataset.i18n = user ? 'fav.open' : 'auth.signIn';
  applyI18n($('#fav-toggle'));
  $('#fav-badge').textContent = user ? `${items.length}/${MAX_FAVORITES}` : '';
  if (!user) {
    renderAuthForm();
    return;
  }
  $('#account-title').textContent = t('account.greeting', { name: user });
  $('#fav-counter').textContent = t('fav.counter', { n: items.length, max: MAX_FAVORITES });
  await renderSlots(items);
}

async function onAuthSubmit(event) {
  event.preventDefault();
  if (busy) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const creating = !hasAccount();
  busy = true;
  $('#auth-submit').disabled = true;
  try {
    const credentials = { ...data, remember: Boolean(data.remember) };
    const result = creating ? await register(credentials) : await login(credentials);
    if (!result.ok) {
      showAuthError(result.errorKey, result.vars);
      return;
    }
    form.reset();
    showAuthError(null);
    toast(t(creating ? 'auth.created' : 'auth.welcome', { name: currentUser() }));
    onChange();
  } catch {
    showAuthError('error.unknown');
  } finally {
    busy = false;
    $('#auth-submit').disabled = false;
  }
}

export function initAccountPanel({ onChange: callback }) {
  onChange = callback;
  $('#fav-toggle').addEventListener('click', () => openPanel($('#favorites-panel').hidden));
  $('#favorites-panel').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    openPanel(false);
    $('#fav-toggle').focus();
  });
  $('#panel-close').addEventListener('click', () => {
    openPanel(false);
    $('#fav-toggle').focus();
  });
  $('#auth-form').addEventListener('submit', onAuthSubmit);

  $('#auth-reset').addEventListener('click', () => {
    if (!window.confirm(t('auth.resetConfirm'))) return;
    deleteAccount();
    showAuthError(null);
    toast(t('auth.resetDone'));
    onChange();
  });
  $('#signout-btn').addEventListener('click', () => {
    logout();
    toast(t('auth.signedOut'));
    onChange();
  });
  $('#delete-account-btn').addEventListener('click', () => {
    if (!window.confirm(t('auth.deleteConfirm'))) return;
    deleteAccount();
    toast(t('auth.deleted'));
    onChange();
  });
  $('#fav-clear').addEventListener('click', () => {
    if (!favs.getFavorites().length || !window.confirm(t('fav.clearConfirm'))) return;
    favs.clearFavorites();
    toast(t('fav.cleared'));
    onChange();
  });
  $('#fav-slots').addEventListener('click', (event) => {
    const button = event.target.closest('[data-fav-remove]');
    if (!button) return;
    const [category, index] = button.dataset.favRemove.split(':');
    favs.removeFavorite(category, Number(index));
    toast(t('fav.removed'));
    onChange();
  });
}
