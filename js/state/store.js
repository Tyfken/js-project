const state = {
  lang: 'en',
  view: 'home',
  category: 'characters',
  query: '',
  scope: 'category',
  sortKey: '',
  dir: 'asc',
  page: 1,
  pageSize: 12,
  tick: 0,
};
const listeners = new Set();

export const getState = () => state;

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((listener) => listener(state, patch));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
