import { BASE_URL, LANGS, CATEGORIES, PRIMARY, TEASER_SIZE, contentLang } from '../config.js';
import { fetchJSON, ApiError } from './client.js';

const INTEGER_PARAMS = ['max', 'page', 'index'];

function buildUrl(lang, category, { random = false, ...params } = {}) {
  if (!LANGS.includes(lang)) throw new ApiError('data', `Unsupported language: ${lang}`);
  if (!CATEGORIES.includes(category)) throw new ApiError('data', `Unknown category: ${category}`);
  const apiLang = contentLang(lang);
  const url = new URL(`${BASE_URL}/${apiLang}/${category}${random ? '/random' : ''}`);
  for (const [key, value] of Object.entries(params)) {
    if (INTEGER_PARAMS.includes(key) && !(Number.isInteger(value) && value >= 0)) throw new ApiError('data', `Invalid ${key}`);
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data];
  throw new ApiError('data', 'Unexpected response shape');
}

const withPositions = (list) => list.map((item, i) => ({ ...item, index: item.index ?? i }));

export const getAll = async (lang, category) => withPositions(toArray(await fetchJSON(buildUrl(lang, category))));

export const getTeaser = async (lang, category, max = TEASER_SIZE) =>
  withPositions(toArray(await fetchJSON(buildUrl(lang, category, { max }))));

export async function getByIndex(lang, category, index) {
  const [item] = toArray(await fetchJSON(buildUrl(lang, category, { index })));
  if (!item) throw new ApiError('data', 'Item not found');
  return { ...item, index };
}

export async function getRandom(lang, category) {
  const [item] = toArray(await fetchJSON(buildUrl(lang, category, { random: true }), { useCache: false }));
  if (!item) throw new ApiError('data', 'Empty random response');
  return item;
}

export async function withIndex(lang, category, item) {
  if (Number.isInteger(item.index)) return item;
  const all = await getAll(lang, category);
  const key = PRIMARY[category];
  return all.find((candidate) => candidate[key] === item[key]) ?? item;
}

export async function search(lang, category, query) {
  try {
    return toArray(await fetchJSON(buildUrl(lang, category, { search: query })));
  } catch (error) {
    if (error.kind === 'http' && error.status === 404) return [];
    throw error;
  }
}
