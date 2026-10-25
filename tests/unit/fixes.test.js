// @ts-check
import { describe, it, expect } from 'vitest';
import { OPTIONS, optionsFor, detectBrowser, detectPlatform, BROWSERS, rescanText } from '../../public/js/fixes.js';
import { PROBLEMS } from '../../public/js/problems.js';
import { loadStrings, t } from '../../public/js/i18n.js';
import en from '../../public/js/i18n/en.js';
import fr from '../../public/js/i18n/fr.js';
import es from '../../public/js/i18n/es.js';

const UA = {
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0',
};

describe('product policy', () => {
  // The design asks for 2 to 4 options, but its own browser table gives 5 on Windows and 6 on macOS.
  // We follow the table (see the open question in docs/leakcheck-design-v2.md).
  it('every fix with products offers at least 2 options on every platform, in alphabetical order', () => {
    for (const id of /** @type {const} */ (['browser', 'where', 'webrtc'])) {
      for (const platform of /** @type {const} */ (['windows', 'mac', 'linux', 'ios', 'android', 'other'])) {
        const { shown } = optionsFor(id, platform, 'chrome');
        const names = shown.map((o) => o.name);
        expect(names.length, `${id} ${platform}`).toBeGreaterThanOrEqual(2);
        expect(names, `${id} ${platform}`).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
      }
    }
  });

  it('on Linux, hides DuckDuckGo and Safari and names them', () => {
    const { shown, hidden, where } = optionsFor('browser', 'linux', 'firefox');
    expect(shown.map((o) => o.name)).toEqual(['Brave', 'Firefox', 'Mullvad Browser', 'Tor Browser']);
    expect(hidden).toEqual(['DuckDuckGo', 'Safari']);
    expect(where).toBe('platform');
  });

  it('never lists Opera, and never names a company left out of the VPN list', () => {
    const all = JSON.stringify([OPTIONS, en, fr, es]);
    expect(all).not.toMatch(/\bOpera\b|nord ?vpn|expressvpn|surfshark|cyberghost|private internet access|hotspot shield/i);
  });

  it('every option has a note in every language', () => {
    for (const strings of [en, fr, es]) {
      for (const o of Object.values(OPTIONS).flat()) expect(strings[`fix.opt.${o.note}`], o.note).toBeTypeOf('string');
    }
  });

  it('extensions are hidden in Safari, and the note names the browser', () => {
    expect(optionsFor('gpc', 'mac', 'safari')).toMatchObject({ shown: [], hidden: ['DuckDuckGo Privacy Essentials', 'Privacy Badger'], where: 'browser' });
    expect(optionsFor('gpc', 'windows', 'chrome').shown.length).toBe(2);
  });
});

describe('every problem has its card text in every language', () => {
  it('title, description, fix, effort, steps and trade-off', () => {
    for (const strings of [en, fr, es]) {
      for (const { id } of PROBLEMS) {
        for (const part of ['title', 'desc', 'fix', 'fixDesc', 'effort', 'trade']) expect(strings[`fix.${id}.${part}`], `${id}.${part}`).toBeTypeOf('string');
        expect(Array.isArray(strings[`fix.${id}.steps`]), `${id}.steps`).toBe(true);
      }
      expect(strings['fix.browser.coverage']).toBeTypeOf('string');
      expect(strings['fix.browser.tip']).toBeTypeOf('string');
    }
  });
});

describe('detectBrowser', () => {
  it('reads one real user agent per browser', () => {
    expect(detectBrowser({ userAgent: UA.chrome })).toBe('chrome');
    expect(detectBrowser({ userAgent: UA.edge })).toBe('edge');
    expect(detectBrowser({ userAgent: UA.firefox })).toBe('firefox');
    expect(detectBrowser({ userAgent: UA.safari })).toBe('safari');
    expect(detectBrowser({ userAgent: UA.chrome.replace('Chrome/', 'HeadlessChrome/') })).toBe('chrome');
    expect(detectBrowser({ userAgent: UA.opera })).toBe('other');
    expect(detectBrowser({ userAgent: '' })).toBe('other');
    expect(BROWSERS).toContain('other');
  });
  it('detects Brave from navigator.brave, since it sends a Chrome user agent', () => {
    expect(detectBrowser({ userAgent: UA.chrome, brave: { isBrave: () => Promise.resolve(true) } })).toBe('brave');
  });
});

describe('detectPlatform', () => {
  it('prefers navigator.userAgentData, then the user agent', () => {
    expect(detectPlatform({ userAgent: UA.chrome, userAgentData: { platform: 'Linux' } })).toBe('linux');
    expect(detectPlatform({ userAgent: UA.edge })).toBe('windows');
    expect(detectPlatform({ userAgent: UA.firefox })).toBe('linux');
    expect(detectPlatform({ userAgent: UA.safari })).toBe('mac');
    expect(detectPlatform({ userAgent: UA.iphone })).toBe('ios');
    expect(detectPlatform({ userAgent: UA.android })).toBe('android');
    expect(detectPlatform({ userAgent: '' })).toBe('other');
  });
  it('an iPad asking for the desktop page says Macintosh but has a touch screen', () => {
    expect(detectPlatform({ userAgent: UA.safari, maxTouchPoints: 5 })).toBe('ios');
  });
});

describe('rescanText', () => {
  it('shows before and after, or only after when nothing was scanned before', async () => {
    await loadStrings('en');
    expect(rescanText(t, '3', '1')).toBe('leaking: 3 → 1');
    expect(rescanText(t, null, '4')).toBe('leaking now: 4');
  });
});
