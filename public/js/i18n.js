// @ts-check
import { LANGS } from './lang.js';

/** @typedef {Record<string, string>} Strings */

const DEV = typeof location === 'undefined' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** @type {Strings} */
let strings = {};

/**
 * Load one language's strings; unknown languages get English.
 * @param {string} lang
 * @returns {Promise<Strings>}
 */
export async function loadStrings(lang) {
  const code = LANGS.includes(/** @type {any} */ (lang)) ? lang : 'en';
  strings = (await import(`./i18n/${code}.js`)).default;
  return strings;
}

/**
 * The loaded string for `key`, with `{name}` placeholders filled from `vars`.
 * A missing key throws in development and shows the key in production.
 * @param {string} key
 * @param {Record<string, string|number|undefined>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
  const s = strings[key];
  if (s === undefined) {
    if (DEV) throw new Error(`missing string: ${key}`);
    return key;
  }
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
}
