import { PRIMARY } from '../config.js';

const MIN_QUERY = 2;
const MAX_QUERY = 60;

export function validateQuery(raw) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!value) return { ok: true, value: '' };
  if (value.length < MIN_QUERY) return { ok: false, errorKey: 'search.tooShort' };
  if (value.length > MAX_QUERY) return { ok: false, errorKey: 'search.tooLong' };
  if (!/[\p{L}\p{N}]/u.test(value)) return { ok: false, errorKey: 'search.invalid' };
  return { ok: true, value };
}

export function matchToList(category, found, all) {
  const key = PRIMARY[category];
  const byName = new Map(all.map((item) => [item[key], item]));
  return found.map((hit) => byName.get(hit[key])).filter(Boolean);
}
