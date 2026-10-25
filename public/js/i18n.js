// @ts-check
// i18n (internationalisation): loads one language file and looks strings up by key.
// The page text lives in ./i18n/en.js, fr.js and es.js; HTML uses `data-i18n="key"` and
// scripts call `t('key')`.
import { LANGS } from './lang.js';

/** Most values are strings; step lists are arrays of strings. @typedef {Record<string, string|string[]>} Strings */

// DEV is true on localhost. There a missing key throws loudly so we notice it;
// for real visitors we show the raw key instead of breaking the page.
const DEV = typeof location === 'undefined' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** @type {Strings} */
let strings = {};
/** The loaded language, for plural rules and number formats. */
let current = 'en';

/**
 * Load one language's strings; unknown languages get English.
 * @param {string} lang
 * @returns {Promise<Strings>}
 */
export async function loadStrings(lang) {
  const code = LANGS.includes(/** @type {any} */ (lang)) ? lang : 'en';
  // Dynamic import: only the visitor's language file is downloaded.
  strings = (await import(`./i18n/${code}.js`)).default;
  current = code;
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
  // Replace each `{name}` with its value. Unknown placeholders are left as written.
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
}

/** Whether the loaded language has `key` (for optional parts, such as a tip or per-browser steps). @param {string} key */
export function has(key) {
  return key in strings;
}

// Counts need the right word form: "1 leak" but "2 leaks", and French says "0 fuite" where
// English says "0 leaks". Intl.PluralRules knows each language's rule; the string file has one
// variant per form, `key.one` and `key.other`. Forms a language file lacks (such as 'many') use 'other'.
/**
 * The plural form of `key` for `n`, with `{n}` (formatted for the language) and `vars` filled in.
 * @param {string} key
 * @param {number} n
 * @param {Record<string, string|number|undefined>} [vars]
 * @returns {string}
 */
export function tPlural(key, n, vars = {}) {
  const form = new Intl.PluralRules(current).select(n);
  const full = typeof strings[`${key}.${form}`] === 'string' ? `${key}.${form}` : `${key}.other`;
  return t(full, { n: new Intl.NumberFormat(current).format(n), ...vars });
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
