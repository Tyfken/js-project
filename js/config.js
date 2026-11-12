export const BASE_URL = 'https://potterapi-fedeperin.vercel.app';
export const LANGS = ['en', 'es', 'fr', 'it', 'pt', 'uk', 'id'];
export const API_LANGS = ['en', 'es', 'fr', 'it', 'pt', 'uk'];
export const DEFAULT_LANG = 'en';
export const contentLang = (lang) => (API_LANGS.includes(lang) ? lang : DEFAULT_LANG);
export const CATEGORIES = ['characters', 'books', 'houses', 'spells'];
export const PRIMARY = { characters: 'fullName', books: 'title', houses: 'house', spells: 'spell' };
export const TEMPLATE_IDS = { characters: 'tpl-character', books: 'tpl-book', houses: 'tpl-house', spells: 'tpl-spell' };
export const MAX_FAVORITES = 4;
export const TEASER_SIZE = 4;
export const STORAGE_KEYS = { account: 'hp:v2:account', session: 'hp:v2:session', lang: 'hp:v1:lang' };
export const AUTH = {
  iterations: 600000,
  minPassword: 8,
  maxPassword: 128,
  maxAttempts: 5,
  baseLockMs: 30000,
  maxLockMs: 300000,
};
