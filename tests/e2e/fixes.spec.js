// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';
const ROUTER_URLS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254'].map((a) => `http://${a}/**`);
const V4 = { ip: '81.2.69.142', family: 4, country: 'GB', city: 'London', asn: 20712, asOrg: 'Andrews & Arnold Ltd', tor: false, privateRelay: false };
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0';

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

/** @param {import('@playwright/test').Page} page @param {string} [lang] */
async function open(page, lang = 'en') {
  await page.goto(`${BASE}/${lang}/`);
  await page.locator(`html[data-i18n-ready="${lang}"]`).waitFor();
}

/** Browser scan, then the connection check answered "yes": at least the browser and "where" problems. @param {import('@playwright/test').Page} page */
async function scanAll(page) {
  await page.locator('#run-scan').click();
  await expect(page.locator('#browser .findings > li')).toHaveCount(9, { timeout: 10_000 });
  await page.locator('#run-connection').click();
  await expect(page.locator('#conn-question')).toBeVisible({ timeout: 10_000 });
  await page.locator('#conn-question [data-answer="yes"]').click();
}

/** @param {import('@playwright/test').Page} page */
const cardIds = (page) => page.locator('#fix .fix-list > li').evaluateAll((lis) => lis.map((li) => /** @type {HTMLElement} */ (li).dataset.problem));

test('before any check the plan says to run the scan, and there is no fix tile', async ({ page }) => {
  await stub(page);
  await open(page);
  await expect(page.locator('#fix-empty')).toBeVisible();
  await expect(page.locator('#fix-plan')).toBeHidden();
  await expect(page.locator('#results [data-tile="fix"]')).toHaveCount(0);
});

