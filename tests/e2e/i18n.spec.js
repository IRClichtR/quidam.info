// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';
const ROUTER_URLS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254'].map((a) => `http://${a}/**`);
const V4 = { ip: '81.2.69.142', family: 4, country: 'GB', city: 'London', asn: 'AS1', asOrg: 'Example Telecom', tor: false, privateRelay: false };

/**
 * Canned lookup, no second origin, refused routers: nothing leaves the test machine.
 * @param {import('@playwright/test').Page} page
 */
async function stub(page) {
  await page.route('**/api/whoami', (route) => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': BASE }, body: JSON.stringify(V4),
  }));
  await page.route('**/api/origins', (route) => route.fulfill({ status: 404, body: '' }));
  for (const pattern of ROUTER_URLS) await page.route(pattern, (route) => route.abort('connectionrefused'));
}

for (const lang of ['fr', 'es']) {
  test(`/${lang}/ at 320px: no button or tag clips after a scan and the fix plan`, async ({ page }) => {
    await stub(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`${BASE}/${lang}/`);
    await page.locator(`html[data-i18n-ready="${lang}"]`).waitFor();
    await page.locator('#run-scan').click();
    await expect(page.locator('#browser li')).toHaveCount(9, { timeout: 10_000 });
    await page.locator('#connection input[name="vpn"][value="yes"]').check();
    await page.locator('#run-connection').click();
    await expect(page.locator('#connection .findings > li').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('#run-localnet').click();
    await expect(page.locator('#localnet .findings > li')).toHaveCount(3, { timeout: 10_000 });
    await page.locator('#show-fixes').click();
    await expect(page.locator('#fix')).toBeVisible();
    for (const b of await page.locator('#fix .fix-toggle').all()) await b.click();
    // The page is translated: the English button label is gone.
    await expect(page.locator('#run-scan')).not.toHaveText('RUN THE SCAN');

    const { bad, checked } = await page.evaluate(() => {
      /** @type {string[]} */
      const out = [];
      let n = 0;
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth) out.push(`page scrollWidth ${doc.scrollWidth} > ${doc.clientWidth}`);
      for (const el of document.querySelectorAll('button, .btn, .tag, .fix-tag')) {
        const h = /** @type {HTMLElement} */ (el);
        if (h.offsetParent === null) continue;
        n++;
        if (h.scrollWidth > h.clientWidth) out.push(`${h.tagName}.${h.className} "${h.textContent?.trim()}" ${h.scrollWidth} > ${h.clientWidth}`);
      }
      return { bad: out, checked: n };
    });
    expect(bad).toEqual([]);
    // Nine browser rows, the connection and network rows, seven fix cards with their tags and buttons.
    expect(checked).toBeGreaterThan(40);
  });
}
