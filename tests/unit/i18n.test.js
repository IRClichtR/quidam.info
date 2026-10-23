// @ts-check
import { describe, it, expect } from 'vitest';
import en from '../../public/js/i18n/en.js';
import fr from '../../public/js/i18n/fr.js';
import es from '../../public/js/i18n/es.js';
import { loadStrings, t } from '../../public/js/i18n.js';

describe('string files', () => {
  it('have identical key sets', () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(fr).sort()).toEqual(keys);
    expect(Object.keys(es).sort()).toEqual(keys);
  });
  it('translate the LEAK tag', () => {
    expect([en['tag.leak'], fr['tag.leak'], es['tag.leak']]).toEqual(['LEAK', 'FUITE', 'FUGA']);
  });
  it('have no empty value', () => {
    for (const strings of [en, fr, es]) {
      for (const [key, value] of Object.entries(strings)) expect(value.trim(), key).not.toBe('');
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
});
