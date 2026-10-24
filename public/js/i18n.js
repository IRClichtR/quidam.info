// @ts-check
import { LANGS } from './lang.js';

/** Most values are strings; step lists are arrays of strings. @typedef {Record<string, string|string[]>} Strings */

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
  if (typeof s !== 'string') {
    if (DEV) throw new Error(`missing string: ${key}`);
    return key;
  }
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
}

/**
 * The loaded list for `key` (steps, one string per item). Missing keys behave as in `t`.
 * @param {string} key
 * @returns {string[]}
 */
export function tList(key) {
  const s = strings[key];
  if (!Array.isArray(s)) {
    if (DEV) throw new Error(`missing list: ${key}`);
    return [key];
  }
  return s;
}
