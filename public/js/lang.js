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

// On the root page, open the matching language. Decided here, nothing is sent anywhere.
if (typeof location !== 'undefined' && location.pathname === '/') {
  location.replace('/' + pickLanguage(navigator.languages ?? []) + '/');
}
