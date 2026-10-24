// @ts-check
import { describe, it, expect } from 'vitest';
import { FIXES, orderFixes, detectBrowser, BROWSERS, rescanText } from '../../public/js/fixes.js';
import { loadStrings, t } from '../../public/js/i18n.js';
import en from '../../public/js/i18n/en.js';
import fr from '../../public/js/i18n/fr.js';
import es from '../../public/js/i18n/es.js';

const ids = (/** @type {{id: string}[]} */ list) => list.map((f) => f.id);
const DEFAULT = ['block', 'dns', 'perms', 'browser', 'ip', 'split', 'tor'];

describe('FIXES', () => {
  it('follows the spec table and the mockup minutes', () => {
    expect(ids(FIXES)).toEqual(DEFAULT);
    expect(FIXES.map((f) => [f.tier, f.hides, f.minutes])).toEqual([
      ['quick', 2, 2], ['quick', 2, 1], ['quick', 1, 2],
      ['week', 3, 30], ['week', 3, 15], ['week', 2, 10],
      ['strong', 3, 10],
    ]);
  });

  it('links every tag to a known finding, or to none', () => {
    for (const fix of FIXES) {
      for (const tag of fix.tags) {
        if (tag.finding !== null) expect(en[`finding.${tag.finding}.label`], `${fix.id}: ${tag.finding}`).toBeTypeOf('string');
        expect(en[`fix.tag.${tag.label}`], tag.label).toBeTypeOf('string');
      }
    }
    const unlinked = FIXES.flatMap((f) => f.tags).filter((t) => t.finding === null).map((t) => t.label);
    expect(new Set(unlinked)).toEqual(new Set(['trackers', 'dns', 'cookies', 'profileLinking']));
  });

  it('has a title, reason, trade-off and steps for every browser', () => {
    for (const fix of FIXES) {
      for (const part of ['title', 'why', 'tradeoff']) expect(en[`fix.${fix.id}.${part}`]).toBeTypeOf('string');
      for (const b of BROWSERS) {
        const steps = en[`fix.${fix.id}.steps.${b}`];
        expect(Array.isArray(steps), `${fix.id}/${b}`).toBe(true);
        expect(steps.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('orderFixes', () => {
  it('promotes the fixes matching the threat, then keeps the default order', () => {
    expect(ids(orderFixes('targeted')).slice(0, 2)).toEqual(['tor', 'ip']);
    expect(ids(orderFixes('ads')).slice(0, 2)).toEqual(['block', 'browser']);
    expect(ids(orderFixes('network'))).toEqual(['dns', 'ip', 'block', 'perms', 'browser', 'split', 'tor']);
    expect(ids(orderFixes('targeted'))).toEqual(['tor', 'ip', 'block', 'dns', 'perms', 'browser', 'split']);
  });
  it('uses the default order without a threat', () => {
    expect(ids(orderFixes(null))).toEqual(DEFAULT);
  });
});

describe('detectBrowser', () => {
  const UA = {
    chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0',
    safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0',
  };
  it('reads one real user agent per browser', () => {
    expect(detectBrowser({ userAgent: UA.chrome })).toBe('chrome');
    expect(detectBrowser({ userAgent: UA.edge })).toBe('edge');
    expect(detectBrowser({ userAgent: UA.firefox })).toBe('firefox');
    expect(detectBrowser({ userAgent: UA.safari })).toBe('safari');
    expect(detectBrowser({ userAgent: UA.chrome.replace('Chrome/', 'HeadlessChrome/') })).toBe('chrome');
    expect(detectBrowser({ userAgent: UA.opera })).toBe('other');
    expect(detectBrowser({ userAgent: '' })).toBe('other');
  });
  it('detects Brave from navigator.brave, since it sends a Chrome user agent', () => {
    expect(detectBrowser({ userAgent: UA.chrome, brave: { isBrave: () => Promise.resolve(true) } })).toBe('brave');
  });
});

describe('the Hide your IP card', () => {
  it('VPN card names no providers', () => {
    for (const [lang, strings] of Object.entries({ en, fr, es })) {
      const keys = Object.keys(strings).filter((k) => k.startsWith('fix.ip.'));
      expect(keys.length, lang).toBeGreaterThan(0);
      for (const k of keys) expect(JSON.stringify(strings[k]), `${lang} ${k}`).not.toMatch(/mullvad|proton|nord|express|ivpn|nym/i);
    }
  });
});

describe('rescanText', () => {
  it('shows before and after, or only after when nothing was scanned before', async () => {
    await loadStrings('en');
    expect(rescanText(t, '3', '1')).toBe('leaking: 3 → 1');
    expect(rescanText(t, null, '4')).toBe('leaking now: 4');
  });
});
