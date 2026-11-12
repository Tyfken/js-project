import { CATEGORIES, LANGS, DEFAULT_LANG, STORAGE_KEYS } from './config.js';
import { getAll, getTeaser, getByIndex, getRandom, search, withIndex } from './api/endpoints.js';
import { getState, setState, subscribe } from './state/store.js';
import { setLang, getLang, t, applyI18n } from './i18n/i18n.js';
import { populateFilterOptions, readFilters, describeFilters, clearControl, applyFilters } from './features/filters.js';
import { SORTS, sortItems } from './features/sort.js';
import { validateQuery, matchToList } from './features/search.js';
import { isSignedIn } from './auth/auth.js';
import * as favs from './storage/favorites.js';
import { renderCards, renderChips, setStatus, errorMessage, skeletons, setFavButton, itemOf, titleOf } from './ui/render.js';
import { initDialogs, openDetail, confirmSwap, currentDetail, toast } from './ui/dialogs.js';
import { initAccountPanel, refreshAccountPanel, openPanel } from './ui/account-panel.js';
import { CLS } from './ui/styles.js';
import { $, $$, debounce } from './utils.js';

const filterForm = $('#filter-form');
const searchForm = $('#search-form');
const searchInput = $('#search-input');

let renderToken = 0;
let sortSignature = '';
let silentReset = false;


function favChecker() {
  const keys = new Set(favs.getFavorites().map((f) => `${f.category}:${f.index}`));
  return (category, index) => keys.has(`${category}:${index}`);
}

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.lang);
    if (LANGS.includes(saved)) return saved;
  } catch {  }
  const guess = navigator.language?.slice(0, 2);
  return LANGS.includes(guess) ? guess : DEFAULT_LANG;
}

function showBusy() {
  $('#results').hidden = false;
  $('#global-results').hidden = true;
  $('#results').replaceChildren(...skeletons(getState().pageSize));
  setStatus({ busy: true });
}

function updatePager(current, pages) {
  $('#pager').hidden = pages <= 1;
  $('#page-info').textContent = t('pager.info', { page: current, pages });
  $('#page-prev').disabled = current <= 1;
  $('#page-next').disabled = current >= pages;
}

const filtersChanged = () => setState({ page: 1, tick: getState().tick + 1 });


