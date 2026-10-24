// @ts-check
import { test, expect } from '@playwright/test';

const ROUTER_URLS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254'].map((a) => `http://${a}/**`);

/**
 * Stub all four router addresses so no test reaches a real one. `answering` fulfils, the rest abort.
 * @param {import('@playwright/test').Page} page
 * @param {string|null} answering
 * @param {string[]} requested
 */
async function stubRouters(page, answering, requested) {
  for (const pattern of ROUTER_URLS) {
    await page.route(pattern, (route) => {
      requested.push(route.request().url());
      if (answering && route.request().url().startsWith(`http://${answering}/`)) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: 'router' });
      }
      return route.abort('connectionrefused');
    });
  }
}

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto('http://localhost:8080/en/');
  await page.locator('html[data-i18n-ready="en"]').waitFor();
}

test('nothing is requested before the click, then three rows appear', async ({ page }) => {
  /** @type {string[]} */
  const requested = [];
  await stubRouters(page, '192.168.1.1', requested);
  await open(page);
  await expect(page.locator('#localnet')).toContainText('MAC addresses, device names or Wi-Fi details');
  await expect(page.locator('#localnet')).toContainText('saying no');
  await page.waitForTimeout(500);
  expect(requested).toEqual([]);

  await page.getByRole('button', { name: 'PROBE MY NETWORK' }).click();
  const rows = page.locator('#localnet .findings > li');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#localnet [data-finding="router"]')).toContainText('answered at 192.168.1.1');
  await expect(page.locator('#localnet [data-finding="router"]')).toHaveAttribute('data-verdict', 'leak');
  await expect(page.locator('#localnet [data-finding="otherDevices"]')).toContainText('not visible from a web page');
  await expect(page.locator('#announce')).toContainText('Local network probe finished');
  expect(requested.length).toBeGreaterThan(0);
});

test('refused requests read as OK', async ({ page }) => {
  await stubRouters(page, null, []);
  await open(page);
  await page.getByRole('button', { name: 'PROBE MY NETWORK' }).click();
  await expect(page.locator('#localnet [data-finding="router"]')).toHaveAttribute('data-verdict', 'ok');
  await expect(page.locator('#localnet .findings > li')).toHaveCount(3);
});
