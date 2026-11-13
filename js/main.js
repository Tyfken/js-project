/*
 * MAIN.JS — The app's conductor. Start reading here after index.html.
 *
 * THE BIG DATA FLOW:
 *   user action -> event listener -> changeState() -> renderCurrentView()
 *   -> API request -> search/filter/sort -> UI renderer -> visible cards.
 *
 * There is NO hidden publish/subscribe store in this version.
 * changeState() below directly calls the renderer, so the flow is easy to trace.
 *
 * Suggested walkthrough order:
 *   1. state and changeState       2. init and bindEvents
 *   3. renderHome / renderBrowse   4. search, filters, sort and pagination
 *   5. favorites and account refresh
 */

import {
  CATEGORIES,
  LANGUAGES,
  DEFAULT_LANGUAGE,
  DEFAULT_PAGE_SIZE,
  STORAGE_KEYS,
  BRAND_LOGO_PATH,
} from "./config.js";
import {
  getAll,
  getTeaser,
  getPage,
  getByIndex,
  getRandom,
  search,
  findItemIndex,
} from "./api/endpoints.js";
import {
  setLanguage,
  getLanguage,
  translate,
  applyTranslations,
} from "./i18n/i18n.js";
import {
  populateFilterOptions,
  readFilters,
  describeFilters,
  clearFilter,
  applyFilters,
} from "./features/filters.js";
import { SORT_OPTIONS, sortItems } from "./features/sort.js";
import { validateQuery, matchToFullRecords } from "./features/search.js";
import { isSignedIn, getCurrentUsername } from "./auth/auth.js";
import {
  getFavorites,
  isFavorite,
  addFavorite,
  removeFavorite,
  replaceFavorite,
} from "./storage/favorites.js";
import {
  renderCardsInto,
  renderSkeletonsInto,
  renderChips,
  setStatus,
  getErrorMessage,
  getTitle,
  setFavoriteButton,
} from "./ui/render.js";
import {
  initDialogs,
  openDetail,
  confirmSwap,
  currentDetail,
  toast,
} from "./ui/dialogs.js";
import {
  initAccountPanel,
  refreshAccountPanel,
  openPanel,
} from "./ui/account-panel.js";

/* ==========================================================================
   1. TRANSPARENT STATE
   This object is the single source of truth for the current screen and controls.
   ========================================================================== */
const state = {
  language: DEFAULT_LANGUAGE,
  view: "home", // 'home' or 'explore'
  category: "characters", // characters, books, houses, or spells
  query: "", // validated search text
  scope: "category", // 'category' or 'all'
  sortKey: "", // empty means "use this category's first option"
  direction: "asc", // 'asc' or 'desc'
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  refreshCount: 0, // increasing this asks for a fresh render (retry/filter)
};

// These variables coordinate asynchronous work; they are not user-facing data.
let renderVersion = 0; // prevents old API responses from overwriting new screens
let randomRequestVersion = 0;
let searchTimer = 0; // visible debounce timers, instead of a hidden utility
let filterTimer = 0;
let sortMenuLanguage = "";
let sortMenuCategory = "";

/**
 * The ONLY normal way to change screen state.
 * Step 1: update the object. Step 2: immediately render the current view.
 * No subscribe(), no listeners array, and no hidden automatic re-render.
 */
function changeState(changes) {
  Object.assign(state, changes);
  renderCurrentView();
}

/* ==========================================================================
   2. SMALL UI HELPERS
   ========================================================================== */

/** Choose a saved language, then the browser language, then English. */
function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.language);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {
    // Storage can be blocked in private browsing; continue with a sensible default.
  }
  const browserLanguage = navigator.language
    ? navigator.language.slice(0, 2)
    : "";
  if (LANGUAGES.includes(browserLanguage)) return browserLanguage;
  return DEFAULT_LANGUAGE;
}

/** Show loading cards in the normal results area. */
function showBusy() {
  const resultsList = document.getElementById("results");
  resultsList.hidden = false;
  document.getElementById("global-results").hidden = true;
  renderSkeletonsInto(resultsList, state.pageSize);
  setStatus({ busy: true });
}

/** Enable/disable pagination buttons and show "Page X of Y". */
function updatePager(currentPage, totalPages) {
  document.getElementById("pager").hidden = totalPages <= 1;
  document.getElementById("page-info").textContent = translate("pager.info", {
    page: currentPage,
    pages: totalPages,
  });
  document.getElementById("page-prev").disabled = currentPage <= 1;
  document.getElementById("page-next").disabled = currentPage >= totalPages;
}