function syncChrome() {
  const { view, category, lang, dir } = getState();
  for (const button of $$('#category-nav [data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('#view-home').hidden = view !== 'home';
  $('#view-browse').hidden = view !== 'explore';
  if (view !== 'explore') return;
  for (const tab of $$('#category-tabs [data-category]')) {
    if (tab.dataset.category === category) tab.setAttribute('aria-current', 'true');
    else tab.removeAttribute('aria-current');
  }
  $('#results').dataset.category = category;
  for (const fieldset of $$('[data-for-category]', filterForm)) fieldset.hidden = fieldset.dataset.forCategory !== category;
  $('#sort-dir').setAttribute('aria-pressed', String(dir === 'desc'));
  const signature = `${lang}:${category}`;
  if (signature !== sortSignature) {
    sortSignature = signature;
    const select = $('#sort-select');
    select.replaceChildren(...SORTS[category].map((s) => new Option(t(s.labelKey), s.key)));
    select.value = getState().sortKey || SORTS[category][0].key;
  }
}

function render() {
  syncChrome();
  return getState().view === 'home' ? renderHome() : renderBrowse();
}

async function renderHome() {
  const token = ++renderToken;
  const { lang } = getState();
  const isFav = favChecker();
  const spellOfTheDay = async () => {
    const spells = await getAll(lang, 'spells');
    if (token !== renderToken || !spells.length) return;
    const spell = spells[Math.floor(Date.now() / 864e5) % spells.length];
    $('#spell-of-the-day [data-field="spell"]').textContent = spell.spell;
    $('#spell-of-the-day [data-field="use"]').textContent = spell.use ?? '';
  };
  const teaser = async (category) => {
    const items = await getTeaser(lang, category);
    if (token !== renderToken) return;
    $(`[data-teaser="${category}"] [data-teaser-list]`).replaceChildren(...renderCards(category, items, isFav));
  };
  const results = await Promise.allSettled([...CATEGORIES.map(teaser), spellOfTheDay()]);
  if (token === renderToken && results.every((r) => r.status === 'rejected')) toast(errorMessage(results[0].reason));
}

async function renderBrowse() {
  const token = ++renderToken;
  const { category, lang, query, scope, dir, page, pageSize } = getState();
  const sortKey = getState().sortKey || SORTS[category][0].key;
  try {
    if (query && scope === 'all') return await renderGlobal(token, lang, query);
    $('#results').hidden = false;
    $('#global-results').hidden = true;
    $('#filters').hidden = false;
    const [all, houses] = await Promise.all([
      getAll(lang, category),
      category === 'characters' ? getAll(lang, 'houses') : [],
    ]);
    const base = query ? matchToList(category, await search(lang, category, query), all) : all;
    if (token !== renderToken) return;
    const ctx = { houses: category === 'houses' ? all : houses };
    populateFilterOptions(category, all, ctx);
    const filtered = sortItems(category, applyFilters(category, base, readFilters(category, filterForm), ctx), sortKey, dir, lang);
    renderChips(describeFilters(category, filterForm));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const current = Math.min(page, pages);
    const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
    $('#results').replaceChildren(...renderCards(category, slice, favChecker()));
    setStatus({ count: t('results.count', { n: filtered.length }), empty: filtered.length === 0 });
    updatePager(current, pages);
  } catch (error) {
    if (token !== renderToken) return;
    $('#results').replaceChildren();
    updatePager(1, 1);
    setStatus({ error: errorMessage(error) });
  }
}

async function renderGlobal(token, lang, query) {
  const settled = await Promise.allSettled(CATEGORIES.map(async (category) => {
    const [all, found] = await Promise.all([getAll(lang, category), search(lang, category, query)]);
    return [category, matchToList(category, found, all)];
  }));
  if (token !== renderToken) return;
  const isFav = favChecker();
  const sections = [];
  let total = 0;
  let failed = 0;
  for (const result of settled) {
    if (result.status === 'rejected') { failed++; continue; }
    const [category, items] = result.value;
    if (!items.length) continue;
    total += items.length;
    const heading = document.createElement('h3');
    heading.className = CLS.globalHeading[category];
    heading.textContent = t(`nav.${category}`);
    const list = document.createElement('ul');
    list.className = CLS.globalGrid;
    list.append(...renderCards(category, items, isFav));
    const section = document.createElement('section');
    section.className = CLS.globalSection;
    section.append(heading, list);
    sections.push(section);
  }
  const allFailed = failed === settled.length;
  $('#global-results').replaceChildren(...sections);
  $('#global-results').hidden = false;
  $('#results').hidden = true;
  $('#filters').hidden = true;
  $('#pager').hidden = true;
  setStatus({
    error: allFailed ? errorMessage(settled[0].reason) : '',
    count: t('results.count', { n: total }),
    empty: !allFailed && total === 0,
  });
  if (failed && !allFailed) toast(t('search.failedSome'));
}


function resetBrowseControls() {
  silentReset = true;
  filterForm.reset();
  searchForm.reset();
  $('#search-error').hidden = true;
  searchInput.removeAttribute('aria-invalid');
  sortSignature = '';
}

function showView(view) {
  if (!['home', 'explore'].includes(view) || view === getState().view) return;
  if (view === 'explore' && !$('#results').children.length) showBusy();
  setState({ view });
  $('#main').focus();
}

function openCategory(category) {
  if (!CATEGORIES.includes(category)) return;
  const { view, category: active } = getState();
  if (category === active) return showView('explore');
  resetBrowseControls();
  showBusy();
  setState({ view: 'explore', category, query: '', scope: 'category', sortKey: '', dir: 'asc', page: 1 });
  if (view === 'home') $('#main').focus();
}

function showDetail(category, item) {
  openDetail(category, item);
  setFavButton($('#detail-fav'), favs.isFavorite(category, Number(item.index)));
}

async function showRandom(category) {
  try {
    const lang = getLang();
    showDetail(category, await withIndex(lang, category, await getRandom(lang, category)));
  } catch (error) {
    toast(errorMessage(error));
  }
}


async function refreshFavUI() {
  const isFav = favChecker();
  for (const card of $$('li.card[data-index]')) {
    setFavButton(card.querySelector('[data-action="favorite"]'), isFav(card.dataset.category, Number(card.dataset.index)));
  }
  const detail = currentDetail();
  if (detail) setFavButton($('#detail-fav'), isFav(detail.category, Number(detail.item.index)));
  await refreshAccountPanel();
}

async function swapFlow(category, item, index) {
  try {
    const lang = getLang();
    const labels = await Promise.all(favs.getFavorites().map(async (f) => {
      const saved = await getByIndex(lang, f.category, f.index).catch(() => null);
      return `${t(`nav.${f.category}`)}: ${saved ? titleOf(f.category, saved) : `#${f.index}`}`;
    }));
    const slot = await confirmSwap(labels, titleOf(category, item));
    if (slot !== null && favs.replaceFavorite(slot, category, index)) toast(t('fav.replaced'));
  } catch (error) {
    toast(errorMessage(error));
  }
}

async function toggleFavorite(category, item) {
  if (!isSignedIn()) {
    if ($('#detail-dialog').open) $('#detail-dialog').close();
    openPanel();
    toast(t('auth.needSignIn'));
    return;
  }
  const index = Number(item.index);
  if (favs.isFavorite(category, index)) {
    favs.removeFavorite(category, index);
    toast(t('fav.removed'));
  } else {
    const result = favs.addFavorite(category, index);
    if (result === 'error') toast(t('fav.storageError'));
    else if (result === 'full') await swapFlow(category, item, index);
    else if (result === 'signedout') { openPanel(); toast(t('auth.needSignIn')); }
    else toast(t('fav.added'));
  }
  refreshFavUI();
}


function onClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const { view, category, random, removeFilter, action } = button.dataset;
  if (view) return showView(view);
  if (category) return openCategory(category);
  if (random) return showRandom(random);
  if (removeFilter) {
    clearControl(getState().category, filterForm, removeFilter);
    return filtersChanged();
  }
  if (button.id === 'detail-fav') {
    const detail = currentDetail();
    if (detail) toggleFavorite(detail.category, detail.item);
    return;
  }
  if (action) {
    const card = button.closest('li.card');
    const item = card && itemOf(card);
    if (!item) return;
    if (action === 'details') showDetail(card.dataset.category, item);
    if (action === 'favorite') toggleFavorite(card.dataset.category, item);
  }
}

function runSearch({ strict }) {
  const check = validateQuery(searchInput.value);
  const error = $('#search-error');
  if (!check.ok) {
    if (strict) {
      error.textContent = t(check.errorKey);
      error.hidden = false;
      searchInput.setAttribute('aria-invalid', 'true');
    }
    return;
  }
  error.hidden = true;
  searchInput.removeAttribute('aria-invalid');
  const scope = new FormData(searchForm).get('scope');
  if (check.value === getState().query && scope === getState().scope) return;
  if (check.value) showBusy();
  setState({ query: check.value, scope, page: 1 });
}

function bindEvents() {
  document.addEventListener('click', onClick);

  $('#lang-select').addEventListener('change', (event) => {
    const lang = event.target.value;
    if (!LANGS.includes(lang)) return;
    setLang(lang);
    try { localStorage.setItem(STORAGE_KEYS.lang, lang); } catch {  }
    if ($('#detail-dialog').open) $('#detail-dialog').close();
    applyI18n();
    if (getState().view === 'explore') showBusy();
    setState({ lang, page: 1 });
    refreshFavUI();
  });

  searchForm.addEventListener('submit', (event) => { event.preventDefault(); runSearch({ strict: true }); });
  searchInput.addEventListener('input', debounce(() => runSearch({ strict: false }), 350));
  searchForm.addEventListener('change', (event) => { if (event.target.name === 'scope') runSearch({ strict: false }); });
  $('#search-clear').addEventListener('click', () => {
    searchForm.reset();
    runSearch({ strict: false });
    searchInput.focus();
  });

  $('#sort-select').addEventListener('change', (event) => setState({ sortKey: event.target.value, page: 1 }));
  $('#sort-dir').addEventListener('click', () => setState({ dir: getState().dir === 'asc' ? 'desc' : 'asc', page: 1 }));
  $('#page-size').addEventListener('change', (event) => {
    const size = Number(event.target.value);
    if (Number.isInteger(size) && size > 0) setState({ pageSize: size, page: 1 });
  });
  $('#page-prev').addEventListener('click', () => setState({ page: Math.max(1, getState().page - 1) }));
  $('#page-next').addEventListener('click', () => setState({ page: getState().page + 1 }));

  filterForm.addEventListener('input', debounce(filtersChanged, 200));
  filterForm.addEventListener('submit', (event) => event.preventDefault());
  filterForm.addEventListener('reset', () => {
    if (silentReset) { silentReset = false; return; }
    setTimeout(filtersChanged);
  });
  $('#empty-reset').addEventListener('click', () => filterForm.reset());
  $('#retry-btn').addEventListener('click', () => {
    if (getState().view === 'explore') showBusy();
    setState({ tick: getState().tick + 1 });
  });

  window.addEventListener('storage', (event) => {
    if ([STORAGE_KEYS.account, STORAGE_KEYS.session].includes(event.key)) refreshFavUI();
  });
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    toast(errorMessage(event.reason));
  });
}


function init() {
  const lang = detectLang();
  setLang(lang);
  $('#lang-select').value = lang;
  applyI18n();
  initDialogs();
  if (matchMedia('(max-width: 1023px)').matches) $('#filters').open = false;
  initAccountPanel({ onChange: refreshFavUI });
  bindEvents();
  subscribe(render);
  setState({ lang });
  refreshFavUI();
}

init();
