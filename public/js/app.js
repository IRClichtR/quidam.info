// @ts-check
import { loadStrings, t } from './i18n.js';

const root = document.documentElement;
await loadStrings(root.lang);

// data-i18n="key" sets the text; placeholders come from the element's other data-* attributes.
for (const el of document.querySelectorAll('[data-i18n]')) {
  const html = /** @type {HTMLElement} */ (el);
  html.textContent = t(html.dataset.i18n ?? '', { ...html.dataset });
}
// data-i18n-attr="aria-label:key" (several pairs separated by commas) sets attributes.
for (const el of document.querySelectorAll('[data-i18n-attr]')) {
  for (const pair of (el.getAttribute('data-i18n-attr') ?? '').split(',')) {
    const [attr, key] = pair.split(':').map((s) => s.trim());
    el.setAttribute(attr, t(key));
  }
}
root.dataset.i18nReady = root.lang;
