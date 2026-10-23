// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';
const LANGS = ['en', 'fr', 'es'];

/** Record CSP violations seen by the page itself (works in every engine). */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    /** @type {any} */ (window).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      /** @type {any} */ (window).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
});

test.describe('root language pick', () => {
  test.use({ locale: 'fr-FR' });
  test('/ redirects to /fr/ for a French browser', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForURL(BASE + '/fr/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});

for (const lang of LANGS) {
  test(`/${lang}/ declares its language and the alternates`, async ({ page }) => {
    await page.goto(`${BASE}/${lang}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const alt of LANGS) {
      await expect(page.locator(`link[rel="alternate"][hreflang="${alt}"]`)).toHaveAttribute('href', `/${alt}/`);
    }
  });
}

test('the shell provides the anchors later tasks fill', async ({ page }) => {
  await page.goto(BASE + '/en/');
  for (const sel of ['#browser', '#connection', '#localnet', '#fix', '#results', '#run-scan']) {
    await expect(page.locator(sel)).toHaveCount(1);
  }
  await expect(page.locator('#announce')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#run-scan')).toHaveText('RUN THE SCAN');
  await expect(page.locator('#browser h2')).toContainText('your browser');
});

test('each page loads its own string file', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto(BASE + '/fr/');
  await expect(page.locator('html')).toHaveAttribute('data-i18n-ready', 'fr');
  expect(urls).toContain(BASE + '/js/i18n/fr.js');
  await expect(page.locator('#skip')).toHaveText('Skip to results');
});

test('the skip link is the first Tab stop and targets the results', async ({ page }) => {
  await page.goto(BASE + '/en/');
  await page.keyboard.press('Tab');
  const focused = page.locator('#skip:focus');
  await expect(focused).toHaveAttribute('href', '#results');
  await expect(focused).toHaveText('Skip to results');
  await expect(focused).toBeInViewport();
});

test('the picker shows each language in its own name', async ({ page }) => {
  await page.goto(BASE + '/es/');
  const picker = page.locator('nav[aria-label]').filter({ hasText: 'Español' });
  await expect(picker).toHaveText('English · Français · Español');
  await expect(picker.locator('a[aria-current="page"]')).toHaveText('Español');
});

// Emulate after goto: Playwright's Firefox drops the emulation when COOP swaps the process.
test('the background follows the system theme', async ({ page }) => {
  await page.goto(BASE + '/en/');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 250, 250)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
});

test('before any click, every request goes to our own server', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto(BASE + '/en/', { waitUntil: 'load' });
  await page.locator('html[data-i18n-ready="en"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  expect(urls.length).toBeGreaterThan(0);
  for (const u of urls) expect(u.startsWith(BASE + '/')).toBe(true);
});

test('no CSP violations', async ({ page }) => {
  /** @type {string[]} */
  const messages = [];
  page.on('console', (m) => messages.push(m.text()));
  for (const lang of LANGS) {
    await page.goto(`${BASE}/${lang}/`, { waitUntil: 'load' });
    await page.locator(`html[data-i18n-ready="${lang}"]`).waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => /** @type {any} */ (window).__csp)).toEqual([]);
  }
  // Violations only: Chromium also warns about the policy text itself (see report).
  expect(messages.filter((m) => /content.security.policy/i.test(m) && /violat|block/i.test(m))).toEqual([]);
});

/** @param {import('@playwright/test').Page} page */
async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const width = doc.clientWidth;
    /** @type {string[]} */
    const bad = [];
    if (doc.scrollWidth > width) bad.push(`page scrollWidth ${doc.scrollWidth} > ${width}`);
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.matches('.sr-only, .skip:not(:focus)')) continue;
      const name = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className}`;
      if (r.right > width + 0.5) bad.push(`${name} right ${r.right} > ${width}`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') bad.push(`${name} clips`);
      if (el.matches('button, a, h1, h2, .tag') && el.scrollWidth > el.clientWidth + 1) bad.push(`${name} text clips`);
    }
    return bad;
  });
}

for (const lang of LANGS) {
  test(`/${lang}/ at 320px has no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`${BASE}/${lang}/`);
    await page.locator(`html[data-i18n-ready="${lang}"]`).waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect(await overflow(page)).toEqual([]);
  });
}

for (const width of [320, 1280]) {
  test(`200% text at ${width}px has no horizontal scroll and nothing clips`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(BASE + '/en/');
    await page.locator('html[data-i18n-ready="en"]').waitFor();
    const before = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    // CSP blocks an injected <style>; the CSSOM is allowed.
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%', 'important'));
    await page.evaluate(() => document.fonts.ready);
    const after = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(after).toBeCloseTo(before * 2, 0);
    expect(await overflow(page)).toEqual([]);
  });
}
