// @ts-check
import { describe, it, expect } from 'vitest';
import { pickLanguage } from '../../public/js/lang.js';

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
