// @ts-check
// Dev script: writes public/fr/index.html and public/es/index.html from public/en/index.html.
// Run with `npm run pages` after changing the English page or any string file.
// The pages carry the same markup; only the text differs. Every element marked data-i18n gets its
// text from the language file here too, so the page reads right before the scripts run (search
// engines, slow connections, JavaScript turned off). app.js fills the same keys at runtime.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PUBLIC = path.join(import.meta.dirname, '..', 'public');
const LANGS = ['fr', 'es'];

/** @param {string} s */
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The page in another language.
 * @param {string} html the English page
 * @param {string} lang
 * @param {Record<string, string|string[]>} strings
 */
export function translatePage(html, lang, strings) {
  /** @param {string} key @param {Record<string, string>} [vars] */
  const t = (key, vars = {}) => {
    const s = strings[key];
    if (typeof s !== 'string') throw new Error(`${lang}: missing string ${key}`);
    return s.replace(/\{(\w+)\}/g, (m, name) => vars[name] ?? m);
  };
  return html
    .replace('<html lang="en">', `<html lang="${lang}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(t('page.title'))}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${escape(t('page.description'))}"`)
    // The current language is marked on its own link in the picker.
    .replace(' aria-current="page" data-i18n="lang.en"', ' data-i18n="lang.en"')
    .replace(` data-i18n="lang.${lang}"`, ` aria-current="page" data-i18n="lang.${lang}"`)
    .replace('href="/en/legal/"', `href="/${lang}/legal/"`)
    // <tag … data-i18n="key" …>text</tag>: the other data-* attributes fill the placeholders.
    .replace(/(<(\w+)\b([^>]*)\bdata-i18n="([^"]+)"([^>]*)>)[^<]*(<\/\2>)/g, (_m, open, _tag, before, key, after, close) => {
      /** @type {Record<string, string>} */
      const vars = {};
      for (const [, name, value] of `${before} ${after}`.matchAll(/data-(\w+)="([^"]*)"/g)) vars[name] = value;
      return `${open}${escape(t(key, vars))}${close}`;
    })
    // data-i18n-attr="aria-label:key": the attribute's static value too.
    .replace(/(\w[\w-]*)="[^"]*"([^>]*data-i18n-attr="\1:([\w.]+)")/g, (_m, attr, rest, key) => `${attr}="${escape(t(key))}"${rest}`);
}

// Run only as a script (`npm run pages`), not when a test imports translatePage.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const en = await readFile(path.join(PUBLIC, 'en', 'index.html'), 'utf8');
  for (const lang of LANGS) {
    const strings = (await import(path.join(PUBLIC, 'js', 'i18n', `${lang}.js`))).default;
    await writeFile(path.join(PUBLIC, lang, 'index.html'), translatePage(en, lang, strings));
    console.log(`wrote public/${lang}/index.html`);
  }
}
