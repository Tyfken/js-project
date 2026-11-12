import { PRIMARY, TEMPLATE_IDS } from '../config.js';
import { applyI18n, t } from '../i18n/i18n.js';
import { CLS, COLOR_MAP } from './styles.js';

const cardItems = new WeakMap();
const ERROR_KEYS = { network: 'error.network', timeout: 'error.timeout', http: 'error.http', parse: 'error.data', data: 'error.data' };

export const HOUSE_IMAGES = {
  0: 'img/houses/gryffindor.svg',
  1: 'img/houses/hufflepuff.svg',
  2: 'img/houses/ravenclaw.svg',
  3: 'img/houses/slytherin.svg',
};

export const itemOf = (card) => cardItems.get(card);
export const titleOf = (category, item) => String(item?.[PRIMARY[category]] ?? '');
export const errorMessage = (error) => t(ERROR_KEYS[error?.kind] ?? 'error.unknown', { status: error?.status ?? '' });

const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '');
const fromTemplate = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);

export function setFavButton(button, isFav) {
  button.setAttribute('aria-pressed', String(isFav));
  const label = button.querySelector('[data-label]') ?? button;
  label.dataset.i18n = isFav ? 'fav.remove' : 'fav.add';
  label.textContent = t(label.dataset.i18n);
}

export function renderCard(category, item) {
  if (category === 'houses' && !item.image) {
    item = { ...item, image: HOUSE_IMAGES[item.index] };
  }
  const card = fromTemplate(TEMPLATE_IDS[category]);
  card.dataset.index = item.index;
  for (const el of card.querySelectorAll('[data-field]')) {
    const field = el.dataset.field;
    const value = item[field];
    if (!hasValue(value)) {
      (el.closest('[data-row]') ?? el).hidden = true;
      continue;
    }
    if (el instanceof HTMLImageElement) {
      el.referrerPolicy = 'no-referrer';
      el.src = value;
      el.alt = titleOf(category, item);
      el.addEventListener('error', () => { el.hidden = true; }, { once: true });
    } else if (Array.isArray(value)) {
      el.replaceChildren(...value.map((entry) => {
        const li = document.createElement('li');
        if (field === 'colors') {
          const swatch = document.createElement('span');
          swatch.className = CLS.swatch;
          swatch.style.backgroundColor = COLOR_MAP[String(entry).toLowerCase()] ?? String(entry);
          li.className = CLS.colorItem;
          li.append(swatch, String(entry));
        } else {
          li.className = CLS.chipItem;
          li.textContent = String(entry);
        }
        return li;
      }));
    } else {
      el.textContent = field === 'number' ? t('field.bookNo', { n: value }) : String(value);
    }
  }
  cardItems.set(card, item);
  applyI18n(card);
  return card;
}

export function renderCards(category, items, isFav) {
  return items.map((item) => {
    const card = renderCard(category, item);
    setFavButton(card.querySelector('[data-action="favorite"]'), isFav(category, item.index));
    return card;
  });
}

export const skeletons = (count) => Array.from({ length: count }, () => fromTemplate('tpl-skeleton'));

export function setStatus({ error = '', empty = false, count = '', busy = false } = {}) {
  document.getElementById('error-panel').hidden = !error;
  document.getElementById('error-message').textContent = error;
  document.getElementById('empty-state').hidden = !empty;
  document.getElementById('results-count').textContent = count;
  document.getElementById('results').setAttribute('aria-busy', String(busy));
}

export function renderChips(chips) {
  document.getElementById('active-filters').replaceChildren(...chips.map(({ name, label }) => {
    const chip = fromTemplate('tpl-chip');
    chip.querySelector('[data-field="label"]').textContent = label;
    const button = chip.querySelector('button');
    button.dataset.removeFilter = name;
    button.setAttribute('aria-label', `${t('filter.remove')}: ${label}`);
    return chip;
  }));
}
