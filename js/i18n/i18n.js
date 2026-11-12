import { DICTIONARIES } from './dictionaries.js';
import { LANGS, DEFAULT_LANG } from '../config.js';

let current = DEFAULT_LANG;

export const getLang = () => current;

export function setLang(lang) {
  current = LANGS.includes(lang) ? lang : DEFAULT_LANG;
  document.documentElement.lang = current;
}

export function t(key, vars = {}) {
  const text = DICTIONARIES[current]?.[key] ?? DICTIONARIES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
