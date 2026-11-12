export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export const year = (s) => {
  const match = /\d{4}/.exec(String(s ?? ''));
  return match ? Number(match[0]) : NaN;
};

export const initial = (s) => norm(s).match(/\p{L}/u)?.[0]?.toUpperCase() ?? '';

export function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}
