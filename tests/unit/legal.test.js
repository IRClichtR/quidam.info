// @ts-check
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateOwner, legalPage, securityTxt, registre } from '../../scripts/legal.js';

const example = JSON.parse(readFileSync(new URL('../../legal/owner.example.json', import.meta.url), 'utf8'));
const owner = {
  ...example,
  you: { fullName: 'Camille Martin', email: 'contact@mysite.fr', publishHomeAddress: false },
  site: { domain: 'mysite.fr', sourceCode: 'https://github.com/x/y' },
};
const when = new Date('2026-11-02T00:00:00Z');

describe('validateOwner', () => {
  it('accepts a filled file', () => expect(validateOwner(owner)).toEqual([]));
  it('refuses the untouched example and says which fields are missing', () => {
    const bad = validateOwner(example);
    expect(bad.some((b) => b.startsWith('you.fullName'))).toBe(true);
    expect(bad.some((b) => b.startsWith('you.email'))).toBe(true);
    expect(bad.some((b) => b.startsWith('site.domain'))).toBe(true);
  });
  it('asks for the address and phone only when they are to be published', () => {
    const named = { ...owner, you: { ...owner.you, publishHomeAddress: true } };
    expect(validateOwner(named).map((b) => b.split(':')[0])).toEqual(['you.homeAddress', 'you.phone']);
  });
  it('wants a bare domain', () => {
    expect(validateOwner({ ...owner, site: { domain: 'https://mysite.fr/' } })).toHaveLength(1);
  });
});

describe('legalPage', () => {
  it('names the publisher, the host and the CNIL, in every language, with no script', () => {
    for (const lang of /** @type {const} */ (['en', 'fr', 'es'])) {
      const html = legalPage(lang, owner, when);
      expect(html).toContain('Camille Martin');
      expect(html).toContain('mailto:contact@mysite.fr');
      expect(html).toContain('Hetzner Online GmbH');
      expect(html).toContain('cnil.fr');
      expect(html).toContain('1-1');
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toContain('[[');
    }
  });
  it('keeps the home address private unless asked to publish it', () => {
    const named = { ...owner, you: { ...owner.you, publishHomeAddress: true, homeAddress: '1 rue X, 69001 Lyon', phone: '+33 6 00 00 00 00' } };
    expect(legalPage('fr', owner, when)).not.toContain('rue X');
    expect(legalPage('fr', named, when)).toContain('1 rue X, 69001 Lyon');
    expect(legalPage('fr', named, when)).toContain('directeur de la publication');
  });
  it('escapes what the owner typed', () => {
    const html = legalPage('en', { ...owner, you: { ...owner.you, fullName: '<b>x</b>' } }, when);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('securityTxt and registre', () => {
  it('security.txt has a contact and expires in a year', () => {
    expect(securityTxt(owner, when)).toBe('Contact: mailto:contact@mysite.fr\nExpires: 2027-11-02T00:00:00Z\nPreferred-Languages: en, fr, es\nCanonical: https://mysite.fr/.well-known/security.txt\n');
  });
  it('the record of processing names the processor and the retention', () => {
    const md = registre(owner, when);
    expect(md).toContain('Hetzner Online GmbH');
    expect(md).toContain('Une minute, en mémoire vive');
  });
});
