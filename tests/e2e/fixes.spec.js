// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';
const ROUTER_URLS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254'].map((a) => `http://${a}/**`);
const V4 = { ip: '81.2.69.142', family: 4, country: 'GB', city: 'London', asn: null, asOrg: null, tor: false, privateRelay: false };

/**
 * Canned lookups and refused routers, so no test spends the shared whoami budget or reaches a real router.
 * Returns the list of stubbed URLs requested.
 * @param {import('@playwright/test').Page} page
 */
async function stub(page) {
  /** @type {string[]} */
  const requested = [];
  await page.route('**/api/whoami', (route) => {
    requested.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': BASE }, body: JSON.stringify(V4) });
  });
  await page.route('**/api/origins', (route) => route.fulfill({ status: 404, body: '' }));
  for (const pattern of ROUTER_URLS) {
    await page.route(pattern, (route) => {
      requested.push(route.request().url());
      return route.abort('connectionrefused');
    });
  }
  return requested;
}

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto(BASE + '/en/');
  await page.locator('html[data-i18n-ready="en"]').waitFor();
}

/** @param {import('@playwright/test').Page} page */
async function showFixes(page) {
  await page.getByRole('button', { name: 'SHOW MY FIXES' }).click();
  await expect(page.locator('#fix')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
const cardIds = (page) => page.locator('#fix .fix-list > li').evaluateAll((lis) => lis.map((li) => /** @type {HTMLElement} */ (li).dataset.fix));

test('SHOW MY FIXES reveals the plan on the same page and focuses its heading', async ({ page }) => {
  await stub(page);
  await open(page);
  await expect(page.locator('#fix')).toBeHidden();
  const url = page.url();
  await showFixes(page);
  expect(page.url()).toBe(url);
  await expect(page.locator('#fix-title')).toBeFocused();
  await expect(page.locator('#fix .fix-list > li')).toHaveCount(7);
  expect(await cardIds(page)).toEqual(['block', 'dns', 'perms', 'browser', 'ip', 'split', 'tor']);
  await expect(page.locator('#fix [data-fix="dns"]')).toContainText('in 5 minutes');
});

test('the threat question is a radio group that arrow keys move through', async ({ page }) => {
  await stub(page);
  await open(page);
  await showFixes(page);
  const group = page.getByRole('radiogroup', { name: 'who are you hiding from?' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  await group.getByRole('radio', { name: /advertisers and trackers/ }).check();
  await page.keyboard.press('ArrowDown');
  const network = group.getByRole('radio', { name: /my internet provider or wi-fi/ });
  await expect(network).toBeChecked();
  await expect(network).toBeFocused();
  expect((await cardIds(page)).slice(0, 2)).toEqual(['dns', 'ip']);
});

test('"someone looking for me" puts the Tor card first', async ({ page }) => {
  await stub(page);
  await open(page);
  await showFixes(page);
  await page.getByRole('radio', { name: /someone looking for me/ }).check();
  expect((await cardIds(page)).slice(0, 2)).toEqual(['tor', 'ip']);
  await expect(page.locator('#fix .fix-list > li').first()).toContainText('if you need strong anonymity');
});

test('the "read this first" note sits above the list', async ({ page }) => {
  await stub(page);
  await open(page);
  await showFixes(page);
  const note = page.locator('#fix .note');
  await expect(note).toContainText('read this first');
  await expect(note).toContainText('easier to recognize');
  const noteBox = await note.boundingBox();
  const listBox = await page.locator('#fix .fix-list').boundingBox();
  expect(noteBox && listBox && noteBox.y + noteBox.height <= listBox.y).toBe(true);
});

test('the meter reads without colour, and steps match the detected browser', async ({ page, browserName }) => {
  await stub(page);
  await open(page);
  await showFixes(page);
  const card = page.locator('#fix [data-fix="browser"]');
  await expect(card.getByRole('img', { name: 'hides: most' })).toHaveCount(1);
  await expect(page.locator('#fix [data-fix="perms"]').getByRole('img', { name: 'hides: some' })).toHaveCount(1);
  const toggle = page.locator('#fix [data-fix="dns"] .fix-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const name = { chromium: 'Chrome', firefox: 'Firefox', webkit: 'Safari' }[browserName];
  await expect(page.locator('#fix [data-fix="dns"] .panel')).toContainText(`steps in ${name}`);
  await expect(page.locator('#fix [data-fix="dns"] .panel')).toContainText('trade-off');
});

test('a tag link moves focus to its finding row', async ({ page }) => {
  await stub(page);
  await open(page);
  await page.locator('#run-scan').click();
  await expect(page.locator('#announce')).toContainText('Scan finished');
  await showFixes(page);
  const link = page.locator('#fix [data-fix="browser"] a', { hasText: 'screen' });
  await expect(link).toHaveAttribute('href', '#finding-screen');
  await link.click();
  await expect(page.locator('#finding-screen')).toBeFocused();
  await expect(page.locator('#fix [data-fix="split"] .fix-tags a')).toHaveCount(0);
});

test('a tick updates the progress and is gone after a reload', async ({ page }) => {
  await stub(page);
  await open(page);
  await showFixes(page);
  await expect(page.locator('#fix-done')).toHaveText('0 / 7 done');
  await page.locator('#fix [data-fix="dns"] input[type="checkbox"]').check();
  await expect(page.locator('#fix-done')).toHaveText('1 / 7 done');
  await expect(page.locator('#fix .progress-bar .is-done')).toHaveCount(1);
  // A reorder keeps the tick.
  await page.getByRole('radio', { name: /someone looking for me/ }).check();
  await expect(page.locator('#fix [data-fix="dns"] input[type="checkbox"]')).toBeChecked();

  await page.reload();
  await page.locator('html[data-i18n-ready="en"]').waitFor();
  await showFixes(page);
  await expect(page.locator('#fix input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(page.locator('#fix input[type="radio"]:checked')).toHaveCount(0);
  await expect(page.locator('#fix-done')).toHaveText('0 / 7 done');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

test('RESCAN TO VERIFY shows before and after counts and reruns only the checks already run', async ({ page }) => {
  const requested = await stub(page);
  await open(page);
  await page.locator('#run-scan').click();
  await expect(page.locator('#announce')).toContainText('Scan finished');
  await page.locator('#run-connection').click();
  await expect(page.locator('#announce')).toContainText('Connection check finished');
  const whoamiBefore = requested.filter((u) => u.includes('/api/whoami')).length;
  expect(whoamiBefore).toBeGreaterThan(0);

  await showFixes(page);
  await page.getByRole('button', { name: 'RESCAN TO VERIFY' }).click();
  await expect(page.locator('#rescan-result')).toHaveText(/^leaking: \d+ → \d+$/);
  await expect(page.locator('#announce')).toContainText(/leaking: \d+ → \d+/);
  expect(requested.filter((u) => u.includes('/api/whoami')).length).toBe(whoamiBefore * 2);
  expect(requested.filter((u) => !u.includes('/api/whoami'))).toEqual([]);
});

test('RESCAN TO VERIFY with no earlier browser scan shows only the new count', async ({ page }) => {
  await stub(page);
  await open(page);
  await showFixes(page);
  await page.getByRole('button', { name: 'RESCAN TO VERIFY' }).click();
  await expect(page.locator('#rescan-result')).toHaveText(/^leaking now: \d+$/);
});

test('the open plan at 320px with 200% text has no horizontal scroll and no clipped text', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await open(page);
  await showFixes(page);
  for (const toggle of await page.locator('#fix .fix-toggle').all()) await toggle.click();
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%', 'important'));
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    /** @type {string[]} */
    const out = [];
    if (document.documentElement.scrollWidth > width) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${width}`);
    for (const el of document.querySelectorAll('#fix *, #fix-cta *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > width + 0.5) out.push(`${el.tagName} ${el.className} right ${r.right}`);
      if (el.matches('button, a, h2, legend, p') && el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName} ${el.className} clips`);
    }
    return out;
  });
  expect(bad).toEqual([]);
});
