// @ts-check
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import en from '../../public/js/i18n/en.js';
import fr from '../../public/js/i18n/fr.js';
import es from '../../public/js/i18n/es.js';
import { loadStrings, t, tList, tPlural, has } from '../../public/js/i18n.js';

/** Keys whose value may stay as in English: brand and language names, OK, the command line. */
const SAME_OK = /^(lang\.\w+|fix\.browser\.(chrome|firefox|safari|edge|brave)|fix\.platform\.\w+|conn\.line\.relay|tag\.ok|hero\.prompt)$/;
/** True when a value has a word to translate once its placeholders are removed (not only '{n} GB'). */
const hasWords = (/** @type {string} */ v) => /\p{L}{3}/u.test(v.replace(/\{\w+\}/g, ''));

/** @param {Record<string, string|string[]>} strings @returns {[string, string][]} */
const leaves = (strings) => Object.entries(strings).flatMap(([k, v]) => [v].flat().map((x, i) => /** @type {[string, string]} */ ([`${k}#${i}`, x])));

describe('string files', () => {
  it('have identical key sets', () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(fr).sort()).toEqual(keys);
    expect(Object.keys(es).sort()).toEqual(keys);
  });
  it('translate the LEAK tag', () => {
    expect([en['tag.leak'], fr['tag.leak'], es['tag.leak']]).toEqual(['LEAK', 'FUITE', 'FUGA']);
  });
  it('fr and es differ from en', () => {
    const base = new Map(leaves(en));
    for (const strings of [fr, es]) {
      const counted = leaves(strings).filter(([k, v]) => !SAME_OK.test(k.split('#')[0]) && hasWords(v));
      const same = counted.filter(([k, v]) => base.get(k) === v);
      expect(same.length / counted.length, same.map(([k]) => k).join(', ')).toBeLessThan(0.1);
    }
  });
  it('keep every placeholder', () => {
    const names = (/** @type {string} */ v) => (v.match(/\{\w+\}/g) ?? []).sort().join();
    for (const strings of [fr, es]) {
      for (const [key, value] of Object.entries(strings)) {
        const list = [value].flat();
        const base = [en[key]].flat();
        // A step list of another length would compare the wrong items.
        expect(list.length, `${key}: ${list.length} items, English has ${base.length}`).toBe(base.length);
        list.forEach((v, i) => expect(names(v), `${key}#${i}`).toBe(names(base[i])));
      }
    }
  });
  it('fr puts a no-break space (U+00A0) before ? : ; !', () => {
    for (const [k, v] of leaves(fr)) expect(v, k).not.toMatch(/[^\u00a0][?:;!](?=\s|$)/);
    const html = readFileSync(new URL('../../public/fr/index.html', import.meta.url), 'utf8');
    const text = [...html.matchAll(/>([^<]+)</g), ...html.matchAll(/ (?:content|aria-label|title|alt)="([^"]+)"/g)].map((m) => m[1]);
    const ENTITIES = /** @type {Record<string, string>} */ ({ nbsp: '\u00a0', gt: '>', lt: '<', amp: '&', quot: '"' });
    for (const v of text) expect(v.replace(/&(\w+);/g, (m, e) => ENTITIES[e] ?? m)).not.toMatch(/[^\u00a0][?:;!](?=\s|$)/);
  });
  it('fr uses a no-break space inside « » and never a plain one', () => {
    for (const [k, v] of leaves(fr)) {
      expect(v, k).not.toMatch(/« /);
      expect(v, k).not.toMatch(/ »/);
      expect(v, k).not.toMatch(/ [:;?!](?=\s|$)/);
    }
  });
  it('every plural key has both forms', () => {
    for (const strings of [en, fr, es]) {
      const bases = new Set(Object.keys(strings).filter((k) => k.endsWith('.one')).map((k) => k.slice(0, -'.one'.length)));
      for (const b of bases) for (const form of ['one', 'other']) expect(strings[`${b}.${form}`], `${b}.${form}`).toBeTypeOf('string');
    }
  });
  it('no v1 "top 3" wording remains', () => {
    expect(JSON.stringify([en, fr, es])).not.toMatch(/top 3|3 premiers|3 primeras/i);
  });
  it('have no empty value', () => {
    for (const strings of [en, fr, es]) {
      for (const [key, value] of Object.entries(strings)) {
        for (const v of [value].flat()) expect(v.trim(), key).not.toBe('');
      }
    }
  });
});

describe('t', () => {
  it('returns the loaded language and fills placeholders', async () => {
    await loadStrings('fr');
    expect(t('tag.leak')).toBe('FUITE');
    await loadStrings('en');
    expect(t('tag.leak')).toBe('LEAK');
    expect(t('header.stored', { n: 0 })).toBe('0 bytes stored');
  });
  it('throws on a missing key in development', async () => {
    await loadStrings('en');
    expect(() => t('no.such.key')).toThrow(/no.such.key/);
  });
  it('tPlural picks the form for the language, with the number formatted', async () => {
    await loadStrings('en');
    expect(tPlural('fix.leaks', 1)).toBe('1 leak');
    expect(tPlural('fix.leaks', 0)).toBe('0 leaks');
    expect(tPlural('fix.tile.count', 1200)).toBe('1,200 problems');
    await loadStrings('fr');
    // French: 0 and 1 are singular.
    expect(tPlural('fix.leaks', 0)).toBe('0 fuite');
    expect(tPlural('fix.leaks', 2)).toBe('2 fuites');
    expect(tPlural('fix.progress', 4, { d: '1' })).toBe('1 / 4 réglés');
    await loadStrings('es');
    expect(tPlural('fix.leaks', 1)).toBe('1 fuga');
    expect(tPlural('fix.leaks', 0)).toBe('0 fugas');
    await loadStrings('en');
  });
  it('has tells whether a key exists', async () => {
    await loadStrings('en');
    expect(has('fix.browser.tip')).toBe(true);
    expect(has('fix.where.tip')).toBe(false);
  });
  it('tList returns a list and throws on a missing key in development', async () => {
    await loadStrings('en');
    const steps = tList('fix.browser.steps');
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(() => tList('no.such.list')).toThrow(/no.such.list/);
  });
});

describe('translated pages', () => {
  it('match the English page and the string files (run npm run pages after a change)', async () => {
    const { translatePage } = await import('../../scripts/sync-pages.js');
    const enPage = readFileSync(new URL('../../public/en/index.html', import.meta.url), 'utf8');
    for (const [lang, strings] of /** @type {const} */ ([['fr', fr], ['es', es]])) {
      const page = readFileSync(new URL(`../../public/${lang}/index.html`, import.meta.url), 'utf8');
      expect(page, `public/${lang}/index.html is out of date: run npm run pages`).toBe(translatePage(enPage, lang, strings));
    }
  });
  it('the English page shows the English strings before the scripts run', () => {
    const page = readFileSync(new URL('../../public/en/index.html', import.meta.url), 'utf8');
    for (const [, key, text] of page.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      const want = String(en[key]).replace(/\{n\}/, '0').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      expect(text.replace(/&#39;/g, "'"), key).toBe(want);
    }
  });
});
