// @ts-check
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import en from '../../public/js/i18n/en.js';
import fr from '../../public/js/i18n/fr.js';
import es from '../../public/js/i18n/es.js';
import { loadStrings, t, tList } from '../../public/js/i18n.js';
import { FIXES, BROWSERS } from '../../public/js/fixes.js';

/** Keys whose value may stay as in English: brand and language names, OK, the command line. */
const SAME_OK = /^(lang\.\w+|fix\.browser\.(chrome|firefox|safari|edge|brave)|tag\.ok|hero\.prompt)$/;
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
  it('every fix has steps for every browser in every language', () => {
    for (const strings of [en, fr, es]) {
      for (const fix of FIXES) {
        for (const b of BROWSERS) {
          const steps = strings[`fix.${fix.id}.steps.${b}`];
          expect(Array.isArray(steps) && steps.length > 0, `fix.${fix.id}.steps.${b}`).toBe(true);
        }
      }
    }
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
  it('tList returns a list and throws on a missing key in development', async () => {
    await loadStrings('en');
    const steps = tList('fix.dns.steps.chrome');
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(() => tList('no.such.list')).toThrow(/no.such.list/);
  });
});
