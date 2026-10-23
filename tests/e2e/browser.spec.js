// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';

/** @param {import('@playwright/test').Page} page @param {string} [lang] */
async function scan(page, lang = 'en') {
  await page.goto(`${BASE}/${lang}/`);
  await page.locator(`html[data-i18n-ready="${lang}"]`).waitFor();
  await page.locator('#run-scan').click();
  await expect(page.locator('#browser li')).toHaveCount(10, { timeout: 10_000 });
  await expect(page.locator('#announce')).not.toBeEmpty();
}

test('a scan fills ten rows, each with a tag', async ({ page }) => {
  await scan(page);
  const rows = page.locator('#browser li');
  for (let i = 0; i < 10; i++) {
    const row = rows.nth(i);
    await expect(row.locator('.tag')).toHaveCount(1);
    await expect(row.locator('.row-value')).not.toBeEmpty();
    await expect(row.locator('.tag svg')).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(page.locator('#browser')).not.toContainText('undefined');
  // No tag and no muted label inside an explanation panel (contrast rule).
  await expect(page.locator('#browser .panel .tag')).toHaveCount(0);
});

test('the announcement and the tiles sum up the scan', async ({ page }) => {
  await scan(page);
  const tiles = page.locator('#results .tile');
  await expect(tiles).toHaveCount(3);
  const leak = Number(await page.locator('#results .tile-leak span').textContent());
  const ok = Number(await page.locator('#results .tile-ok span').textContent());
  const unknown = await page.locator('#browser .tag-unknown').count();
  expect(leak + ok + unknown).toBe(10);
  expect(await page.locator('#browser .tag-leak').count()).toBe(leak);
  await expect(page.locator('#announce')).toHaveText(`Scan finished: ${leak} leaking, ${ok} protected.`);
  await expect(tiles.nth(2)).toContainText(/blends in|fairly distinctive|likely unique/);
  await expect(page.locator('#results .hint')).toBeHidden();
  await expect(page.locator('#run-scan')).toBeFocused();
  await expect(page.locator('#run-scan')).not.toHaveAttribute('aria-disabled', 'true');
});

test('no request leaves our server during the scan', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await scan(page);
  for (const u of urls) expect(u.startsWith(BASE + '/')).toBe(true);
});

test('clicks during a scan are ignored', async ({ page }) => {
  // Hold WebRTC gathering so the scan lasts its full 2 s timeout.
  await page.addInitScript(() => {
    RTCPeerConnection.prototype.createOffer = () => new Promise(() => {});
  });
  await page.goto(BASE + '/en/');
  await page.locator('html[data-i18n-ready="en"]').waitFor();
  await page.evaluate(() => {
    /** @type {any} */ (window).__runs = 0;
    new MutationObserver((list) => {
      for (const m of list) if (m.addedNodes.length && /Scan finished/.test(m.target.textContent ?? '')) /** @type {any} */ (window).__runs++;
    }).observe(/** @type {Node} */ (document.getElementById('announce')), { childList: true, characterData: true, subtree: true });
    /** @type {any} */ (window).__disabled = false;
    new MutationObserver(() => {
      if (document.getElementById('run-scan')?.getAttribute('aria-disabled') === 'true') /** @type {any} */ (window).__disabled = true;
    }).observe(/** @type {Node} */ (document.getElementById('run-scan')), { attributes: true });
  });
  await page.locator('#run-scan').dblclick();
  await page.waitForTimeout(500);
  // force: Playwright itself waits while aria-disabled is set; a real visitor can still click.
  await page.locator('#run-scan').click({ force: true });
  await expect(page.locator('#announce')).toContainText('Scan finished', { timeout: 10_000 });
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => /** @type {any} */ (window).__runs)).toBe(1);
  expect(await page.evaluate(() => /** @type {any} */ (window).__disabled)).toBe(true);
  await expect(page.locator('#run-scan')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#browser li')).toHaveCount(10);
});

test('a row opens and closes its explanation with the keyboard', async ({ page }) => {
  await scan(page);
  const row = page.locator('#browser li[data-finding="fonts"]');
  const toggle = row.locator('button[aria-expanded]');
  const panel = row.locator('.panel');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('why it matters');
  await expect(panel).toContainText('how to reduce it');
  await expect(toggle).toHaveAttribute('aria-controls', /** @type {string} */ (await panel.getAttribute('id')));
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
});

test.describe('without WebRTC', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete (/** @type {any} */ (window)).RTCPeerConnection;
    });
  });
  test('the scan finishes and the local IP finding is OK', async ({ page }) => {
    await scan(page);
    const row = page.locator('#browser li[data-finding="webrtcLocal"]');
    await expect(row.locator('.tag-ok')).toHaveCount(1);
    await expect(row.locator('.row-value')).toHaveText('WebRTC off');
  });
});

test.describe('without crypto.subtle (plain http on a LAN address)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete (/** @type {any} */ (Crypto.prototype)).subtle;
    });
  });
  test('the scan still finishes and announces', async ({ page }) => {
    await scan(page);
    await expect(page.locator('#announce')).toHaveText(/^Scan finished: \d+ leaking, \d+ protected\.$/);
    for (const id of ['canvas', 'audio']) {
      await expect(page.locator(`#browser li[data-finding="${id}"] .tag-unknown`)).toHaveCount(1);
    }
  });
});

test('French page shows the translated LEAK tag', async ({ page }) => {
  await scan(page, 'fr');
  const tags = await page.locator('#browser .tag').allTextContents();
  for (const tag of tags) expect(['FUITE', 'OK', 'INCERTAIN']).toContain(tag.trim());
});

test('no CSP violation during the scan', async ({ page }) => {
  await page.addInitScript(() => {
    /** @type {any} */ (window).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      /** @type {any} */ (window).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await scan(page);
  await page.locator('#browser li button[aria-expanded]').first().click();
  expect(await page.evaluate(() => /** @type {any} */ (window).__csp)).toEqual([]);
});

test('after a scan, 320px has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await scan(page, 'fr');
  for (const b of await page.locator('#browser li button[aria-expanded]').all()) await b.click();
  const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(width).toBe(0);
});