test('after a scan the third tile counts the problems and links to the fixes', async ({ page }) => {
  await stub(page);
  await open(page);
  await scanAll(page);
  const n = (await cardIds(page)).length;
  expect(n).toBeGreaterThan(1);
  const tile = page.locator('#results [data-tile="fix"]');
  await expect(tile).toContainText(`${n} problems`);
  await expect(tile).toContainText('each with a basic fix');
  await tile.getByRole('link', { name: 'SEE THE FIXES ↓' }).click();
  await expect(page).toHaveURL(/#fix$/);
  await expect(page.locator('#fix-title')).toBeInViewport();
  await expect(page.locator('#fix-lead')).toHaveText(new RegExp(`^Your \\d+ leaks come down to ${n} problems\\.`));
  await expect(page.locator('#fix .policy')).toContainText('Nothing is sponsored and there are no affiliate links.');
});

test('cards: most leaks first, START HERE on the first, which is open; tags use a word and an icon', async ({ page }) => {
  await stub(page);
  await open(page);
  await scanAll(page);
  const cards = page.locator('#fix .fix-list > li');
  await expect(cards.first()).toContainText('1 / ');
  await expect(cards.first().locator('.badge')).toHaveText('START HERE');
  await expect(cards.nth(1).locator('.badge')).toHaveCount(0);
  const counts = await cards.evaluateAll((lis) => lis.map((li) => Number(li.querySelector('.card-leaks')?.textContent?.split(' ')[0])));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  await expect(cards.first().locator('.tag-leak')).toHaveText('PROBLEM');
  await expect(cards.first().locator('.tag-leak svg')).toHaveCount(1);
  await expect(cards.first().locator('.tag-ok').first()).toHaveText('BASIC FIX');
  // The first card is expanded; its panel follows its button in the reading order.
  const how = cards.first().locator('[data-action="how"]');
  await expect(how).toHaveAttribute('aria-expanded', 'true');
  await expect(how).toHaveText('HIDE THE STEPS');
  const panelId = await how.getAttribute('aria-controls');
  const follows = await page.evaluate((id) => {
    const btn = document.querySelector(`[aria-controls="${id}"]`);
    const panel = document.getElementById(/** @type {string} */ (id));
    return !!btn && !!panel && !!(btn.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, panelId);
  expect(follows).toBe(true);
  const second = cards.nth(1).locator('[data-action="how"]');
  await expect(second).toHaveAttribute('aria-expanded', 'false');
  await second.click();
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(cards.nth(1).locator('.panel')).toBeVisible();
});

test.describe('on Linux', () => {
  test.use({ userAgent: LINUX_FIREFOX });
  test('options are sorted, at least two, and DuckDuckGo and Safari are named as not shown', async ({ page }) => {
    await stub(page);
    await open(page);
    await scanAll(page);
    const card = page.locator('#fix [data-problem="browser"]');
    const names = await card.locator('.option-name').allTextContents();
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(names).not.toContain('DuckDuckGo');
    expect(names).not.toContain('Safari');
    await expect(card.locator('.options-note')).toHaveText('Not on Linux, so not shown: DuckDuckGo, Safari.');
    // The VPN card lists its options too, with the free alternatives.
    const vpn = page.locator('#fix [data-problem="where"]');
    expect(await vpn.locator('.option-name').allTextContents()).toEqual(['Mullvad', 'NymVPN', 'Proton VPN']);
    await expect(vpn.locator('.coverage-text')).toHaveText('closes 3 of 3');
  });
});

test('"done" collapses a card and counts it; "undo" restores it; nothing is stored', async ({ page }) => {
  await stub(page);
  await open(page);
  await scanAll(page);
  const n = (await cardIds(page)).length;
  const leaksBefore = await page.locator('#results .tile-leak span').textContent();
  await expect(page.locator('#fix-done')).toHaveText(`0 / ${n} fixed`);
  const card = page.locator('#fix [data-problem="where"]');
  // click, not check: the card is redrawn collapsed, so the checkbox itself is replaced.
  await card.locator('[data-action="done"]').click();
  await expect(card.locator('.tag-ok')).toHaveText('FIXED');
  await expect(card).toContainText('sites can tell where you are → hide your address with a VPN');
  await expect(card.locator('[data-action="how"]')).toHaveCount(0);
  await expect(card.locator('[data-action="undo"]')).toBeFocused();
  await expect(page.locator('#fix-done')).toHaveText(`1 / ${n} fixed`);
  await expect(page.locator('#fix .progress-bar .is-done')).toHaveCount(1);
  // Ticking a fix changes no count: only a rescan does.
  await expect(page.locator('#results .tile-leak span')).toHaveText(/** @type {string} */ (leaksBefore));
  await card.locator('[data-action="undo"]').click();
  await expect(card.locator('[data-action="done"]')).not.toBeChecked();
  await expect(card.locator('[data-action="done"]')).toBeFocused();
  await expect(page.locator('#fix-done')).toHaveText(`0 / ${n} fixed`);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  expect(await page.context().cookies()).toEqual([]);
});

test('the connection outcome links to the VPN card', async ({ page }) => {
  await stub(page);
  await open(page);
  await scanAll(page);
  // Redrawn after the cards exist, so the link points at the card itself.
  await page.locator('#conn-question [data-answer="unsure"]').click();
  await expect(page.locator('#conn-outcome a')).toHaveAttribute('href', '#fix-where');
});

test('RESCAN TO CHECK shows before and after counts and reruns only the checks already run', async ({ page }) => {
  const requested = await stub(page);
  await open(page);
  await scanAll(page);
  const whoamiBefore = requested.filter((u) => u.includes('/api/whoami')).length;
  expect(whoamiBefore).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'RESCAN TO CHECK' }).click();
  await expect(page.locator('#rescan-result')).toHaveText(/^leaking: \d+ → \d+$/);
  expect(requested.filter((u) => u.includes('/api/whoami')).length).toBe(whoamiBefore * 2);
  // The local network was never probed, so the rescan doesn't probe it either.
  expect(requested.filter((u) => !u.includes('/api/whoami'))).toEqual([]);
  // The answer survives a rescan from the same address.
  await expect(page.locator('#conn-question [aria-checked="true"]')).toHaveAttribute('data-answer', 'yes');
});

for (const lang of ['en', 'fr', 'es']) {
  test(`/${lang}/ at 320px with every card open: no horizontal scroll, no clipped control, no word broken in a tile`, async ({ page }) => {
    await stub(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page, lang);
    await page.locator('#run-scan').click();
    await expect(page.locator('#browser .findings > li')).toHaveCount(9, { timeout: 10_000 });
    await page.locator('#run-connection').click();
    await expect(page.locator('#conn-question')).toBeVisible({ timeout: 10_000 });
    await page.locator('#conn-question [data-answer="vpn"]').click();
    await page.locator('#test-vpn').click();
    await page.locator('#vpn-dbl').click();
    await page.locator('#run-localnet').click();
    await expect(page.locator('#localnet .findings > li')).toHaveCount(4, { timeout: 10_000 });
    const closed = page.locator('#fix [data-action="how"][aria-expanded="false"]');
    while (await closed.count()) await closed.first().click();
    await page.evaluate(() => document.fonts.ready);
    const bad = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      /** @type {string[]} */
      const out = [];
      if (document.documentElement.scrollWidth > width) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${width}`);
      for (const el of document.querySelectorAll('button, a, .btn, .tag, .badge, h2, h3, h4, .tile-word, .option-name')) {
        const h = /** @type {HTMLElement} */ (el);
        // The skip link is clipped on purpose until it gets focus.
        if (h.offsetParent === null || h.matches('.skip')) continue;
        if (h.scrollWidth > h.clientWidth + 1) out.push(`${h.tagName}.${h.className} "${h.textContent?.trim()}" ${h.scrollWidth} > ${h.clientWidth}`);
        if (h.getBoundingClientRect().right > width + 0.5) out.push(`${h.tagName}.${h.className} "${h.textContent?.trim()}" sticks out`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });
}