/** Keep navigation highlights, visible screen, category fieldset and sort menu in sync. */
function syncNavigation() {
  // Step 1: highlight Home or Explore.
  const viewButtons = document.querySelectorAll("#category-nav [data-view]");
  for (const button of viewButtons) {
    if (button.dataset.view === state.view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  document.getElementById("view-home").hidden = state.view !== "home";
  document.getElementById("view-browse").hidden = state.view !== "explore";
  if (state.view !== "explore") return;

  // Step 2: highlight the selected category tab.
  const categoryTabs = document.querySelectorAll(
    "#category-tabs [data-category]",
  );
  for (const tab of categoryTabs) {
    if (tab.dataset.category === state.category)
      tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  }
  document.getElementById("results").dataset.category = state.category;

  // Step 3: show only this category's filters.
  const fieldsets = document.querySelectorAll(
    "#filter-form [data-for-category]",
  );
  for (const fieldset of fieldsets) {
    fieldset.hidden = fieldset.dataset.forCategory !== state.category;
  }
  document
    .getElementById("sort-dir")
    .setAttribute("aria-pressed", String(state.direction === "desc"));

  // Step 4: rebuild sort choices only when language or category changes.
  if (
    state.language !== sortMenuLanguage ||
    state.category !== sortMenuCategory
  ) {
    sortMenuLanguage = state.language;
    sortMenuCategory = state.category;
    const select = document.getElementById("sort-select");
    select.replaceChildren();
    const options = SORT_OPTIONS[state.category];
    for (const option of options) {
      select.add(new Option(translate(option.labelKey), option.key));
    }
    select.value = state.sortKey || options[0].key;
  }
}

/* ==========================================================================
   3. HOME RENDERING
   Each helper catches its own error, so one failed category does not hide the rest.
   ========================================================================== */

/** Load and display one four-item home preview. */
async function loadTeaser(category, language, requestVersion) {
  try {
    const items = await getTeaser(language, category);
    if (requestVersion !== renderVersion) return { ok: true }; // Ignore an old request.
    const list = document.querySelector(
      `[data-teaser="${category}"] [data-teaser-list]`,
    );
    renderCardsInto(list, category, items);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Pick a spell based on the day number, so it stays the same throughout one day. */
async function loadSpellOfTheDay(language, requestVersion) {
  try {
    const spells = await getAll(language, "spells");
    if (requestVersion !== renderVersion || spells.length === 0)
      return { ok: true };
    const dayNumber = Math.floor(Date.now() / 86400000); // 86,400,000 ms = one day.
    const spell = spells[dayNumber % spells.length];
    document.querySelector(
      '#spell-of-the-day [data-field="spell"]',
    ).textContent = spell.spell;
    document.querySelector('#spell-of-the-day [data-field="use"]').textContent =
      spell.use ?? "";
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Start the home requests together, then report failures without blocking the page. */
async function renderHome(requestVersion) {
  const language = state.language;
  // Promise.all waits for all five jobs. Each job catches its own network error.
  const results = await Promise.all([
    loadTeaser("characters", language, requestVersion),
    loadTeaser("books", language, requestVersion),
    loadTeaser("houses", language, requestVersion),
    loadTeaser("spells", language, requestVersion),
    loadSpellOfTheDay(language, requestVersion),
  ]);
  if (requestVersion !== renderVersion) return;

  let failedCount = 0;
  let firstError = null;
  for (const result of results) {
    if (!result.ok) {
      failedCount++;
      if (firstError === null) firstError = result.error;
    }
  }
  if (failedCount === results.length) toast(getErrorMessage(firstError));
  else if (failedCount > 0) toast(translate("error.unknown"));
}

/* ==========================================================================
   4. EXPLORE RENDERING: SEARCH -> FILTER -> SORT -> PAGINATE -> CARDS
   ========================================================================== */

/** Search one category for the "all categories" view. */
async function searchOneCategory(category, language, query) {
  try {
    const allItems = await getAll(language, category);
    const hits = await search(language, category, query);
    const items = matchToFullRecords(category, hits, allItems);
    return { ok: true, category, items };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Render grouped results when the user searches across all four categories. */
async function renderGlobalSearch(requestVersion, language, query) {
  const searchResults = await Promise.all([
    searchOneCategory("characters", language, query),
    searchOneCategory("books", language, query),
    searchOneCategory("houses", language, query),
    searchOneCategory("spells", language, query),
  ]);
  if (requestVersion !== renderVersion) return;

  const globalContainer = document.getElementById("global-results");
  globalContainer.replaceChildren();
  let totalCount = 0;
  let failedCount = 0;
  let firstError = null;

  // Build one section per category that has matches.
  for (const result of searchResults) {
    if (!result.ok) {
      failedCount++;
      if (firstError === null) firstError = result.error;
      continue;
    }
    if (result.items.length === 0) continue;
    totalCount += result.items.length;

    const heading = document.createElement("h3");
    heading.className = "global-heading";
    heading.textContent = translate(`nav.${result.category}`);
    const list = document.createElement("ul");
    list.className = "global-grid";
    renderCardsInto(list, result.category, result.items);
    const section = document.createElement("section");
    section.className = "global-section";
    section.append(heading, list);
    globalContainer.append(section);
  }

  // Global search has its own grouped area; normal filters and pager are hidden.
  const allFailed = failedCount === searchResults.length;
  globalContainer.hidden = false;
  document.getElementById("results").hidden = true;
  document.getElementById("filters").hidden = true;
  document.getElementById("pager").hidden = true;
  setStatus({
    error: allFailed ? getErrorMessage(firstError) : "",
    count: translate("results.count", { n: totalCount }),
    empty: !allFailed && totalCount === 0,
  });
  if (failedCount > 0 && !allFailed) toast(translate("search.failedSome"));
}

/** The normal single-category pipeline. Every step has one clear responsibility. */
async function renderBrowse(requestVersion) {
  const language = state.language;
  const category = state.category;
  const sortKey = state.sortKey || SORT_OPTIONS[category][0].key;

  if (state.query !== "" && state.scope === "all") {
    await renderGlobalSearch(requestVersion, language, state.query);
    return;
  }

  document.getElementById("results").hidden = false;
  document.getElementById("global-results").hidden = true;
  document.getElementById("filters").hidden = false;

  try {
    // Step 1: download the complete category. Houses are also needed for character filters.
    const allItems = await getAll(language, category);
    let houseList = [];
    if (category === "characters") houseList = await getAll(language, "houses");
    if (category === "houses") houseList = allItems;
    if (requestVersion !== renderVersion) return;

    // Step 2: build filter choices from ALL items, then read the active filters.
    // This is the first filtering level: the category tab already chose a list.
    populateFilterOptions(category, allItems, houseList);
    const filters = readFilters(category);
    const hasActiveFilters = Object.keys(filters).length > 0;
    renderChips(describeFilters(category));

    // Step 3: choose how to get the current page.
    // If there is no search, no filter, and the user chose "API order",
    // we use the API's own max + page parameters. Otherwise we fetch the full
    // list and do search/filter/sort/pagination in the browser.
    const useServerPagination =
      state.query === "" && !hasActiveFilters && sortKey === "api";

    let pageItems = [];
    let totalCount = 0;
    let totalPages = 1;
    let currentPage = 1;

    if (useServerPagination) {
      // The full list gives the total count; getPage asks the API for one page.
      totalCount = allItems.length;
      totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
      currentPage = Math.min(state.page, totalPages);
      state.page = currentPage;
      pageItems = await getPage(
        language,
        category,
        state.pageSize,
        currentPage,
      );
      if (requestVersion !== renderVersion) return;
    } else {
      // Step 3a: optional server search, then match hits to full records.
      let baseItems = allItems;
      if (state.query !== "") {
        const hits = await search(language, category, state.query);
        baseItems = matchToFullRecords(category, hits, allItems);
      }
      if (requestVersion !== renderVersion) return;

      // Step 3b: multi-level filtering: every active rule must pass.
      const filteredItems = applyFilters(
        category,
        baseItems,
        filters,
        houseList,
      );

      // Step 3c: sort a copy, so the original API order remains available.
      const sortedItems = sortItems(
        category,
        filteredItems,
        sortKey,
        state.direction,
        language,
      );

      // Step 3d: calculate a safe page number and copy only this page's items.
      totalCount = sortedItems.length;
      totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
      currentPage = Math.min(state.page, totalPages);
      state.page = currentPage;
      const firstPosition = (currentPage - 1) * state.pageSize;
      const lastPosition = firstPosition + state.pageSize;
      for (
        let position = firstPosition;
        position < lastPosition && position < sortedItems.length;
        position++
      ) {
        pageItems.push(sortedItems[position]);
      }
    }

    // Step 4: render cards and update the count, empty state and pager.
    renderCardsInto(document.getElementById("results"), category, pageItems);
    setStatus({
      count: translate("results.count", { n: totalCount }),
      empty: totalCount === 0,
    });
    updatePager(currentPage, totalPages);
  } catch (error) {
    if (requestVersion !== renderVersion) return; // A newer screen already won.
    document.getElementById("results").replaceChildren();
    updatePager(1, 1);
    setStatus({ error: getErrorMessage(error) });
  }
}

/** Increment the request version, sync the chrome, then render the selected screen. */
async function renderCurrentView() {
  renderVersion++;
  const thisRequest = renderVersion;
  syncNavigation();
  if (state.view === "home") await renderHome(thisRequest);
  else await renderBrowse(thisRequest);
}

/* ==========================================================================
   5. NAVIGATION AND SEARCH ACTIONS
   ========================================================================== */

/** Clear controls when switching to a different category. */
function resetBrowseControls() {
  clearTimeout(searchTimer);
  clearTimeout(filterTimer);

  // Clear each filter manually so no hidden reset event triggers an extra render.
  for (const control of document.getElementById("filter-form").elements) {
    if (control.type === "checkbox") control.checked = false;
    else if (control.name) control.value = "";
    control.removeAttribute("aria-invalid");
  }
  document.getElementById("search-form").reset();
  document.getElementById("search-error").hidden = true;
  document.getElementById("search-input").removeAttribute("aria-invalid");
  sortMenuCategory = ""; // Force the sort menu to be rebuilt for the new category.
}

/** Switch between Home and Explore without losing the current browse settings. */
function showView(view) {
  if (view !== "home" && view !== "explore") return;
  if (view === state.view) return;
  if (
    view === "explore" &&
    document.getElementById("results").children.length === 0
  )
    showBusy();
  changeState({ view });
  document.getElementById("main").focus();
}

/** Open a category tab or a "See all" link from the home page. */
function openCategory(category) {
  if (!CATEGORIES.includes(category)) return;
  const previousView = state.view;
  if (category === state.category) {
    showView("explore");
    return;
  }
  resetBrowseControls();
  showBusy();
  changeState({
    view: "explore",
    category,
    query: "",
    scope: "category",
    sortKey: "",
    direction: "asc",
    page: 1,
  });
  if (previousView === "home") document.getElementById("main").focus();
}

/**
 * Validate and run search.
 * strict=true (Submit button) shows validation errors.
 * strict=false (typing/scope change) waits quietly until the input is valid.
 */
function runSearch(strict) {
  clearTimeout(searchTimer); // A newer action cancels an older delayed search.
  const input = document.getElementById("search-input");
  const check = validateQuery(input.value);
  const error = document.getElementById("search-error");

  if (!check.ok) {
    if (strict) {
      error.textContent = translate(check.errorKey);
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
    }
    return;
  }
  error.hidden = true;
  input.removeAttribute("aria-invalid");

  const scope = new FormData(document.getElementById("search-form")).get(
    "scope",
  );
  if (check.value === state.query && scope === state.scope) return; // Nothing changed.
  if (check.value !== "") showBusy();
  changeState({ query: check.value, scope, page: 1 });
}

/** Called after a filter input changes or a filter chip/reset button is used. */
function applyFilterChange() {
  changeState({ page: 1, refreshCount: state.refreshCount + 1 });
}

/* ==========================================================================
   6. DETAILS, RANDOM ITEMS AND FAVORITES
   ========================================================================== */

/** Open the detail dialog and synchronize its favorite button. */
function showDetail(category, item) {
  openDetail(category, item);
  setFavoriteButton(
    document.getElementById("detail-fav"),
    isFavorite(category, Number(item.index)),
  );
}

/** Ask the API for a random item, then open its details. */
async function showRandom(category) {
  randomRequestVersion++;
  const thisRequest = randomRequestVersion;
  const language = getLanguage();
  try {
    const randomItem = await getRandom(language, category);
    const item = await findItemIndex(language, category, randomItem);
    // Ignore this result if another random click or language change happened first.
    if (thisRequest !== randomRequestVersion || language !== state.language)
      return;
    showDetail(category, item);
  } catch (error) {
    if (thisRequest === randomRequestVersion) toast(getErrorMessage(error));
  }
}

/** Refresh every visible bookmark button, the detail button, and the side panel. */
async function refreshFavoriteUI() {
  const cards = document.querySelectorAll("li.card[data-index]");
  for (const card of cards) {
    const button = card.querySelector('[data-action="favorite"]');
    setFavoriteButton(
      button,
      isFavorite(card.dataset.category, Number(card.dataset.index)),
    );
  }
  const detail = currentDetail();
  if (detail !== null) {
    setFavoriteButton(
      document.getElementById("detail-fav"),
      isFavorite(detail.category, Number(detail.item.index)),
    );
  }
  await refreshAccountPanel();
}

/** When the list is full, ask which slot to replace, then save that choice. */
async function swapFavorite(category, item, index) {
  const language = getLanguage();
  const username = getCurrentUsername();
  const favorites = getFavorites().slice(); // Snapshot the current four references.
  const labels = [];

  // Load readable titles for the radio choices. A failed lookup uses #index instead.
  for (const favorite of favorites) {
    let savedItem = null;
    try {
      savedItem = await getByIndex(language, favorite.category, favorite.index);
    } catch {
      // Keep the swap dialog usable even if one API request fails.
    }
    const title = savedItem
      ? getTitle(favorite.category, savedItem)
      : `#${favorite.index}`;
    labels.push(`${translate(`nav.${favorite.category}`)}: ${title}`);
  }
  // Do not open an outdated dialog after sign-out or a language change.
  if (
    !isSignedIn() ||
    username !== getCurrentUsername() ||
    language !== state.language
  )
    return;

  const slot = await confirmSwap(labels, getTitle(category, item));
  if (slot === null) return; // The user cancelled.
  if (!isSignedIn()) {
    toast(translate("auth.needSignIn"));
    return;
  }
  if (replaceFavorite(slot, category, index)) toast(translate("fav.replaced"));
  else toast(translate("fav.storageError"));
}

/** Add/remove a favorite, opening sign-in or the swap dialog when necessary. */
async function toggleFavorite(category, item) {
  if (!isSignedIn()) {
    if (document.getElementById("detail-dialog").open)
      document.getElementById("detail-dialog").close();
    openPanel(true);
    toast(translate("auth.needSignIn"));
    return;
  }
  const index = Number(item.index);
  if (isFavorite(category, index)) {
    if (removeFavorite(category, index)) toast(translate("fav.removed"));
    else toast(translate("fav.storageError"));
  } else {
    const result = addFavorite(category, index);
    if (result === "error") toast(translate("fav.storageError"));
    else if (result === "full") await swapFavorite(category, item, index);
    else if (result === "signedout") {
      openPanel(true);
      toast(translate("auth.needSignIn"));
    } else if (result === "added") toast(translate("fav.added"));
  }
  await refreshFavoriteUI();
}

/* ==========================================================================
   7. EVENT LISTENERS
   Each listener changes state or calls a clearly named action.
   ========================================================================== */

/**
 * Event delegation: one document click listener handles buttons created later.
 * Read the button's data-* attributes to decide which action the user requested.
 */
function handleDocumentClick(event) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button");
  if (button === null) return;

  if (button.dataset.view) {
    showView(button.dataset.view);
    return;
  }
  if (button.dataset.category) {
    openCategory(button.dataset.category);
    return;
  }
  if (button.dataset.random) {
    showRandom(button.dataset.random);
    return;
  }
  if (button.dataset.removeFilter) {
    clearFilter(state.category, button.dataset.removeFilter);
    applyFilterChange();
    return;
  }
  if (button.id === "detail-fav") {
    const detail = currentDetail();
    if (detail !== null) toggleFavorite(detail.category, detail.item);
    return;
  }
  if (button.dataset.action) {
    const card = button.closest("li.card");
    if (card === null || !card.itemData) return;
    if (button.dataset.action === "details")
      showDetail(card.dataset.category, card.itemData);
    if (button.dataset.action === "favorite")
      toggleFavorite(card.dataset.category, card.itemData);
  }
}

/** Language changes affect labels, API content, sort labels and favorite titles. */
async function handleLanguageChange(event) {
  const language = event.target.value;
  if (!LANGUAGES.includes(language)) return;
  setLanguage(language);
  try {
    localStorage.setItem(STORAGE_KEYS.language, language);
  } catch {
    // The language still works for this visit even if it cannot be remembered.
  }
  if (document.getElementById("detail-dialog").open)
    document.getElementById("detail-dialog").close();
  randomRequestVersion++;
  applyTranslations();
  if (state.view === "explore") showBusy();
  changeState({ language, page: 1 });
  await refreshFavoriteUI();
}

/** Connect every control exactly once during startup. */
function bindEvents() {
  // One delegated listener covers navigation, random buttons, filter chips and cards.
  document.addEventListener("click", handleDocumentClick);
  document
    .getElementById("lang-select")
    .addEventListener("change", handleLanguageChange);

  // SEARCH: submit is immediate; typing waits 350 ms after the last keystroke.
  document
    .getElementById("search-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      runSearch(true);
    });
  document
    .getElementById("search-input")
    .addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        runSearch(false);
      }, 350);
    });
  document
    .getElementById("search-form")
    .addEventListener("change", function (event) {
      if (event.target.name === "scope") runSearch(false);
    });
  document
    .getElementById("search-clear")
    .addEventListener("click", function () {
      document.getElementById("search-form").reset();
      runSearch(false);
      document.getElementById("search-input").focus();
    });

  // SORTING AND PAGINATION: each control updates state, then renders again.
  document
    .getElementById("sort-select")
    .addEventListener("change", function (event) {
      changeState({ sortKey: event.target.value, page: 1 });
    });
  document.getElementById("sort-dir").addEventListener("click", function () {
    const newDirection = state.direction === "asc" ? "desc" : "asc";
    changeState({ direction: newDirection, page: 1 });
  });
  document
    .getElementById("page-size")
    .addEventListener("change", function (event) {
      const size = Number(event.target.value);
      if (Number.isInteger(size) && size > 0)
        changeState({ pageSize: size, page: 1 });
    });
  document.getElementById("page-prev").addEventListener("click", function () {
    changeState({ page: Math.max(1, state.page - 1) });
  });
  document.getElementById("page-next").addEventListener("click", function () {
    changeState({ page: state.page + 1 });
  });

  // FILTERS: wait 200 ms so typing a page range does not render on every keystroke.
  document.getElementById("filter-form").addEventListener("input", function () {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilterChange, 200);
  });
  document
    .getElementById("filter-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
    });
  document.getElementById("filter-form").addEventListener("reset", function () {
    // The reset event fires BEFORE values reset; timeout 0 runs after that update.
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilterChange, 0);
  });
  document.getElementById("empty-reset").addEventListener("click", function () {
    document.getElementById("filter-form").reset();
  });
  document.getElementById("retry-btn").addEventListener("click", function () {
    if (state.view === "explore") showBusy();
    changeState({ refreshCount: state.refreshCount + 1 });
  });

  // Another tab may sign in/out or edit the same local account.
  window.addEventListener("storage", function (event) {
    if (
      event.key === null ||
      event.key === STORAGE_KEYS.account ||
      event.key === STORAGE_KEYS.session
    ) {
      refreshFavoriteUI();
    }
  });

  // Final safety net for an unexpected async error. Normal errors are handled above.
  window.addEventListener("unhandledrejection", function (event) {
    event.preventDefault();
    toast(getErrorMessage(event.reason));
  });
}

/* ==========================================================================
   8. STARTUP
   ========================================================================== */
function init() {
  // Step 0: use the central logo path so students can replace one SVG easily.
  document.getElementById("brand-logo").src = BRAND_LOGO_PATH;

  // Step 1: choose and apply the language before the first render.
  const language = detectLanguage();
  setLanguage(language);
  document.getElementById("lang-select").value = language;
  applyTranslations();

  // Step 2: initialize reusable UI and connect event listeners.
  initDialogs();
  if (matchMedia("(max-width: 1023px)").matches)
    document.getElementById("filters").open = false;
  initAccountPanel(refreshFavoriteUI);
  bindEvents();

  // Step 3: the first state change renders Home; then refresh account/favorite UI.
  changeState({ language });
  refreshFavoriteUI();
}

init();
