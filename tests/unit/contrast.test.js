// @ts-check
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../public/css/site.css', import.meta.url), 'utf8');

/** @param {string} block */
function tokens(block) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toUpperCase();
  return out;
}

const darkBlock = css.match(/^:root\s*\{([^}]*)\}/m);
const lightBlock = css.match(/@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{([^}]*)\}/);
const themes = {
  dark: tokens(darkBlock ? darkBlock[1] : ''),
  light: tokens(lightBlock ? lightBlock[1] : ''),
};

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const EXPECTED = {
  dark: { bg: '#121212', fg: '#EDEDED', soft: '#CFCFCF', muted: '#A3A3A3', line: '#2E2E2E', panel: '#1C1C1C', red: '#FF7469', 'on-red': '#121212', safe: '#22D3EE' },
  light: { bg: '#FAFAFA', fg: '#111111', soft: '#333333', muted: '#545454', line: '#D4D4D4', panel: '#EFEFEF', red: '#A1201A', 'on-red': '#FFFFFF', safe: '#005A6B' },
};

// The exact spec tokens put muted, red and safe below 7:1 on panel (6.45 to 6.83),
// so only fg and soft may be used as text on a panel. Reported to the controller.
const ON_BG = ['fg', 'soft', 'muted', 'red', 'safe'];
const ON_PANEL = ['fg', 'soft'];

describe.each(/** @type {const} */ (['dark', 'light']))('%s theme', (name) => {
  const tk = themes[name];
  it('uses the exact spec tokens', () => {
    expect(tk).toEqual(EXPECTED[name]);
  });
  it.each(ON_BG)('%s on bg is at least 7:1', (fg) => {
    expect(contrast(tk[fg], tk.bg)).toBeGreaterThanOrEqual(7);
  });
  it.each(ON_PANEL)('%s on panel is at least 7:1', (fg) => {
    expect(contrast(tk[fg], tk.panel)).toBeGreaterThanOrEqual(7);
  });
  it('onRed on red is at least 7:1', () => {
    expect(contrast(tk['on-red'], tk.red)).toBeGreaterThanOrEqual(7);
  });
});
