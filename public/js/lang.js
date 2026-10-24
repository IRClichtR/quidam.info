// @ts-check
/** @typedef {'en'|'fr'|'es'} Lang */

/** @type {readonly Lang[]} */
export const LANGS = ['en', 'fr', 'es'];

/**
 * First supported language among the browser's preferences, English otherwise.
 * @param {readonly string[]} prefs
 * @returns {Lang}
 */
export function pickLanguage(prefs) {
  for (const pref of prefs) {
    const code = /** @type {Lang} */ (pref.toLowerCase().split('-')[0]);
    if (LANGS.includes(code)) return code;
  }
  return 'en';
}

/**
 * Where the root page (`/` or `/index.html`) should go; null on any other page.
 * @param {string} pathname
 * @param {readonly string[]} prefs
 * @returns {string|null}
 */
export function languageRedirect(pathname, prefs) {
  return pathname === '/' || pathname === '/index.html' ? '/' + pickLanguage(prefs) + '/' : null;
}

// On the root page, open the matching language. Decided here, nothing is sent anywhere.
const target = typeof location === 'undefined' ? null : languageRedirect(location.pathname, navigator.languages ?? []);
if (target) location.replace(target);
