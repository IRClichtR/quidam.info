// @ts-check
import { describe, it, expect } from 'vitest';
import { pickLanguage, languageRedirect } from '../../public/js/lang.js';

describe('pickLanguage', () => {
  it('takes the first supported language by primary subtag', () => {
    expect(pickLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(pickLanguage(['de', 'es-MX'])).toBe('es');
  });
  it('falls back to English', () => {
    expect(pickLanguage(['de'])).toBe('en');
    expect(pickLanguage([])).toBe('en');
  });
});

describe('languageRedirect', () => {
  it('sends the root page, as / or /index.html, to the picked language', () => {
    expect(languageRedirect('/', ['fr-FR'])).toBe('/fr/');
    expect(languageRedirect('/index.html', ['es'])).toBe('/es/');
    expect(languageRedirect('/index.html', [])).toBe('/en/');
  });
  it('leaves language pages alone', () => {
    expect(languageRedirect('/en/', ['fr'])).toBeNull();
    expect(languageRedirect('/fr/index.html', ['en'])).toBeNull();
  });
});
